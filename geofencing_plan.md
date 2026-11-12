# Geofencing UI State, Status Bar, Floating Action, And Radius Editor

## Summary

Build the geofencing UI on the home screen only, with local in-memory state and no backend integration yet.

The home geofence feature will support four UI states per selected child:

- `unset`: no geofence has been created for that child.
- `editing`: user is choosing the geofence radius.
- `enabled`: geofence exists and alerts are active.
- `disabled`: geofence exists but alerts are paused.

The floating geofence button will change by state:

- `unset`: purple/question or geofence setup state, opens editor.
- `editing`: blue save button, saves the selected radius and enables geofence.
- `enabled`: green shield/geofence state, disables geofence on press.
- `disabled`: gray/orange disabled state, re-enables geofence on press.

The bottom card above the nav will replace the existing child summary card:

- In `unset`, `enabled`, and `disabled`, show the geofence status card from the design.
- In `editing`, show only the radius slider card above the bottom nav, per confirmed preference.

## Current Repo Context

Relevant existing files:

```txt
apps/mobile/src/app/(app)/home.tsx
apps/mobile/src/components/home/safety-fab.tsx
apps/mobile/src/components/home/child-summary-card.tsx
apps/mobile/src/components/home/pastel-map.tsx
apps/mobile/src/components/home/pastel-map.native.tsx
apps/mobile/src/components/home/safe-zone-rings.tsx
apps/mobile/src/components/home/safe-zone-rings.native.tsx
apps/mobile/src/components/ui/app-icon.tsx
apps/mobile/src/theme/tokens.ts
apps/mobile/src/data/children.ts
apps/mobile/package.json
```

Current behavior:

- `SafetyFab` exists and uses `AppIcon` name `geofence`.
- `onSafetyPress` is currently a no-op from `home.tsx`.
- `SafeZoneRings` always render on both native and web fallback maps.
- The bottom card above nav is currently `ChildSummaryCard`.
- `@expo/ui` is not installed.
- `react-native-gesture-handler` is installed, but the selected slider direction is Expo UI Slider.

## Product Decisions Locked

- Geofence UI state is per child.
- Status card actions `Set Now` and `Edit` enter edit mode.
- Edit mode bottom UI shows slider only, not status + slider.
- Radius range is `0 m` to `500 m`, based on the design.
- Default draft radius is `120 m`, based on the design.
- UI-only pass: no persistence, backend, notification registration, location permission flow, or actual geofence API calls.

## Public Interfaces And Types

### Add Local Types

Create or colocate these types, preferably in a feature-local file:

```ts
export type GeofenceUiStatus = 'unset' | 'editing' | 'enabled' | 'disabled';

export type ChildGeofenceState = {
  radiusMeters: number;
  savedRadiusMeters: number | null;
  status: GeofenceUiStatus;
};
```

Recommended default factory:

```ts
const DEFAULT_GEOFENCE_RADIUS_METERS = 120;
const MIN_GEOFENCE_RADIUS_METERS = 0;
const MAX_GEOFENCE_RADIUS_METERS = 500;
const GEOFENCE_RADIUS_STEP_METERS = 10;

function createDefaultGeofenceState(): ChildGeofenceState {
  return {
    radiusMeters: DEFAULT_GEOFENCE_RADIUS_METERS,
    savedRadiusMeters: null,
    status: 'unset',
  };
}
```

### Home State Shape

In `home.tsx`, store per-child state:

```ts
const [geofencesByChildId, setGeofencesByChildId] = useState<Record<string, ChildGeofenceState>>(() =>
  Object.fromEntries(children.map(child => [child.id, createDefaultGeofenceState()])),
);
```

Derived values:

```ts
const selectedGeofence = geofencesByChildId[selectedChild.id] ?? createDefaultGeofenceState();
const selectedRadius = selectedGeofence.savedRadiusMeters ?? selectedGeofence.radiusMeters;
```

### Map Component Props

Extend `PastelMap` and native variant:

