# Stepwhere — Interface Design System

Working record of settled design decisions. Read this before touching UI; hold to
these values so the app converges instead of drifting per-feature.

## Direction

**Who:** a parent on their phone, usually in the evening or during a moment of
worry. Two questions: "where was my child today?" and "why is there no data for
that stretch?"

**Feel:** *a legible record.* Calm, chronological, trustworthy. Not a dashboard,
not a feed. Structure carries the weight; color communicates status only.

**Domain vocabulary:** stay, trip, gap, coverage, place, geofence, rail, day.

**Signature (History):** the 24-hour coverage bar. One 10px segmented bar laid
out against real elapsed time, colored by kind, with explicit `untracked` runs.
It answers "shape of the day" and "was the tracker even on?" before any
scrolling, and doubles as a scrubber. Nothing else in the app has it — that is
the point.

## Foundations

- **Styling:** Unistyles v3. `StyleSheet.create(theme => ({...}))`; dynamic
  styles are functions returning objects.
- **Spacing base:** 4px. Use `theme.spacing[1..7]` only — never a raw number.
- **Screen gutter:** `spacing[5]` (20) horizontal on all page content.
- **Depth strategy:** **1px border + `shadows.card`** on surfaces. Committed —
  do not mix in shadow-only or tint-only elevation.
  - `shadows.card` for in-page cards, `shadows.floating` for modals/overlays,
    `shadows.sheet` for anything anchored to the bottom edge, `shadows.marker`
    for map pins.
  - Never put `borderWidth` on all four sides of an element pinned to the screen
    edges; use the single relevant side.
- **Radius scale:** `pill 8` chips/badges · `cardSmall 12` rows and icon chips ·
  `button 16` buttons and controls · `card 20` cards and modal tops ·
  `sheet 24` · `circle 999`.
- **Surfaces:** one hue, lightness only. `background` → `surface` →
  `surfaceMuted`. Sheets and cards use opaque `surface`; never a translucent
  `rgba()` surface unless a real blur renders behind it.

## Typography

`theme.typography.text.*` is the canonical scale. **Use it instead of hardcoded
`fontSize`.** Piloted in `features/history`; migrate other features onto it.

| Token | px / lh | Use |
|---|---|---|
| `overline` | 10/12 +0.7ls | uppercase stat labels, section headers, badges |
| `caption` | 11/15 | sub-labels, attribution |
| `meta` | 12/16 | secondary meta, times, transition rows |
| `body` | 13/18 | body copy, trailing metrics, buttons |
| `bodyLarge` | 15/20 | card titles, control labels |
| `titleSmall` | 18/24 | modal titles |
| `title` | 22/28 | — |
| `display` | 30/34 −0.3ls | screen title |
| `metric` | 20/24 −0.2ls | hero stat values |

- `family.display` for titles and metric values; `family.body` for everything else.
- `weight` and `family` are always tokens, never literals.
- **Every glyph that renders a number gets `...theme.typography.tabular`.**
- Hierarchy comes from size **+ weight + color** together. Three tiers:
  value `semibold/text`, label `medium/textSecondary`, meta `regular/textMuted`.

## Patterns

**Screen shell** (home / activity / history are identical):
`SafeAreaView edges={[]}` → `BlurTargetView` → spacer sized
`topBarHeight + carouselHeight` → content. Top bar overlay `top:0 zIndex 54`,
carousel overlay `top: topBarHeight zIndex 52`, both `pointerEvents="box-none"`
with `onLayout` feeding measured heights back. Defaults: top bar 68, carousel 64.

**Screen title** — `marginTop spacing[4]`, `marginHorizontal spacing[5]`,
`text.display` bold, `family.display`.

**Card** — `marginTop spacing[4]` · `marginHorizontal spacing[5]` ·
`radius.card` · `borderWidth 1 / chrome.cardBorder` · `surface` ·
`...shadows.card`. Padding `spacing[4]` dense, `spacing[6]` for empty states.

**Date stepper** — `IconButton chevron-left` + pressable card
(`minHeight 52`, `radius.button`, border + `shadows.card`) + `IconButton
chevron-right`, `gap spacing[3]`. Shared by Activity and History. A "jump to
today" text button renders only when it would do something.

