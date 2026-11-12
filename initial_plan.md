# StepWhere Mobile Home Screen Initial Plan

This plan focuses only on `apps/mobile`, the Expo app. The first milestone is a polished static Home screen that matches the provided iOS-style family safety design, with reusable components and a Unistyles foundation that can keep evolving.

## Current Project Notes

- Workspace uses pnpm with the mobile app at `apps/mobile`.
- Mobile entry is `apps/mobile/src/index.ts`, which already imports `./unistyles`.
- `apps/mobile/src/unistyles.ts` does not exist yet, so the first implementation phase must add it.
- Expo Router is used through `apps/mobile/src/app/_layout.tsx`.
- Current `index.tsx` is the Expo starter screen and will be replaced by the StepWhere home screen.
- Current tab setup uses `expo-router/unstable-native-tabs` with two starter tabs. The target design needs a custom four-item bottom nav: Home, Activity, Logs, Profile.
- `react-native-unistyles` is already installed.
- No StepWhere-specific assets exist yet. Child avatars and map visuals need a planned asset strategy.

## Proposed Mobile Structure

```text
apps/mobile/src/
  app/
    _layout.tsx
    index.tsx
    activity.tsx
    logs.tsx
    profile.tsx

  components/
    layout/
      AppStatusBar.tsx
      ScreenShell.tsx

    home/
      HomeHeader.tsx
      StepWhereLogo.tsx
      HeaderIconButton.tsx
      ChildCarousel.tsx
      ChildAvatarItem.tsx
      AddChildButton.tsx
      TelemetryBar.tsx
      TelemetryItem.tsx
      PastelMap.tsx
      MapRoadLayer.tsx
      ChildMapMarker.tsx
      SafeZoneRings.tsx
      MapControls.tsx
      SafetyFab.tsx
      ChildSummaryCard.tsx

    navigation/
      BottomNavigationBar.tsx
      BottomNavigationItem.tsx

    ui/
      Badge.tsx
      StatusDot.tsx
      StatusPill.tsx
      IconButton.tsx
      Avatar.tsx

  data/
    children.ts
    telemetry.ts

  theme/
    tokens.ts
    status.ts
    shadows.ts

  unistyles.ts
```

Keep the first implementation local and static. Data can live in `src/data` until real state, APIs, or location services are introduced.

## Phase 1: Foundation And Theme

Goal: create the styling base before building UI.

1. Add `apps/mobile/src/unistyles.ts`.
2. Register a first `lightTheme` with:
   - color tokens from the design guidelines
   - status palettes for `safe`, `transit`, `alert`, and `offline`
   - spacing scale: `4, 8, 12, 16, 20, 24, 32`
   - radii for pills, cards, circles, and nav
   - typography sizes and weights used by this screen
   - reusable shadow tokens for cards, floating buttons, and markers
3. Decide the breakpoint/runtime setup for Unistyles, even if only phone sizes are used initially.
4. Add TypeScript theme typings if needed by the installed Unistyles version.
5. Keep the existing `src/constants/theme.ts` untouched until components are migrated, then remove or shrink it later.

Acceptance criteria:

- App starts without missing `./unistyles` import errors.
- Theme values are centralized and named by intent, not one-off component colors.
- Components can import `StyleSheet` from `react-native-unistyles`.

## Phase 2: App Shell And Navigation

Goal: create the full-screen mobile shell and bottom nav frame.

1. Replace the Expo starter content in `src/app/index.tsx` with `HomeScreen`.
2. Update `_layout.tsx` so the app renders a clean StepWhere shell.
3. Decide whether to keep `NativeTabs` or replace it with an in-screen custom bottom navigation for design accuracy.
4. Add placeholder routes/screens for:
   - `activity.tsx`
   - `logs.tsx`
   - `profile.tsx`
5. Build `BottomNavigationBar` with four equal tabs.
6. Add the iOS home indicator treatment inside the bottom nav area for the mock-quality first screen.

Recommended first-screen approach:

- Use a custom `BottomNavigationBar` inside the Home screen for pixel control.
- Keep Expo Router routes available, but defer real tab navigation behavior until the static screen is visually stable.

Acceptance criteria:

- Screen fills a modern iPhone-sized viewport.
- Bottom nav has Home active and Activity, Logs, Profile inactive.
- Touch targets are at least 44 px high.

## Phase 3: Static Data Model

Goal: keep UI components reusable and state-driven from day one.

Create `src/data/children.ts` with:

- Aarav: selected, School, safe
- Diya: On the way, transit
- Kabir: Home, safe
- Myra: Left School, alert

Suggested shape:

```ts
type ChildStatus = 'safe' | 'transit' | 'alert' | 'offline';

type Child = {
  id: string;
  name: string;
  status: ChildStatus;
  statusLabel: string;
  locationLabel: string;
  avatar: ImageSourcePropType;
  selected?: boolean;
};
```

Create `src/data/telemetry.ts` with:

- battery label/value
- signal strength
- selected child safety status
- last updated value
- ETA label placeholder

Acceptance criteria:

- Child carousel, map marker, telemetry bar, and summary card all consume the same selected child object.
- Status colors come from theme/status mappings, not duplicated conditionals.

## Phase 4: Header And Child Selector

Goal: build the top identity and child-switching area.

Components:

- `AppStatusBar`
- `HomeHeader`
- `StepWhereLogo`
- `HeaderIconButton`
- `ChildCarousel`
- `ChildAvatarItem`
- `AddChildButton`
- `Badge`
- `StatusDot`

