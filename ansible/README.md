# Stepwhere host configuration (Ansible)

Configures the one prod EC2 host: OS, Docker, the Compose project (app, Pangolin, Beszel, Dozzle) and the backup timers. The plan is in [`docs/infra/aws-migration-plan.md`](../docs/infra/aws-migration-plan.md) (sections 5 to 8 and 15). **Humans run everything here; agents never do** (see `AGENTS.md`).

Ansible never creates AWS resources and never touches routes, users or sites in Pangolin.

## What runs

`site.yml` runs these roles in order on the host found by the dynamic inventory (tags `Project=stepwhere`, `Env=prod`, `Role=app`):

| Role | Does |
| --- | --- |
| `base` | apt dist-upgrade; unattended security updates (no auto reboot); chrony; UTC; journald 500 MB; 2 GiB swap, `vm.swappiness=10`; sshd keys only; `deploy` user; formats (only if empty) and mounts the data volume at `/srv`; creates `/srv/{stepwhere,pangolin,redis,beszel}` |
| `docker` | Docker CE + Compose plugin (Docker's arm64 apt repo); `daemon.json`; ECR credential helper for root and `deploy` |
| `infisical` | Infisical CLI; `/etc/stepwhere/infisical.env` (0600) |
| `stack` | `/srv/stepwhere/compose.yml` and `.env`. The `up` step runs last, in `post_tasks`, once Pangolin's config and the monitoring directories exist |
| `pangolin` | `/srv/pangolin/config/config.yml` and Traefik's static and dynamic config |
| `monitoring` | Beszel and Dozzle host directories (the services are in the same `compose.yml`) |
| `backups` | systemd timers `stepwhere-db-backup` (21:00 UTC) and `stepwhere-config-backup` (21:30 UTC) |

`db-roles.yml` is separate and one-off (below).

## Prerequisites (on your laptop)

- `ansible-core` 2.19 or newer, `boto3` and `botocore` (inventory plugin), `psycopg2` (only for `db-roles.yml`).
- AWS CLI v2 and the **Session Manager plugin** (`session-manager-plugin`; `brew install --cask session-manager-plugin`). SSH is tunnelled through SSM; port 22 is never open.
- Logged in with `aws sso login --sso-session Stepwhere`, and `export AWS_PROFILE=stepwhere-prod`.
- The private half of the `stepwhere-prod-ops` key pair, in `ssh-agent` or `export ANSIBLE_PRIVATE_KEY_FILE=~/.ssh/<key>`.
- Collections, pinned in `requirements.yml`:

  ```sh
  cd ansible
  ansible-galaxy collection install -r requirements.yml
  ```

## Vault

All secrets live in `group_vars/prod/vault.yml` (gitignored). `vault.example.yml` lists every variable.

```sh
cd ansible
cp group_vars/prod/vault.example.yml group_vars/prod/vault.yml
$EDITOR group_vars/prod/vault.yml          # fill in real values
ansible-vault encrypt group_vars/prod/vault.yml
export ANSIBLE_VAULT_PASSWORD_FILE=~/.config/stepwhere/vault-pass   # or pass --ask-vault-pass
```

Use letters and digits only in passwords and tokens (`openssl rand -hex 24`): they are written into `.env` and systemd environment files without escaping. `vault_redis_password` must equal the password in `REDIS_URL` in Infisical.

Also fill in `group_vars/prod/main.yml`: `infisical_project_id` (required) and, once RDS exists, `rds_endpoint` (host name only, from `tofu output`). While `rds_endpoint` is empty the database backup is not installed.

## Running it

From `infra/` (they `cd` into `ansible/`):

```sh
make host-check     # ansible-playbook site.yml --check --diff   read it first
make host-apply     # ansible-playbook site.yml
```

Or directly: `cd ansible && ansible-playbook site.yml --check --diff`. Useful flags: `--tags base|docker|infisical|stack|pangolin|monitoring|backups`, `--limit <instance-id>`.

- `--check` is meant for a host that has been applied once. On a fresh host it can fail where Docker is not installed yet.
- A second `make host-apply` should report no changes (except the first run after a vault change).
- `stack_start` (default `true` in `group_vars/prod/main.yml`): set `-e stack_start=false` to write all files but not run `docker compose up`. `-e '{"stack_services":["pangolin","gerbil","traefik"]}'` limits `up` to some services.
- Compose, Pangolin config and monitoring change only through Ansible. CI only pulls images and restarts services.

### First-run order

1. `tofu apply` for `prod` (all three stages), so the instance, data volume and RDS exist. Put the RDS endpoint in `main.yml`.
2. Fill the vault (above). Run `make host-check` and read it. If the ECR images do not exist yet, run `make host-apply ANSIBLE_ARGS="-e stack_start=false"`; otherwise `make host-apply`. This sets up the OS, Docker, files and timers.
3. Database roles, once. In one terminal `make db-tunnel`, in another:

   ```sh
   cd ansible
   ansible-playbook -i localhost, db-roles.yml
   ```

   It asks for the `stepwhere_admin` password (Secrets Manager secret of `stepwhere-prod-db`). It creates `stepwhere_app` (owns schema `public`, may create schemas, which drizzle needs) and `stepwhere_backup` (`pg_read_all_data`), with the passwords from the vault. Passwords of existing roles are not touched unless you add `-e db_roles_update_passwords=true`. Put the `stepwhere_app` password into `DATABASE_URL` in Infisical.
4. Let CI push the first arm64 images, then run `make host-apply` again with `stack_start` true. The whole stack comes up.
5. Pangolin first run (below), then DNS.
6. Beszel: open `monitor.stepwhere.in`, create the hub user, **Add system**, copy the public key into `vault_beszel_agent_key`, run `make host-apply`. The agent only starts once the key is set. In the hub, the system's host is `/beszel_socket/beszel.sock` (a unix socket shared with the hub; no TCP port). Do not enable Beszel's own S3 backup: the instance role cannot delete in the backups bucket.
7. Check the backups: `sudo systemctl start stepwhere-db-backup stepwhere-config-backup` (through `make shell`), then `journalctl -u stepwhere-db-backup`.

## Pangolin first run

1. DNS: `access.stepwhere.in` must resolve to the Elastic IP before Traefik can get its Let's Encrypt certificate (HTTP-01 over port 80). While testing, set `acme_ca_server` in `main.yml` to the staging directory to stay clear of rate limits, then switch back and delete `/srv/pangolin/config/letsencrypt/acme.json`.
2. Get the one-time setup token: `docker compose -f /srv/stepwhere/compose.yml logs pangolin | grep -i token`. Open `https://access.stepwhere.in/auth/initial-setup`, create your admin user, turn on 2FA.
3. Create the organisation and a **Local Site** (same host, no tunnel).
4. Create the resources below. Targets are Compose service names on the `edge` network.

| Host | Target (on the Local Site) | Scheme | Pangolin auth | Notes |
| --- | --- | --- | --- | --- |
| `access.stepwhere.in` | (dashboard, routed by `dynamic_config.yml`) | HTTPS | Pangolin login + 2FA | Not a resource; Ansible manages it |
| `api.stepwhere.in` | `server:8223` | HTTPS | none | App has its own auth; WebSockets |
| `share.stepwhere.in` | `share-view:80` | HTTPS | none | Public share links; the image proxies `/__share_api` to the server |
| `ingest.stepwhere.in` | `device-ingest-proxy:8290` | **plain HTTP, no HTTPS redirect** | none | Firmware; must never redirect |
| `panel.stepwhere.in` | `admin:80` | HTTPS | Pangolin SSO | Extra gate before the app login |
| `monitor.stepwhere.in` | `beszel-hub:8090` | HTTPS | Pangolin SSO | |
| `logs.stepwhere.in` | `dozzle:8080` | HTTPS | Pangolin SSO | |

### The `ingest` resource

Pangolin 1.25.3 generates a resource with `ssl = false` on Traefik's `web` entrypoint with no redirect router (`getTraefikConfig.ts`), and its update API accepts `ssl`. Resources are created with `ssl = true`, and I could not confirm the dashboard has a switch for it. Test this early (plan section 7, spike item 1): `curl -i http://ingest.stepwhere.in/health` must answer from the proxy with no 301/308.

If Pangolin cannot do it, use the commented fallback in `roles/pangolin/templates/dynamic_config.yml.j2`: uncomment the `ingest-router` and `ingest-service`, run `make host-apply`, and do not create the `ingest` resource in Pangolin (Traefik reloads the file by itself).

### Other things to know

- **No access logs.** `traefik_config.yml` has no `accessLog` block on purpose: share-link tokens are in URL paths. Do not add one.
- Traefik's insecure API and dashboard are switched off (the installer template enables them).
- Security headers (HSTS, nosniff, Referrer-Policy for `api` and `panel`) are not set here; use Pangolin's custom response headers on the resource, or set them in the apps (plan section 7, spike item 5).
- UDP 51820/21820 (tunnels) are not published and not open. To use a remote site, open them on `sg-app` and uncomment the two ports in `compose.yml.j2`.
- CI runs `docker compose` as root through SSM Run Command. The ECR helper config is in `/root/.docker/config.json`, so the script must run with `HOME=/root` (`export HOME=/root`) if the SSM shell does not set it.

## Backups

| Job | When (UTC / IST) | What | Where |
| --- | --- | --- | --- |
| `stepwhere-db-backup` | 21:00 / 02:30 | `pg_dump -Fc` of `stepwhere` as `stepwhere_backup` (`postgres:18-alpine`, `sslmode=verify-full`, RDS CA bundle at `/etc/stepwhere/rds-ca.pem`) | `s3://stepwhere-backups/daily/postgres/<date>.dump`, plus `monthly/postgres/<YYYY-MM>.dump` on the 1st |
| `stepwhere-config-backup` | 21:30 / 03:00 | tar.gz of `/srv/pangolin` and `/srv/beszel` (taken while running; SQLite files are copied with their WAL) | `daily/config/<date>.tar.gz`, plus `monthly/config/<YYYY-MM>.tar.gz` |

- Uploads use the `amazon/aws-cli` container with the instance role (IMDSv2, hop limit 2). The role can only `PutObject`: the scripts never list or delete remotely, and they remove their local scratch files.
- Optional healthchecks.io pings (`vault_healthchecks_db_url`, `vault_healthchecks_config_url`): success pings the URL, failure pings `<url>/fail`. Empty means no ping.
- Redis is not backed up (rebuildable).

## Pinned versions

Set in `group_vars/prod/main.yml`; all publish `linux/arm64`. Check the release notes before bumping Pangolin, Gerbil, Traefik and the Badger plugin together.

| Component | Version |
| --- | --- |
| Pangolin / Gerbil | 1.25.3 / 1.5.2 |
| Traefik / Badger plugin | v3.7.16 / v1.8.0 |
| Beszel hub and agent | 0.21.1 |
| Dozzle | v11.3.5 |
| Redis | 7.4-alpine |
| Postgres client (backups) / AWS CLI (backups) | 18-alpine / 2.39.1 |

## Lint

```sh
cd ansible
ansible-lint --profile production
ansible-playbook -i <inventory with a [prod] group> --syntax-check site.yml
```
