# Billing setup guide: your steps

Billing runs on Cashfree autopay (`billing-cashfree-plan.md`). Everything except
Cashfree is built and runs against a fake provider, so you can try every flow
before the account exists. Cashfree is connected last.

## 1 · Try it now with the fake provider

Nothing to sign up for. On your dev server (`pnpm dev:public`):

1. In Infisical, server project, `dev` environment, set
   `BILLING_PURCHASES_ENABLED=true` and `BILLING_PILOT_ORGANIZATION_IDS` to your
   test family's organization ID. Leave `BILLING_PROVIDER` unset (it defaults to
   `fake`).
2. Open the app in a dev build. Profile shows the Subscription card. Choose a
   plan, review it, and tap Set up autopay. Instead of Cashfree, a **Test
   payment** sheet lets you approve, decline, leave the bank pending or let it
   expire. Charges can be paid or failed the same way.
3. Charges are sent to the fake bank 3 days before they're due and settle on
   their due date by themselves, so a plan whose free month ends within 3 days
   shows the whole cycle quickly.

A production server refuses to sell through the fake provider.

## 2 · Clean up the store setup

Nothing here is urgent; none of it was ever live.

- **Infisical** (server, `dev`): delete `SUPERWALL_API_KEY`,
  `SUPERWALL_PROJECT_ID`, `SUPERWALL_APPLICATION_IDS` and
  `SUPERWALL_WEBHOOK_SECRET`. The server no longer reads them.
- **EAS**: delete `EXPO_PUBLIC_SUPERWALL_IOS_KEY` and
  `EXPO_PUBLIC_SUPERWALL_ANDROID_KEY` if you created them.
- **Superwall**: delete the project (ID 42336), or leave it; nothing calls it.
- **App Store Connect**: the 15 subscriptions in "Stepwhere Subscription" were
  never submitted. Leave them, or delete them (Subscriptions → the product →
  Delete). Deleted product IDs can't be reused. Keep the old in-app purchases
  removed from sale.
- **Google Play**: nothing was created.

## 3 · Cashfree account (start any time, needed last)

Cashfree's production approval involves waiting on them, so starting early
costs nothing.

1. Sign up at cashfree.com with the business that will invoice families. Sandbox
   keys are available straight away; production needs KYC (PAN, GST, bank
   account, business documents).
2. Put these pages on stepwhere.in, because Cashfree checks them: Terms,
   Privacy, Refund and Cancellation policy, Contact details, and pricing.
   Refund policy: no refunds for unused days after cancelling; support can
   refund any payment.
3. Ask your account manager to enable **Subscriptions** and **UPI AutoPay**.
   UPI AutoPay is not self-serve. Ask them these, and send me the answers:
   - Does an `ON_DEMAND` charge send the RBI pre-debit notice for us, or must we
     use the controlled notification and execution APIs?
   - Is the webhook secret the same as the client secret?
   - Fees for mandate creation and for each debit, per method.
   - Does the React Native SDK's subscription checkout work with Expo SDK 56 and
     React Native 0.85?
4. Sandbox keys into Infisical (server project, `dev`). Don't paste them into
   chat:

   | Secret | Value |
   |---|---|
   | `CASHFREE_CLIENT_ID` | Sandbox App ID |
   | `CASHFREE_CLIENT_SECRET` | Sandbox Secret Key |
   | `CASHFREE_WEBHOOK_SECRET` | Per Cashfree's answer above |

5. Webhook in the Cashfree sandbox dashboard (Developers → Webhooks,
   Subscriptions, latest API version):
   `https://npafhgmeij.a.pinggy.link/v1/webhooks/billing/cashfree`.
6. Tell me when that's done. I then write the Cashfree provider and add the SDK
   to the app, and we switch `BILLING_PROVIDER=cashfree` on dev.

## 4 · Before launch

- App Review check with the real checkout (Guideline 3.1.4), and Google Play's
  payments policy check.
- Production keys in the production environment, `BILLING_ENVIRONMENT=PRODUCTION`,
  `BILLING_LEGAL_NAME` and `BILLING_GSTIN`.
- A real ₹ payment by the team, then the pilot families.
