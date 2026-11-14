# Stepwhere Production Infra And CI/CD Runbook

This directory contains the production deployment assets for the Stepwhere VPS stack and documents the CI/CD model around them.

The production stack is intentionally simple:

- GitHub Actions builds Docker images.
- DigitalOcean Container Registry stores images.
- A VPS runs Docker Compose from `/opt/stepwhere`.
- Edge Caddy terminates public traffic.
- The server loads runtime secrets from Infisical.
- The admin and public share apps are static builds served by internal Caddy containers.
- The device ingest proxy exposes a temporary HTTP firmware endpoint and forwards to the main API.

## Files

- `.github/workflows/build-and-release.yml`: Main CI/CD workflow for build, migration, and deploy.
- `deploy/Caddyfile`: Edge Caddy config for API, admin panel, and device ingest hosts.
- `deploy/docker-compose.prod.yml`: Production Compose stack for server, admin, device ingest proxy, Redis, and edge Caddy.
- `deploy/env.production.example`: Template for `/opt/stepwhere/.env` on the VPS.
- `apps/server/Dockerfile`: Production server image, including Infisical CLI.
- `apps/admin/Dockerfile`: Static admin build image served by Caddy on HTTP.
- `apps/admin/Caddyfile`: Internal HTTP-only static admin server config.
- `apps/share-view/Dockerfile`: Public live-share and family-invite static image.
- `apps/share-view/Caddyfile`: Internal static server and browser security policy.
- `apps/device-ingest-proxy/Dockerfile`: Env-free Hono proxy image for firmware HTTP ingest.

## Production Services

Compose services:

- `server`
  - Image: `${SERVER_IMAGE_REPOSITORY}:${SERVER_IMAGE_TAG}`
  - Container: `stepwhere-server`
  - Host binding: `127.0.0.1:8223:8223`
  - Runtime secrets: Infisical via `infisical run`
  - Requires Redis to be healthy before start.

- `admin`
  - Image: `${ADMIN_IMAGE_REPOSITORY}:${ADMIN_IMAGE_TAG}`
  - Container: `stepwhere-admin`
  - Host binding: `127.0.0.1:4800:80`
  - Static SPA served over internal HTTP by Caddy.
  - Public HTTPS is handled by the separate edge Caddy service.

- `share-view`
  - Image: `${SHARE_VIEW_IMAGE_REPOSITORY}:${SHARE_VIEW_IMAGE_TAG}`
  - Container: `stepwhere-share-view`
  - Host binding: `127.0.0.1:4810:80`
  - Public endpoint: `https://share.stepwhere.in`
  - `/__share_api/*` is proxied by edge Caddy to the API, including WebSockets.

- `device-ingest-proxy`
  - Image: `${DEVICE_INGEST_PROXY_IMAGE_REPOSITORY}:${DEVICE_INGEST_PROXY_IMAGE_TAG}`
  - Container: `stepwhere-device-ingest-proxy`
  - Host binding: `127.0.0.1:8290:8290`
  - Public endpoint: `http://ingest.stepwhere.in/location`
  - Upstream: `http://server:8223/v1/telemetry/location`
  - First pass has no env, no Infisical, and no `x-device-ingest-key` injection.

- `redis`
  - Image: `redis:7.4-alpine`
  - Container: `stepwhere-redis`
  - No public host port.
  - Password comes from `/opt/stepwhere/.env` as `REDIS_PASSWORD`.

- `caddy`
  - Image: `caddy:2.10-alpine`
  - Container: `stepwhere-caddy`
  - Uses `network_mode: host`
  - Mounts `/opt/stepwhere/Caddyfile`.
  - Owns public routing and TLS, except the firmware ingest host is intentionally HTTP-only.

Volumes:

- `stepwhere_redis_data`
- `stepwhere_caddy_data`
- `stepwhere_caddy_config`

## Public Runtime Layout

- `https://api.stepwhere.in` -> edge Caddy -> `127.0.0.1:8223`
- `https://panel.stepwhere.in` -> edge Caddy -> `127.0.0.1:4800`
- `https://share.stepwhere.in` -> edge Caddy -> `127.0.0.1:4810`
- `http://ingest.stepwhere.in` -> edge Caddy HTTP-only site -> `127.0.0.1:8290`

DNS records required:

```text
api.stepwhere.in    -> VPS public IP
panel.stepwhere.in  -> VPS public IP
share.stepwhere.in  -> VPS public IP
ingest.stepwhere.in -> VPS public IP
```

Firewall:

- Allow public `80/tcp`.
- Allow public `443/tcp`.
- Do not open `8223/tcp`, `4800/tcp`, `8290/tcp`, or Redis publicly.

## Edge Caddy Details

`deploy/Caddyfile` has three sites:

```caddyfile
api.stepwhere.in {
	reverse_proxy 127.0.0.1:8223
}

panel.stepwhere.in {
	reverse_proxy 127.0.0.1:4800
}

http://ingest.stepwhere.in {
	reverse_proxy 127.0.0.1:8290
}
```

The API site explicitly uses RSA-compatible TLS settings:

```caddyfile
tls {
	key_type rsa2048
	protocols tls1.2 tls1.3
	ciphers TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
}
```

The ingest site is written as `http://ingest.stepwhere.in` on purpose. Do not change it to `ingest.stepwhere.in` unless firmware can support HTTPS.

