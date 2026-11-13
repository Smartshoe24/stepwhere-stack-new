# Runbook: build the AWS stack and cut over

DigitalOcean (droplet, registry) and Supabase **keep serving users** until the cutover. Both servers read the **same Infisical `prod` environment**. Its few conflicting values switch to AWS in one short window on cutover day.

Every command here is run by a human (see `AGENTS.md`). Background and names: [`aws-migration-plan.md`](aws-migration-plan.md).

Paths: `make …` and `scripts/ssm-run.sh` run from `infra/`; everything else from the repo root unless a step says `cd`. Keep `export AWS_PROFILE=stepwhere-prod` in every terminal.

## The whole journey

```text
 ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐
 │ 0. PREP    │──▶│ 1. AWS     │──▶│ 2. DNS     │──▶│ 3. HOST    │──▶│ 4. IMAGES  │
 │ tools, key │   │ bootstrap  │   │ new names  │   │ Ansible    │   │ merge PR   │
 │ token,     │   │ account    │   │ access     │   │ DB users   │   │ CI → ECR   │
 │ deploy gate│   │ prod ×3    │   │ monitor    │   │ additive   │   │ deploy WAITS│
 │ TTL → 60s  │   │            │   │ logs       │   │ secrets    │   │ server OFF │
 └────────────┘   └────────────┘   └────────────┘   └────────────┘   └─────┬──────┘
                                                                           │
                    ════════ CUTOVER DAY (one sitting) ════════            │
 ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐         │
 │ 8. CLEANUP │◀──│ 7. CUTOVER │◀──│ 6. SWITCH  │◀──│ 5. PANGOLIN│◀────────┘
 │ remove DO  │   │ 4 A records│   │ + VERIFY   │   │ routes     │
 │ Supabase   │   │ → EIP      │   │ prod → RDS │   │ Beszel     │
 │ old secrets│   │ certs, test│   │ server ON  │   │ Dozzle     │
 │            │   │            │   │ GO / NO-GO │   │ backups    │
 └────────────┘   └─────┬──────┘   └─────┬──────┘   └────────────┘
                        │                │ no-go?
                        ▼                ▼
      ROLLBACK: DNS back + restore old prod values (Infisical point-in-time recovery)
```

## ⚠️ Four rules for the whole run

| # | Rule | Why |
| --- | --- | --- |
| 1 | **Until Phase 6, only *add* keys to Infisical `prod`; never change or delete one.** | The DigitalOcean server re-reads `prod` on every restart. New keys are ignored by its old code; changed ones would break it. |
| 2 | **Until Phase 6, the new `server` container must not run, and CI's deploy gate (`AWS_DEPLOY_ENABLED`) stays `false`.** | Before the switch, `prod` still points at Supabase. The new server, its migrations and Mira provisioning would write into the live old database. |
| 3 | **Phases 6 and 7 happen in one sitting.** | After the switch, the DigitalOcean server keeps working only until it restarts (crash, reboot or deploy). It would then boot with RDS settings it can't reach. |
| 4 | **Don't restart Traefik repeatedly before cutover.** | Let's Encrypt allows 5 failed validations per hostname per hour. `api`, `share`, `panel` and `ingest` can't validate until DNS moves. |

## Phase 0 · Preparation

**Laptop tools**
- [ ] OpenTofu 1.12.x, AWS CLI v2, `jq`, `openssl`.
- [ ] Session Manager plugin: `brew install --cask session-manager-plugin`.
- [ ] Ansible: `pipx install ansible-core && pipx inject ansible-core boto3 botocore psycopg2-binary`.

**Ops SSH key** (used only through SSM; port 22 stays closed)

```sh
ssh-keygen -t ed25519 -f ~/.ssh/stepwhere_prod_ops -C stepwhere-prod-ops
ssh-add ~/.ssh/stepwhere_prod_ops
```

**Infisical (server project)**
- [ ] Create a new machine identity / token for the AWS host with **read access to `prod`**. Keep it for the vault in Phase 3.
- [ ] Note the password inside the current `prod` `REDIS_URL`. The new host's Redis reuses it, so `REDIS_URL` never has to change.