```ts
type GeofenceButtonState = 'unset' | 'editing' | 'enabled' | 'disabled';

type PastelMapProps = {
  geofenceButtonState: GeofenceButtonState;
  geofenceRadiusMeters: number | null;
  geofenceVisible: boolean;
  onSafetyPress: () => void;
  // existing props...
};
```

### Safe Zone Ring Props

Update safe zone ring components:

Native:

```ts
type SafeZoneRingsProps = {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  visible: boolean;
};
```

Web fallback:

```ts
type SafeZoneRingsProps = {
  radiusMeters: number;
  visible: boolean;
};
```

## State Transitions

### Floating Button Press

Implement one handler in `home.tsx`:

```ts
function handleGeofenceActionPress() {
  update selected child's geofence state:
    unset -> editing
    editing -> enabled, save draft radius
    enabled -> disabled
    disabled -> enabled
}
```

Exact transition details:

- `unset -> editing`
  - `radiusMeters` becomes `savedRadiusMeters ?? 120`.
  - `savedRadiusMeters` remains `null`.

- `editing -> enabled`
  - `savedRadiusMeters = radiusMeters`.
  - `status = 'enabled'`.

- `enabled -> disabled`
  - Keep `savedRadiusMeters`.
  - Keep `radiusMeters = savedRadiusMeters`.
  - `status = 'disabled'`.

- `disabled -> enabled`
  - Keep `savedRadiusMeters`.
  - Keep `radiusMeters = savedRadiusMeters`.
  - `status = 'enabled'`.

### Status Card Action Press

Implement:

```ts
function handleGeofenceStatusActionPress() {
  update selected child's geofence state:
    unset -> editing
    enabled -> editing
    disabled -> editing
}
```

Exact behavior:

- If status is `unset`, open editor with radius `120`.
- If status is `enabled` or `disabled`, open editor with `savedRadiusMeters`.
- If already `editing`, no-op.

### Radius Change

```ts
function handleGeofenceRadiusChange(radiusMeters: number) {
  set selected child radiusMeters = rounded radius;
}
```

Rounding:

```ts
Math.round(value / 10) * 10
```

Clamp to `0..500`.

## Components To Add

### `GeofenceStatusCard`

New file:

```txt
apps/mobile/src/components/home/geofence-status-card.tsx
```

Props:

```ts
type GeofenceStatusCardProps = {
  bottomOffset: number;
  childName: string;
  chromeHidden?: boolean;
  onActionPress: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  radiusMeters: number | null;
  status: 'unset' | 'enabled' | 'disabled';
};
```

Visual states from reference:

`enabled`:

- Icon: shield/check style.
- Accent: green.
- Title: `Geofence is ON`
- Radius pill: `120 m`
- Body: `You'll be notified if Aarav leaves the safe zone.`
- Action: pencil icon + `Edit` + chevron.

`disabled`:

- Icon: shield/x or disabled shield style.
- Accent: orange.
- Title: `Geofence is OFF`
- Radius pill: `120 m`
- Body: `You won't be notified if Aarav leaves the safe zone.`
- Action: pencil icon + `Edit` + chevron.

`unset`:

- Icon: question circle.
- Accent: purple.
- Title: `No geofence set`
- No radius pill.
- Body: `Set a safe zone to get alerts when Aarav leaves that area.`
- Action: pencil icon + `Set Now` + chevron.

Layout:

- Position absolute like `ChildSummaryCard`.
- `left/right: theme.spacing[4]`.
- `bottom: bottomOffset`.
- Background `theme.colors.surface`.
- Border `theme.colors.chrome.cardBorder`.
- Rounded card matching design, using `theme.radius.card`.
- Two-row content:
  - First row: icon + title + optional radius pill + action cluster.
  - Second row: body text aligned under title area.
- Keep card minimum height around `110-124` so two-line unset/off body fits without clipping.
- Use `flexShrink: 1` and wrapping for long child names.

Dark mode:

