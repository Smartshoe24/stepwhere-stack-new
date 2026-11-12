# Family subscriptions: backend rollout

## Scope and launch status

Implemented: durable family shoe ownership; immutable 30-day physical-device
trials; one combined subscription for 1–5 shoes; 3/6/12-month terms; quoted store
prices and 7/14/21/30-day first-term trial-credit bands; idempotent checkout;
verified Superwall reconciliation; signed durable webhooks; scheduled coverage
selection; purchaser-owned management; warranty replacement; coverage guards.

**Not a live payment launch:** mobile subscription screens and the native purchase
adapter are the next phase. No prices, term discounts, store products, provider
credentials, or external dashboards were fabricated or provisioned. Real store
sandbox purchases and notification delivery must be checked before enabling
purchase or enforcement flags. Server unit tests cover the enforcement switch,
coverage gates, ownership claim/release and the store-review grant
(`apps/server/src/modules/billing/*.test.ts`); they mock the database, so the
real-store checks below still apply.

## Data model

- `device_ownerships`: family ownership survives unlinking/archiving children.
- `device_activations`: the first successful link starts exactly 30 days; relinking
  never resets it. Account deletion leaves minimal anti-repeat activation history.
- `billing_customers`: stable UUIDv4 identity, distinct from mutable family admins.
  Call `/billing/manage` to get the authenticated purchaser's Superwall identity.
- `family_subscriptions`: one live bundle per family and per purchaser. The
  `original_transaction_id` column stores Superwall V3's stable `subscription_id`;
  individual store transaction IDs live in the transaction ledger.
- `billing_quotes` / `billing_checkout_intents`: immutable selected shoes, prices,
  term, provider identity, revision and offer. Quotes expire after 15 minutes;
  successful delayed payments are not discarded just because a quote expired.
- `billing_transactions`: idempotent verified/unassigned/revoked store ledger.
- `device_coverage_intervals`: historical paid/free/grace/legacy/support grants.
- `billing_trial_credits`: consumes each physical-device trial once, only after a
  verified qualifying offer purchase. Warranty replacements inherit conversion.
- `billing_offer_codes`: AES-256-GCM encrypted Apple one-time codes, hashed for
  redemption lookup. An issued code is never returned to the available pool.
- `billing_provider_events`: verified Svix intake, retry and leased processing.
  Completed raw payloads are deleted after 30 days; financial records are separate.
- `billing_audit`: catalog, code import, ownership release and warranty operations.

User/family deletion nulls financial identity references instead of cascading the
ledger. Child deletion does not remove device activations or paid grants. Parent
email/name and child names must not be sent as Superwall attributes.

## Migration and rollout

`apps/server/drizzle/0012_family_billing.sql` is additive and billing-only;
`0013_billing_price_evidence.sql` adds verified monetary evidence to the ledger. Earlier
hand-written migrations had no snapshots; the new snapshot reconciles that drift
without applying their DDL again. The migration backfills first activation from
the earliest retained binding and ownership from the latest known family binding,
including currently unlinked shoes. Existing explicit child plans retain coverage
intervals. Already purchased shoes cannot receive another first-trial credit.
It does not grant a new migration-day trial or indefinite paid service.

Run the ordinary dev migration command:

```sh
pnpm --filter @stepwhere/server db:migrate
```

For local Postgres use `db:migrate:local`, or set `DATABASE_URL` and `DIRECT_URL`
explicitly and run `drizzle-kit migrate --config drizzle.config.ts` from the server.
For prod use the same checked-in migration with the prod Infisical environment;
do not use `db:push` or reset a populated database.

Keep these default flags off:

```dotenv
BILLING_PURCHASES_ENABLED=false
BILLING_EARLY_CREDIT_ENABLED=false
BILLING_ENFORCEMENT_ENABLED=false
BILLING_PILOT_ORGANIZATION_IDS=
BILLING_STORE_ENVIRONMENT=SANDBOX
```

Device ownership has its own switch, on by default:

```dotenv
BILLING_DEVICE_OWNERSHIP_ENABLED=true
```

`BILLING_DEVICE_OWNERSHIP_ENABLED` is independent of enforcement. When `true`
(today's behaviour), every bind path (onboarding create/bind, admin bind, admin
"create child for user", store-review provisioning) claims the shoe for the
family through `claimDevice`, and reserving or binding a shoe another family owns
returns 409 `DEVICE_BOUND_ELSEWHERE`. Unbinding or archiving never releases a
claim; support releases it from the admin device page ("Release ownership",
`POST /admin/billing/ownership-release`), which is refused while the shoe is
still bound to a child. When `false`, no claim is recorded and the
another-family 409 is never raised; the ordinary active-binding checks (one
child per shoe at a time) still apply, and the 30-day physical-device trial is
still started on first activation. Ownership drives `GET /billing/devices`,
quotes and warranty replacement, so keep it on whenever purchases are enabled.

