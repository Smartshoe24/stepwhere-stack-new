# Stepwhere AWS infrastructure plan

Status: **draft v2 for review.** Nothing has been bootstrapped or applied. Agents only write code; a human runs every `tofu`, `make` and `ansible-playbook` command (see `AGENTS.md`).

Order of work, as agreed:
1. Finish this plan.
2. Bootstrap the state bucket.
3. Apply the infrastructure.
4. Configure the host.
5. Cut over.

## 0. Decisions locked

| Area | Decision |
| --- | --- |
| Cloud / region | AWS, **ap-south-1 (Mumbai) only**. Single region, single AZ for compute and database (`ap-south-1a`). |
| Accounts | Stepwhere-only organization `r-rprw`. Management account `713881826913` (billing, Organizations and Identity Center only). Workloads in **`stepwhere-prod` `045837342042`**. |
| App host | EC2 **`m7g.large`**: Graviton3 ARM, 2 vCPU / 8 GiB, steady CPU (no credits). Ubuntu 24.04 LTS arm64. |
| Database | RDS for PostgreSQL **18** on **`db.m8g.large`**: Graviton4, 2 vCPU / 8 GiB, steady CPU. Single-AZ, gp3, private. |
| Redis | Container on the host. It is optional and rebuildable (live activity counters only). |
| Deployment model | **One Docker Compose deployment** on the host. |
| Reverse proxy | **Pangolin** (Pangolin + Gerbil + Traefik) with its dashboard at **`access.stepwhere.in`**. It manages every public and private route and replaces today's edge Caddy. |
| Infrastructure as code | **OpenTofu** for everything in AWS. |
| Host configuration | **Ansible** for everything on the VM (packages, Docker, Compose files, Pangolin, monitoring, backups). |
| App delivery | GitHub Actions builds **arm64** images, pushes them to ECR and deploys through SSM Run Command. |
| Monitoring | **Beszel** (host and container metrics, alerts) + **Dozzle** (container logs), both behind Pangolin auth. **CloudWatch alarms** watch from outside the box. |
| Who runs what | Humans run all `tofu` / `make` / `ansible-playbook` commands. Agents write code and run offline checks only. |
| Data | **Clean cutover, fresh start.** Supabase is dropped. No data migration, no avatar copy. Plain Postgres everywhere: local dev already uses `postgres:16`, and dev moves to 18 to match prod. First-run seeding is in section 11. |
| DNS | `stepwhere.in` stays at its **third-party DNS provider**. Records are created there by hand (section 7). OpenTofu manages no DNS. |
| Alerts | **`ceo@stepwhere.in`**: SNS (CloudWatch alarms), the budget, Beszel and the backup dead-man's switch |
| CI runners | GitHub **`ubuntu-24.04-arm`** runners (available on our plan) build native arm64 images |
| Pangolin users | Pangolin's own users with **2FA**, no external identity provider. Admins log in twice for the panel (Pangolin, then the app); that is accepted. |

## 1. Architecture

```text
                Internet (IPv4)
                         │  80/tcp, 443/tcp only
                 ┌───────▼─────────────────────────────────────────────────┐
                 │ EC2 m7g.large  (public subnet ap-south-1a, Elastic IP)  │
                 │                                                          │
                 │  Pangolin edge:  traefik ── pangolin ── gerbil           │
                 │      │ HTTPS: api / share / panel / access / monitor / logs
                 │      │ HTTP:  ingest (firmware, plain HTTP on purpose)   │
                 │      ▼                                                   │
                 │  app:   server(API) ── redis                             │
                 │         device-ingest-proxy ─▶ server                    │
                 │         admin (static)   share-view (static, /__share_api ─▶ server)
                 │  ops:   beszel-hub  beszel-agent  dozzle                 │
                 │  host:  /srv on its own EBS volume, backup timers        │
                 └──────────────┬───────────────────────────┬──────────────┘
                                │ 5432 (sg-app → sg-db)      │ S3 gateway endpoint
                 ┌──────────────▼──────────────┐   ┌────────▼───────────────────┐
                 │ RDS PostgreSQL 18           │   │ S3: stepwhere-storage,     │
                 │ db.m8g.large, private       │   │ -backups, -audit-logs,     │
                 │ subnets a+b, no public IP   │   │ tofu state                 │
                 └─────────────────────────────┘   └────────────────────────────┘

  Humans: SSO → `aws ssm start-session` (shell, SSH for Ansible, port-forward to RDS).
  Port 22 is never open.
  CI: GitHub OIDC → ECR push → `ssm send-command` (compose pull/up, migrations).
```

## 2. Who owns what

| Layer | Tool | Examples | Run by |
| --- | --- | --- | --- |
| AWS resources | OpenTofu (`infra/`) | VPC, security groups, EC2, EIP, EBS, RDS, S3, ECR, IAM, SNS, alarms, health checks, budgets, CloudTrail | Human: `make plan` / `make apply` |
| Operating system and host services | Ansible (`ansible/`) | packages, users, Docker, `/srv` mount, Compose files, Pangolin, Beszel, Dozzle, backup timers, DB roles | Human: `make host-check` / `make host-apply` |
| Application images | GitHub Actions | build arm64 → ECR → SSM deploy → migrations | CI, on merge to `main` |
| Routes and access policies | Pangolin dashboard | resources, auth, users | Human, in the UI. Its database is backed up nightly. |
| Secrets | Infisical | app runtime secrets, DB app password | Human |
| DNS records | third-party DNS provider | A records → Elastic IP | Human, by hand |

