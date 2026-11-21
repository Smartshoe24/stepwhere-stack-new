# Billing: status and what's left

Handoff notes for whoever picks billing up next. Last updated 21 Nov 2026, branch
`feat/billing`.

Read these with it:

| Doc | What's in it |
|---|---|
| `billing-cashfree-plan.md` | Why Cashfree, how pricing works, phases, decisions, open questions for Cashfree |
| `billing-backend.md` | How the server works now: model, rules, tables, routes, jobs, settings, tests |
| `billing-setup-guide.md` | The account and dashboard steps that someone with access has to do |
| `design/billing-cashfree-mockups.html` | Every screen and state the app should show |

## Where it stands

Family plans are sold through **Cashfree autopay** behind a provider interface,
so the provider can be swapped later (for example, store billing on iOS only if
App Review says no).

- **Phases 1–4 are done** (core, running the plan, app screens, clean-up). They
  run end to end against a **fake provider**.
- **Cashfree itself is not connected.** `BILLING_PROVIDER=cashfree` fails every
  call with "Payments aren't available yet" until the Cashfree provider is
  written.
- Purchases and enforcement are **off by default**
  (`BILLING_PURCHASES_ENABLED=false`, `BILLING_ENFORCEMENT_ENABLED=false`).
- Nothing billing-related is live for real users.

### Pricing model

- **Price book:** prices live in a server-side price book (`billing_price_book`,
  v1 seeded in migration 0020). Per shoe, GST included:

  | Plan | Price per shoe |
  |---|---|
  | 3 months | ₹397 |
  | 6 months | ₹549 |
  | 12 months | ₹899 |

  A plan costs the per-shoe price times the number of shoes.
- **Autopay:** each family has one `ON_DEMAND` mandate, with a ₹5,000 limit. The
  server raises every charge itself, with an exact amount and an IST due date.
  Nothing is set up as a plan in Cashfree.
- **Decisions already taken:**
  - The plan starts when the first selected shoe's free month ends. The other
    shoes' leftover free days are credited against the first charge.
  - No refunds for unused days. Support can refund any payment.
  - With no free days left, tracking starts at once and the first charge is the
    next day.
  - 3 days of grace after a failed charge.
  - Anyone in the family can buy the plan. Only the purchaser can change it,
    cancel it, pay or see invoices.

## What's built

### Server (`apps/server`)

- **Migrations**:
  - `0019_billing_reset.sql` **drops the old store-billing tables**.
  - `0020_cashfree_billing.sql` creates the new ones, adds the `billing`
    notification type and seeds price book v1.

  They have been tested only on a throwaway Postgres. They have **not been
  applied to the shared dev database**: get approval before you migrate it.
- **Code**:
  - `src/modules/billing/`: pricing (pure functions), quotes, checkout,
    subscription actions (add shoes, renewal, cancel, resume, autopay change,
    pay now), ledger (mandates, charges, refunds, invoices), worker jobs,
    notifications, family/admin/webhook routes.
  - `providers/`:
    - `provider.ts`: the `BillingProviderClient` interface.
    - `fake.provider.ts`: the fake provider. Its state lives in
      `billing_fake_objects`, and charges settle on their due date by
      themselves.
    - `index.ts`: picks the active provider. Cashfree is a stub here for now.
- **Background jobs** in `src/index.ts`: `billing-events`, `billing-coverage`,
  `billing-charges`, `billing-mandates`, `billing-reminders`.
- **Removed**: Superwall client, store verification, and the App Store
  subscription script.

### App (`apps/mobile`)

- **Screens** in `src/app/(app)/billing/`: choose plan, review, status,
  subscription, add shoes, invoices, invoice.
- **Logic and parts** in `src/features/billing/`: card states, formatting, quote
  helpers, banners, locked states, manage sheets, and the checkout adapter.
- **Fake checkout:** a **Test payment** sheet appears in dev builds when the
  provider is `fake`. The Cashfree checkout is a stub.