Caddy is force-recreated whenever the Caddy service is selected for deploy because Docker Compose does not restart a running container just because a bind-mounted `Caddyfile` changed.

## GitHub Secrets

Required repository or environment secrets:

```env
DIGITALOCEAN_ACCESS_TOKEN=
VPS_HOST=
VPS_USER=
VPS_SSH_PRIVATE_KEY=
VPS_SSH_PASSPHRASE=
VPS_SSH_PORT=22
```

Notes:

- `DIGITALOCEAN_ACCESS_TOKEN` is used by GitHub to push images and by the VPS deploy script to pull from DigitalOcean Container Registry.
- `VPS_SSH_PRIVATE_KEY` may be passphrase-protected.
- If the SSH key is encrypted, `VPS_SSH_PASSPHRASE` is required.
- SSH/SCP are handled by `appleboy/ssh-action@v1` and `appleboy/scp-action@v1`.
- We switched to Appleboy actions because manual `ssh-agent` plus `SSH_ASKPASS` was hanging on passphrase-protected keys in CI.
- `REDIS_PASSWORD` is not a GitHub secret anymore. It lives in `/opt/stepwhere/.env` so plain VPS `docker compose up` can work.

## GitHub Variables

Required repository variables:

```env
ADMIN_IMAGE_REPOSITORY=registry.digitalocean.com/<registry>/stepwhere-admin
SHARE_VIEW_IMAGE_REPOSITORY=registry.digitalocean.com/<registry>/stepwhere-share-view
DEVICE_INGEST_PROXY_IMAGE_REPOSITORY=registry.digitalocean.com/<registry>/stepwhere-device-ingest-proxy
SERVER_IMAGE_REPOSITORY=registry.digitalocean.com/<registry>/stepwhere-server

INFISICAL_ENV_SLUG=prod

INFISICAL_ADMIN_PROJECT_SLUG=
INFISICAL_ADMIN_GITHUB_IDENTITY_ID=

INFISICAL_SHARE_PROJECT_SLUG=
INFISICAL_SHARE_GITHUB_IDENTITY_ID=

INFISICAL_SERVER_PROJECT_SLUG=
INFISICAL_SERVER_GITHUB_IDENTITY_ID=
```

Important:

- Admin and server Infisical variables are app-specific because they may live in different Infisical projects.
- If one Infisical GitHub OIDC identity can read both projects, set both identity variables to the same value.
- Do not use one shared `INFISICAL_PROJECT_SLUG`.
- The device ingest proxy has no Infisical project in the first pass.

Share view build variables (Infisical share project, `INFISICAL_ENV_SLUG` env):

```env
VITE_GOOGLE_MAPS_API_KEY=
VITE_APP_STORE_URL=
VITE_PLAY_STORE_URL=
# Apple Developer Team ID; builds .well-known/apple-app-site-association for com.stepwhere
APPLE_TEAM_ID=
# Comma-separated SHA-256 signing cert fingerprints for com.stepwhere
# (Play Console > App integrity > App signing key; add the upload key for sideloaded APKs)
ANDROID_CERT_SHA256_FINGERPRINTS=AA:BB:...,CC:DD:...
```

`APPLE_TEAM_ID` and `ANDROID_CERT_SHA256_FINGERPRINTS` are required. Without them the
association files are not generated, `/family/join` links stop opening the app, and the
share view job fails at "Check app association variables".

Common failure:

If a Docker build log shows tags like this:

```text
--tag :sha-... --tag :main
```

then the matching image repository variable is missing. For the proxy, add:

```env
DEVICE_INGEST_PROXY_IMAGE_REPOSITORY=registry.digitalocean.com/<registry>/stepwhere-device-ingest-proxy
```

## Protected GitHub Environment

Create a protected environment:

```text
production-migrations
```

It must require reviewer approval.

The `migrate` job uses this environment and runs only when:

- Drizzle migration files change, or
- `workflow_dispatch.run_migrations=true`.

Migration secrets are fetched from the server Infisical project using GitHub OIDC.

## VPS Prerequisites

Install on the VPS:

- Docker Engine
- Docker Compose plugin
- `curl`
- `doctl`
- Infisical CLI

The deploy path is:

```text
/opt/stepwhere
```

The workflow can bootstrap this directory, but `VPS_USER` needs limited passwordless sudo.

Create sudoers file:

```sh
sudo visudo -f /etc/sudoers.d/stepwhere-deploy
```

Recommended limited entry:

```sudoers
<VPS_USER> ALL=(root) NOPASSWD: /usr/bin/mkdir, /usr/bin/chown
```

If binaries live elsewhere, check:

```sh
command -v mkdir
command -v chown
```

The workflow uses `sudo -n`, so it fails immediately instead of prompting if sudo is not configured.

The deploy user must run Docker without sudo:

```sh
sudo usermod -aG docker <VPS_USER>
```

Log out and back in after changing group membership.

Validation on VPS:

```sh
sudo -n mkdir -p /opt/stepwhere
sudo -n chown "$USER":"$USER" /opt/stepwhere
docker ps
docker compose version
```

## VPS `/opt/stepwhere/.env`

Create this file once:

```text
/opt/stepwhere/.env
```

Use `deploy/env.production.example` as the template.

Required values:

```env
SERVER_IMAGE_REPOSITORY=registry.digitalocean.com/<registry>/stepwhere-server
SERVER_IMAGE_TAG=main

ADMIN_IMAGE_REPOSITORY=registry.digitalocean.com/<registry>/stepwhere-admin
ADMIN_IMAGE_TAG=main

DEVICE_INGEST_PROXY_IMAGE_REPOSITORY=registry.digitalocean.com/<registry>/stepwhere-device-ingest-proxy
DEVICE_INGEST_PROXY_IMAGE_TAG=main

INFISICAL_ENV=prod
INFISICAL_SERVER_PROJECT_ID=<server-infisical-project-id>
INFISICAL_PATH=/

CADDY_ACME_EMAIL=ops@stepwhere.in

REDIS_PASSWORD=<redis-password>
```

Rules:

- This file is persistent deployment state.
- The workflow updates image tag keys after successful deploys.
- Stable deploy tag is `main`, not `latest`.
- Immutable `sha-*` image tags are still pushed for traceability.
- Do not put `INFISICAL_TOKEN` in this file.
- Do not put Infisical client ID or client secret in this file.
- `REDIS_PASSWORD` intentionally lives here so Redis and its healthcheck can start without Infisical.

Why `REDIS_PASSWORD` is duplicated:

- Redis needs its password before the server can fetch secrets from Infisical.
- The server's Infisical `REDIS_URL` must contain the same password.
- This duplication is accepted while Redis is local Compose infrastructure.

## VPS `~/.bashrc` Infisical Token

The server runtime token comes from the VPS shell environment.

Add near the top of `~/.bashrc`:

```sh
export INFISICAL_TOKEN="..."
```

If generating dynamically:

```sh
export INFISICAL_TOKEN="$(
  infisical login \
    --method=universal-auth \
    --client-id="..." \
    --client-secret="..." \
    --silent \
    --plain
)"
```

If `.bashrc` has a non-interactive guard:

```sh
case $- in
  *i*) ;;
  *) return;;
esac
```

the `INFISICAL_TOKEN` export must appear before that block.

The workflow:

- sources `~/.bashrc`
- switches to `set -u` only after sourcing it
- checks `INFISICAL_TOKEN`
- exports it
- lets Docker Compose interpolate `${INFISICAL_TOKEN}` directly from the remote shell

The workflow does not write `INFISICAL_TOKEN` into `.deploy.env`.

Validation without printing the token:

```sh
ssh <VPS_USER>@<VPS_HOST> 'set -e; . "$HOME/.bashrc"; set -u; : "${INFISICAL_TOKEN:?missing}"; echo ok'
```

## Infisical Layout

The setup uses separate Infisical projects per app and root secret paths.

Do not configure `/admin` or `/server` folders in Infisical. The workflow intentionally omits `secret-path`, so the Infisical action reads from project root `/`.

### Admin Infisical Project Root

Environment: `prod`

Root `/` values:

```env
VITE_STEPWHERE_API_URL=https://api.stepwhere.in
VITE_STEPWHERE_AUTH_URL=https://api.stepwhere.in/api/auth
```

Usage:

- GitHub Actions fetches these with OIDC.
- They are passed as Vite build args into the admin image.
- Admin container does not use Infisical at runtime.

### Server Infisical Project Root

Environment: `prod`

Root `/` values:

```env
NODE_ENV=production
PORT=8223

DATABASE_URL=
DIRECT_URL=

BETTER_AUTH_SECRET=
BETTER_AUTH_URL=https://api.stepwhere.in
BETTER_AUTH_TRUSTED_ORIGINS=https://panel.stepwhere.in
ADMIN_AUTH_ALLOWED_ORIGINS=https://panel.stepwhere.in
API_CORS_ALLOWED_ORIGINS=http://127.0.0.1:5174,http://localhost:5174

PUBLIC_SHARE_APP_URL=https://share.stepwhere.in
SHARE_LINK_SIGNING_SECRET=

AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_AVATARS_BUCKET=stepwhere-avatars-prod-<AWS-ACCOUNT-ID>-ap-south-1

DEVICE_INGEST_AUTH_DISABLED=false
DEVICE_INGEST_API_KEY=
DEVICE_PROVISIONING_SECRET=

REDIS_URL=redis://default:<same-value-as-VPS-REDIS_PASSWORD>@redis:6379

GOOGLE_GEOCODING_API_KEY=
GOOGLE_PLACES_API_KEY=
GOOGLE_ROADS_API_KEY=
GOOGLE_OAUTH_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
# Optional. Mobile Google email verification only needs the web client ID above.
GOOGLE_OAUTH_CLIENT_SECRET=

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID=
DISABLE_TWILLIO_OTP=false

TRAIL_ROAD_SNAPPING_ENABLED=false
HISTORY_ROAD_SNAPPING_ENABLED=false
REALTIME_DEBUG=false
ENABLE_API_REFERENCE=false
```

Mobile Google email verification uses the native Google SDK and sends a Google ID token to the API. It does not use `/api/auth/callback/google` and does not require localhost or tunnel OAuth redirect URIs.

Google Cloud setup must include a Web OAuth client shared by mobile `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` and API `GOOGLE_OAUTH_CLIENT_ID`, Android OAuth clients for `com.stepwhere` and `com.stepwhere.dev` with the required SHA-1 fingerprints, and iOS OAuth clients for `com.stepwhere` and `com.stepwhere.dev`.

Temporary firmware testing value:

```env
DEVICE_INGEST_AUTH_DISABLED=true
```