- Keep white/dark theme surfaces.
- Use same semantic accents:
  - green: `theme.colors.primaryGreen` or `#009944`-like token from design.
  - orange: `#FF6A00`.
  - purple: `#8B5CF6`.
- Increase text contrast against dark surface:
  - title/action accent stays vivid.
  - body uses `theme.colors.text`.

### `GeofenceRadiusEditorCard`

New file:

```txt
apps/mobile/src/components/home/geofence-radius-editor-card.tsx
```

Props:

```ts
type GeofenceRadiusEditorCardProps = {
  bottomOffset: number;
  chromeHidden?: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
  onRadiusChange: (radiusMeters: number) => void;
  radiusMeters: number;
};
```

Visual:

- Absolute bottom card like status card.
- Only slider UI appears in edit mode.
- Match reference:
  - top labels: `0 m` left, `500 m` right.
  - horizontal slider track.
  - blue active track/knob.
  - blue value bubble below thumb: `120 m`.
- Card height around `126-150`.
- Background `theme.colors.surface`.
- Border `theme.colors.chrome.cardBorder`.
- Rounded card matching design.

Slider implementation:

- Add dependency:
  ```bash
  pnpm --filter @stepwhere/mobile exec expo install @expo/ui
  ```
- Import:
  ```ts
  import Slider from '@expo/ui/community/slider';
  ```
- Use:
  ```tsx
  <Slider
    minimumValue={0}
    maximumValue={500}
    step={10}
    value={radiusMeters}
    onValueChange={onRadiusChange}
    minimumTrackTintColor="#2563EB"
  />
  ```
- Since Expo UI Slider has platform visual limitations, especially around thumb tint on iOS, layer custom labels/value bubble around it to preserve the design intent.
- If exact native thumb/track styling is insufficient during implementation, do not switch packages in this pass; keep Expo UI Slider and document the visual limitation for the next polish pass.

### `SafetyFab` State Update

Update:

```txt
apps/mobile/src/components/home/safety-fab.tsx
```

New props:

```ts
type SafetyFabState = 'unset' | 'editing' | 'enabled' | 'disabled';

type SafetyFabProps = {
  bottomOffset: number;
  chromeHidden?: boolean;
  onPress?: () => void;
  state: SafetyFabState;
};
```

State designs:

`enabled`:

- Outer ring: green-tinted.
- Inner button: green circular art, preferably textured/radial if feasible with static styles.
- Icon: current geofence icon or shield icon in white.

`disabled`:

- Outer ring: neutral/gray.
- Inner button: gray.
- Icon: disabled shield/geofence style in white.

`editing`:

- Outer ring: blue-tinted.
- Inner button: blue `#2563EB`.
- Icon: save/floppy in white.
- Accessibility label: `Save geofence`.

`unset`:

- Outer ring: purple-tinted.
- Inner button: purple.
- Icon: current geofence icon or question mark in white.
- Accessibility label: `Set geofence`.

AppIcon changes:

Extend `apps/mobile/src/components/ui/app-icon.tsx` with names needed by this feature:

```ts
| 'pencil'
| 'save'
| 'help'
| 'shield-off'
| 'shield-check'
```

Suggested MaterialCommunity mappings:

```ts
pencil: 'pencil-outline'
save: 'content-save'
help: 'help'
'shield-off': 'shield-off-outline'
'shield-check': 'shield-check-outline'
```

## Home Screen Integration

### Replace Bottom Card

In `home.tsx`, replace `ChildSummaryCard` usage with conditional geofence card/editor:

```tsx
{showHomeBottomChrome ? (
  selectedGeofence.status === 'editing' ? (
    <GeofenceRadiusEditorCard
      bottomOffset={summaryBottomOffset}
      chromeHidden={secondaryTopChromeHidden}
      onLayout={handleSummaryLayout}
      onRadiusChange={handleGeofenceRadiusChange}
      radiusMeters={selectedGeofence.radiusMeters}
    />
  ) : (
    <GeofenceStatusCard
      bottomOffset={summaryBottomOffset}
      childName={selectedChild.name}
      chromeHidden={secondaryTopChromeHidden}
      onActionPress={handleGeofenceStatusActionPress}
      onLayout={handleSummaryLayout}
      radiusMeters={selectedGeofence.savedRadiusMeters}
      status={selectedGeofence.status}
    />
  )
) : null}
```