Boundaries:
- **OpenTofu never configures the OS.** User data only installs what Ansible needs to connect.
- **Ansible never creates AWS resources.**
- **CI never changes the host's configuration.** It only pulls new images and restarts containers.

## 3. OpenTofu

### 3.1 Layout and state

```text
infra/
  Makefile                 # the only way humans run tofu (3.9)
  README.md
  .opentofu-version        # 1.12.4
  bootstrap/               # state bucket (written, not applied)
  account/                 # account-wide baseline, rarely changes
  prod/                    # the environment
```

| Stack | State key | Contents | Change frequency |
| --- | --- | --- | --- |
| `bootstrap` | `bootstrap/terraform.tfstate` | state bucket | once |
| `account` | `account/terraform.tfstate` | security baseline, CloudTrail + audit bucket, GitHub OIDC provider, SNS alerts topic, budget | rare |
| `prod` | `prod/terraform.tfstate` | network, compute, database, app buckets, ECR, IAM roles, alarms, health checks | normal |

**Why three stacks:** account-wide guardrails and the audit trail shouldn't sit in the same plan as day-to-day changes, so a bad `prod` plan can't touch them. `prod` reads two values from `account` (SNS topic ARN, OIDC provider ARN) via `terraform_remote_state`.

### 3.2 Conventions (every stack)

- `required_version = "~> 1.12"` and `hashicorp/aws ~> 6.0`. `.terraform.lock.hcl` is committed with `darwin_arm64` and `linux_amd64` hashes.
- Provider setup:
  - `region = "ap-south-1"`;
  - `allowed_account_ids = ["045837342042"]`;
  - `default_tags = { Project = "stepwhere", Env = "prod", ManagedBy = "opentofu", Stack = <stack> }`.
- S3 backend with `use_lockfile = true` and `encrypt = true`. Credentials come from `AWS_PROFILE=stepwhere-prod` and are never written into code.
- Naming: `stepwhere-prod-<thing>` for named resources. Buckets have their own names (section 4).
- **Stateful resources are protected twice:**
  - `lifecycle { prevent_destroy = true }` on RDS, the data volume and all buckets;
  - on top of that, `deletion_protection` on RDS, `disable_api_termination` on EC2, and final snapshots.
- **No secrets in state:**
  - the RDS master password is generated and held by AWS (`manage_master_user_password = true` → Secrets Manager);
  - the app's DB password and every runtime secret live in Infisical;
  - the SSH key is a public key only.
- Non-secret inputs are committed in `prod/terraform.tfvars`.
- Flat `.tf` files, no modules (one environment).
- Plans are always saved (`-out`) and applied from the saved file.
- CI runs `tofu fmt -check` and `tofu validate` only. It never runs plan or apply.

### 3.3 `bootstrap/` (written)

`stepwhere-tofu-state-045837342042-ap-south-1`: versioned, SSE-S3, public access blocked, TLS-only, lock-file cleanup lifecycle, `prevent_destroy`. Applied with local state first, then migrated into itself.

### 3.4 `account/`

| File | Resources |
| --- | --- |
| `baseline.tf` | EBS encryption by default; S3 account-level public access block; IAM Access Analyzer (account analyzer, free) |
| `audit.tf` | `stepwhere-audit-logs` bucket (section 4); CloudTrail trail (management events, all regions, log-file validation) → that bucket. One management-event trail is free; only S3 storage is billed. |
| `alerts.tf` | SNS topic `stepwhere-prod-alerts` + email subscription to **`ceo@stepwhere.in`**. **The subscription must be confirmed from that inbox.** |
| `budget.tf` | Monthly cost budget, **$300**, alerting `ceo@stepwhere.in` at 80% actual and 100% forecast. |
| `github-oidc.tf` | IAM OIDC provider for `token.actions.githubusercontent.com` (roles that use it live in `prod`). |

### 3.5 `prod/`: network (`network.tf`, `security.tf`)

| Resource | Spec |
| --- | --- |
| VPC | `10.20.0.0/16`, IPv4 only (IPv6 was only needed for replicating from Supabase), DNS hostnames on |
| Subnets | `public-a` `10.20.0.0/24`, holds the EC2 host. `public-b` `10.20.1.0/24`, reserved and empty. `db-a` `10.20.10.0/24` and `db-b` `10.20.11.0/24`, with no internet route. RDS requires a subnet group spanning two AZs even when Single-AZ. |
| Routing | Internet gateway, a public route table (`0.0.0.0/0` → IGW), and a DB route table with local routes only. **No NAT gateway.** |
| S3 gateway endpoint | On the public route table. Free; host ↔ S3 traffic stays on the AWS network. |
| `sg-app` | Ingress 80/tcp and 443/tcp from `0.0.0.0/0`. Egress all. **No 22.** UDP 51820/21820 (Pangolin tunnels) stay **closed** until a remote site is needed. |
| `sg-db` | Ingress 5432/tcp from `sg-app` only. No egress needed. |

### 3.6 `prod/`: compute (`compute.tf`, `iam-host.tf`)

