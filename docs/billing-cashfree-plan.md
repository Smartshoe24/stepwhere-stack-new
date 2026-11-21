# Billing on Cashfree: migration plan

Status, 14 Nov 2026: **phases 1–4 are built** (core, running the plan, app
screens, clean-up) and run end to end against the fake provider. Next is phase 5,
your Cashfree account; then I connect Cashfree (phase 6). How it works now:
`billing-backend.md`. Your steps: `billing-setup-guide.md`. Mockups:
`docs/design/billing-cashfree-mockups.html`.

Decisions taken (the recommendations): the plan starts when the first shoe's
free month ends and other shoes' leftover days are credited; prices include GST;
₹5,000 autopay limit for everyone; no refunds for unused days, support can refund
any payment; with no free days left, tracking starts at once and the first
charge is the next day.

## Goal

Families pay for Stepwhere through a Cashfree autopay mandate (UPI AutoPay,
card or eNACH), from our own screens in the iOS and Android apps. Billing code
talks to a provider interface, so Cashfree can be swapped later (for example
back to store billing on iOS if App Review requires it) without touching
coverage, trials, locking or the UI.

What stays the same from the store design:

- Everyone in the family can see the plan; anyone can start one when
  there is no live plan; only the person who pays can change or cancel it.
- 30 free days per shoe from first link, shoes on a plan chosen by the payer,
  3-day grace, everything locked after it, pilot families first.
- Coverage as per-device intervals (`device_coverage_intervals`), and every
  read path that already checks them.

## How pricing works with Cashfree

There is no product catalogue to create in Cashfree, and none in the stores.

- **Prices live on our server** in a versioned price book: per-shoe price per
  term (₹397 for 3 months, ₹549 for 6, ₹899 for 12). A plan's price is per-shoe
  price × shoes. Changing prices, adding a discount or running a promotion is a
  data change, done from the admin console later.
- **Each family has one Cashfree subscription of type `ON_DEMAND`**, which is
  the autopay mandate. It has no fixed amount or schedule, only a maximum per
  debit. We use **₹5,000 for everyone**, which covers the largest plan (5 shoes
  × 12 months = ₹4,495) and stays below the ₹15,000 point where UPI and cards
  need extra authentication.
- **Every charge is raised by our server** with its exact amount and date
  (`POST /subscriptions/pay`, `payment_type: CHARGE`). This is what makes the
  rest possible:
  - the first charge waits until the first free month ends, and other shoes'
    leftover free days come off it as a credit;
  - adding a shoe mid-period charges only the rest of the period;
  - changing shoes or period at renewal just changes the next amount, with no
    new approval while it stays under ₹5,000;
  - each subscription keeps the price it was sold at until we decide otherwise.

Why not Cashfree's `PERIODIC` plans: Cashfree would charge automatically, but
UPI AutoPay doesn't reliably support 3- and 6-month intervals, `CHANGE_PLAN`
can't exceed the original maximum, and one-off pro-rated charges aren't
possible. `ON_DEMAND` means we run the schedule ourselves, which is a small
scheduler job.

Rules we have to follow:

- **Pre-debit notice.** The customer must be told at least 24 hours before each
  autopay debit. We raise each charge 2–3 days ahead with
  `payment_schedule_date` set to the due date, and send our own push and email
  reminder the day before. To confirm with Cashfree: whether their default flow
  sends the RBI notice for us, or whether we must use the controlled
  notification and execution APIs.
- **Charge timing.** A charge can be scheduled 1–14 days ahead (UPI: before
  21:00 for the next day). Nothing can be debited on the same day it is raised.
- **Retries.** UPI retries 3 times within a few hours. Cards and eNACH don't, so
  the server retries the next day, inside the 3-day grace.
- **Authorisation.** UPI and card mandates take ₹1, which we refund
  automatically. eNACH takes ₹0 but needs 1–2 working days of bank approval.

### Worked example (the mockups)

Riya's free month ends 26 Nov, Arjun's 10 Dec. Priya picks 2 shoes × 6 months
on 14 Nov.