Keep the existing `summaryHeight` measurement path so offsets still work.

### Wire Floating Button

Pass state into map:

```tsx
<PastelMap
  geofenceButtonState={selectedGeofence.status}
  geofenceRadiusMeters={selectedGeofence.savedRadiusMeters}
  geofenceVisible={selectedGeofence.status === 'enabled' || selectedGeofence.status === 'editing'}
  onSafetyPress={handleGeofenceActionPress}
/>
```

In edit mode, show the draft radius ring:

```ts
const visibleRadius = selectedGeofence.status === 'editing'
  ? selectedGeofence.radiusMeters
  : selectedGeofence.savedRadiusMeters;
```

Use `visibleRadius` for map rings.

### Map Safe Zone Visibility

Update native map:

```tsx
{geofenceVisible && geofenceRadiusMeters != null ? (
  <SafeZoneRings
    latitude={selectedChild.latitude}
    longitude={selectedChild.longitude}
    radiusMeters={geofenceRadiusMeters}
    visible
  />
) : null}
```

For `editing`, pass `radiusMeters` draft so the map updates as the slider moves.

For web fallback, scale the decorative ring dimensions proportionally:

```ts
const outerSize = interpolate radius 0..500 to 48..180
```

Recommended visual fallback:

- 0 m: small 48px circle.
- 500 m: 180px circle.
- inner/middle rings scale proportionally.

## Theme And Color Plan

Use existing app tokens for surfaces:

- Card background: `theme.colors.surface`.
- Border: `theme.colors.chrome.cardBorder`.
- Body text: `theme.colors.text`.
- Muted labels: `theme.colors.textSecondary`.

Feature accent constants can be local for now:

```ts
const geofenceAccent = {
  enabled: '#009944',
  disabled: '#FF6A00',
  unset: '#8B5CF6',
  editing: '#2563EB',
};
```

Dark mode adjustments:

- Keep the same accents.
- Use lower-opacity background fills:
  - enabled outer ring: `rgba(0, 153, 68, 0.18)`
  - disabled outer ring: `rgba(156, 163, 175, 0.18)`
  - unset outer ring: `rgba(139, 92, 246, 0.18)`
  - editing outer ring: `rgba(37, 99, 235, 0.18)`
- Keep icon foreground white.
- Status card remains `theme.colors.surface`.

## UI Copy

Use exact status copy:

Enabled:

```txt
Geofence is ON
You'll be notified if Aarav leaves the safe zone.
Edit
```

Disabled:

```txt
Geofence is OFF
You won't be notified if Aarav leaves the safe zone.
Edit
```

Unset:

```txt
No geofence set
Set a safe zone to get alerts when Aarav leaves that area.
Set Now
```

Radius pill:

```txt
120 m
```

Slider labels:

```txt
0 m
500 m
```

No km display in this UI pass because the reference is `0-500 m`. Keep all values in meters.

## Animation Behavior

Use Reanimated patterns already in the home screen.

Cards:

- Reuse `ChildSummaryCard` animation style:
  - opacity `220ms` out, `190ms` in.
  - translate down when chrome hidden.

Status/editor transition:

- Simple fade/translate between status card and slider card.
- Do not animate map ring radius aggressively; slider changes can update directly.

Floating button:

- Existing `SafetyFab` hide/show animation remains.
- State color/icon can switch instantly, or use `withTiming` on wrapper opacity if simple.
- Do not overanimate the button state in this first UI pass.

## Edge Cases

- Switching child while editing:
  - Show that selected child’s own state.
  - If the new child is unset, show unset state.
  - Do not persist draft radius across children.