| Resource | Spec |
| --- | --- |
| AMI | Read from SSM parameter `/aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id` |
| Instance | `m7g.large` in `public-a`. IMDSv2 required, hop limit **2** so containers can use the instance role. `disable_api_termination = true`. EBS-optimized. Monitoring at the default 5-minute interval. `lifecycle.ignore_changes = [ami, user_data]` so a new AMI never replaces the host. |
| Root volume | gp3 30 GiB, encrypted. OS and Docker images only, rebuildable by Ansible. |
| Data volume | gp3 30 GiB, encrypted, mounted at **`/srv`** by Ansible, `prevent_destroy`, tag `Backup=daily`. Holds Compose files, Redis AOF, Pangolin DB and certificates, Beszel data. It survives instance replacement. |
| Elastic IP | Attached. Every A record at the DNS provider points here, and it survives instance replacement. |
| Key pair | `aws_key_pair` from your **public** key in `terraform.tfvars`. Used only by Ansible over SSH tunnelled through SSM. |
| User data | Minimal cloud-init: set hostname, `apt install python3`, make sure `snap.amazon-ssm-agent` is running. Nothing else. |
| Auto-recovery | CloudWatch alarm on `StatusCheckFailed_System` → `ec2:recover`; alarm on `StatusCheckFailed_Instance` → reboot. Both notify SNS. |
| Instance role | `AmazonSSMManagedInstanceCore`; ECR pull on the 4 repositories; `stepwhere-storage` read/write; `stepwhere-backups` **PutObject only** (no delete, no overwrite under Object Lock); `secretsmanager:GetSecretValue` for the RDS master secret is **not** granted. |

### 3.7 `prod/`: database (`rds.tf`)

| Setting | Value |
| --- | --- |
| Engine | `postgres`, major **18** pinned, `auto_minor_version_upgrade = true` |
| Class | `db.m8g.large`, Single-AZ, `availability_zone = ap-south-1a` (same AZ as the host, so no cross-AZ transfer cost) |
| Storage | gp3, `allocated_storage = 20` (fresh database; gp3 still gives 3,000 IOPS / 125 MiB/s), `max_allocated_storage = 100` (grows automatically, no downtime), encrypted with the AWS-managed KMS key |
| Network | `db_subnet_group` (db-a, db-b), `sg-db`, `publicly_accessible = false` |
| Credentials | Master user `stepwhere_admin`, `manage_master_user_password = true`. Secrets Manager rotates it; humans use it only for admin work. The app uses its own role (section 5.4). |
| Database | `db_name = "stepwhere"` |
| Parameter group `stepwhere-pg18` | `rds.force_ssl = 1`; `log_min_duration_statement = 500`; `log_lock_waits = on`; `idle_in_transaction_session_timeout = 60000`; `pg_stat_statements` enabled |
| Backups | `backup_retention_period = 14` (point-in-time restore to any second in 14 days); backup window `20:30–21:00 UTC` (02:00 IST); `copy_tags_to_snapshot`; `delete_automated_backups = false`; `skip_final_snapshot = false` |
| Maintenance | Window `Sun 21:30–22:30 UTC`; `apply_immediately = false` |
| Protection | `deletion_protection = true` + `prevent_destroy` |
| Observability | Database Insights (Standard, 7-day free tier) on. Enhanced Monitoring off at first. Postgres logs exported to CloudWatch Logs with 14-day retention. |
| TLS | CA `rds-ca-rsa2048-g1`. The app connects with `sslmode=verify-full` using the RDS CA bundle baked into the server image. |
| Admin access | `aws ssm start-session --document-name AWS-StartPortForwardingSessionToRemoteHost` via the host to the RDS endpoint `:5432`. No security-group change needed. |

### 3.8 `prod/`: the rest

| File | Resources |
| --- | --- |
| `s3.tf` | `stepwhere-storage`, `stepwhere-backups` (section 4) |
| `ecr.tf` | `stepwhere-server`, `stepwhere-admin`, `stepwhere-share-view`, `stepwhere-device-ingest-proxy`. Scan on push. Mutable tags (deploys re-point `main`; `sha-*` tags stay unique by convention). Lifecycle: untagged images expire after 7 days; keep the newest 30 `sha-*`. |
| `iam-ci.tf` | Role `stepwhere-prod-github-deploy`. Trust: `repo:Smartshoe24/stepwhere-stack-new` (and its immutable form `repo:Smartshoe24@166411271/stepwhere-stack-new@1454954451`), `ref:refs/heads/main` and the `production` / `production-migrations` environments. Allows: ECR push to the 4 repos; `ssm:SendCommand` with `AWS-RunShellScript` on instances tagged `Project=stepwhere, Env=prod`; `ssm:GetCommandInvocation`. |
| `backups.tf` | Data Lifecycle Manager: daily snapshot of volumes tagged `Backup=daily`, keep 7. |
| `alarms.tf` | → SNS: EC2 status checks; EC2 CPU > 80% for 15 min; RDS CPU > 80% for 15 min; RDS `FreeStorageSpace` < 10 GiB; RDS `FreeableMemory` < 512 MiB; RDS `DatabaseConnections` > 150. |
| `health.tf` | Route 53 health checks (these work without a Route 53 zone) for `https://api.stepwhere.in/health`, `https://share.stepwhere.in/health` and `http://ingest.stepwhere.in/health` (needs a `/health` route on the proxy, or a TCP check on :80). Each has a CloudWatch alarm → SNS. About $0.75 per check per month. |
| `outputs.tf` | instance ID, EIP, RDS endpoint, master secret ARN, bucket names, ECR URLs, CI role ARN |

Staged rollout without `-target`: `prod` has two switches, `enable_database` and `enable_instance`, both `false` at first.
1. Apply with both off. That creates network, buckets, ECR, IAM and alarms, all cheap and safe.
2. Flip on RDS and apply.
3. Flip on the instance and apply.

Each stage is a normal, reviewable plan.