`BILLING_PILOT_ORGANIZATION_IDS` enables enforcement for only the listed families.
Do not enable global enforcement until the existing-device rollout policy is
chosen: old test shoes can already have expired trials. A provider outage does not
extend grants; disabling enforcement restores existing app service behavior.

## External setup

1. Apple: one `StepWhere Family Service` subscription group, 15 products
   `com.stepwhere.family.{1..5}.{3|6|12}m`. Higher shoe counts rank above lower
   counts; all durations for a count use the same level. Disable Family Sharing.
   Configure three-day billing grace and approved subscription metadata.
2. Play: five products `stepwhere_family_{1..5}`, each with auto-renewing
   `p3m`, `p6m`, `p12m` base plans and three-day grace. No monthly base plan.
3. Superwall: connect both stores under the project's `com.stepwhere` apps;
   configure count entitlements `family_1_shoe` through `family_5_shoes`.
4. Store first-term offers: one full term discounted, then normal renewal. Four
   trial-credit bands per product/base plan. Apple uses individual offer codes;
   Google uses developer-determined offers, explicitly selected by the adapter.
   Longer-term discounts belong in the normal store renewal price, not arbitrary
   client-side payment amounts.
5. Put server-only values in Infisical: `SUPERWALL_API_KEY` (organization key with
   `customers:read` and `users:read`), `SUPERWALL_PROJECT_ID`, comma-separated
   `SUPERWALL_APPLICATION_IDS`, `SUPERWALL_WEBHOOK_SECRET`, and
   `BILLING_OFFER_CODE_KEY` (32 random bytes as 64 hex characters). Back up the
   encryption key; rotation requires re-encrypting code inventory.
6. Set Superwall webhook URL to `https://YOUR_API/v1/webhooks/superwall`. Copy that
   endpoint's Svix signing secret. Configure the appropriate store server
   notification integrations in Superwall. Separate sandbox/prod deployments;
   events and queried grants must match the configured store environment.