This disables the main API's `x-device-ingest-key` requirement for `/v1/telemetry/location`. Payload validation and active child-device binding checks still run. Revert it to `false` once the device ingest proxy can inject the key upstream.

## Docker Images

All production images use Node 24 where applicable.

### Server Image

Source: `apps/server/Dockerfile`

Important details:

- Uses Turbo prune for `@stepwhere/server`.
- Copies root `tsconfig.base.json` into pruned build stages.
- Installs native build dependencies in the builder stage.
- Installs runtime native libraries in the runner stage.
- Installs Infisical CLI in the runner stage.
- Runs as non-root `stepwhere`.
- Workdir is `/app/apps/server`.
- Exposes `8223`.
- Starts with:

```sh
infisical run --env="$INFISICAL_ENV" --projectId="$INFISICAL_PROJECT_ID" --path="${INFISICAL_PATH:-/}" -- node dist/index.js
```

Workarounds kept intentionally:

- `tsc-alias --resolve-full-paths` runs after `tsc` because Node ESM needs `.js` extensions in emitted relative imports.
- Runner copies `/app/apps/server/node_modules` because pnpm workspace resolution otherwise resolved the wrong `ws` package in Docker.
- `start-server.sh` was removed. The Dockerfile `CMD` owns server startup.

### Admin Image

Source: `apps/admin/Dockerfile`

Important details:

- Fetches Vite build values in CI from the admin Infisical project.
- Builds static files with `pnpm --filter shadcn-admin build`.
- Runner is `caddy:2.10-alpine`.
- Serves only HTTP on `:80` inside the container.
- Public HTTPS is handled by edge Caddy.

Expected harmless logs from the admin container:

```text
server is listening only on the HTTP port
HTTP/2 skipped because it requires TLS
HTTP/3 skipped because it requires TLS
```

`docker ps` may show image metadata ports like `443/tcp`, `443/udp`, and `2019/tcp` for `stepwhere-admin`. Those are not public host bindings. The only binding is:

```text
127.0.0.1:4800->80/tcp
```

### Device Ingest Proxy Image

Source: `apps/device-ingest-proxy/Dockerfile`

Important details:

- Hono app.
- No Infisical.
- No runtime env.
- Fixed port `8290`.
- Workdir is `/app/apps/device-ingest-proxy`.
- Runner only copies root `node_modules`, package metadata, and `dist`.
- App-local `node_modules` is not copied because this package uses hoisted pnpm workspace dependencies.

Endpoints:

```http
GET /health
POST /location
```

Proxy upstream:

```text
http://server:8223/v1/telemetry/location
```

## CI/CD Workflow

Workflow:

```text
.github/workflows/build-and-release.yml
```

Triggers:

- `push` to `main`
- manual `workflow_dispatch`

Concurrency:

```text
build-and-release-production
```

`cancel-in-progress` is false so production deploys do not interrupt each other.

Permissions:

```yaml
contents: read
id-token: write
```

`id-token: write` is required for Infisical OIDC.

### Setup Job

The setup job:

- computes stable deploy tags as `main`
- computes immutable tags as `sha-${GITHUB_SHA::12}`
- detects path changes with `dorny/paths-filter`
- combines push filters and manual dispatch inputs
- decides which jobs should run

Path filters:

- Server:
  - `.dockerignore`
  - `apps/server/**`
  - `package.json`
  - `packages/**`
  - `pnpm-lock.yaml`
  - `pnpm-workspace.yaml`
  - `turbo.json`

- Admin:
  - `.dockerignore`
  - `apps/admin/**`
  - `package.json`
  - `packages/**`
  - `pnpm-lock.yaml`
  - `pnpm-workspace.yaml`
  - `turbo.json`

- Device ingest proxy:
  - `.dockerignore`
  - `apps/device-ingest-proxy/**`
  - `package.json`
  - `packages/**`
  - `pnpm-lock.yaml`
  - `pnpm-workspace.yaml`
  - `turbo.json`

- Caddy:
  - `deploy/Caddyfile`

- Infra:
  - `deploy/docker-compose.prod.yml`

- Migrations:
  - `apps/server/drizzle/**/*.sql`
  - `apps/server/drizzle/meta/**`

### Server Job

Runs when server changes or migrations are requested.

Steps:

```sh
pnpm install --frozen-lockfile
pnpm --filter @stepwhere/server typecheck
pnpm --filter @stepwhere/server test
docker build/push apps/server/Dockerfile
```

Pushed tags:

```text
${SERVER_IMAGE_REPOSITORY}:sha-<short-sha>
${SERVER_IMAGE_REPOSITORY}:main
```

### Admin Job

Runs when admin changes.

Steps:

```sh
pnpm install --frozen-lockfile
Infisical/secrets-action@v1.0.16 with admin project variables
pnpm --filter shadcn-admin lint
pnpm --filter shadcn-admin build
docker build/push apps/admin/Dockerfile
```

Build args:

```env
VITE_STEPWHERE_API_URL
VITE_STEPWHERE_AUTH_URL
```

Pushed tags:

```text
${ADMIN_IMAGE_REPOSITORY}:sha-<short-sha>
${ADMIN_IMAGE_REPOSITORY}:main
```

### Device Ingest Proxy Job

Runs when proxy paths change or `workflow_dispatch.device_ingest_proxy=true`.

Steps:

```sh
pnpm install --frozen-lockfile
pnpm --filter @stepwhere/device-ingest-proxy typecheck
pnpm --filter @stepwhere/device-ingest-proxy test
docker build/push apps/device-ingest-proxy/Dockerfile
```

