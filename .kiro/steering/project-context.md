---
inclusion: always
---
# Stepwhere stack: project context (handoff, 2026-11-15)

Read this first in a new session, together with `AGENTS.md` (agents never deploy
or touch real infrastructure; a human runs those steps). QA details:
`qa-pipeline.md` in this folder.

## Working with the owner
- The owner (Shubham, GitHub `Smartshoe24`) is **not a developer**: short, plain
  explanations and exact click-by-click steps. A developer also works in this repo
  (QA bench, QA firmware): tell the owner when a change touches their code.
- Changes go as PRs; the owner merges. Merge order matters when PRs build on each
  other: a PR based on another branch must be retargeted to `main` before merging
  (PR #11 once landed on a dead branch and had to be re-opened as #12).

## Repos
- **This repo, `Smartshoe24/stepwhere-stack-new`, is the live one.** Production
  AWS trusts only it.
- `stepwhere/stepwhere-stack` is the old repo: **retired**, its deploys fail. Do not
  change it.
- Tracker firmware and OTA releases: `Smartshoe24/Stepwhere-Firmware` (see its
  `.kiro/steering/project-context.md`). Production firmware v2.2.0; the bench board
  is IMEI 869938082392680.

## Production
- AWS account **045837342042** (`stepwhere-prod`, ap-south-1). The owner logs in
  via the access portal `https://d-9f675beb6a.awsapps.com/start` (user shubham,
  AdministratorAccess). The firmware S3 bucket is in the separate management
  account 713881826913.
- Deploy: "Build And Release" on push to `main`, only for services whose paths
  changed; manual: Actions → Build And Release → Run workflow, tick services.
- **Gotcha:** the deploy runs `docker compose up -d <service>`, which does **not**
  restart a container whose image is unchanged. After an Infisical change, a
  human must restart it: SSM Session Manager on the host,
  `cd /srv/stepwhere && sudo docker compose restart server`.
- Logs: `https://logs.stepwhere.in` (Dozzle), container `stepwhere-server-1`.
  Useful searches: `network-geolocation`, `qa-test-log`, `qa-functional`.
- Open issue: `[background-task] skipped overlapping run { task: 'history-processing' }`
  every 30 s for hours, i.e. one history run seems stuck. Not investigated yet.

## Secrets (Infisical, project **"server"** `c54a008b-1814-4bfe-bafa-564b6f330113`, environment **Production**, path `/`)
- `CELL_GEOLOCATION_ENABLED=true`, `GOOGLE_GEOLOCATION_API_KEY` (added 2026-11-15;
  they were only in Development before, so production lookups were silently off).
- Optional: `NETWORK_LOOKUP_TEST_DEVICES` (IMEIs, comma-separated: bound devices get
  a lookup every 30 s), `QA_AUTO_REGISTER_TACS` (default `86993808`).
- The **"admin"** Infisical project (`f3274d01-…`) holds only the admin website's
  VITE_ variables. `NODE_ENV` in Development must stay `development`.

## Device path
Tracker → `http://ingest.stepwhere.in/location` → `apps/device-ingest-proxy`
(unchanged body) → server `POST /v1/telemetry/location`. Firmware files:
`/fw/*` from CloudFront (`FIRMWARE_UPSTREAM_URL` in the proxy Dockerfile), image
ranges re-encoded as hex with `?enc=hex`.

## Wi-Fi / GSM location (server, `apps/server/src/modules/telemetry`)
The tracker sends serving cell + Wi-Fi with every upload (~10 s) while it has no
GPS fix; the server asks Google Geolocation:
- first lookup **2 min** after GPS is lost;
- then as soon as the serving cell is not one of the last 4 used or the Wi-Fi set
  shares < 50 % of its access points, **at most every 30 s**;
- otherwise every **7 min**; after a move of ≥ 1 km every 1 min until 7 stable results.
Code: `cell-geolocation.ts`, `telemetry.service.ts`, `google-geolocation.client.ts`.
Only devices bound to a child (and QA boards, see qa-pipeline.md) get lookups.

## Build and test locally
pnpm 10 (`pnpm install --frozen-lockfile`), build `@stepwhere/types` first.
Server: `pnpm --filter @stepwhere/server typecheck` / `test`.
Admin: `pnpm --filter shadcn-admin lint` and `exec tsc -b`.
Migrations: `drizzle-kit generate --config drizzle.config.ts` in apps/server
(latest 0022). Production also has columns from the old repo's migrations, so use
`IF NOT EXISTS` when a column may already exist (0020).
QA firmware: `bash apps/firmware/scripts/build-arduino.sh qa`; host tests in
`apps/firmware/test/`.

## Backlog (bring up when the owner asks "what to build next")
Own Wi-Fi/cell location database learned from GPS fixes, to replace most Google
calls (saved learning).