**GitHub (`Smartshoe24/stepwhere-stack-new`)**
- [ ] Repository variable **`AWS_DEPLOY_ENABLED` = `false`**. This is the gate behind rule 2: while it is `false`, pushes to `main` only build and push images, and the `migrate` and `deploy` jobs are skipped. (GitHub Free can't put required reviewers on environments in a private repo.) The `production` and `production-migrations` environments are created automatically on first use.

**DNS provider**
- [ ] Lower the TTL of `api`, `share`, `panel` and `ingest` to **60 s**, at least 48 h before Phase 7.

## Phase 1 · AWS infrastructure

```text
 bootstrap ──▶ account ──▶ prod stage 1 ──▶ prod stage 2 ──▶ prod stage 3
 (state)       (audit,      (network, S3,    (RDS, 10–15     (EC2 host,
               alerts,       ECR, IAM)        min)             EIP, /srv)
               budget)
```

```sh
cd infra
make login
make whoami          # must print 045837342042
```

- [ ] **1.1 State bucket:** `make bootstrap-first`. Read the plan (7 resources), type `yes`, and wait for "no changes pending".
- [ ] **1.2 Account baseline:**
  ```sh
  make init  STACK=account
  make plan  STACK=account      # read it
  make apply STACK=account
  ```
  Then confirm **both** SNS emails in `ceo@stepwhere.in` (ap-south-1 and us-east-1).
- [ ] **1.3 Prod, stage 1.** All switches in `prod/terraform.tfvars` stay `false`.
  ```sh
  make init STACK=prod
  make plan STACK=prod && make apply STACK=prod
  tofu -chdir=prod output -raw github_deploy_role_arn
  ```
  Set the GitHub repository variable **`AWS_DEPLOY_ROLE_ARN`** to that ARN.
- [ ] **1.4 Prod, stage 2 (RDS):** set `enable_database = true`, then `make plan STACK=prod && make apply STACK=prod`. It takes about 10–15 minutes.
- [ ] **1.5 Prod, stage 3 (host):**
  - set `ssh_public_key` to the contents of `~/.ssh/stepwhere_prod_ops.pub`;
  - set `enable_instance = true`.
  ```sh
  make plan STACK=prod && make apply STACK=prod
  tofu -chdir=prod output    # elastic_ip, rds_endpoint, instance_id, rds_master_secret_arn
  ```
- [ ] **1.6 SSM works:** `make shell`, then `exit`. Allow 2–3 minutes after boot.
- [ ] **1.7** Commit `prod/terraform.tfvars` (switches and the public key only).

## Phase 2 · DNS (new hostnames only)

At the DNS provider, add **A records → Elastic IP**, TTL 300:

| Name | Purpose |
| --- | --- |
| `access.stepwhere.in` | Pangolin dashboard |
| `monitor.stepwhere.in` | Beszel |
| `logs.stepwhere.in` | Dozzle |

🚫 Don't touch `api`, `share`, `panel` or `ingest`. They keep serving from DigitalOcean.

## Phase 3 · Host, database users, additive secrets

- [ ] **3.1 Ansible setup**
  ```sh
  cd ansible
  ansible-galaxy collection install -r requirements.yml
  cp group_vars/prod/vault.example.yml group_vars/prod/vault.yml
  ```
- [ ] **3.2 Fill `group_vars/prod/vault.yml`**

  | Variable | Value |
  | --- | --- |
  | `vault_infisical_token` | the AWS host's `prod` token from Phase 0 |
  | `vault_redis_password` | **the password from the current `prod` `REDIS_URL`** |
  | `vault_rds_app_password` | `openssl rand -hex 24` |
  | `vault_rds_backup_password` | `openssl rand -hex 24` |
  | `vault_pangolin_server_secret` | `openssl rand -hex 32` |
  | `vault_beszel_agent_key` | leave empty for now |

  Then encrypt it and point Ansible at the vault password:
  ```sh
  ansible-vault encrypt group_vars/prod/vault.yml
  export ANSIBLE_VAULT_PASSWORD_FILE=<file holding the vault password>
  ```
- [ ] **3.3 `group_vars/prod/main.yml`:** set `infisical_project_id` and `rds_endpoint` (`tofu -chdir=../infra/prod output -raw rds_endpoint`). `infisical_env` stays `prod`. Commit the file.
- [ ] **3.4 First host run.** This writes files only; nothing starts.
  ```sh
  cd ../infra
  make host-apply ANSIBLE_ARGS="-e stack_start=false"
  make host-check          # should report no changes
  ```
- [ ] **3.5 Database users (once).**
  - Terminal 1: `cd infra && make db-tunnel`.
  - Terminal 2: print the master password, then run the playbook. It asks for that password.
  ```sh
  cd infra
  aws secretsmanager get-secret-value \
    --secret-id "$(tofu -chdir=prod output -raw rds_master_secret_arn)" \
    --query SecretString --output text | jq -r .password
  cd ../ansible && ansible-playbook -i localhost, db-roles.yml
  ```
- [ ] **3.6 Infisical `prod`: add the new keys only** (rule 1). Old code ignores them.

  | Key (new) | Value |
  | --- | --- |
  | `AWS_S3_STORAGE_BUCKET` | `stepwhere-storage` |
  | `INITIAL_ADMIN_EMAIL` | `admin@stepwhere.in` |
  | `ADMIN_SETUP_CODE` | `openssl rand -hex 16` |

- [ ] **3.7 Prepare the switch values** in your password manager. **Don't enter them yet.**

  | Key | Today (DigitalOcean) | At the switch (Phase 6) |
  | --- | --- | --- |
  | `DATABASE_URL` | Supabase | `postgresql://stepwhere_app:<vault_rds_app_password>@<rds_endpoint>:5432/stepwhere?sslmode=verify-full` |
  | `DIRECT_URL` | Supabase | delete, or the same as `DATABASE_URL` |
  | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | old IAM user | **delete** (the host role replaces them) |
  | `AWS_S3_AVATARS_BUCKET` | old bucket | **delete** |

  Everything else stays as it is: `REDIS_URL`, auth, Twilio, Google, `PLAY_REVIEW_*`, `DEVICE_INGEST_AUTH_DISABLED`.
- [ ] **3.8 Dev Infisical:** add `AWS_S3_STORAGE_BUCKET`, or local `pnpm dev` won't start after the merge.

## Phase 4 · Images (server stays off)

```text
 merge PR ──▶ CI builds 4 arm64 images ──▶ pushes to ECR ──▶ migrate / deploy jobs
                                                               ⏭ SKIPPED while
                                                               AWS_DEPLOY_ENABLED=false
```

- [ ] **4.1 Merge** a PR `chore/infra-migration` → `main`. CI builds and pushes the four arm64 images to ECR.
  - The **`migrate` and `deploy` jobs are skipped** because `AWS_DEPLOY_ENABLED` is `false` (rule 2).
  - If an image wasn't built, run **Build And Release** on `main` with that service's force input ticked. Its deploy job will also wait.
- [ ] **4.2 Start everything except `server` and `device-ingest-proxy`**, so Pangolin, monitoring and the static apps can be set up. The proxy depends on `server` in Compose, so starting it would start the server too.
  ```sh
  cd ansible
  ansible-playbook site.yml -e '{"stack_services":["gerbil","traefik","pangolin","redis","admin","share-view","beszel-hub","dozzle"]}'
  ```
- [ ] **4.3 Check:** `cd ../infra && scripts/ssm-run.sh 'cd /srv/stepwhere && docker compose ps'`. Everything listed above should be `running` / `healthy`, and **neither `server` nor `device-ingest-proxy` should be there**.

## Phase 5 · Pangolin, monitoring, backups

- [ ] **5.1 Setup token:**
  ```sh
  scripts/ssm-run.sh 'cd /srv/stepwhere && docker compose logs pangolin | grep -i token'
  ```
- [ ] **5.2** Open `https://access.stepwhere.in/auth/initial-setup`. Create your admin user with **2FA**, the organisation and a **Local Site**.
- [ ] **5.3 Routes (resources):**

  | Host | Target | Scheme | Pangolin auth |
  | --- | --- | --- | --- |
  | `monitor.stepwhere.in` | `beszel-hub:8090` | HTTPS | SSO |
  | `logs.stepwhere.in` | `dozzle:8080` | HTTPS | SSO |
  | `panel.stepwhere.in` | `admin:80` | HTTPS | SSO |
  | `api.stepwhere.in` | `server:8223` | HTTPS | none |
  | `share.stepwhere.in` | `share-view:80` | HTTPS | none |
  | `ingest.stepwhere.in` | `device-ingest-proxy:8290` | **HTTP, SSL off, no redirect** | none |

  - ℹ️ `panel`, `api`, `share` and `ingest` can't get certificates yet. That's expected (rule 4).
  - ⚠️ If Pangolin can't serve `ingest` as plain HTTP, don't create that resource. Uncomment the fallback router in `ansible/roles/pangolin/templates/dynamic_config.yml.j2` and re-run the Phase 4.2 command.
- [ ] **5.4 Beszel:**
  1. On `monitor.stepwhere.in`, create the hub user.
  2. **Add system**, host `/beszel_socket/beszel.sock`.
  3. Put the public key in `vault_beszel_agent_key`.
  4. Re-run the Phase 4.2 command with `"beszel-agent"` added to the list.
- [ ] **5.5 Dozzle:** `logs.stepwhere.in` shows live logs.
- [ ] **5.6 Backups** (the database is still empty, which is fine):
  ```sh
  scripts/ssm-run.sh 'systemctl start stepwhere-db-backup stepwhere-config-backup; journalctl -u stepwhere-db-backup -u stepwhere-config-backup -n 50 --no-pager'
  aws s3 ls s3://stepwhere-backups/daily/ --recursive
  ```
- [ ] **5.7 Checks that don't need the server** (from the repo root):
  ```sh
  EIP=$(tofu -chdir=infra/prod output -raw elastic_ip)
  curl -si --resolve ingest.stepwhere.in:80:$EIP http://ingest.stepwhere.in/health   # 502 for now (proxy is off), but NOT 301/308
  curl -sk --resolve share.stepwhere.in:443:$EIP https://share.stepwhere.in/health   # ok
  ```
  - `502 Bad Gateway` is correct at this stage. It proves the route is plain HTTP with no redirect.
  - 🛑 A `301` or `308` means Pangolin redirects to HTTPS. Fix that before cutover day.

## Phase 6 · Switch and verify (cutover day, start of the sitting)

```text
 ┌─ before switch ─────────────┐        ┌─ after switch ──────────────┐
 │ prod → Supabase             │        │ prod → RDS                   │
 │ DO server: OK               │  ───▶  │ DO server: OK until restart  │
 │ AWS server: OFF             │        │ AWS server: ON               │
 └─────────────────────────────┘        └──────────────────────────────┘
```

- [ ] **6.1 Note the rollback point:** the current time. Infisical's point-in-time recovery restores `prod` to it.
- [ ] **6.2 Switch Infisical `prod`:** apply the four changes from 3.7. From now on, don't restart or deploy anything on DigitalOcean (rule 3).
- [ ] **6.3 Migrations:** run them on the host.
  ```sh
  cd infra
  make run CMD="node dist/scripts/migrate.js"
  ```
- [ ] **6.4 Server and ingest proxy on:** bring the whole stack to its normal state (this starts `server`, then `device-ingest-proxy`), then check it.
  ```sh
  make host-apply
  scripts/ssm-run.sh 'cd /srv/stepwhere && docker compose ps'
  ```
  Then open the deploy gate, so future merges to `main` deploy automatically:
  ```sh
  gh variable set AWS_DEPLOY_ENABLED --body true
  ```
- [ ] **6.5 API** (`-k` until the real certificates arrive):
  ```sh
  EIP=$(tofu -chdir=prod output -raw elastic_ip)
  curl -sk --resolve api.stepwhere.in:443:$EIP https://api.stepwhere.in/health
  curl -sk --resolve api.stepwhere.in:443:$EIP https://api.stepwhere.in/ready
  curl -sk --resolve api.stepwhere.in:443:$EIP https://api.stepwhere.in/v1/admin/setup   # "required": true
  ```
- [ ] **6.6 Admin setup in a browser:**
  1. Add to `/etc/hosts`: `<EIP> api.stepwhere.in panel.stepwhere.in share.stepwhere.in`.
  2. Open a **Chrome Guest window** (your normal profile's HSTS blocks the temporary certificate).
  3. Open `https://api.stepwhere.in/health` → Advanced → Proceed.
  4. Open `https://panel.stepwhere.in` → Pangolin login (2FA) → Proceed.
  5. **Set up admin:** enter a password and `ADMIN_SETUP_CODE`, then sign in as `admin@stepwhere.in`.
  6. Create the plans, then **bulk-add the real shoes by IMEI** (e.g. `869938082392516`).
  7. Delete `ADMIN_SETUP_CODE` from Infisical `prod`.
- [ ] **6.7 Mira's Demo Shoe:**
  ```sh
  make run CMD="node dist/scripts/provision-play-review.js" ENV="ALLOW_PLAY_REVIEW_PROVISION=true"
  ```
  "Mira Demo" shows locations in the panel within minutes.
- [ ] **6.8 Test shoe upload:**
  ```sh
  curl -si --resolve ingest.stepwhere.in:80:$EIP http://ingest.stepwhere.in/health     # 200 now
  curl -si --resolve ingest.stepwhere.in:80:$EIP http://ingest.stepwhere.in/location \
    -H 'Content-Type: application/json' \
    -d '{"hardwareIdentifier":"869938082392516","latitude":18.52043,"longitude":73.856744,"gpsFixValid":true,"accuracyMeters":null,"batteryPercent":80,"batteryVoltageMv":3990,"signalStrength":0,"satelliteCount":9,"stepCounter":0,"deviceState":"active"}'
  ```
  Expect `2xx`, and Dozzle shows it in `device-ingest-proxy` and `server`. A shoe not yet bound to a child may be rejected; that's expected.
- [ ] **6.9 Monitoring:**
  - Beszel shows the host and containers (now including `server`);
  - Dozzle is clean;
  - RDS Performance Insights shows connections.
- [ ] **6.10 Remove the `/etc/hosts` lines.**

### 🚦 GO / NO-GO

- **GO:** every box is ticked → continue straight to Phase 7.
- **NO-GO:**
  1. Restore `prod` to the 6.1 time with Infisical point-in-time recovery.
  2. Stop the AWS app: `scripts/ssm-run.sh 'cd /srv/stepwhere && docker compose stop device-ingest-proxy server'`.
  3. Close the deploy gate again: `gh variable set AWS_DEPLOY_ENABLED --body false`.
  4. DigitalOcean is fully safe again. Try another day.

## Phase 7 · Cutover (same sitting)

```text
   BEFORE                               AFTER
 api ────▶ DigitalOcean            api ────▶ Elastic IP (AWS)
 share ──▶ DigitalOcean            share ──▶ Elastic IP
 panel ──▶ DigitalOcean            panel ──▶ Elastic IP
 ingest ─▶ DigitalOcean            ingest ─▶ Elastic IP
```

- [ ] **7.1** Note the **droplet IP**.
- [ ] **7.2** At the DNS provider: A records for **`api`, `share`, `panel`, `ingest` → Elastic IP**.
- [ ] **7.3** Wait for propagation:
  ```sh
  for h in api share panel ingest; do echo "$h $(dig +short $h.stepwhere.in @1.1.1.1) $(dig +short $h.stepwhere.in @8.8.8.8)"; done
  ```
- [ ] **7.4 Real certificates:** restart Traefik once.
  ```sh
  cd infra && scripts/ssm-run.sh 'cd /srv/stepwhere && docker compose restart traefik'
  ```
- [ ] **7.5** Check them, **without `-k`**:
  ```sh
  curl -sI https://api.stepwhere.in/health
  curl -sI https://share.stepwhere.in/health
  curl -sI https://panel.stepwhere.in
  ```
- [ ] **7.6 Live checks:**
  - mobile app: sign up (everyone re-onboards), add a child, bind a shoe;
  - a share link opens live;
  - avatar upload (this exercises `stepwhere-storage` through the host role);
  - admin panel and the Mira demo;
  - real shoes posting (Dozzle).
- [ ] **7.7 External health checks:** set `enable_health_checks = true` in `infra/prod/terraform.tfvars`, then `make plan STACK=prod && make apply STACK=prod`.
- [ ] **7.8** After a quiet day, set the four TTLs back to 300.

### ↩️ Rollback after cutover

1. Point the four A records back to the droplet IP.
2. Restore `prod` to the 6.1 time with Infisical point-in-time recovery.
3. Restart the DigitalOcean server so it reloads the restored values.
4. Close the deploy gate: `gh variable set AWS_DEPLOY_ENABLED --body false`.

Supabase is untouched, so the old service resumes as before. Anything written on AWS stays in RDS.

## Phase 8 · Decommission (after 1–2 weeks, once you're satisfied)

- [ ] DigitalOcean: destroy the droplet and the container registry.
- [ ] Supabase: optional final dump, then delete the project.
- [ ] GitHub, delete:
  - secrets `DIGITALOCEAN_ACCESS_TOKEN`, `VPS_HOST`, `VPS_USER`, `VPS_SSH_PRIVATE_KEY`, `VPS_SSH_PASSPHRASE`, `VPS_SSH_PORT`;
  - variables `SERVER_IMAGE_REPOSITORY`, `ADMIN_IMAGE_REPOSITORY`, `SHARE_VIEW_IMAGE_REPOSITORY`, `DEVICE_INGEST_PROXY_IMAGE_REPOSITORY`, `INFISICAL_SERVER_GITHUB_IDENTITY_ID`, `INFISICAL_SERVER_PROJECT_SLUG`.
- [ ] GitHub: `AWS_DEPLOY_ENABLED` stays `true`. Set it to `false` whenever you need to merge without deploying.
- [ ] Infisical: revoke the DigitalOcean host's token.
- [ ] AWS: delete the old IAM user's access keys (the old avatar bucket credentials).
- [ ] Docs: rewrite `deploy/README.md` for the new setup (agent task).
- [ ] After one month of real usage: buy the RDS reserved instance (`db.m8g.large`, 1 year, no upfront) and an EC2 Compute Savings Plan.