- Radius set to `0 m`:
  - Allow it because design shows min `0 m`.
  - Save allowed.
  - Map ring at `0 m` can render as no visible ring or minimum visual ring; status still says `0 m`.

- Disabled geofence:
  - Status card shows saved radius.
  - Map ring should not render.
  - Floating button press re-enables with same saved radius.

- Unset geofence:
  - Status card shows no radius pill.
  - Map ring should not render.
  - Floating button and `Set Now` enter edit mode.

- Editing existing enabled/disabled geofence:
  - Slider starts at saved radius.
  - Pressing blue save button saves new radius and sets status to enabled.

## Dependency Change

Add:

```txt
@expo/ui
```

Recommended install command:

```bash
pnpm --filter @stepwhere/mobile exec expo install @expo/ui
```

Expected `apps/mobile/package.json` dependency addition:

```json
"@expo/ui": "<Expo-compatible version>"
```

The exact version should be chosen by Expo install.

## Files Expected To Change

```txt
apps/mobile/package.json
pnpm-lock.yaml
apps/mobile/src/app/(app)/home.tsx
apps/mobile/src/components/home/safety-fab.tsx
apps/mobile/src/components/home/pastel-map.tsx
apps/mobile/src/components/home/pastel-map.native.tsx
apps/mobile/src/components/home/safe-zone-rings.tsx
apps/mobile/src/components/home/safe-zone-rings.native.tsx
apps/mobile/src/components/ui/app-icon.tsx
```

New files:

```txt
apps/mobile/src/components/home/geofence-status-card.tsx
apps/mobile/src/components/home/geofence-radius-editor-card.tsx
```

Optional new file if implementation wants cleaner state helpers:

```txt
apps/mobile/src/components/home/geofence-state.ts
```

## Testing And Verification

Run after implementation:

```bash
pnpm --filter @stepwhere/mobile lint
pnpm --filter @stepwhere/mobile exec tsc --noEmit
```

Manual scenarios:

1. Initial home state for Aarav:
   - Bottom card says `No geofence set`.
   - No map safe-zone ring is shown.
   - Floating button shows setup/unset state.

2. Tap floating button in unset state:
   - Bottom card becomes slider only.
   - Floating button becomes blue save.
   - Slider shows `0 m`, `500 m`, and value bubble around `120 m`.

3. Move slider:
   - Value bubble updates in 10m increments.
   - Map ring updates while editing.

4. Tap blue save button:
   - Status becomes `Geofence is ON`.
   - Radius pill shows selected radius.
   - Map ring remains visible.
   - Floating button becomes enabled/green state.

5. Tap enabled floating button:
   - Status becomes `Geofence is OFF`.
   - Radius pill remains.
   - Map ring disappears.
   - Floating button becomes disabled state.

6. Tap disabled floating button:
   - Status becomes `Geofence is ON`.
   - Same saved radius returns.
   - Map ring reappears.

7. Tap `Edit` from enabled/off:
   - Bottom UI changes to slider only.
   - Slider starts at saved radius.
   - Floating button becomes blue save.

8. Switch between children:
   - Each child has independent geofence UI state.
   - A child with no setup shows unset even if another child has enabled geofence.

9. Dark mode:
   - Status card surface, text, accents, and floating button states are legible.
   - Slider card remains readable.
   - Bottom nav spacing and card position remain correct.

10. Map interaction:
   - Geofence card/editor and floating button hide consistently with existing chrome-hide behavior.
   - No bottom card overlaps the nav.

## Assumptions And Defaults

- This pass is UI-only with local state in `home.tsx`.
- Geofence state is per selected child.
- Default radius is `120 m`.
- Radius range is `0-500 m`, step `10 m`.
- Edit mode shows slider only above the bottom nav.
- Saving always enables the geofence.
- Disabled geofence keeps saved radius but hides the map ring.
- Backend persistence, geofence APIs, notification wiring, and permission flows are out of scope.
- Expo UI Slider is the selected slider implementation, and any native styling limitation is acceptable for this pass unless it visibly blocks matching the design.