Pushed tags:

```text
${DEVICE_INGEST_PROXY_IMAGE_REPOSITORY}:sha-<short-sha>
${DEVICE_INGEST_PROXY_IMAGE_REPOSITORY}:main
```

### Migration Job

Runs when migration changes are detected or manually requested.

Requires approval through `production-migrations`.

Steps:

```sh
Infisical/secrets-action@v1.0.16 with server project variables
pnpm install --frozen-lockfile
pnpm --filter @stepwhere/server exec drizzle-kit migrate --config drizzle.config.ts
```

Infisical action reads from the server project root `/`.

### Deploy Job

Runs when any deployable component changed or `workflow_dispatch.deploy=true`.

Uses Appleboy SSH/SCP with key passphrase support.

Steps:

1. Ensure `/opt/stepwhere` exists.
2. `sudo -n mkdir -p /opt/stepwhere` if missing.
3. `sudo -n chown "$USER":"$USER" /opt/stepwhere`.
4. Upload `deploy/docker-compose.prod.yml` and `deploy/Caddyfile` to `/opt/stepwhere`.
5. Source `~/.bashrc`.
6. Require `INFISICAL_TOKEN`.
7. Validate `/opt/stepwhere/.env` exists.
8. Validate required keys are present.
9. Copy `.env` to `.next.env`.
10. Update only changed image tags.
11. Copy `.next.env` to temporary `.deploy.env`.
12. Validate Caddy config using `caddy:2.10-alpine`.
13. Login to DigitalOcean Container Registry.
14. Pull affected images.
15. Run `docker compose up -d` for affected services.
16. Force-recreate Caddy if selected.
17. Prune unused Docker images.
18. Check local health endpoints.
19. Move `.next.env` to `.env` only after health checks pass.
20. Remove `.deploy.env` and `.next.env` through shell trap.

Required `.env` keys checked by deploy:

```text
SERVER_IMAGE_REPOSITORY
SERVER_IMAGE_TAG
ADMIN_IMAGE_REPOSITORY
ADMIN_IMAGE_TAG
DEVICE_INGEST_PROXY_IMAGE_REPOSITORY
DEVICE_INGEST_PROXY_IMAGE_TAG
INFISICAL_ENV
INFISICAL_SERVER_PROJECT_ID
INFISICAL_PATH
CADDY_ACME_EMAIL
REDIS_PASSWORD
```

Local health gates:

```sh
curl -fsS http://127.0.0.1:8223/health
curl -fsS http://127.0.0.1:4800/
curl -fsS http://127.0.0.1:8290/health
```

If a health gate fails, the workflow prints the relevant container logs.

## Manual Workflow Dispatch

Inputs:

```text
server
admin
device_ingest_proxy
caddy
deploy
run_migrations
```

Examples:

- Build and deploy only server:

```text
server=true
deploy=false
```

The server change itself causes deploy selection.

- Build and deploy the device ingest proxy:

```text
device_ingest_proxy=true
```

- Reconcile existing VPS stack without rebuilding images:

```text
deploy=true
server=false
admin=false
device_ingest_proxy=false
caddy=false
run_migrations=false
```

- Deploy Caddy config only:

```text
caddy=true
```

- Run production migrations:

```text
run_migrations=true
```

This also builds the server image because migration changes and server code should stay aligned.

## Device Firmware HTTP Ingest

Temporary firmware endpoint:

```http
POST http://ingest.stepwhere.in/location
Content-Type: application/json
```

Minimum payload:

```json
{
  "hardwareIdentifier": "SW-DEV-0001",
  "latitude": 18.5204,
  "longitude": 73.8567,
  "stepCounter": 12345
}
```

Full payload:

```json
{
  "hardwareIdentifier": "SW-DEV-0001",
  "latitude": 18.5204,
  "longitude": 73.8567,
  "accuracyMeters": 12.5,
  "batteryPercent": 82,
  "batteryVoltageMv": 3890,
  "signalStrength": 4,
  "satelliteCount": 9,
  "stepCounter": 12345,
  "deviceState": "active"
}
```

Field rules:

- `hardwareIdentifier`: required string, non-empty.
- `latitude`: required number, `-90` to `90`.
- `longitude`: required number, `-180` to `180`.
- `stepCounter`: required integer, `>= 0`.
- `accuracyMeters`: optional number or `null`, `>= 0`.
- `batteryPercent`: optional integer or `null`, `0` to `100`.
- `batteryVoltageMv`: optional integer or `null`, `> 0`.
- `signalStrength`: optional integer or `null`, `0` to `5`.
- `satelliteCount`: optional integer or `null`, `>= 0`.
- `deviceState`: optional, one of `active`, `sleep`, `offline`.

Responses come from the main API:

- `201`: telemetry accepted.
- `400`: invalid JSON or invalid payload.
- `404`: no active child-device binding for the hardware identifier.
- `500`: proxy/API runtime failure.

Health:

```sh
curl -fsS http://ingest.stepwhere.in/health
```

Expected:

```json
{
  "ok": true,
  "service": "stepwhere-device-ingest-proxy"
}
```

Security warning:

- The proxy is intentionally unauthenticated in this first pass.
- It does not inject `x-device-ingest-key`.
- Server Infisical must temporarily set `DEVICE_INGEST_AUTH_DISABLED=true`.
- Next pass should give the proxy env/Infisical support and inject `x-device-ingest-key` upstream.

