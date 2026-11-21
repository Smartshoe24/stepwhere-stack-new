# Family billing: backend

How the server sells and enforces the family plan. The plan and its reasoning
are in `billing-cashfree-plan.md`; the screens are in
`design/billing-cashfree-mockups.html`; your setup steps are in
`billing-setup-guide.md`.

## Status

Built and tested against the **fake provider**. Cashfree itself is not
connected yet: `BILLING_PROVIDER=cashfree` fails every call with "Payments
aren't available yet" until `providers/cashfree.provider.ts` is written.
Purchases and enforcement stay off by default.

## The model in one paragraph

Prices live on our server as per-shoe prices for 3, 6 and 12 months. Each
family has at most one live plan, paid by one person through one autopay
mandate (UPI AutoPay, card or eNACH) with a ₹5,000 limit per debit. The server
works out every charge (amount and IST due date) and raises it against the
mandate a few days ahead; the provider only moves money. A paid charge grants
per-shoe coverage intervals, which is all the rest of the app checks.

## Rules

- **Free days are kept.** A new plan starts when the first selected shoe's free
  month ends. Shoes with free days left get them taken off the first charge
  (`per-shoe price × days left ÷ days in the period`, whole rupees). If a shoe
  has no free days left, coverage starts as soon as the autopay is approved and
  the first charge is due the next day.
- **Adding shoes** charges only for the rest of the current period, from when
  each added shoe's own free month ends. Nothing is charged if the free month
  outlasts the period; the shoe joins at renewal.
- **Swapping shoes and changing the period** apply at the next renewal. They
  rebuild a renewal charge that hasn't been sent to the bank yet, and are
  refused while one is being debited.
- **Anyone in the family can start a plan.** Only the person who pays can change
  it, cancel it, pay a failed charge or see invoices (`NOT_PURCHASER`). One
  autopay setup per family at a time (`CHECKOUT_IN_PROGRESS`); the same person
  starting again replaces their earlier attempt.
- **Cancelling** cancels the mandate at once; coverage runs to the end of the
  paid period plus 3 days. Resuming needs the mandate to still be active,
  otherwise the app sets up a new autopay (`AUTOPAY_REQUIRED`). A plan that was
  never paid simply ends and the free months carry on.
- **Autopay turned off in the UPI app** (or paused, or card expired) has the
  same effect as cancelling.
- **Failed charges**: the plan goes `past_due`. UPI retries on its own; for
  cards and eNACH the server retries the next day, up to 3 attempts. Tracking
  continues for 3 days after the due date, then the plan expires. "Pay now"
  takes a one-off payment outside the autopay and stops the retries. An added
  shoe whose charge never goes through leaves the plan.
- **Prices include 18% GST.** Every paid charge gets an invoice numbered per
  financial year (`SW/26-27/00042`), split into CGST and SGST.

## Data model (`src/db/schema/billing.ts`)