| When | What | Amount |
|---|---|---|
| 14 Nov | Mandate authorised, ₹1 refunded | ₹1 |
| 26 Nov | First charge: ₹1,098 minus Arjun's 14 days (₹549 × 14 ÷ 181) | ₹1,056 |
| 3 Jan | Kabir added; his free month ends; rest of period (₹549 × 143 ÷ 181) | ₹434 |
| 26 May | Renewal for 3 shoes | ₹1,647 |

The credit and pro-rating formula is one pure function, used for quotes and
charges alike, with unit tests: `perShoeMinor × days ÷ periodDays`, rounded to
whole rupees.

When no free days are left, coverage starts as soon as the mandate is active
(provisional), and the first charge is raised for the next day. If that charge
fails, the provisional coverage is revoked.

## Architecture

```
mobile screens ──► /v1/billing/* routes ──► billing domain (quotes, schedule, coverage)
                                                 │
                                                 ▼
                                       BillingProvider interface
                                                 │
                                    CashfreeProvider (+ FakeProvider for tests)
                                                 ▲
                              /v1/webhooks/cashfree ─┘ (verified, queued, worker)
```

The domain owns money and time: prices, periods, credits, which shoes are
covered, and when to charge. The provider only moves money.

```ts
interface BillingProvider {
  readonly name: "cashfree";
  createMandate(input: {
    mandateRef: string; customer: { name: string; email: string; phone: string };
    maxAmountMinor: number; expiresAt: Date; returnUrl: string;
  }): Promise<{ providerMandateId: string; checkout: CheckoutToken }>;
  getMandate(providerMandateId: string): Promise<MandateSnapshot>;
  cancelMandate(providerMandateId: string): Promise<void>;
  scheduleCharge(input: {
    providerMandateId: string; chargeRef: string; amountMinor: number;
    dueOn: string /* YYYY-MM-DD, IST */; note: string;
  }): Promise<ChargeSnapshot>;
  getCharge(chargeRef: string): Promise<ChargeSnapshot>;
  retryCharge(chargeRef: string): Promise<ChargeSnapshot>;
  cancelCharge(chargeRef: string): Promise<void>;
  createOneTimePayment(input: { paymentRef: string; amountMinor: number; customer: Customer }): Promise<{ checkout: CheckoutToken }>;
  refund(input: { chargeRef: string; refundRef: string; amountMinor: number; reason: string }): Promise<RefundSnapshot>;
  parseWebhook(rawBody: string, headers: Headers): ProviderEvent; // throws if the signature fails
}
```

`CheckoutToken` is opaque to the app (`{ provider: "cashfree", sessionId,
subscriptionId, environment }`). The app has one matching adapter,
`startCheckout(token)`, so swapping the provider means one server class and one
mobile adapter.

## Server changes

### Schema (new migration `0019_cashfree_billing.sql`)

Migrations 0012 and 0013 may already be applied wherever `feat/prod-qa-admin`
was deployed, so we add a forward migration instead of editing them. All
billing tables are empty, so it can drop and reshape freely.

| Table | Change |
|---|---|
| `billing_catalog` | **Replaced** by `billing_price_book`: currency, term months, per-shoe price, version, `active_from`/`active_to`. |
| `billing_offer_codes`, `billing_trial_credits` | **Dropped.** Credits are recorded on the charge. |
| `billing_mandates` | **New.** Customer, family, provider, provider IDs, status, method (`upi`/`card`/`enach`), masked label, max amount, authorised and cancelled times, cancel source (us, customer in UPI app, card expired). |
| `family_subscriptions` | Store fields become `provider`, `environment`, `mandate_id`. Add `price_book_version`, `per_shoe_minor`, `renewal_amount_minor`, `next_charge_on`, `next_term_months`, `cancel_at_period_end`. States: `pending_start`, `active`, `past_due`, `cancelled`, `expired`, `revoked`. |
| `billing_transactions` | **Replaced** by `billing_charges`: our ref (the Cashfree `payment_id`), subscription, mandate, kind (`first`, `renewal`, `add_shoes`, `one_time`), amount, credit, breakdown, `due_on`, status, provider payment ID, attempts, failure reason, and the coverage it pays for. |
| `billing_refunds`, `billing_invoices` | **New.** Invoices get a numbering series per financial year (`SW/26-27/00042`) and a GST breakdown. |
| `billing_checkout_intents` | Kept. The snapshot holds the full quote (amounts, dates, credits) and the mandate it created. |
| `device_coverage_intervals` | Add source `provisional`. |
| Unchanged | `device_activations`, `device_ownerships`, `billing_customers`, `billing_provider_events`, `billing_audit`. |