**Modal sheet** — `Modal animationType="slide" presentationStyle="overFullScreen"
transparent` → `SafeAreaView edges={['bottom']}` `justifyContent:'flex-end'` →
scrim `absoluteFillObject` + `shadowStrong` @ `opacity 0.32` → sheet
`width '100%'` `maxWidth 560` `alignSelf center`, top corners `radius.card`,
`borderWidth 1`, `surface`, `paddingHorizontal/Top spacing[5]`,
`paddingBottom bottomInset + spacing[4]`, `gap spacing[4]`, `shadows.floating`.
Header = title `family.display` 20 bold + subtitle `text.body` + 36×36 circular
close on `surfaceMuted` with `AppIcon close 18`. Body keyed on state so it
remounts. **Android gets the platform dialog, not this sheet.**

**Timeline row (History)** — hybrid rail + card. Time gutter 56, rail 28.
Stays are cards (`radius.cardSmall`, 36px icon chip tinted at ~12%, numbered
badge cross-referencing the map pin). Trips and gaps are ~60% weight: no card,
one inline meta line against the rail. Gap rails are stacked 3px dots, not
`borderStyle: 'dashed'` (Android renders single-side dashes inconsistently).
One right-aligned trailing metric per row, `text.body` semibold tabular.

**States** — loading is `ShoeLoader size={64}` centered (app convention; no
skeletons). Error is an `alertBackground` inline banner plus a **neutral
outlined** action — never a solid `navActive` fill, that token belongs to nav.
Empty states are a card with a 44px `surfaceMuted` icon tile, title, body, and an
optional action that goes somewhere real.

**Status** — use `StatusPill` / `StatusDot`, or the `theme.status[*]`
background/text pair. Never bare colored text.

**Selection** — one accent per feature. History selection is amber
(`colors.history.selected`) everywhere: list, map, coverage bar. Selecting must
never unmount the list.

## Motion

- Durations under 300ms for UI. Spring `{ damping: 24, stiffness: 220 }`.
- Chrome hide 220ms / show 190ms, `withTiming` on opacity + translateY.
- Only `transform` and `opacity` for ordinary React Native views. Canvas drawing
  properties may animate on the UI thread when they do not trigger layout or a
  native map-overlay rebuild.
- One live cue: a 1600ms breathing dot for ongoing events. No decorative motion.

## Color on fills — the rule that was being broken

Never put a hardcoded `#FFFFFF` on a saturated accent. Dark-mode accents are
*lighter* than their light-mode counterparts, so white-on-accent inverts exactly
backwards; every geofence state measured below AA in both themes (`enabled` was
**1.74:1**). Use paired tokens instead:

- **Tinted chip** — `pillSurface` + `pillText`. Default choice for status chips,
  badges, and radius pills. All pairs verified >= 6.3:1.
- **Saturated fill** — `fill` + `onFill`. For the FAB and active segments only.
  `fill` is deliberately darker than the plain accent so `onFill` clears 4.5:1.

`components/home/geofence-presentation.ts` is the single accessor. Do not read
`colors.geofence.enabled` etc. directly for text or icons — those remain only for
map geometry and halos.

Related: **state is signalled by a dot or icon, not by tinting the title.** Colored
13px title text was simultaneously the shoutiest and lowest-contrast element on
the geofence card. Titles are `colors.text`; a `StatusDot` carries the state.

## Performance rules for map + gesture surfaces

Learned from the geofence slider, which re-rendered a 3,000-line component at
touch frequency and crashed low-end Android in kilometre mode.

- **Native sliders emit `onValueChange` per pointer-move frame (~60-120Hz), not
  per step, and do not dedupe.** Never wire one straight into React state. Keep
  the drag in a ref, equality-dedupe the snapped value, and commit from the
  platform's real completion event (`useGeofenceRadiusDrag`). Android uses
  `onValueChangeFinished`; iOS uses `onEditingChanged(false)`.
- **Always equality-guard state updaters** driven by continuous input: return the
  same object and React skips the commit entirely.
- **`React.memo` on a map component is worthless if any prop is a fresh identity.**
  Inline `{ latitude, longitude }` literals, `?? []` fallbacks, and plain
  `function` declarations passed as props all defeat it. Use module-level `EMPTY`
  constants, primitive props instead of objects, and `useStableCallback`
  (`lib/use-stable-callback.ts`) for handlers crossing into memoized subtrees.
