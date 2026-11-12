# Stepwhere Mobile EAS Release Runbook

This app is the Expo mobile client for Stepwhere.

Mobile CI/CD is owned by EAS Workflows from this directory:

```text
apps/mobile/.eas/workflows
```

GitHub Actions does not build, validate, submit, or publish the mobile app. GitHub Actions is reserved for the server/admin/device-proxy/VPS stack.

## EAS Project

Expo organization:

```text
stepwhere-app
```

Expo project:

```text
stepwhere-mobile-app
```

`app.config.ts` reads:

```env
EXPO_OWNER=stepwhere-app
EAS_PROJECT_ID=652fdb22-ac7e-4e6a-9b41-54662c032f6e
```

Those defaults are embedded so local config inspection works without env vars, but EAS Environment Variables should own build-time values.

## Safety Model

Nothing in this pass can automatically replace the current live Play Store app:

- All production build workflows are manually triggered.
- No workflow contains an EAS `submit` job.
- No workflow contains an EAS `update` job.
- No production workflow runs on push to `main`.
- Upload to Play Console internal testing is manual.
- OTA publishing is intentionally not enabled.

Live users are affected only if a human uploads/promotes a release in Play Console or if OTA publishing is added later.

## Current App IDs

Development:

```text
APP_VARIANT=development
Android package: com.stepwhere.dev
iOS bundle id: com.stepwhere.dev
Scheme: stepwhere-dev
Display name: Stepwhere Dev
```

Production:

```text
APP_VARIANT=production
Android package: com.stepwhere
iOS bundle id: com.stepwhere
Scheme: stepwhere
Display name: Stepwhere
```

The production Android package and iOS bundle identifier both stay `com.stepwhere` because those are the existing store app identifiers.

## EAS Dashboard Setup

Before relying on EAS Workflows:

1. Open the EAS dashboard.
2. Go to `stepwhere-app -> stepwhere-mobile-app`.
3. Open project GitHub settings/connections.
4. Install or configure the Expo GitHub app.
5. Link this repository:

```text
stepwhere/stepwhere-stack
```

6. Confirm EAS can access repository contents.
7. Confirm workflows are read from:

```text
apps/mobile/.eas/workflows
```

The workflow directory is nested because `apps/mobile/eas.json` is the EAS project root.

If nested workflow execution through the dashboard is not available in the account/runtime, run workflows manually from the app root:

```sh
cd apps/mobile
eas workflow:run .eas/workflows/build-android-production.yml
```

## EAS Environments

Mobile does not use Infisical in the first pass. EAS Environment Variables are the source of truth.

Create two EAS environments:

```text
development
production
```

### Development EAS Env

```env
APP_VARIANT=development
EXPO_OWNER=stepwhere-app
EAS_PROJECT_ID=652fdb22-ac7e-4e6a-9b41-54662c032f6e
EXPO_PUBLIC_API_URL=http://localhost:8223
EXPO_PUBLIC_AUTH_URL=http://localhost:8223/api/auth
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<firebase-auth-web-client-id>.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=
```

Firebase config is committed in the repo at:

```text
apps/mobile/google-services.json
```

Google email verification uses the native Google SDK and sends a Google ID token to the API. It does not use `/api/auth/callback/google` and does not require localhost or tunnel redirect URIs.

Google SDK sign-in does not work in Expo Go. Use a development build or production build. After adding or changing Google config files or native plugins, rebuild the app.

Required Google config files:

```text
apps/mobile/google-services.json
apps/mobile/GoogleService-Info.plist
apps/mobile/GoogleService-Info.dev.plist
```

The Google Cloud project must include a Web OAuth client shared by mobile `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` and API `GOOGLE_OAUTH_CLIENT_ID`, Android OAuth clients for `com.stepwhere` and `com.stepwhere.dev` with SHA-1 fingerprints, and iOS OAuth clients for `com.stepwhere` and `com.stepwhere.dev`.

### Production EAS Env

```env
APP_VARIANT=production
EXPO_OWNER=stepwhere-app
EAS_PROJECT_ID=652fdb22-ac7e-4e6a-9b41-54662c032f6e
EXPO_PUBLIC_API_URL=https://api.stepwhere.in
EXPO_PUBLIC_AUTH_URL=https://api.stepwhere.in/api/auth
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<firebase-auth-web-client-id>.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=
```