### Code

- `superwall.client.ts` and the Svix webhook are removed. New:
  `providers/provider.ts` (the interface), `providers/cashfree.provider.ts`,
  `providers/fake.provider.ts`.
- `billing-pricing.ts` (new, pure): price book lookup, quote, credits,
  pro-rating, GST split. Most of the unit tests go here.
- `billing.service.ts`: quotes and checkout move to the new model. The
  store-shaped checks (store match, offer codes, trial-credit bands, the
  `EARLY_CHECKOUT_UNAVAILABLE` block) go away. One-live-plan-per-family and
  original-purchaser rules stay.
- `billing-verification.service.ts` becomes `billing-ledger.service.ts`: it
  applies provider events (mandate active or cancelled, charge succeeded,
  failed or refunded) to subscriptions, charges and coverage. Idempotent on the
  provider event ID and our charge ref.
- `billing.worker.ts`:
  - processes queued webhook events;
  - **charge scheduler** (new): raises charges 3 days before `next_charge_on`;
  - **dunning** (new): retries failed card and eNACH charges the next day;
    moves subscriptions to `past_due`, then `expired` at the end of grace;
  - **mandate reconcile** (new, daily): fetches every live mandate from
    Cashfree to catch missed webhooks;
  - keeps `maintainBillingCoverage` (share-link revocation).
- Notifications (new): free month ending (7/3/0 days, only without a plan),
  autopay set up, charge tomorrow, payment received, payment failed, grace
  ending.
- Invoices: number on charge success, render a PDF, store it in our object
  storage, email it.

### Routes

| Route | Who | Purpose |
|---|---|---|
| `GET /billing/devices`, `GET /billing/subscription` | Family | Existing, new fields. |
| `GET /billing/prices` | Family | Price book for Choose a plan. |
| `POST /billing/quotes` | Family | Shoes + term → dated list of charges, credits, renewal. 15-minute expiry. |
| `POST /billing/checkout` | Family | Quote + idempotency key → mandate + checkout token. |
| `GET /billing/checkout/{id}` | Family | Status for the Setting up screen. Checks Cashfree directly if a webhook is late. |
| `POST /billing/subscription/add-shoes` | Payer | Quote then confirm; schedules the pro-rated charge. |
| `POST /billing/subscription/schedule` | Payer | Swap shoes or change term at renewal; undo. |
| `POST /billing/subscription/cancel`, `/resume` | Payer | Cancel the mandate; resume creates a new one. |
| `POST /billing/subscription/payment-method` | Payer | New mandate; old one cancelled once the new one is active. |
| `POST /billing/charges/{id}/pay-now` | Payer | One-off payment for a failed charge. |
| `GET /billing/invoices`, `GET /billing/invoices/{id}/pdf` | Payer | Invoices. |
| `POST /v1/webhooks/cashfree` | Cashfree | Signature check (HMAC-SHA256 of timestamp + raw body, 5-minute window), store, queue. |
| Admin: grant, extend, refund, price book | Admin | Later, with the admin console screens. |

### Configuration (Infisical)

`CASHFREE_ENV` (`sandbox`/`production`), `CASHFREE_CLIENT_ID`,
`CASHFREE_CLIENT_SECRET`, `CASHFREE_WEBHOOK_SECRET` (may be the client secret;
to confirm), `CASHFREE_API_VERSION` (`2026-01-01`), `BILLING_MANDATE_MAX_MINOR`
(500000), `BILLING_GSTIN`, `BILLING_LEGAL_NAME`, `BILLING_SAC_CODE`. The feature
flags stay. `SUPERWALL_*` and `BILLING_OFFER_CODE_KEY` are deleted.