The server reads Superwall's documented
[subscriber API and V3 subscription history](https://api.superwall.com/docs),
requiring matching customer identity and purchased ownership. Alias conflicts
are held for review instead of assigning the current screen's children.
[Webhook signatures](https://superwall.com/docs/integrations/webhooks/verify) are
verified against the unmodified raw body before durable intake. Refund hints
revoke the affected transaction even if it is no longer the current period.

## Catalog configuration

Use the existing system-admin token with `POST /v1/admin/billing/catalog`.
One row describes one store/environment/count/term/currency/storefront/credit-band
variant. Supply actual configured store minor-unit prices; no placeholder seed
prices exist. Normal rows use band `0`, `offerId: null`, and identical purchase
and renewal prices. Google rows include the corresponding `basePlanId`.

Example shape (replace every price and identifier with reviewed store settings):

```json
{
  "store": "APP_STORE",
  "environment": "SANDBOX",
  "shoeCount": 2,
  "termMonths": 6,
  "productId": "com.stepwhere.family.2.6m",
  "basePlanId": null,
  "offerId": null,
  "currency": "INR",
  "storefront": "IN",
  "trialCreditBand": 0,
  "amountMinor": 100000,
  "renewalAmountMinor": 100000,
  "enabled": false
}
```

The example amounts are illustrative, not pricing recommendations. Only enable
rows after matching store configuration. Use the same two-/three-letter
storefront value when requesting quotes. For a discounted row, `offerId` is the
configured Google offer identifier or Apple offer reference. Import Apple codes
with `POST /admin/billing/offer-codes`:
`{catalogId, expiresAt, codes:[...]}`; codes are never echoed or audited in cleartext.

Credit calculation uses remaining free days divided by **all selected shoes**,
rounding up to 7/14/21/30. Already converted/paid shoes contribute zero. The
configured store offer price must be at most
`renewalAmountMinor * (1 - band/(30*termMonths))`. Missing codes, offers or eligible
prices return `EARLY_CHECKOUT_UNAVAILABLE`, preserving free service.

## API and native handoff

All paths below are under `/v1`; normal `{data: ...}` responses and bearer auth.

| Endpoint | Authority / behavior |
| --- | --- |
| `GET /billing/devices` | Family members; owned shoes, nullable child, trial and coverage state |
| `GET /billing/subscription` | Members; selected shoes, dates, renewal, purchaser flag, revision |
| `GET /billing/manage` | Authenticated purchaser, even after demotion; identity and original-store management URLs |
| `POST /billing/quotes` | Family admin; `{deviceIds,termMonths,store,currency,storefront}` |
| `POST /billing/checkout-intents` | Admin and original purchaser for changes; `{quoteId,idempotencyKey}` |
| `GET /billing/checkout-intents/{id}` | Members; status, no private offer code or store transaction token |
| `POST /billing/sync` | Purchaser; authoritative query, not a trusted client receipt/boolean |
| `PATCH /billing/coverage-selection` | Admin and original purchaser; `{deviceIds,revision}`; same count, next renewal |
| `POST /webhooks/superwall` | Svix-authenticated public route, durable intake before acknowledgement |
| `POST /admin/billing/warranty-replacements` | System admin; `{organizationId,oldDeviceId,newDeviceId,reason}` |
| `POST /admin/billing/ownership-release` | System admin; `{deviceId,reason}` (reason ≥ 10 chars); 409 while still bound to a child or covered/scheduled; admin UI: device page "Release ownership" |
| `GET /admin/billing/review-queue` | System admin; sanitized unresolved events/intents/transactions |
| `POST /admin/billing/events/{id}/retry` | System admin; retry after resolving configuration/identity issue |
| `POST /admin/billing/checkout-intents/{id}/abandon` | System admin; `{reason}`; re-verifies before clearing unpaid checkout; issued codes never reused |

For the next mobile phase:

1. Identify Superwall with the stable billing customer UUID **before** purchase;
   never use a child ID or switch to the current admin's identity on a role change.
2. Default-select linked owned shoes, maximum five. Request a fresh quote and
   create an intent before invoking the store. Display actual localized StoreKit/
   Play prices; if they disagree with the quote, stop and refresh/configure catalog.
3. Use Superwall paywalls with one purchase owner/custom controller. If native
   offer-code, base-plan or replacement control needs `react-native-iap`, that
   adapter alone owns purchase finishing; do not run competing purchase handlers.
4. Count increases take effect after verified payment. Android upgrades use the
   reviewed immediate replacement mode (`CHARGE_FULL_PRICE`); reductions/term
   changes use `DEFERRED`. Dates and paid proration are store-authoritative.
5. Offer redemption must match the server-issued intent/code/offer. Early payment
   waits for signed offer evidence before consuming trial credit. Pending and
   unassigned purchases do not grant paid access.
6. Finish/acknowledge verified native purchases, restore on launch, then call sync
   and poll intent status. A custom Play adapter needs explicit acknowledgement
   and recovery; this backend does not accept/store Google purchase tokens yet.
7. Offer restore and original-store management actions, handle cancellation without
   signing users out, and render `SUBSCRIPTION_REQUIRED` as an access state, not 401.

## Enforcement and operational checks

Tracking summaries mask uncovered snapshots. Steps are hidden only for a child
that is not covered now (the same check as the live/share gates): a covered child
gets the same step totals, firmware counters, `activity.stepped` realtime events
and trail cache as with enforcement off. Because cumulative totals are shown as
soon as a child is covered, today's total on the day coverage starts can include
samples from before the grant. For an uncovered child, Activity reads only
covered minute buckets from past grants, never cumulative totals, live totals or
daily fallback; a boundary minute is excluded unless fully covered. Daily fallback
totals for covered children are shown only for fully covered local days. Historical event/path reads require
continuous covered intervals; events spanning an unpaid gap are excluded rather
than leaking the gap. Trails use the current continuous coverage window and reuse
the road cache only when every cached point falls inside that window. Public shares are guarded and revoked by the
boundary worker. Geofence evaluation and queued push delivery recheck coverage.
Authenticated raw telemetry still ingests for recovery and support diagnostics.

The store-review provisioning script (`review:provision`) claims the demo shoe
for the reviewer family through `claimDevice` and upserts one `support` coverage
grant (`grant_key = support:play-review`) from 8 days before the run to 10 years
after, so the seeded 7-day history stays visible under enforcement. Re-running
it updates that grant in place. The "Included Shoe Service" plan it writes is
only a display label and grants no coverage.

Free/ordinary paid expiration gets three days; payment failure uses only
store-confirmed grace capped at three days. Cancellation keeps purchased dates;
refund/revocation removes its grant immediately. Renewal reconciles scheduled shoe
selection; support replacement transfers original trial/paid dates and disables
the old shoe, never restarting a free month.

Before enabling purchases, manually exercise both real stores: purchase, native
acknowledgement, accelerated sandbox renewal, cancellation, billing issue/grace,
refund, restore, delayed webhook, duplicate webhook, upgrade/downgrade, app account
switch, admin transfer, and warranty replacement. Review unexpected payments in
the admin queue; do not attach them to arbitrary children. Reconcile pending store
charges before support clears a checkout. Validate history/activity at coverage
boundaries and avoid global enforcement until native subscription UX is ready.