Implementation notes:

- Use native safe-area values, but visually match the 375 x 812 target.
- Logo text should render as lowercase `step where`, with `step` grey and `where` green.
- Add a small pin/location accent near the logo.
- Header actions: chat icon and bell icon with red `2` badge.
- Carousel should be horizontally scrollable but show the five target items on 375 px width.
- Myra needs a red alert badge on the avatar.

Asset decision:

- For the first static implementation, use local generated child portrait assets or temporary colored avatar placeholders.
- Before visual polish is complete, replace placeholders with friendly child portraits stored under `apps/mobile/assets/images/children`.

Acceptance criteria:

- Five carousel items are visible: Aarav, Diya, Kabir, Myra, Add Child.
- Avatar rings and labels reflect status.
- Aarav appears selected.

## Phase 5: Telemetry Strip

Goal: add the compact reassurance strip above the map.

Components:

- `TelemetryBar`
- `TelemetryItem`

Columns:

- Battery: icon, `Battery`, `Till 6:30PM`
- Signal: icon, `Signal`, three green dots
- Status: icon, `Status`, `At School`

Implementation notes:

- Use a white rounded container with soft shadow or a hairline divider.
- Use equal-width columns and vertical dividers.
- Keep copy small and readable.

Acceptance criteria:

- Bar is around 58 px high on a 375 px screen.
- It can slightly overlay the map area.
- Status text is not conveyed by color alone.

## Phase 6: Map Scene

Goal: create the map-first visual anchor without needing a real map SDK yet.

Components:

- `PastelMap`
- `MapRoadLayer`
- `ChildMapMarker`
- `SafeZoneRings`
- `MapControls`
- `SafetyFab`

Implementation notes:

- Build the first map as a lightweight custom React Native view using absolute-positioned shapes.
- Use pale map background, soft road bands, simple blocks, park/water areas, and subtle labels.
- Place Aarav marker near the visual center.
- Safe-zone rings should sit behind the avatar and use green opacity layers.
- Right-side controls: target and layers.
- Safety FAB: green circular shield/check button above the summary card.

Future note:

- A real map SDK can replace `PastelMap` later while keeping `ChildMapMarker`, `MapControls`, and overlays intact.

Acceptance criteria:

- Center marker is the primary visual focus.
- Map remains low contrast so overlays are readable.
- Floating buttons have consistent circular touch targets and shadows.

## Phase 7: Child Summary Card

Goal: add the collapsed expandable card for the selected child.

Components:

- `ChildSummaryCard`
- `StatusPill`
- `StatusDot`
- `Avatar`

Content:

- Aarav avatar
- Name: `Aarav`
- Status pill: `School`
- Green status dot
- Meta: `Last updated: just now`
- Right side: `ETA` and chevron down

Implementation notes:

- Position above bottom nav.
- Treat it as tappable and expandable, though the first phase can keep it static.
- Use a white card, 18-22 px radius, and soft shadow.

Acceptance criteria:

- Card fits between map and bottom nav without overlap.
- Text remains readable at the target screen width.
- Layout can support future expanded states.

## Phase 8: Interaction Wiring

Goal: make the static screen behave enough to validate component design.

1. Add local selected-child state in `HomeScreen`.
2. Tapping a child updates:
   - selected child ring
   - telemetry status
   - map marker status color
   - summary card
3. Add press handlers as no-op placeholders for:
   - Add Child
   - chat
   - notification bell
   - map target
   - map layers
   - Safety FAB
   - summary card expand
4. Add accessibility labels and roles for tappable items.

Acceptance criteria:

- Child selection updates all dependent UI from shared state.
- Every visible control has a clear accessible label.

## Phase 9: Visual QA And Polish

Goal: verify the screen against the guidelines before moving to deeper functionality.

Checklist:

- iOS-style status bar exists and blends into the screen.
- Header logo, chat icon, and bell badge are present.
- Child selector has Aarav, Diya, Kabir, Myra, and Add Child.
- Telemetry bar has Battery, Signal, and Status columns.
- Map is pastel and low contrast.
- Aarav marker has safe-zone rings and a pointer.
- Right map controls are stacked.
- Green Safety FAB is above the summary card.
- Summary card shows Aarav status and last update.
- Bottom nav has Home active.
- iOS home indicator is visible.
- Text does not overlap or clip at 375 x 812.
- Touch targets are 44 x 44 px minimum.

Verification steps:

1. Run TypeScript or Expo lint.
2. Run the app on iOS simulator or web during early layout work.
3. Capture screenshots at 375 x 812 and a taller iPhone size.
4. Adjust spacing only through theme tokens where practical.

## Phase 10: Follow-Up After First Screen Stabilizes

Defer these until the first static Home screen is stable:

- Real map SDK integration.
- Real child profile images and upload flow.
- Push notification wiring.
- Location permissions and live tracking.
- SOS/safety action menu.
- Expanded child detail sheet.
- Activity, Logs, and Profile screen implementations.
- Dark mode.
- Server integration.

## Implementation Order Summary

1. Add Unistyles foundation.
2. Replace starter Home with a StepWhere screen shell.
3. Add static child and telemetry data.
4. Build header and child carousel.
5. Build telemetry strip.
6. Build pastel map, marker, controls, and Safety FAB.
7. Build summary card.
8. Build bottom navigation.
9. Wire local child selection.
10. Run visual and accessibility QA.