Firebase config is committed in the repo at:

```text
apps/mobile/google-services.json
```

`EXPO_PUBLIC_*` values are bundled into the app and are not secrets. The normal Firebase `google-services.json` file is also shipped in the Android app, so we commit it instead of using EAS file env variables. Do not commit service-account JSON, Firebase Admin credentials, private keys, upload keystores, or credential files.

## Local Development

Pull development env:

```sh
cd apps/mobile
pnpm env:pull:dev
pnpm start
```

This writes:

```text
apps/mobile/.env.local
```

Pull production env only for debugging:

```sh
cd apps/mobile
pnpm env:pull:prod
```

This writes:

```text
apps/mobile/.env.production.local
```

Do not commit local env files.

## Firebase Config Handling

`app.config.ts` always uses the root Firebase config file:

```text
./google-services.json
```

Create these Firebase Android apps in the same Firebase project before building:

```text
com.stepwhere
com.stepwhere.dev
```

After both Android apps exist, download `google-services.json` from Firebase Console and place it at `apps/mobile/google-services.json`. The file must contain both package names in its `client` array. The Google Services Gradle plugin selects the correct client by matching the build package name, so the same file works for `com.stepwhere` and `com.stepwhere.dev`.

The committed `apps/mobile/google-services.json` contains only the intended `com.stepwhere` and `com.stepwhere.dev` Android clients.

For iOS, keep the Firebase config files at:

```text
apps/mobile/GoogleService-Info.plist      # com.stepwhere
apps/mobile/GoogleService-Info.dev.plist  # com.stepwhere.dev
```

Each plist must contain its matching `BUNDLE_ID`, an iOS `CLIENT_ID`, and `REVERSED_CLIENT_ID`. The native Google plugin copies the selected plist and registers its reversed client ID as an iOS URL scheme. Because these plists do not provide `WEB_CLIENT_ID`, both EAS environments must define `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`; it must equal the API's `GOOGLE_OAUTH_CLIENT_ID`.

## EAS Profiles

`eas.json` defines:

```text
development
production-local
production
```

Development:

- development client
- internal distribution
- EAS channel: `development`
- EAS environment: `development`
- Android package: `com.stepwhere.dev`

Production:

- store distribution
- EAS channel: `production`
- EAS environment: `production`
- auto increment enabled
- Android package: `com.stepwhere`

Production local:

- production app identifiers and EAS production environment
- internal distribution for installable device builds
- Android APK and iOS ad hoc IPA
- not suitable for TestFlight or Play Store upload

## EAS Workflows

### Validate Mobile

File:

```text
apps/mobile/.eas/workflows/validate.yml
```

Trigger:

```text
pull_request to main, mobile/package/shared workspace paths only
```

Checks:

```sh
pnpm --filter @stepwhere/mobile typecheck
pnpm --filter @stepwhere/mobile lint
APP_VARIANT=development pnpm --filter @stepwhere/mobile exec expo config --json
APP_VARIANT=production pnpm --filter @stepwhere/mobile exec expo config --json
```

### Android Production Build

File:

```text
apps/mobile/.eas/workflows/build-android-production.yml
```

Run:

```sh
cd apps/mobile
eas workflow:run .eas/workflows/build-android-production.yml
```

Purpose:

- Manual Android production AAB build.
- Uses EAS `production` profile and environment.
- Produces package `com.stepwhere`.
- Does not upload to Play Console.
- Does not publish OTA.

### Development Builds

File:

```text
apps/mobile/.eas/workflows/build-development.yml
```

Run:

```sh
cd apps/mobile
eas workflow:run .eas/workflows/build-development.yml
```

Purpose:

- Manual Android and iOS development-client builds.
- Android package is `com.stepwhere.dev`.
- Not for Play Console internal testing.

### Production Builds

File:

```text
apps/mobile/.eas/workflows/build-production.yml
```

Run:

```sh
cd apps/mobile
eas workflow:run .eas/workflows/build-production.yml
```

Purpose:

- Manual Android and iOS production builds.
- Still no submit step.
- Useful later when iOS release prep starts.

## Local Build Commands

Development Android:

```sh
cd apps/mobile
pnpm eas:build:dev:android
```

Development iOS:

```sh
cd apps/mobile
pnpm eas:build:dev:ios
```

Production Android:

```sh
cd apps/mobile
pnpm eas:build:prod:android
```

Production iOS:

```sh
cd apps/mobile
pnpm eas:build:prod:ios
```

Production all platforms:

```sh
cd apps/mobile
pnpm eas:build:prod
```

For Google Play, use the production Android build. It produces an AAB for:

```text
com.stepwhere
```

## Validation

Local typecheck:

```sh
cd apps/mobile
pnpm typecheck
```

Lint:

```sh
cd apps/mobile
pnpm lint
```

Inspect development Expo config:

```sh
cd apps/mobile
APP_VARIANT=development pnpm exec expo config --json
```

Inspect production Expo config:

```sh
cd apps/mobile
APP_VARIANT=production pnpm exec expo config --json
```

Check Android package in production config:

```sh
cd apps/mobile
APP_VARIANT=production pnpm exec expo config --json | rg '"package": "com.stepwhere"'
```

Build installable production-configured artifacts locally with EAS remote credentials and production environment variables:

```sh
cd apps/mobile
pnpm eas:build:local-prod:android
pnpm eas:build:local-prod:ios
```

The iPhone must be registered in the ad hoc provisioning profile used by the `production-local` profile. These artifacts are written to `apps/mobile/.builds/` and are only for device testing.

One-time Apple setup for a local production-configured iPhone build:

```sh
cd apps/mobile
pnpm exec eas device:create
pnpm exec eas credentials --platform ios
pnpm eas:build:local-prod:ios
```

Use the Apple team that owns the existing `com.stepwhere` App ID. EAS-managed credentials should include an Apple Distribution certificate, an ad hoc provisioning profile for local device testing, an App Store provisioning profile for TestFlight, and an APNs key for push notifications.

Build the final store artifacts locally:

```sh
cd apps/mobile
pnpm eas:build:local-store:android
pnpm eas:build:local-store:ios
```

Only the store-profile iOS IPA can be submitted to TestFlight. The production-local IPA cannot be submitted.

## Google Play Console Setup

The Play Store app already uses:

```text
com.stepwhere
```

All internal, closed, and production Play Console releases must use builds with that same package.

Do not upload these to the existing Play Store app:

```text
com.stepwhere.dev
com.vael36.stepwhere
```

### 1. Confirm App Record

In Google Play Console:

```text
All apps -> Stepwhere
```

Confirm:

```text
Package name: com.stepwhere
```

The package name is locked after the first upload. Keep it unchanged.

### 2. Confirm App Signing

Go to:

```text
Test and release -> Setup -> App signing
```

Check:

- Play App Signing is enabled.
- You know whether the current upload key is managed by EAS.
- EAS production Android credentials match the upload key expected by Play Console.

If the old live app was not built by this EAS project, inspect or import Android credentials before uploading a new AAB. A different upload key can cause upload rejection.

Useful EAS command:

```sh
cd apps/mobile
eas credentials --platform android
```

If Play Console rejects the upload key, either configure EAS to use the existing upload key or reset the upload key in Play Console and then update EAS credentials.

Do not rotate app signing credentials casually.

### 3. Confirm Store Listing

Go to:

```text
Grow users -> Store presence -> Main store listing
```

Confirm or complete:

- App name
- Short description
- Full description
- App icon
- Feature graphic
- Phone screenshots
- App category
- Contact email
- Website if available
- Privacy policy URL

### 4. Confirm App Content

Go to:

```text
Policy and programs -> App content
```

Complete every required section before closed testing/production:

- Privacy policy
- Data safety
- Content rating
- Target audience and content
- Ads declaration
- App access
- Data deletion/account deletion if required
- Any sensitive permissions declaration Google surfaces

Stepwhere likely needs Data Safety disclosures for:

- account identifiers
- phone/auth data
- child profile data
- uploaded avatars/images
- location-related child/device data
- push notification tokens/device identifiers
- diagnostics/crash data if collected