## Mobile changes

- Add `react-native-cashfree-pg-sdk`. It works in our dev builds, not Expo Go.
  A small config plugin in `apps/mobile/plugins/` adds the Android manifest
  flag `cashfree_subscription_flow_enable` and the iOS
  `LSApplicationQueriesSchemes` for UPI apps (`phonepe`, `tez`, `paytmmp`,
  `bhim`, `amazonpay`, `credpay`).
- Remove the Superwall keys from `.env.example`, the README and EAS.
- `src/features/billing/`: API hooks, the checkout adapter
  (`CFSubscriptionSession` + `doSubscriptionPayment`), a status poller, and
  formatting for prices and dates.
- Screens under `src/app/(app)/billing/`: Choose a plan, Review plan, Setting
  up / result, Subscription (manage), Add shoes, Invoices, plus the swap,
  cancel and payment-method sheets.
- Shared pieces: Subscription card on Profile (11 states), Home banner,
  coverage chip on each child, the locked card for History and Home, and one
  handler that turns a `SUBSCRIPTION_REQUIRED` response into the locked card.
- Everything behind the server's feature flags, so it ships dark.

## Phases

Cashfree is connected last. Until then a **fake provider** stands in for it:
it creates pretend mandates and charges, and a dev-only screen in the app (and
admin endpoints) can approve, decline, fail or refund them, so every flow and
state in the mockups can be exercised end to end.

| # | Phase | Who | Done when |
|---|---|---|---|
| 1 | Core | Me | Migration, price book, pricing functions with tests, provider interface, fake provider, quote and checkout routes, webhook queue. |
| 2 | Running the plan | Me | Scheduler, dunning, reconcile, coverage and locking, notifications, invoices, manage routes (add shoes, swap, cancel, payment method, pay now). All driven by the fake provider and tested. |
| 3 | App | Me | Every screen in the mockups, the Profile card, banners, locked states, with a fake checkout sheet in dev builds. |
| 4 | Clean-up | Me | Remove Superwall code and docs, the subscription script, and the unsubmitted App Store products. |
| 5 | Cashfree account | You | Sandbox keys and webhook secret in Infisical; later KYC, Subscriptions and **UPI AutoPay activated by the account manager**, policy pages live on the website, GSTIN confirmed. |
| 6 | Cashfree provider | Me | Cashfree implementation of the interface, the React Native SDK and config plugin, sandbox runs end to end via `pnpm dev:public` and Pinggy. |
| 7 | **App Review check** | You + me | A TestFlight / App Review submission with the real checkout and review notes explaining that every feature needs the shoe (Guideline 3.1.4). Same check for Google Play's payments policy. **Gate for the iOS release.** |
| 8 | Pilot | Both | Production keys, pilot family IDs, real ₹ payments by the team, then a few families. |

Two things are worth starting early even though the integration comes last,
because they involve waiting on other people: the Cashfree account and KYC
(production approval and UPI AutoPay activation can take days to weeks), and
the App Review check. If Apple says no, the provider interface lets us put store
billing back on iOS only, and Android and the web keep Cashfree.

## Decisions needed

1. **Free days**: start the plan when the first selected shoe's free month ends
   and credit other shoes' leftover days (recommended, in the mockups), or
   start each shoe separately.
2. **GST**: prices include GST (recommended, shown as included).
3. **Autopay limit**: ₹5,000 for everyone (recommended), or a limit based on
   each plan.
4. **Refunds**: no refunds for unused days on cancel, with support able to
   refund any payment (recommended).
5. **No free days left**: cover straight away and charge the next day
   (recommended), or wait for the first charge to succeed.

## Open questions for Cashfree

- Does the default `ON_DEMAND` charge flow send the RBI pre-debit notice, or do
  we use the controlled notification and execution APIs?
- Is the webhook secret the client secret?
- Can a mandate's authorisation amount be the first charge, for families with
  no free days left?
- Fees for mandate creation and each debit, per method.
- Is the React Native SDK's subscription checkout fine with Expo SDK 56 and
  React Native 0.85?