| Table | Holds |
|---|---|
| `device_activations`, `device_ownerships` | Unchanged: the free month per physical shoe and family ownership. `trial_converted_at` is set when a plan takes over a shoe, so its free days can't be credited twice. |
| `billing_price_book` | Versioned per-shoe prices. Plans keep the version they were sold at. Launch prices are seeded by migration 0020. |
| `billing_customers` | The paying person. |
| `billing_quotes` | Everything a quote promised (shoes, dates, amounts, credits, schedule). Expires after 15 minutes. |
| `billing_mandates` | One autopay at the payer's bank. Our id is the reference the provider gets. |
| `billing_checkout_intents` | One autopay setup (new plan, or replacing a plan's autopay) and the session the app opens. |
| `family_subscriptions` | The plan: shoes, period, price, mandate, state (`scheduled`, `active`, `past_due`, `cancelled`, `expired`, `revoked`), scheduled changes and `revision`. |
| `billing_charges` | Every debit (`first`, `renewal`, `add_shoes`, `one_time`) with its breakdown and the coverage it buys. One row is one payment at the provider. |
| `billing_refunds`, `billing_invoices`, `billing_invoice_sequences` | Support refunds and GST invoices. |
| `device_coverage_intervals` | Coverage per shoe: `trial`, `paid`, `grace`, `provisional` (before the first debit clears), `support`. |
| `billing_provider_events` | Verified webhooks, queued for the worker. |
| `billing_fake_objects` | State for the fake provider only. |
| `billing_audit` | Every change, with who made it. |

Migration 0019 drops the old store tables (they never held payments); 0020
creates the new ones and adds the `billing` notification type.

## Code (`src/modules/billing/`)

| File | Does |
|---|---|
| `billing-pricing.ts` | Pure maths: quotes, credits, pro-rating, IST dates, GST split, invoice numbers. Unit-tested. |
| `billing.service.ts` | Prices, quotes, overview and DTOs, purchaser checks. |
| `billing-checkout.service.ts` | Starting and polling an autopay setup. |
| `billing-subscription.service.ts` | Add shoes, schedule renewal changes, cancel, resume, pay now, invoices. |
| `billing-ledger.service.ts` | Applies what the provider reports to mandates, plans, charges, coverage and invoices. Idempotent. |
| `billing.worker.ts` | Webhook queue, renewal charges, submitting and retrying charges, reconciling, expiry, share-link revocation. |
| `billing-notifications.service.ts` | Push reminders and receipts. |
| `billing-admin.service.ts` / `.routes.ts` | Prices, refunds, support coverage, family detail, warranty and ownership tools. |
| `providers/` | The provider interface, the fake provider and the Cashfree stub. |

## API

Family routes (`/v1`, any family member):

| Route | Purpose |
|---|---|
| `GET /billing/overview` | Prices, shoes, plan and any setup in progress. The app's main read. |
| `GET /billing/prices`, `/billing/devices`, `/billing/subscription` | The same pieces separately. |
| `POST /billing/quotes` | `new_plan` or `add_shoes` → dated list of charges. |
| `POST /billing/checkout`, `GET /billing/checkout/{id}` | Start and poll an autopay setup. Polling re-checks the provider. |
| `POST /billing/subscription/add-shoes` | Apply an `add_shoes` quote. Payer only. |
| `PUT /billing/subscription/renewal` | Shoes or period for the next period. Payer only. |
| `POST /billing/subscription/cancel`, `/resume`, `/autopay` | Cancel, undo, or set up a new autopay. Payer only. |
| `POST /billing/charges/{id}/pay-now`, `GET /billing/charges` | One-off payment for a failed charge; payments and invoices. Payer only. |
| `POST /billing/dev/fake/{kind}/{id}` | Fake provider only, never in production: approve, decline, pay or fail anything. |

Webhooks: `POST /v1/webhooks/billing/cashfree`, only when
`BILLING_PROVIDER=cashfree`. The body is verified and stored; the worker re-reads
each object from Cashfree before acting.

Admin (`/v1/admin`): `POST /admin/billing/prices`,
`POST /admin/billing/charges/{id}/refund`, `POST /admin/billing/coverage-grants`,
`GET /admin/billing/families/{organizationId}`, `GET /admin/billing/review-queue`,
`POST /admin/billing/events/{id}/retry`, plus the warranty and ownership tools.

## Background jobs (`src/index.ts`)

| Job | Every | Does |
|---|---|---|
| `billing-events` | 30 s | Applies queued webhook events. |
| `billing-coverage` | 30 s | Expires plans past grace, drops unpaid added shoes, revokes share links. |
| `billing-charges` | 1 min | Builds renewals 5 days ahead, sends charges 3 days ahead, retries, reconciles. |
| `billing-mandates` | 10 min | Expires abandoned setups and re-reads autopays daily. |
| `billing-reminders` | 1 h | Charge-tomorrow notices and free-month reminders. |

## Settings

| Variable | Default | Notes |
|---|---|---|
| `BILLING_PURCHASES_ENABLED` | `false` | Turns on quotes and checkout. |
| `BILLING_ENFORCEMENT_ENABLED` / `BILLING_PILOT_ORGANIZATION_IDS` | `false` / empty | Locks shoes without coverage, for everyone or for pilot families. |
| `BILLING_PROVIDER` | `fake` | `cashfree` once connected. A production server refuses to sell through `fake`. |
| `BILLING_ENVIRONMENT` | `SANDBOX` | `PRODUCTION` needs `cashfree`. |
| `BILLING_MANDATE_MAX_MINOR` | `500000` | ₹5,000 autopay limit. |
| `BILLING_LEGAL_NAME`, `BILLING_GSTIN` | – | For invoices. |
| `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, `CASHFREE_WEBHOOK_SECRET`, `CASHFREE_API_VERSION` | – / `2026-01-01` | Required once purchases run on Cashfree. |

## Tests

- `billing-pricing.test.ts`: the maths, including the mockups' numbers.
- `billing.flow.integration.test.ts`: every flow end to end against Postgres and
  the fake provider. Run it on a throwaway database:

  ```sh
  BILLING_IT=1 BILLING_PURCHASES_ENABLED=true DATABASE_URL=postgresql://… \
    pnpm --filter @stepwhere/server exec vitest run billing.flow
  ```

## Not done yet

- The Cashfree provider, its webhook signature check and the app's Cashfree SDK
  (phase 6 of the plan).
- Invoice PDFs (`pdfUrl` is always null; invoices are listed in the app).
- Admin console screens for the admin endpoints.