The exact answers must match the real app behavior and privacy policy.

## Internal Testing Build And Publish

Use internal testing for fast QA before closed testing.

### Step 1: Build Production Android AAB

Run the manual EAS workflow:

```sh
cd apps/mobile
eas workflow:run .eas/workflows/build-android-production.yml
```

Download the `.aab` from the EAS build page.

Before upload, confirm:

```text
Android package: com.stepwhere
Profile: production
Distribution: store
```

### Step 2: Open Internal Testing

In Google Play Console:

```text
Test and release -> Testing -> Internal testing
```

Create or edit the internal testing release.

### Step 3: Add Testers

Add testers using either:

- email list
- Google Group

Recommended:

- Create a named tester list like `Stepwhere Internal QA`.
- Add your own Google account first.
- Add team/stakeholder accounts.

### Step 4: Create Internal Release

Go to:

```text
Internal testing -> Releases -> Create new release
```

Upload the EAS `.aab`.

Fill release notes, for example:

```text
Initial Stepwhere internal Android test build.
```

Review warnings/errors. Fix blocking errors.

Click the Play Console action shown by your UI, usually:

```text
Save and publish
```

or:

```text
Start rollout to Internal testing
```

### Step 5: Share Opt-In Link

After the release is available:

1. Go back to Internal testing.
2. Find the tester opt-in link.
3. Open it with a tester account.
4. Accept opt-in.
5. Install from Google Play.

Use the opt-in link, not direct store search, because internal apps may not appear publicly.

### Step 6: QA Checklist

On a real Android device:

- App installs from Play.
- App opens without crashing.
- Phone auth flow works.
- OTP/recovery flow works.
- Family onboarding works.
- Device QR scan/camera permission works.
- Google Maps renders.
- Child/device live location renders.
- Push notification permission prompt works.
- Expo push token registration reaches the server.
- Geofence notification sound/channel works.
- Avatar upload works.
- Logout/login works.
- App survives restart with session.

Collect:

- Play Console pre-launch report results.
- Crashes and ANRs.
- Tester feedback.

## Closed Testing Build And Publish

Use closed testing after internal QA.

For new personal Google Play developer accounts, Google may require a closed test with at least 12 opted-in testers for 14 continuous days before production access. Organization accounts and older accounts may differ, but closed testing is still recommended.

### Step 1: Prepare Tester Group

- Gather at least 12 committed Android testers if your account is subject to the rule.
- Prefer 15-20 testers to avoid opt-in/drop-off risk.
- Use a Google Group or email list.
- Make sure testers can access Google Play with those accounts.

### Step 2: Create Closed Testing Track

In Google Play Console:

```text
Test and release -> Testing -> Closed testing
```

Create a track, for example:

```text
beta
```

Add tester group/list.

### Step 3: Upload Release

Build the production Android AAB:

```sh
cd apps/mobile
eas workflow:run .eas/workflows/build-android-production.yml
```

Upload the `.aab` to the closed testing track.

Add release notes:

```text
Stepwhere closed beta build.
```

Review release and start rollout to closed testing.

### Step 4: Share Closed Testing Opt-In Link

Send the opt-in link to testers.

Ask testers to:

1. Open the opt-in link.
2. Accept testing.
3. Install the app from Google Play.
4. Open and use the app.

### Step 5: Maintain Test Window

If the 12-tester/14-day rule applies:

- Keep at least 12 testers opted in for the full required period.
- Monitor Play Console eligibility.
- Avoid unnecessary release churn.
- Fix only blocking issues.
- Keep notes of tester activity and feedback.

After the test period:

```text
Test and release -> Production
```

Request production access if Play Console requires it.

## Production Release

Production release automation is intentionally not configured yet.

First production rollout should be manual:

1. Promote a known-good closed testing build, or upload a new production AAB.
2. Use staged rollout.
3. Monitor crashes, ANRs, and user feedback.

## OTA Status

EAS Update is configured with:

```ts
runtimeVersion: {
  policy: "appVersion"
}
```

OTA publishing is not enabled in the first pass.

Do not add or run production OTA workflows until the team decides the OTA guard strategy.