- **Entry points:** the Profile Subscription card, home and history banners, and
  billing push notifications routed to `/billing`.

### Shared types

`packages/types/src/billing.ts` is the API contract between server and app.

### Verified

| Check | Result |
|---|---|
| Server type check | Clean |
| Server unit tests | 249 passing |
| Billing integration tests | 13 passing (Postgres + fake provider) |
| App type check | Clean |
| App unit tests | 154 passing |

The integration tests cover every flow, plus regression tests for the 10
defects a review pass found:

- a late "paid" on a failed or cancelled charge;
- pay-now double charging;
- cancel during an in-flight charge;
- atomic submit;
- restore on resume;
- free months handed back when an unpaid plan expires;
- re-cancelling at the provider.

Run them:

```sh
pnpm --filter @stepwhere/server typecheck && pnpm --filter @stepwhere/server test
pnpm --filter @stepwhere/mobile typecheck && pnpm --filter @stepwhere/mobile test

# Integration tests: needs a throwaway Postgres, never the shared dev DB
docker run -d --name sw-billing-it -e POSTGRES_PASSWORD=pw -p 55999:5432 postgres:16
LOCAL_DATABASE_URL=postgresql://postgres:pw@127.0.0.1:55999/postgres \
  pnpm --filter @stepwhere/server db:migrate:local
BILLING_IT=1 BILLING_PURCHASES_ENABLED=true \
  DATABASE_URL=postgresql://postgres:pw@127.0.0.1:55999/postgres \
  pnpm --filter @stepwhere/server exec vitest run billing.flow
```

## Not verified yet

- **The app screens have not been run on a device or simulator.** They type
  check and their logic is unit tested, but nobody has looked at them against
  the mockups yet. Do that first: section 1 of `billing-setup-guide.md` shows how
  to turn on the fake provider for a test family.
- The full cycle on a real dev server with the background jobs running (the
  integration tests call the jobs directly).

## What's left, in order

1. **Try it on the dev server with the fake provider.**
   - Apply migrations 0019 and 0020 to the dev database (with approval).
   - Set `BILLING_PURCHASES_ENABLED=true` and the pilot organization ID in
     Infisical.
   - Run a dev build and go through every mockup state, fixing UI issues as you
     go.
2. **Clean up the store setup** (section 2 of the setup guide): delete the old
   Superwall secrets in Infisical and EAS, and the unsubmitted App Store
   products if you want. Nothing urgent.
3. **Cashfree account** (section 3 of the setup guide, needs the account owner):
   - Sign up, then KYC.
   - Policy pages live on stepwhere.in.
   - Ask the account manager to enable Subscriptions and UPI AutoPay, and get
     answers to the open questions (below).
   - Sandbox keys go into **Infisical only**. Never paste them in chat or commit
     them.
4. **Write the Cashfree provider** once the sandbox keys exist:
   - `apps/server/src/modules/billing/providers/cashfree.provider.ts`, which
     implements `BillingProviderClient`. Register it in `providers/index.ts` in
     place of the stub.
   - Every snapshot type the fake provider returns must be mapped from
     Cashfree's responses.
   - API details:
     - Base URL: sandbox `https://sandbox.cashfree.com/pg`, production
       `https://api.cashfree.com/pg`.
     - Header `x-api-version: 2026-01-01`.
     - Mandates are `ON_DEMAND` subscriptions.
     - Charges use `POST /subscriptions/pay` with `payment_type: CHARGE`, and
       must be scheduled 1–14 days ahead.
     - UPI AutoPay makes 1 attempt plus 3 hourly retries. Cards and eNACH have
       no automatic retries. The `providerWillRetry` flag in charge snapshots
       must reflect this.
     - Authorisation is ₹1 for UPI and card (refunded) and ₹0 for eNACH.
   - **Webhook**: `POST /v1/webhooks/billing/cashfree` (the route already
     exists).
     - Signature check: HMAC-SHA256 of timestamp + raw body, compared with
       `x-webhook-signature`; the timestamp comes from `x-webhook-timestamp`.
       Use the raw body, not re-serialised JSON.
     - Then implement `parseWebhook`.
   - Testing: sandbox end to end through `pnpm dev:public` and Pinggy, with the
     webhook URL set in the Cashfree sandbox dashboard.