- **Never animate a native map overlay per frame.** During a radius drag, keep the
  last committed circle geometrically fixed and dim it to 40% alpha. The badge
  may update once per snapped step. On release, a bounded 280ms Skia overlay may
  animate from the previous radius to the committed radius; the native map
  circle swaps to its final geometry only after that transition completes.
- **`transform` and `opacity` means exactly those two.** Animating `width`,
  `height`, `left`, `top`, or `borderRadius` from a worklet is not a cheap
  shortcut — it drives Reanimated through the *layout* commit path every frame
  (shadow-tree diff + Yoga pass, plus a fresh rounded-rect mask for
  `borderRadius`). The geofence ring did this and was fine at 300px and unusable
  at 4000px: identical per-frame work, ~160x the area. That is what "smooth in
  metres, stutters in kilometres" actually was.
- **Do not maintain a second live radius drawing above the map during drag.** It
  adds another renderer and still needs pointer-frequency values. A release-only
  Skia transition is allowed because it is bounded, receives one `{from, to}`
  transaction, and never reads the slider's live value.
- **Never call `fitToCoordinates` mid-gesture or on a unit toggle.** At 10km it
  spans ~20km and forces a multi-zoom-level tile refetch. Fit once after a changed
  radius is committed on release. It may run concurrently with the bounded
  release transition, whose Skia geometry follows shared camera-region values.
- **Cap unbounded overlay counts.** Trail dots are hard-limited to
  `MAX_TRAIL_DOTS = 120`; spacing widens on long trails rather than the count
  growing (a 20km trail was emitting ~500 native circles).
- **No per-render `console.*`.** A dev-only log inside a hot `useMemo` is a bridge
  round-trip per frame and will dominate any profile.
- **Every function a worklet captures must itself be a worklet.** Declaring a
  helper in the same file does **not** make it safe — the Babel plugin captures
  same-module functions into `__closure` exactly like imports, and inlines
  neither. A captured plain function compiles fine and throws only when the
  animation runs: `[Worklets] Tried to synchronously call a non-worklet function
  X on the UI thread`. Verified against react-native-worklets 0.8.3:

  ```
  function plainLocal(v) { return v * 2; }            // captured, no hash → THROWS
  function workletLocal(v) { 'worklet'; return v * 3 } // captured, has hash → fine
  ```

  In order of preference: use Reanimated's own helper (`clamp`, `interpolate`,
  `withTiming`), add a `'worklet'` directive, inline the arithmetic, or move the
  work to `runOnJS`/render. Keep worklet bodies to shared-value reads and
  arithmetic; do string and object formatting on the JS side.

  Enforced by `pnpm check:worklets`, which compiles each file with the real Babel
  plugin and inspects the emitted `__closure` rather than pattern-matching source.
  That matters: the first version of that script encoded the "imports are unsafe,
  locals are inlined" rule, reported a clean tree, and missed a captured local
  `clamp` that was crashing on device.

## Accessibility

- Every interactive element: `accessibilityRole`, `accessibilityLabel`, and
  `accessibilityState` for selected/disabled.
- Minimum 44×44 hit area. Small visuals (a 10px bar) get padding + negative
  margin, not a bigger visual.
- No state reachable only by gesture. If a pan changes state, a press must too.
- Pressed `button.pressedOpacity` and disabled `0.45` are distinct — never share
  one opacity for both.

## History module map

| File | Responsibility |
|---|---|
| `history-screen.tsx` | page composition, date and selection state |
| `history-view-state.ts` | discriminated `HistoryViewState` (no string flags) |
| `history-day-summary.ts` | pure metrics + coverage segments |
| `history-day-summary-card.tsx` | coverage bar + three stats |
| `history-date-control.tsx` | stepper matching Activity |
| `history-date-sheet.tsx` | picker on the shared modal recipe |
| `history-timeline.tsx` | inline list in the page scroll |
| `history-event-row.tsx` | hybrid rail + card rows |
| `history-event-visuals.ts` | **single source** of event color/icon/number |
| `history-map-card.tsx` | 190px non-interactive preview |
| `history-map-modal.tsx` | fullscreen map + peek + event stepper |
| `history-states.tsx` | loading / error / empty |
| `history-formatters.ts` | all user-facing copy and number formatting |