## Admin Auth And Authorization Notes

Production admin origin:

```text
https://panel.stepwhere.in
```

Server Infisical must include:

```env
BETTER_AUTH_TRUSTED_ORIGINS=https://panel.stepwhere.in
ADMIN_AUTH_ALLOWED_ORIGINS=https://panel.stepwhere.in
API_CORS_ALLOWED_ORIGINS=http://127.0.0.1:5174,http://localhost:5174
```

`API_CORS_ALLOWED_ORIGINS` is a comma-separated exact allowlist for general API
CORS. Keep it separate from Better Auth and admin-auth origin settings; do not
use a wildcard when credentials are enabled.

Platform admin model:

- `users.role = "admin"` controls admin panel/platform access.
- Family organization roles are separate and live in organization membership records.
- A mobile family admin is not a platform admin unless `users.role = "admin"`.

Platform admins must be able to access `/v1/admin/*` even if:

- `onboarding_completed=false`
- no family membership exists
- no active organization exists

Admin API routes are mounted before family/member routes so platform admins do not pass through family onboarding middleware.

Admin middleware still rejects:

- missing user
- non-admin users
- suspended admins
- banned admins
- admins without an email credential account

## Why The Current Workarounds Exist

### Appleboy SSH/SCP Instead Of Raw SSH Agent

The first pass used `webfactory/ssh-agent` and then a custom `SSH_ASKPASS` setup for passphrase-protected keys. GitHub Actions hung at `ssh-add`. We switched to:

- `appleboy/ssh-action@v1`
- `appleboy/scp-action@v1`

Both accept `key` and `passphrase` inputs directly.

### Limited Sudo For `/opt/stepwhere`

`VPS_USER` may not be able to create directories under `/opt`. The workflow uses sudo only to create/chown `/opt/stepwhere`; all uploads and deploy commands run as `VPS_USER`.

### Source `.bashrc` Before `set -u`

Some `.bashrc` files reference optional unset variables. The deploy script uses `set -e`, sources `.bashrc`, then enables `set -u`.

### Compose Reads `INFISICAL_TOKEN` From Shell

`INFISICAL_TOKEN` is not written to `.deploy.env`. Docker Compose interpolates it from the remote shell after `.bashrc` is sourced.

### Redis Password Lives In VPS `.env`

Redis itself is not Infisical-aware. Its password must be available before the server can start and read Infisical secrets.

### Stable Deploy Tag Is `main`

Manual force deploys should not depend on a `sha-*` tag generated in a run that did not build images. Images still push immutable `sha-*` tags, but deployment state uses `main`.

### Infisical Root Paths

Infisical project folders are not used. Admin and server have separate Infisical projects, and each uses project root `/`.

### Public HTTPS Is Not A Deploy Gate

The deploy workflow checks local services only. Public HTTPS can fail temporarily because of DNS, firewall, or ACME issuance, so it is validated separately after deploy.

### Admin Image Is HTTP-Only

The admin image is a static Caddy server on `:80`. TLS is intentionally handled by edge Caddy.

### Server ESM Build Uses `tsc-alias`

The server package is ESM. `tsc` emitted extensionless imports that Node could not resolve in Docker, so the build runs:

```sh
tsc -p tsconfig.json && tsc-alias -p tsconfig.json --resolve-full-paths
```

### Server Runner Copies App `node_modules`

The server image copies `/app/apps/server/node_modules` so Node resolves the server package's direct dependencies correctly. This fixed runtime issues with CommonJS/ESM interop for `ws`.

### Proxy Runner Does Not Copy App `node_modules`

The device ingest proxy package uses hoisted pnpm dependencies in the pruned workspace, so its app-local `node_modules` does not exist in Docker. The runner copies root `/app/node_modules` only.

## Mobile EAS Release Model

Mobile app release is intentionally separate from the server/admin/device-proxy Docker deploy workflow.

GitHub Actions does not own mobile CI/CD. The mobile GitHub workflow was removed. EAS Workflows are defined beside the mobile EAS project root:

```text
apps/mobile/.eas/workflows
```

Detailed runbook:

```text
apps/mobile/README.md
```

Mobile release decisions:

- Expo organization is `stepwhere-app`.
- Expo project is `stepwhere-mobile-app`.
- EAS Environment Variables are the mobile source of truth.
- Mobile does not use Infisical in the first pass.
- Firebase Android config is committed as normal public app config at `apps/mobile/google-services.json`.
- That file must come from one Firebase project containing Android clients for both `com.stepwhere.dev` and `com.stepwhere`.
- The Google Services Gradle plugin selects the matching client from the file based on the Android package name for the current build.
- Local mobile development pulls env from EAS with:
  ```sh
  cd apps/mobile
  pnpm env:pull:dev
  ```
- Mobile validation is handled by `apps/mobile/.eas/workflows/validate.yml`.
- Android production artifacts are built manually with:
  ```sh
  cd apps/mobile
  eas workflow:run .eas/workflows/build-android-production.yml
  ```
- Android production builds use the existing Play Store identifier:
  ```text
  com.stepwhere
  ```
- Android development builds use:
  ```text
  com.stepwhere.dev
  ```