5. **App SDK**:
   - Add `react-native-cashfree-pg-sdk`, using `CFSubscriptionSession` and
     `CFPaymentGatewayService.doSubscriptionPayment`.
   - It needs a config plugin: Android manifest meta-data, and iOS
     `LSApplicationQueriesSchemes` for the UPI apps.
   - Replace the Cashfree stub in
     `apps/mobile/src/features/billing/checkout-adapter.ts`.
   - Check that it works with Expo SDK 56 and React Native 0.85.
6. **App Review check (gate for the iOS release)**:
   - Submit a TestFlight / App Review build with the real checkout, with review
     notes explaining that every paid feature needs the physical shoe
     (Guideline 3.1.4).
   - Do the same check against Google Play's payments policy.
   - If Apple refuses, add store billing as a second provider on iOS only.
7. **Before launch**:
   - Production keys.
   - `BILLING_PROVIDER=cashfree`, `BILLING_ENVIRONMENT=PRODUCTION`,
     `BILLING_LEGAL_NAME`, `BILLING_GSTIN`.
   - A real ₹ payment by the team, then pilot families. After that, turn on
     enforcement.
8. **Later**:
   - Invoice PDFs (`pdfUrl` is always null today; invoices are listed in the
     app).
   - Admin console screens for the admin endpoints in
     `billing-admin.routes.ts` (prices, refunds, coverage grants, family view,
     warranty swaps, review queue, event retry).

## Open questions for Cashfree

- Does an `ON_DEMAND` charge send the RBI pre-debit notice for us, or must we
  use the controlled notification and execution APIs?
- Is the webhook secret the same as the client secret?
- Can a mandate's authorisation amount be the first charge, for families with no
  free days left?
- Fees for mandate creation and for each debit, per method.
- Does the React Native SDK's subscription checkout work with Expo SDK 56 and
  React Native 0.85?

## Gotchas

- **Regenerating migration 0020** (if you change the schema before it ships):
  1. Remove the 0020 entry from `drizzle/meta/_journal.json`, and delete
     `0020_cashfree_billing.sql` and `meta/0020_snapshot.json`.
  2. Run
     `DATABASE_URL=postgres://unused@127.0.0.1:1/x npx drizzle-kit generate --name cashfree_billing`
     in `apps/server`.
  3. Re-append the hand-written tail: `ALTER TYPE notification_type ADD VALUE
     'billing'` and the price book v1 seed.

  Once 0020 has run anywhere shared, add a new migration instead.
- **Charge states** go scheduled → submitting (an atomic claim) → submitted →
  paid / failed / cancelled / refunded / partially_refunded.
  - A "paid" that arrives after a charge was marked failed or cancelled is
    always recorded. It is then applied, or refunded automatically if the
    payment is no longer wanted.
  - Don't add code that skips late "paid" events.
- **Locking**: billing changes take a per-family advisory lock
  (`lockBilling`). Actions limited to the purchaser take the purchaser lock
  first, then the family lock. Keep that order to avoid deadlocks.
- **Provider calls after commit**: provider side effects that follow a state
  change (cancelling charges or the mandate) are collected as `AfterCommit`
  callbacks and run after the transaction commits. Don't call the provider
  inside the transaction for these.
- **Fake provider safety**: `BILLING_PROVIDER=fake` refuses to run with
  `BILLING_ENVIRONMENT=PRODUCTION`, or with purchases on and
  `NODE_ENV=production`.
- **Dev-only route**: `/v1/billing/dev/fake/{kind}/{id}` drives fake outcomes.
  It only exists with the fake provider outside production.
- **Billing notifications** are push-only. They are stored as read and kept out
  of the in-app inbox and the unread count.