### 3.9 `infra/Makefile`

```text
make login                      # aws sso login --sso-session Stepwhere
make whoami                     # fails unless the account is 045837342042
make fmt | make validate        # offline, no AWS needed (agents may run these)
make init  STACK=prod           # tofu init against the S3 backend
make plan  STACK=prod           # whoami + tofu plan -out=prod.tfplan
make apply STACK=prod           # whoami + tofu apply prod.tfplan (saved plan only)
make host-check                 # ansible-playbook site.yml --check --diff
make host-apply                 # ansible-playbook site.yml
make db-tunnel                  # SSM port-forward localhost:15432 → RDS:5432
make shell                      # SSM shell on the host
make run CMD="…" [ENV="K=V"]    # one-off command in a fresh server container on the host (migrations, play-review provisioning)
```

Every target that touches AWS runs `whoami` first. `STACK` must be one of `bootstrap|account|prod`.

## 4. Buckets

| Bucket | Stack | Purpose | Settings | Access |
| --- | --- | --- | --- | --- |
| `stepwhere-tofu-state-045837342042-ap-south-1` | bootstrap | OpenTofu state | versioned; lock-file cleanup; TLS-only | humans (SSO admin), later CI read for drift checks |
| **`stepwhere-storage`** | prod | **App user files.** Prefixes: `avatars/`, room for `exports/`, `firmware/` later. Starts empty (fresh start). | versioned; non-current versions expire after 30 days; abort incomplete uploads after 7 days; SSE-S3; BucketOwnerEnforced; public access blocked; TLS-only; no CORS (the native app uploads with presigned URLs) | instance role read/write; the app hands out presigned URLs |
| **`stepwhere-backups`** | prod | Off-RDS copies: nightly `pg_dump`, nightly archive of `/srv` config (Pangolin DB and config, Beszel), Beszel's own S3 backups | versioned; **Object Lock (governance, 14 days)**, which must be enabled at creation; lifecycle: `daily/` expires after 35 days, `monthly/` moves to Glacier Instant Retrieval at 30 days and expires after 400 days | instance role **PutObject only**; humans read/restore |
| **`stepwhere-audit-logs`** | account | CloudTrail logs and S3 server access logs for `storage` and `backups` | versioned; Glacier IR after 90 days; expire after 400 days; CloudTrail bucket policy | CloudTrail / S3 logging service only; humans read |

**Why `stepwhere-backups` exists when RDS already has backups:**
- RDS automated backups disappear with the instance and can't be restored outside RDS.
- A plain `pg_dump` can be restored anywhere (local, another account, another provider).
- Object Lock means a compromised host can't delete or overwrite backups.