- Google Play internal and closed testing use production Android AABs built with `com.stepwhere`.
- Play Console upload remains manual.
- Store submission automation is out of scope for the first pass.
- No EAS `submit` or `update` jobs are configured.
- No production mobile workflow runs automatically on push to `main`.
- OTA config is prepared in the Expo config, but OTA publishing is not enabled until the guard policy is finalized.

## Manual VPS Compose Usage

From `/opt/stepwhere`:

```sh
cd /opt/stepwhere
. "$HOME/.bashrc"
: "${INFISICAL_TOKEN:?missing}"
export INFISICAL_TOKEN
docker compose -f docker-compose.prod.yml up -d
```

From another directory:

```sh
. "$HOME/.bashrc"
: "${INFISICAL_TOKEN:?missing}"
export INFISICAL_TOKEN
docker compose --env-file /opt/stepwhere/.env -f /opt/stepwhere/docker-compose.prod.yml up -d
```

Recreate only server after Infisical runtime changes:

```sh
cd /opt/stepwhere
. "$HOME/.bashrc"
: "${INFISICAL_TOKEN:?missing}"
export INFISICAL_TOKEN
docker compose --env-file .env -f docker-compose.prod.yml up -d --force-recreate server
```

## Validation Commands

### Local YAML

```sh
node -e "const fs=require('fs'); const yaml=require('yaml'); ['.github/workflows/build-and-release.yml','deploy/docker-compose.prod.yml'].forEach((file)=>yaml.parse(fs.readFileSync(file,'utf8'))); console.log('yaml ok')"
```

### Local Compose Render

```sh
INFISICAL_TOKEN=dummy \
SERVER_IMAGE_REPOSITORY=registry.digitalocean.com/test/stepwhere-server \
SERVER_IMAGE_TAG=main \
ADMIN_IMAGE_REPOSITORY=registry.digitalocean.com/test/stepwhere-admin \
ADMIN_IMAGE_TAG=main \
DEVICE_INGEST_PROXY_IMAGE_REPOSITORY=registry.digitalocean.com/test/stepwhere-device-ingest-proxy \
DEVICE_INGEST_PROXY_IMAGE_TAG=main \
INFISICAL_ENV=prod \
INFISICAL_SERVER_PROJECT_ID=server-project-id \
INFISICAL_PATH=/ \
CADDY_ACME_EMAIL=ops@stepwhere.in \
REDIS_PASSWORD=dummy \
docker compose -f deploy/docker-compose.prod.yml config
```

### Server

```sh
pnpm --filter @stepwhere/server typecheck
pnpm --filter @stepwhere/server test
docker build --file apps/server/Dockerfile --tag stepwhere-server:ci .
```

### Admin

```sh
pnpm --filter shadcn-admin lint
VITE_STEPWHERE_API_URL=https://api.stepwhere.in \
VITE_STEPWHERE_AUTH_URL=https://api.stepwhere.in/api/auth \
pnpm --filter shadcn-admin build
docker build \
  --file apps/admin/Dockerfile \
  --build-arg VITE_STEPWHERE_API_URL=https://api.stepwhere.in \
  --build-arg VITE_STEPWHERE_AUTH_URL=https://api.stepwhere.in/api/auth \
  --tag stepwhere-admin:ci .
```

### Device Ingest Proxy

```sh
pnpm --filter @stepwhere/device-ingest-proxy typecheck
pnpm --filter @stepwhere/device-ingest-proxy test
docker build --file apps/device-ingest-proxy/Dockerfile --tag stepwhere-device-ingest-proxy:ci .
```

Container smoke:

```sh
cid=$(docker run -d -p 127.0.0.1:8299:8290 stepwhere-device-ingest-proxy:ci)
curl -fsS http://127.0.0.1:8299/health
docker rm -f "$cid"
```

### VPS Local Health

```sh
curl -fsS http://127.0.0.1:8223/health
curl -fsS http://127.0.0.1:4800/
curl -fsS http://127.0.0.1:8290/health
```

### Public Health

```sh
curl -fsS https://api.stepwhere.in/health
curl -fsS https://panel.stepwhere.in/
curl -fsS http://ingest.stepwhere.in/health
```

## Troubleshooting

### Docker Build Tag Is `:main` Or `:sha-*`

Missing GitHub repository variable for an image repository.

Check:

```env
SERVER_IMAGE_REPOSITORY
ADMIN_IMAGE_REPOSITORY
DEVICE_INGEST_PROXY_IMAGE_REPOSITORY
```

### `/opt/stepwhere/.env is missing`

Create it from `deploy/env.production.example` on the VPS.

### Missing Required Key In `/opt/stepwhere/.env`

The deploy script validates all required keys before Compose runs. Add the missing key to `/opt/stepwhere/.env`.

### `INFISICAL_TOKEN is required on the VPS`

The workflow sourced `~/.bashrc` but did not see an exported token.

Fix:

- Put `export INFISICAL_TOKEN=...` before any non-interactive `.bashrc` guard.
- Validate with the SSH command in the Infisical token section.

### Redis Is Unhealthy

Check that `/opt/stepwhere/.env` contains:

```env
REDIS_PASSWORD=...
```

and that server Infisical contains the matching:

```env
REDIS_URL=redis://default:<same-password>@redis:6379
```

Redis healthcheck reads `REDIS_PASSWORD` from the Redis container environment.

### Server Starts Then Curl Gets Connection Reset

Inspect server logs:

```sh
docker logs --tail 200 stepwhere-server
```

Past causes:

- missing ESM `.js` extensions in built output, fixed by `tsc-alias`
- wrong `ws` dependency resolution, fixed by copying app-local `node_modules`
- missing or wrong Infisical runtime env

### Caddy TLS Fails Publicly But Local Services Are Healthy

Check:

```sh
docker logs --tail 200 stepwhere-caddy
```

Also verify:

- DNS points to the VPS
- firewall allows `80/tcp` and `443/tcp`
- ACME can reach Caddy

The deploy workflow intentionally does not fail on public HTTPS readiness.

### Admin Container Shows 443/2019 Ports

Those are inherited image metadata from `caddy:2.10-alpine`, not public bindings. Confirm actual bindings with:

```sh
docker ps
```

Expected:

```text
127.0.0.1:4800->80/tcp
```

### Admin Email Auth Origin Rejected

Check server Infisical:

```env
ADMIN_AUTH_ALLOWED_ORIGINS=https://panel.stepwhere.in
BETTER_AUTH_TRUSTED_ORIGINS=https://panel.stepwhere.in
```

Then recreate server.

### Device Simulator API CORS Rejected

To call `https://api.stepwhere.in` directly from the local simulator, set in
server Infisical:

```env
API_CORS_ALLOWED_ORIGINS=http://127.0.0.1:5174,http://localhost:5174
```

Then recreate the server container. Verify the preflight with:

```sh
curl -i -X OPTIONS https://api.stepwhere.in/v1/telemetry/location \
  -H 'Origin: http://127.0.0.1:5174' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type,x-device-ingest-key'
```

### Platform Admin Blocked By Onboarding

Admin routes should be mounted before family routes. Platform admins should not require mobile onboarding, family membership, or active organization for `/v1/admin/*`.

### Firmware Ingest Returns 404

The request reached the API, but there is no active child-device binding for the provided `hardwareIdentifier`.

### Firmware Ingest Returns 400

Payload failed server validation. Check field names, numeric ranges, and `Content-Type: application/json`.

### Firmware Ingest Returns 401

The main server still requires `x-device-ingest-key`. For temporary HTTP proxy testing, set in server Infisical:

```env
DEVICE_INGEST_AUTH_DISABLED=true
```

Then recreate server.

### Firmware Ingest Returns 502 Or 504

The device ingest proxy gives the main API 15 seconds to complete a telemetry
request. It returns `UPSTREAM_TIMEOUT` with HTTP 504 when that deadline expires,
or `UPSTREAM_UNAVAILABLE` with HTTP 502 for connection and transport failures.
Use the response `x-request-id` to correlate proxy and server logs. Do not retry
automatically at the proxy because the upstream transaction may have committed
before the response path failed.

Compare the API's process-only and database-backed checks:

```sh
curl -fsS http://127.0.0.1:8223/health
curl -fsS http://127.0.0.1:8223/ready
```

Telemetry database statement and idle-in-transaction work is limited to 12
seconds, with a 3-second lock acquisition limit. Those limits are transaction
local and do not leak through Supavisor to other requests.

## First Deploy Checklist

1. Add GitHub secrets.
2. Add GitHub variables, including all three image repositories.
3. Create protected `production-migrations` environment.
4. Configure Infisical admin project root.
5. Configure Infisical server project root.
6. Configure DNS for `api`, `panel`, `share`, and `ingest`.
7. Install Docker, Compose plugin, `curl`, `doctl`, and Infisical CLI on the VPS.
8. Configure limited passwordless sudo for `/opt/stepwhere` bootstrap.
9. Ensure `VPS_USER` can run Docker without sudo.
10. Create `/opt/stepwhere/.env`.
11. Export `INFISICAL_TOKEN` near the top of `~/.bashrc`.
12. Validate token visibility through non-interactive SSH.
13. Run workflow dispatch with the components you want to build.
14. Validate local health endpoints on the VPS.
15. Validate public endpoints.

## Current Intentional Limitations

- Redis is local Compose infrastructure.
- Redis password is duplicated between VPS `.env` and server Infisical `REDIS_URL`.
- Device ingest proxy is unauthenticated for firmware connectivity testing.
- Device ingest proxy does not inject `x-device-ingest-key` yet.
- Public HTTP is intentionally allowed only for `ingest.stepwhere.in`.
- Admin image is static and has no runtime Infisical configuration.
- Server runtime token lifecycle is delegated to VPS `~/.bashrc`.

## OTA firmware hosting (device-ingest-proxy `/fw`)

Trackers fetch `http://ingest.stepwhere.in/fw/manifest.json` once a day and
download signed images from `/fw/releases/<x.y.z>/stepwhere.ota` in 4 KB
byte ranges. The proxy reads them from, in order:

- `FIRMWARE_UPSTREAM_URL`: base URL of the firmware bucket (S3/CloudFront),
  e.g. `https://<distribution>.cloudfront.net`. Range is forwarded.
- `FIRMWARE_DIR` (default `/srv/firmware`): a directory with the same layout,
  mounted into the `stepwhere-device-ingest-proxy` container.

Layout: `manifest.json`, optional `devices/<hardwareIdentifier>.json`,
`releases/<x.y.z>/stepwhere.ota`. Produce them with
`tools/fw_server.py publish` or the release workflow in
`Smartshoe24/Stepwhere-Firmware`. Without either setting the proxy answers
`/fw/*` with 404, so devices simply find no update.

Setting the variable or mounting the directory is a deployment change and is
done by a person (see AGENTS.md).