## Rules that exist because they were broken

- No feature-local color forks. `getHistoryEventColor` exists because the map and
  list once rendered the same trip in different colors.
- No raw enum in UI copy. `formatGapReason` exists because `reason.replaceAll`
  shipped "moved while sleeping" to users.
- No duplicated derived layout math across a parent and child component.
- No hardcoded `fontSize` in new code. Use `typography.text`.
- Legal/attribution text belongs on the artifact it describes, at `overline`
  muted — not in the content hierarchy.

## Public live-share viewer

**Who:** a trusted recipient opening a private child-location link, usually on a
phone. The screen must answer whether the location is current, when the last fix
arrived, and when access ends before it asks the person to interpret the map.

**Direction:** map-first and calm. The map is full viewport; a compact trust
panel is anchored to the bottom on phones and moves to the upper left on larger
screens. Avoid dashboard grids and marketing hero treatments.

**Signature:** the trust rail combines live/delayed/last-known state, last fix,
and remaining access time in one surface. Its breathing green dot is the only
continuous motion and is disabled for reduced motion.

**Web tokens:** 4px spacing base; map parchment `#EDF2EC`, route green
`#167A46`, satellite blue `#356C99`, caution amber `#A86516`, ink `#17211B`,
paper `#FFFFFF`. Depth is a 1px low-opacity border plus a three-layer soft
shadow. Cards use 20px radius, inner trust surfaces 14px, and controls 14px or
pill radius.

## Admin console — Night Trail

**Who:** a Stepwhere operator at a desk, scanning a fleet of shoes for the ones
that stopped reporting, breached a geofence, or need provisioning.

**Direction:** dark-only operations console. Dense (13px base, 32px controls,
36px rows), quiet chrome, brand used sparingly. Reference:
`apps/admin/design/design-system.html`. Tokens live in
`apps/admin/src/styles/theme.css`; shadcn variable names are kept and pointed at
Night Trail values, so new shadcn primitives inherit the theme.

**Colour roles — "peach speaks, pink switches":**
- Peach `--act #F4C87D` (the mobile dark accent) for anything with a word:
  links, sort arrows, filter values, selected-row text.
- Primary button is a 24% peach wash, peach hairline, white label (11.9:1).
  One primary per view.
- Pink `--toggle #FF66CB` only for wordless state: checkbox, switch, radio,
  tab underline, chart series 1.
- "You are here" = 7% peach tint + 1px trail edge (active nav, selected row).
- Status colours carry the same meanings as the mobile app: ok green,
  caution orange (not amber), breach red, info blue, unset violet. Always a dot
  plus a word (`StatusBadge`), never colour alone.

**Depth:** surfaces step canvas → raised → overlay by lightness; edges are
low-opacity white inset hairlines. Only overlays (menus, dialogs, toasts) get
`shadow-overlay`.

**Focus:** keyboard only. `focus-trail` = trail-gradient hairline (0.5px on
retina) + soft pink/peach glow. Inputs and the checkbox use `focus-hair` or the
equivalent solid peach hairline because their `::after` is taken.

**Radius:** 4 xs · 6 controls · 8 cards · 12 dialogs · pill for badges.

**Type:** Geist + Geist Mono, self-hosted via `@fontsource-variable`. Hardware
IDs, coordinates and record IDs are mono. `label-caps` for 11px uppercase
labels. Every number is `tabular-nums`.

**Motion:** 120–200ms ease-out. The Live dot's breathe is the only loop.

**Shared kit** (`src/components/patterns/`): `PageHeader`, `StatStrip`/`Stat`,
`Panel`, `KeyValueList`/`KeyValue`, `FormField`, `LabeledInput`, `MetricRow`,
`EventTable`, `LiveBadge`/`FreshnessIndicator`, `EmptyState`/`ErrorState`,
`chart-theme`. Data tables render through `DataTableView`. Build new pages from
these; don't re-declare local `Field`/`SummaryBox` helpers.

**Maps:** Google Maps JS API (`VITE_GOOGLE_MAPS_API_KEY`) with the Night Trail
map style, trail path stepped peach → pink, geofence ring in ok/breach, HTML pin
with a trail ring. Without a key the panel shows coordinates.