**Not needed:**
- buckets for the static sites (they're served from the host);
- a deploy-artifacts bucket (CI deploys via SSM, Ansible ships config);
- an Ansible SSM transfer bucket (we use SSH tunnelled through SSM instead of the `aws_ssm` connection plugin);
- load-balancer log buckets (no ALB).

**Naming:** bucket names are global across all AWS customers.
- Before the first apply, a human checks each name with `aws s3api head-bucket --bucket <name>`:
  - `404` means the name is free;
  - `403` means someone else owns it.
- If a name is taken, the fallback is a `-aps1` suffix, e.g. `stepwhere-storage-aps1`.

## 5. Ansible

### 5.1 Layout

```text
ansible/
  ansible.cfg              # SSH via SSM ProxyCommand, pipelining, yaml output
  requirements.yml         # amazon.aws, community.docker, community.general, community.postgresql
  inventory/aws_ec2.yml    # dynamic inventory: tag Project=stepwhere, Env=prod → group "prod"
  group_vars/prod/
    main.yml               # versions, domains, bucket names, sizes (non-secret)
    vault.yml              # ansible-vault: Infisical machine-identity bootstrap only
  site.yml                 # base → docker → stack → pangolin → monitoring → backups
  db-roles.yml             # one-off: create app/backup roles on RDS through the tunnel
  roles/
    base/  docker/  infisical/  stack/  pangolin/  monitoring/  backups/
```

### 5.2 Connection

- Inventory hostnames are instance IDs.
- SSH runs inside an SSM session: `ProxyCommand aws ssm start-session --target %h --document-name AWS-StartSSHSession --parameters portNumber=%p`.
- Requires the Session Manager plugin locally, plus the key pair from section 3.6.
- Port 22 is never public.

### 5.3 Roles

| Role | Does |
| --- | --- |
| `base` | apt full upgrade; `unattended-upgrades` for security updates, no automatic reboot (reboots are manual and announced); chrony; timezone UTC; journald capped at 500 MB; 2 GiB swap file and `vm.swappiness=10`; formats `/srv` only if empty and mounts it by UUID; `ops` user with your key; `deploy` user (docker group, no sudo); sshd: keys only, no root, no passwords |
| `docker` | Docker CE + Compose plugin from Docker's apt repo (arm64); `daemon.json`: `log-driver: local` (max-size 10m, 5 files per container), `live-restore: true`; `amazon-ecr-credential-helper` for `deploy`, so `docker pull` from ECR needs no login |
| `infisical` | Infisical CLI; machine-identity credentials to `/etc/stepwhere/infisical.env` (0600, root) from Vault. The server container keeps using `infisical run` as today. |
| `stack` | `/srv/stepwhere/compose.yml` and `.env` (non-secret: image tags, domains); creates Docker networks `edge` and `backend`; first `docker compose up -d`. Later image updates come from CI. |
| `pangolin` | `/srv/pangolin`: `config.yml`, Traefik static and dynamic config (TLS options for `api`, the plain-HTTP router fallback for `ingest`, access-log policy). Pangolin, Gerbil and Traefik are services in the same Compose project. |
| `monitoring` | Beszel hub, Beszel agent (host network, read-only Docker socket) and Dozzle (read-only Docker socket) as Compose services |
| `backups` | systemd timers: **02:30 IST** `pg_dump -Fc` of RDS (via a `postgres:18` client container, `stepwhere_backup` role) → `s3://stepwhere-backups/daily/`; first of the month also to `monthly/`; **03:00 IST** tar of `/srv/pangolin` and Beszel data → same bucket. Each job pings a dead-man's-switch URL on success (healthchecks.io free tier), so a missed backup raises an alert. |
| `db-roles.yml` | Run once, from a laptop, through `make db-tunnel`. Creates `stepwhere_app` (owns the `public` schema, used by the app and migrations) and `stepwhere_backup` (`pg_read_all_data`). The passwords go into Infisical. |

**Order:** always run `make host-check` (`--check --diff`) and read it before `make host-apply`. Every role must be idempotent: a second run reports zero changes.

## 6. Compose stack on the host

One Compose project, `stepwhere`, in `/srv/stepwhere`.

| Service | Image | Network | Memory limit | Notes |
| --- | --- | --- | --- | --- |
| `traefik` | `traefik` (pinned) | edge | 256m | The only service with host ports: 80, 443 |
| `pangolin` | `fosrl/pangolin` (pinned) | edge | 512m | Dashboard and API for `access.stepwhere.in` |
| `gerbil` | `fosrl/gerbil` (pinned) | edge | 128m | Tunnel manager. Idle until a remote site exists. |
| `server` | ECR `stepwhere-server` | edge, backend | 2g | API :8223, workers, `infisical run` |
| `device-ingest-proxy` | ECR | edge | 256m | :8290 → `server:8223` |
| `admin` | ECR | edge | 64m | static, :80 |
| `share-view` | ECR | edge | 64m | static, :80; **now also proxies `/__share_api/*` → `server:8223`** (moved from edge Caddy) |
| `redis` | `redis:7.4-alpine` | backend | 512m | AOF on `/srv/redis`, password from `.env` |
| `beszel-hub` | `henrygd/beszel` | edge | 256m | `monitor.stepwhere.in` |
| `beszel-agent` | `henrygd/beszel-agent` | host | 64m | host and container metrics |
| `dozzle` | `amir20/dozzle` | edge | 128m | `logs.stepwhere.in` |

Limits total about 4.3 GiB of the 8 GiB, leaving room for the page cache, image pulls during deploys and swap. All images must be **arm64** (all third-party images above publish arm64).

## 7. Pangolin

### Routes (resources)

All targets are on a **Local Site**: same host, no tunnel.

| Host | Target | Scheme | Pangolin auth | Notes |
| --- | --- | --- | --- | --- |
| `access.stepwhere.in` | Pangolin dashboard | HTTPS | Pangolin login + 2FA | Admin users only |
| `api.stepwhere.in` | `server:8223` | HTTPS | **none** (the app has its own auth) | WebSockets; Traefik's default certificate (the old RSA-2048 setting is dropped, see 7.1) |
| `share.stepwhere.in` | `share-view:80` | HTTPS | none | Public share links |
| `ingest.stepwhere.in` | `device-ingest-proxy:8290` | **HTTP only, no HTTPS redirect** | none | Firmware endpoint; must never redirect |
| `panel.stepwhere.in` | `admin:80` | HTTPS | **Pangolin SSO** + app login | An extra gate in front of the admin console |
| `monitor.stepwhere.in` | `beszel-hub:8090` | HTTPS | Pangolin SSO | |
| `logs.stepwhere.in` | `dozzle:8080` | HTTPS | Pangolin SSO | |

### DNS records (at the third-party provider, by hand)

| Name | Type | Value | TTL |
| --- | --- | --- | --- |
| `access`, `panel`, `monitor`, `logs` | A | Elastic IP | 300 |
| `api`, `share`, `ingest` | A | Elastic IP (at cutover, Phase 6) | 60 during cutover, then 300 |
| `stepwhere.in` | CAA | `0 issue "letsencrypt.org"` (optional; only if the provider supports CAA) | 3600 |

Certificates use Let's Encrypt **HTTP-01** through port 80, which is open anyway. The DNS provider needs no API access. `ingest` never gets a certificate.

### 7.1 Why the old RSA-2048 setting is dropped

Today's `deploy/Caddyfile` forces `api.stepwhere.in` onto an **RSA 2048-bit certificate** and a short list of RSA ciphers. Caddy's default would be a smaller, more modern **ECDSA** certificate.

It was added on 2026-07-08 ("update caddy for rsa…"), while the team was trying to make the **N706 modem post over HTTPS** (`https_post()` in `stepwhere.wifi-experiment-final.ino`). Small modem TLS stacks often only handle RSA certificates. The next day the plain-HTTP `device-ingest-proxy` was built instead, and current firmware (`stepwhere.ino` v2.0) posts to `http://ingest.stepwhere.in`.

No current client needs it:
- The mobile apps and browsers handle ECDSA fine.
- Firmware never uses `api` over HTTPS.

So `api` uses Traefik's default certificate and settings.

**If firmware ever moves to HTTPS**, give *that* host (likely `ingest`) an RSA-2048 certificate with a dedicated Traefik resolver (`keyType: RSA2048`) and test it on a real N706 first.

### Must be proven before cutover (a Phase 0 spike, run locally with Docker)

1. **Plain-HTTP `ingest`:** a resource with SSL off serves on :80 with no redirect, and `POST /location` reaches the proxy byte-for-byte. Fallback: a router in Traefik's file provider, outside Pangolin.
2. ~~`api` RSA-2048 certificate~~. **Dropped** (see 7.1). The spike only checks that `api` serves Traefik's default certificate on TLS 1.2 and 1.3.
3. **WebSockets** through Traefik for `api` and `share` `/__share_api`.
4. **Share tokens must not be logged:** today Caddy skips logging `/v1/share-links/*`. Traefik access logs can't filter by path, so either keep them off or drop the `RequestPath` field. App logs already redact tokens.
5. **Security headers:** HSTS, nosniff and Referrer-Policy for `api` and `panel`, as a Traefik middleware or set by the apps. The share CSP already lives in the share-view image.
6. **Backup and restore** of Pangolin's database and config from `stepwhere-backups`.

## 8. Monitoring

| Need | Tool | Why |
| --- | --- | --- |
| Host load (CPU, memory, disk, network, load average) and per-container CPU, memory and network, with history and alerts | **Beszel** | Very light hub and agent, built for exactly this. Alerts by email, Telegram or Slack. Backs itself up to S3. |
| Container logs: live tail, search, several containers at once | **Dozzle** | Read-only, no database, reads Docker's own log files (kept locally with rotation) |
| "The box itself is down" and database health | **CloudWatch alarms → SNS email** (section 3.8) | On-box tools can't report their own host dying; RDS metrics come from AWS |
| Public endpoints up (`api`, `share`, `ingest`) | **Route 53 health checks → CloudWatch → SNS** (they work without moving DNS to Route 53) | Checks from 3+ locations outside the box; alerts `ceo@stepwhere.in` |
| Backup jobs actually ran | healthchecks.io (free) dead-man's switch | Alerts when a nightly job doesn't check in |

Beszel and Dozzle sit behind Pangolin SSO, so neither exposes its own login to the internet.

**Not chosen for now:**
- a self-hosted Grafana + Prometheus + Loki stack (too heavy next to the apps on 8 GiB);
- Netdata (more than we need);
- Portainer (management, not monitoring, and adds attack surface).

If we later need long log retention and search, add the **Grafana Alloy agent → Grafana Cloud free tier**, or the Docker `awslogs` driver → CloudWatch Logs. Both are additive and need no re-architecture.

## 9. CI/CD changes

1. **arm64 images.** The host is Graviton, so every image must be built for `linux/arm64`.
   - Use GitHub's `ubuntu-24.04-arm` runners if the plan allows them for this private repo.
   - Otherwise use `docker buildx` with QEMU emulation, which is slower.
2. **AWS auth:**
   - add `aws-actions/configure-aws-credentials` (OIDC role) and `aws-actions/amazon-ecr-login`;
   - remove `doctl`, `DIGITALOCEAN_ACCESS_TOKEN` and all `VPS_*` SSH secrets.
3. **Deploy:** `ssm send-command` → `cd /srv/stepwhere && docker compose pull <changed> && docker compose up -d <changed>`, then the same local health checks as today (`/health`, `/ready`).
4. **Migrations:** RDS is private, so the runner can't reach it. Migrations run **on the host** through SSM (`docker compose run --rm server <migrate command>`), gated by the `production-migrations` environment as today. This needs the migration files and `drizzle-kit` in the server image, or a small `migrate` target.
5. Compose, Pangolin and monitoring config change through Ansible (human), never through CI.

## 10. Application code changes (separate PRs, before cutover)

| Change | Where |
| --- | --- |
| Make `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` optional so the S3 client uses the instance role | `apps/server/src/config/env.ts` |
| Rename `AWS_S3_AVATARS_BUCKET` → `AWS_S3_STORAGE_BUCKET` and add an `avatars/` key prefix (today keys sit at the bucket root as `<org>/<user>/…` and `users/<user>/…`). Nothing to copy: fresh start. | `apps/server/src/infrastructure/s3.ts`, `modules/uploads` |
| `DATABASE_URL` → RDS with `sslmode=verify-full` and the RDS CA bundle in the image. Drop `prepare: false` (it was only needed for the Supabase pooler). Remove the Supabase wording in `package.json` (`db:push` message, `DIRECT_URL`). | Infisical, `apps/server/Dockerfile`, `src/db/client.ts`, `package.json` |
| Local dev on `postgres:18-alpine`, so dev matches prod | `docker-compose.yml` |
| Make migrations runnable inside the server image (migration files + `drizzle-kit`, or a `migrate` entry point) | `apps/server` |
| **First-run admin setup** (section 11.2): while no admin exists, the panel asks for the password of `admin@stepwhere.in`. Once set, the setup feature switches itself off for good. | `apps/server` (setup endpoints), `apps/admin` (setup screen) |
| Move `/__share_api/*` → `server:8223` (with WebSockets) into the share-view Caddyfile | `apps/share-view/Caddyfile` |
| Add `GET /health` to the ingest proxy for the external health check | `apps/device-ingest-proxy` |
| Security headers for the API (if not done in Traefik) | `apps/server` |
| Firmware: **none.** Same hostname, still plain HTTP. | — |

## 11. Rollout phases

Fresh start: there is no data to move, so there is no maintenance window. The new stack is built and tested completely, then DNS flips.

| Phase | What | Who |
| --- | --- | --- |
| 0 | Close the open questions; code PRs (section 10); Pangolin spike (section 7); `infra/` and `ansible/` code written and reviewed | agents write, you review |
| 1 | `bootstrap` apply → migrate its state → `account` apply → confirm the SNS email in `ceo@stepwhere.in` | you |
| 2 | `prod` apply in 3 stages (base → RDS → instance) | you |
| 3 | `make host-check` / `make host-apply`; `db-roles.yml` through `make db-tunnel`; DATABASE_URL and the other prod values into Infisical; CI pushes the first arm64 images; stack up | you + CI |
| 4 | **Pangolin first run:** create your admin user with 2FA, the Local Site, and the resources in section 7. Add the DNS records (section 7) **except** `api`, `share`, `ingest`, which still point at the droplet; HTTPS for `access`, `panel`, `monitor`, `logs` comes up here. | you |
| 5 | **First-run seeding** (section 11.1) | you |
| 6 | Smoke-test `api`, `share` and `ingest` against the EIP with `curl --resolve`; flip their A records (TTL 60 s, lowered 48 h before). Pangolin gets their certificates on the first request. | you |
| 7 | Watch: real shoe uploads in Dozzle, the Mira demo, sign-ups, share links, admin. Any device still resolving the old IP posts to the droplet and is simply lost (fresh start). | you |
| 8 | After 48 h: shut down the droplet and DOCR; delete the Supabase project; remove `DIGITALOCEAN_ACCESS_TOKEN`, `VPS_*`, old AWS keys and Supabase values from GitHub and Infisical; rewrite `deploy/README.md` for the new setup | you |

### 11.1 First-run seeding (empty database)

Each step runs on the host with `make run CMD=...`, a Makefile target that wraps `aws ssm send-command` and runs `docker compose run --rm server <CMD>` through `infisical run`, exactly like the container's normal start command.

1. **Migrations:** `make run CMD="node dist/scripts/migrate.js"` (later deploys run it automatically, gated by `production-migrations`).
2. **First admin:** open `panel.stepwhere.in` (behind Pangolin login). The setup screen asks for the password of `admin@stepwhere.in` and the one-time setup code from Infisical. After that the panel shows the normal login, and setup is gone (section 11.2).
3. **In the admin panel:**
   - create the plans;
   - bulk-create the real shoes by IMEI (e.g. the test board `869938082392516`), so they are accepted the moment they post.
4. **Mira's Demo Shoe (Google Play review account):**
   - **It is not created automatically.** It comes from `src/scripts/provision-play-review.ts`, which refuses to run unless `ALLOW_PLAY_REVIEW_PROVISION=true`.
   - Set `PLAY_REVIEW_ENABLED=true` and `PLAY_REVIEW_PHONE_NUMBER`, `PLAY_REVIEW_OTP`, `PLAY_REVIEW_EMAIL`, `PLAY_REVIEW_HARDWARE_IDENTIFIER` in Infisical prod.
   - Run once:
     ```sh
     make run CMD="node dist/scripts/provision-play-review.js" ENV="ALLOW_PLAY_REVIEW_PROVISION=true"
     ```
   - It creates the reviewer user and family, the child "Mira Demo", the device "Mira's Demo Shoe" bound to that child, a disabled geofence, and the "Included Shoe Service" plan.
   - From then on the server's play-review telemetry worker (started in `src/index.ts` when `PLAY_REVIEW_ENABLED=true`) feeds it demo data **automatically**.
   - The script is safe to run again (it upserts).
5. **Families re-onboard** in the mobile app: old accounts and sessions don't exist on the new database.

### 11.2 First-run admin setup (to build)

**Goal:** on a fresh database, the first visit to the admin panel lets us set the password for `admin@stepwhere.in`. After that, the feature disappears.

**Server (`apps/server`):**

1. `GET /v1/admin/setup` → `{ "required": true | false, "email": "admin@stepwhere.in" }`. `required` is true **only while no user with role `admin` exists**.
2. `POST /v1/admin/setup` `{ password, setupCode }`:
   - Runs in one transaction under a Postgres advisory lock, so two simultaneous requests can't both succeed.
   - Re-checks that no admin exists. If one does, it answers **404** forever after.
   - Checks `setupCode` against `ADMIN_SETUP_CODE` from Infisical with a constant-time compare, and is rate-limited.
   - Creates `admin@stepwhere.in` (from `INITIAL_ADMIN_EMAIL`) with role `admin` and a better-auth **email/password credential**. The existing admin sign-in (`assertEmailSignInUserIsAdmin` in `src/infrastructure/better-auth.ts`) requires that credential.
   - Password policy: at least 12 characters.
   - Writes one log line, without the password.
3. If `ADMIN_SETUP_CODE` is unset, setup is disabled even on an empty database.

**Admin panel (`apps/admin`):** on load, call `GET /v1/admin/setup`.
- If `required`: show "Set up admin" with the email read-only, password + confirm, and the setup code.
- Otherwise: the normal login.

**Why a setup code:** the panel sits behind Pangolin's login, but the API (`api.stepwhere.in`) is public, because the mobile app needs it. Without a code, anyone who found the endpoint between the deploy and our first visit could claim the admin account. With the code they can't, and it costs one extra field, once.

**After setup:** delete `ADMIN_SETUP_CODE` from Infisical. The endpoints already refuse because an admin exists; this is belt and braces.

## 12. Monthly cost (on-demand, USD, approximate)

| Item | $/month |
| --- | --- |
| EC2 `m7g.large` | 42.6 |
| EBS gp3 30 + 30 GiB, DLM snapshots | ~7 |
| Public IPv4 (Elastic IP) | 3.65 |
| RDS `db.m8g.large` Single-AZ | 175.2 |
| RDS gp3 20 GB (grows automatically) | 2.6 |
| Route 53 health checks ×3 | ~2 |
| S3 (storage, backups, audit, state), Secrets Manager, CloudWatch alarms and logs | ~6–12 |
| **Total** | **≈ 240–245** |
| With a 1-yr RDS reserved instance ($117.4) + EC2 Savings Plan (~30%) | **≈ 170** |

The budget alarm is set at $300 and goes to `ceo@stepwhere.in`. Reserved RDS and the Savings Plan are bought **after one month** of real usage.

## 13. Open questions

None blocking. The plan is ready for review.

### Answered (2026-10-29)

- Supabase is dropped: fresh start on plain Postgres (RDS), no data or avatar migration.
- `stepwhere.in` DNS stays at its third-party provider; records are added by hand.
- Alerts go to `ceo@stepwhere.in`.
- GitHub ARM runners are available.
- Pangolin uses its own users with 2FA.
- Admins logging in twice for the panel is fine.
- `PLAY_REVIEW_HARDWARE_IDENTIFIER` is a dummy ID, so it can't clash with a real shoe.
- First admin is `admin@stepwhere.in`, set up from the panel on first visit (11.2).
- `stepwhere-storage`, `stepwhere-backups` and `stepwhere-audit-logs` are all free.
- RSA-2048 on `api` is dropped: it was left over from a modem HTTPS experiment (7.1).

## 14. Account and access setup (done)

| | |
| --- | --- |
| Organization | root `r-rprw`, all features |
| Management account | `Stepwhere` `713881826913`, root `ceo@stepwhere.in` (MFA, no access keys) |
| Root access management | centralized; member accounts have no root credentials |
| Workload account | `stepwhere-prod` `045837342042` |
| Human access | IAM Identity Center (ap-south-1) → `AdministratorAccess` on `stepwhere-prod` |
| CLI | `~/.aws/config`: `[sso-session Stepwhere]` + `[profile stepwhere-prod]`; `aws sso login --sso-session Stepwhere` |

## 15. Implementation contract

Every piece (OpenTofu, Ansible, CI, app) uses exactly these names.

| Thing | Value |
| --- | --- |
| Account / region | `045837342042` / `ap-south-1` (Route 53 health-check alarms live in `us-east-1`, the only region that has those metrics) |
| ECR registry | `045837342042.dkr.ecr.ap-south-1.amazonaws.com` |
| ECR repositories | `stepwhere-server`, `stepwhere-admin`, `stepwhere-share-view`, `stepwhere-device-ingest-proxy` |
| Image tags | `main` (deployed) and `sha-<git sha>` (immutable by convention); `linux/arm64` only |
| Instance tags | `Project=stepwhere`, `Env=prod`, `Role=app`, `Name=stepwhere-prod-app`, `DataVolumeId=<vol-…>` |
| Host login for Ansible | user `ubuntu` (key from the `stepwhere-prod-ops` key pair) over SSH inside SSM |
| Data volume | attached as `/dev/sdf`; on the host `/dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_<vol id without "-">`; ext4, label `stepwhere-data`, mounted at `/srv` |
| Host paths | `/srv/stepwhere` (Compose project `stepwhere`: `compose.yml`, `.env`), `/srv/pangolin`, `/srv/redis`, `/srv/beszel`, `/etc/stepwhere/infisical.env` (0600 root, `INFISICAL_TOKEN=…`) |
| Compose services | `gerbil`, `traefik`, `pangolin`, `server`, `device-ingest-proxy`, `admin`, `share-view`, `redis`, `beszel-hub`, `beszel-agent`, `dozzle` |
| Docker networks | `edge` (Traefik ↔ every routed service), `backend` (server ↔ redis) |
| Buckets | `stepwhere-storage`, `stepwhere-backups` (Object Lock), `stepwhere-audit-logs`, `stepwhere-tofu-state-045837342042-ap-south-1` |
| RDS | identifier `stepwhere-prod-db`, database `stepwhere`, master `stepwhere_admin` (Secrets Manager), app role `stepwhere_app`, backup role `stepwhere_backup` |
| Server env (new or renamed) | `AWS_S3_STORAGE_BUCKET=stepwhere-storage` (replaces `AWS_S3_AVATARS_BUCKET`), AWS keys optional, `INITIAL_ADMIN_EMAIL=admin@stepwhere.in`, `ADMIN_SETUP_CODE` (optional, one-time), `DATABASE_URL=postgres://stepwhere_app:…@<rds endpoint>:5432/stepwhere?sslmode=verify-full` |
| One-off commands in the server image | `node dist/scripts/migrate.js`, `node dist/scripts/provision-play-review.js`, always wrapped in `infisical run …` like the image's `CMD` |
| Remote command runner | `infra/scripts/ssm-run.sh '<shell>'`: finds the instance by tags, runs the shell as root through `AWS-RunShellScript`, waits, prints output and exits with its status. Used by `make run` and by CI. |
| CI role | `stepwhere-prod-github-deploy` (ARN output from `prod`, stored as GitHub variable `AWS_DEPLOY_ROLE_ARN`) |
| Alerts | SNS `stepwhere-prod-alerts` (ap-south-1) and `stepwhere-prod-alerts-us-east-1` → `ceo@stepwhere.in` |
