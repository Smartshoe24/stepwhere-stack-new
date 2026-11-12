# Local dev stack

One command runs Postgres, Redis, the API, the admin panel, the live share view
and the device ingest proxy, managed by [process-compose](https://f1bonacci.github.io/process-compose/).
`pnpm dev:public` also hosts the stack from this machine through Pinggy Pro, so
anyone with the link can use the admin panel, open share links, install the QA
bench agent, and point a device or the mobile app at it.

## Quick start

```bash
pnpm install
pnpm dev:doctor          # tools, Docker, ports, Infisical access
pnpm dev                 # TUI; q to quit
```

Open <http://localhost:4800>. Sign-in codes print in the server log
(`pnpm dev:logs server`) while Twilio isn't configured.

| Command | What it runs |
|---|---|
| `pnpm dev` | infra, migrations, server, admin, share view, ingest proxy |
| `pnpm dev:public` | the above + Caddy edge + Pinggy tunnels |
| `pnpm dev:mobile` / `pnpm dev:public:mobile` | adds Metro for the Expo dev client |
| `pnpm dev:simulator` | adds the device simulator |
| `pnpm dev:logs <name>` · `pnpm dev:restart <name>` · `pnpm dev:status` | work from any terminal |
| `pnpm dev:attach` | reopen the TUI |
| `pnpm dev:down` | stop the apps; Postgres and Redis keep running (`pnpm infra:down` stops them) |

`PC_DISABLE_TUI=1 pnpm dev` streams plain output instead of the TUI. Every
process also writes `.dev/logs/<name>.log`.

## How it fits together

| Process | Port | Ready when |
|---|---|---|
| `infra` | Postgres 5433, Redis 6380 (Docker) | `docker compose up --wait` exits |
| `migrate` | | Drizzle migrations applied to the local DB |
| `types` | | `@stepwhere/types` built (the server imports its `dist`) |
| `server` | 8223 | `GET /ready` |
| `ingest` | 8290 | `GET /health` |
| `admin` | 4800 | `GET /` |
| `share` | 5175 | `GET /` |
| `edge` (public) | 8800 (Docker) | `GET /__edge/health` |
| `tunnel-panel`, `tunnel-share` (public) | | ssh to Pinggy; restarts on drop |
| `metro` (mobile) | 8081 | `GET /status` |
| `simulator` | 5174 | `GET /` |

- **Config files.** `process-compose.yaml` is the base stack. `dev/process-compose.{public,mobile,simulator}.yaml` are overlays that add processes.
- **Environment.** Every app starts through `scripts/dev/run.mjs <app> -- <cmd>`, which builds its environment in three layers. The local overlay is applied last, which is why we don't wrap with `infisical run`: that would override it.
  1. Infisical dev secrets, when you have access.
  2. Local stand-ins for secrets the server needs to boot.
  3. The local overlay from `scripts/dev/env.mjs`: ports, URLs, origins and the local database.
- **One source of URLs.** `scripts/dev/env.mjs` is the only place that knows ports and URLs. Server-to-server traffic always uses `127.0.0.1`.
- **Same-origin admin.** The admin calls its own origin (`VITE_STEPWHERE_API_URL=""`). Vite proxies `/v1` and `/api/auth`, including WebSockets, to the server locally, and Caddy does it in public mode. The admin and API therefore share one origin, so the session cookie is first-party.
- **Shared infra.** `docker-compose.yml` pins `name: stepwhere`, so every checkout shares the same Postgres and Redis containers and volumes.

## Settings

Copy `dev/local.env.example` to `dev/local.env` (gitignored). Shell variables win over it.

| Variable | Default | Purpose |
|---|---|---|
| `STEPWHERE_INFISICAL` | `1` | `0` skips Infisical and uses local stand-ins only |
| `STEPWHERE_PANEL_HOST` | `npafhgmeij.a.pinggy.link` | Pinggy host for admin + API + firmware |
| `STEPWHERE_SHARE_HOST` | none | Pinggy host for the live share view |
| `PINGGY_PANEL_TOKEN`, `PINGGY_SHARE_TOKEN` | none | Pinggy Pro access tokens for those hosts |
| `PINGGY_BIN` | `apps/dev-tunnel/bin/pinggy`, then PATH, then `ssh` | Pinggy CLI |
| `REDIS_PASSWORD` | `stepwhere-dev` | local Redis password |
| `INFISICAL_TOKEN` or `INFISICAL_CLIENT_ID` + `INFISICAL_CLIENT_SECRET` | none | Infisical machine identity (see below) |

**Existing tunnel setup is reused.** `apps/dev-tunnel/.env.local` (`PINGGY_TOKEN`, `PINGGY_DOMAIN`) and `apps/dev-tunnel/bin/pinggy` are read from this checkout or the main checkout, so worktrees need no copy. The same applies to `dev/local.env` and the root `.env`. Files in the current checkout win.

**Infisical access.** Secrets are fetched with a machine identity when one is set, otherwise with your personal CLI login:
- **Machine identity (preferred).** Put `INFISICAL_TOKEN=<access token>`, or `INFISICAL_CLIENT_ID` and `INFISICAL_CLIENT_SECRET` for universal auth, in the main checkout's root `.env`. That file is gitignored on every branch and every worktree reads it. The identity needs read access to the `dev` environment of the server and share-view projects. These values never reach the apps.
- **Personal login.** "This project does not belong to your selected organization" means the CLI is logged into another org. Run `infisical login` and pick Stepwhere.

`pnpm dev:doctor` reports which method was used and how many secrets each project returned. Without access, features that need real keys stay off:
- S3 avatars
- Twilio SMS (codes print in the server log instead)
- Google APIs

## Public mode (Pinggy Pro)

```
https://<panel host>  ┐                     /v1/*, /api/auth/*, /health, /ready → server :8223
http://<panel host>   ├─► Pinggy ─► Caddy :8800 ─► /downloads/* → QA agent tarball
https://<share host>  ┘                     everything else → admin :4800
                                            share host → share view :5175 (/__share_api → server)
```

- **The panel host is the firmware's existing host.**
  - Browsers use it over HTTPS for the admin panel.
  - The firmware posts over plain HTTP to `/v1/telemetry/location`, unchanged.
  - Keep "force HTTPS" off on that Pinggy tunnel.
- **Teammates** open `https://<panel host>` and sign in.
- **The QA bench agent** installs straight from this machine. The pairing dialog shows both commands:
  ```bash
  npm install -g https://<panel host>/downloads/stepwhere-qa-agent.tgz
  stepwhere-qa-agent pair --server https://<panel host> --code XXXX-XXXX
  ```
- **The mobile app** (`pnpm dev:public:mobile`) gets `EXPO_PUBLIC_API_URL=https://<panel host>`. Without public mode it gets this machine's LAN IP, for phones on the same Wi-Fi.
- **Server URLs.** The server's `BETTER_AUTH_URL`, `QA_AGENT_SERVER_URL` and `PUBLIC_SHARE_APP_URL` switch to the public hosts. The localhost URLs keep working at the same time.

To set it up:
1. The panel tunnel uses the existing `apps/dev-tunnel/.env.local` token, so it works as is.
2. For share links, create a second persistent domain plus access token in the Pinggy dashboard. Put `STEPWHERE_SHARE_HOST` and `PINGGY_SHARE_TOKEN` in `dev/local.env`.
3. Run `pnpm dev:public`. `pnpm dev:doctor --public` checks the setup first.

**Access is "anyone with the link".** The admin panel still needs a sign-in. Device ingest is unauthenticated in dev (`DEVICE_INGEST_AUTH_DISABLED=true`), the same as the firmware path today.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Port 8223 (server) is in use` | Another dev server is running: `pnpm dev:down`, or stop the listed PID |
| `container stepwhere-redis is unhealthy` | Recreate it with the password: `docker compose up -d --force-recreate redis` |
| Admin shows "Blocked request. This host is not allowed" | The host isn't in `STEPWHERE_PANEL_HOST`/`STEPWHERE_SHARE_HOST` |
| Tunnel log says `skipped` | Set the Pinggy token in `dev/local.env` |
| Signed in on the tunnel but requests are 401 | Use the panel host for both admin and API; never mix tunnel and localhost in one tab |
