# Stepwhere infrastructure (OpenTofu)

Everything runs in the **`stepwhere-prod`** AWS account (`045837342042`), region **ap-south-1**. The design, the decisions behind it and the rollout phases are in [`docs/infra/aws-migration-plan.md`](../docs/infra/aws-migration-plan.md). Section 15 of that plan lists the names every piece shares.

**Humans run every plan and apply.** Agents only write code and run the offline checks (`make fmt-check`, `make validate`); see `AGENTS.md`.

## Stacks

| Stack | Holds | State key |
| --- | --- | --- |
| `bootstrap/` | the state bucket `stepwhere-tofu-state-045837342042-ap-south-1` | `bootstrap/terraform.tfstate` |
| `account/` | EBS encryption by default, S3 account public access block, Access Analyzer, CloudTrail + `stepwhere-audit-logs`, SNS alert topics (ap-south-1 and us-east-1), monthly budget, GitHub OIDC provider | `account/terraform.tfstate` |
| `prod/` | VPC, security groups, EC2 host + `/srv` data volume + Elastic IP, RDS Postgres 18, `stepwhere-storage`, `stepwhere-backups`, ECR, host and CI roles, DLM snapshots, CloudWatch alarms, Route 53 health checks | `prod/terraform.tfstate` |

`prod` reads the SNS topics, OIDC provider and audit bucket from `account` through `terraform_remote_state`, so `account` must be applied first.

Every provider block sets `allowed_account_ids = ["045837342042"]`: OpenTofu refuses to run with credentials for any other account.

## Prerequisites

- OpenTofu `1.12.x` (`.opentofu-version`)
- AWS CLI v2 + the [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html)
- `jq` (for `scripts/ssm-run.sh`)
- The `stepwhere-prod` SSO profile (plan, section 14)

```sh
cd infra
make login     # aws sso login --sso-session Stepwhere
make whoami    # must print 045837342042
make help      # every target
```

## First-time rollout

Each `make plan` writes `<stack>/<stack>.tfplan`. Read it, then `make apply` applies exactly that file.

1. **State bucket.** `make bootstrap-first` creates the bucket with local state, asks for `yes`, then moves its own state into the bucket and checks that nothing is pending.
2. **Account baseline.**
   ```sh
   make init  STACK=account
   make plan  STACK=account
   make apply STACK=account
   ```
   Then confirm the two SNS subscription emails in `ceo@stepwhere.in`. One is for ap-south-1 and one for us-east-1.
3. **Prod, stage 1** (network, buckets, ECR, IAM, DLM). All switches in `prod/terraform.tfvars` stay `false`.
   ```sh
   make init STACK=prod && make plan STACK=prod && make apply STACK=prod
   ```
   Set the GitHub variable `AWS_DEPLOY_ROLE_ARN` from `tofu -chdir=prod output -raw github_deploy_role_arn`.
4. **Prod, stage 2 (database).** Set `enable_database = true`, then plan and apply. It takes about 10–15 minutes.
5. **Prod, stage 3 (host).** Put your ops **public** key in `ssh_public_key`, set `enable_instance = true`, then plan and apply. Use `tofu -chdir=prod output elastic_ip` for the DNS records.
6. **Host.** Follow `ansible/README.md`: `make host-check`, then `make host-apply`.
7. **After the DNS cutover.** Set `enable_health_checks = true`, then plan and apply.

## Day to day

| Task | Command |
| --- | --- |
| Change infrastructure | edit `.tf` → `make plan STACK=prod` → review → `make apply STACK=prod` |
| Shell on the host | `make shell` |
| Postgres from your laptop | `make db-tunnel`, then connect to `127.0.0.1:15432`. The admin password is in Secrets Manager (`tofu -chdir=prod output rds_master_secret_arn`). |
| One-off app command | `make run CMD="node dist/scripts/migrate.js"` |
| Anything as root on the host | `scripts/ssm-run.sh '<shell>'` |

## Protected resources

These carry `prevent_destroy`, plus `deletion_protection` or `disable_api_termination` where AWS offers it:
- the RDS instance
- the `/srv` data volume
- all buckets
- the host

A plan that wants to destroy one of them fails. Removing a protected resource is a deliberate two-step change: first remove the protection, then remove the resource.

## Conventions

- Flat `.tf` files per stack, no modules until there is a second environment.
- No secrets in code or state. The RDS master password lives in Secrets Manager (`manage_master_user_password`); app secrets live in Infisical.
- Commit `.terraform.lock.hcl`. After a provider change, refresh it for laptops and CI:
  `tofu providers lock -platform=darwin_arm64 -platform=linux_amd64 -platform=linux_arm64`
- CI (`.github/workflows/infra-checks.yml`) only runs `fmt -check` and `validate`, never plan or apply.
