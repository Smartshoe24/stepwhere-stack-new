import { Platform } from 'react-native';

// Typography
const displayFamily = Platform.select({
  ios: 'Avenir Next',
  android: 'sans-serif-medium',
  default: 'sans-serif',
});

const bodyFamily = Platform.select({
  ios: 'Avenir Next',
  android: 'sans-serif',
  default: 'sans-serif',
});

const typography = {
  family: {
    display: displayFamily,
    body: bodyFamily,
    mono: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
  },
  size: {
    title: 22,
    childName: 12,
    childStatus: 10,
    telemetryLabel: 10,
    telemetryValue: 11,
    summaryName: 16,
    summaryMeta: 11,
    navLabel: 11,
    body: 14,
  },
  // Canonical text scale. Piloted in features/history; migrate other
  // features onto this instead of hardcoded fontSize numbers.
  text: {
    overline: { fontSize: 10, lineHeight: 12, letterSpacing: 0.7 },
    caption: { fontSize: 11, lineHeight: 15 },
    meta: { fontSize: 12, lineHeight: 16 },
    body: { fontSize: 13, lineHeight: 18 },
    bodyLarge: { fontSize: 15, lineHeight: 20 },
    titleSmall: { fontSize: 18, lineHeight: 24 },
    title: { fontSize: 22, lineHeight: 28 },
    display: { fontSize: 30, lineHeight: 34, letterSpacing: -0.3 },
    metric: { fontSize: 20, lineHeight: 24, letterSpacing: -0.2 },
  },
  // Applied to every glyph that renders a number so columns never jitter.
  tabular: {
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
} as const;

// Spacing
const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 32,
} as const;

// Radius
const radius = {
  pill: 8,
  card: 20,
  cardSmall: 12,
  circle: 999,
  button: 16,
  sheet: 24,
} as const;

// Shadows
const shadows = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  floating: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 6,
  },
  marker: {
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  nav: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 10,
  },
  // Upward-cast shadow for surfaces anchored to the bottom edge.
  sheet: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 12,
  },
} as const;

// Shared status colors
const status = {
  safe: {
    main: '#22C55E',
    border: '#16A34A',
    background: '#DCFCE7',
    text: '#15803D',
  },
  transit: {
    main: '#F59E0B',
    border: '#F97316',
    background: '#FEF3C7',
    text: '#D97706',
  },
  alert: {
    main: '#EF4444',
    border: '#DC2626',
    background: '#FEE2E2',
    text: '#DC2626',
  },
  offline: {
    main: '#9CA3AF',
    border: '#9CA3AF',
    background: '#F3F4F6',
    text: '#6B7280',
  },
} as const;

export const lightTheme = {
  colors: {
    // Layout surfaces
    background: '#F8F9FA',
    surface: '#FFFFFF',
    surfaceMuted: '#F3F4F6', // Secondary cards and muted panels
    map: '#EEF3EF',
    divider: '#E5E7EB',

    // Text and neutral UI
    text: '#111827',
    textSecondary: '#4B5563',
    textMuted: '#9CA3AF',
    textVeryMuted: '#D1D5DB',
    icon: '#6B7280',
    navInactive: '#6B7280',
    navActive: '#FF38BB',
    navIndicator: 'rgba(255, 56, 187, 0.13)',
    navRipple: 'rgba(255, 56, 187, 0)',
    movementTrail: {
      main: '#FF38BB',
    },
    history: {
      stay: '#22C55E',
      trip: '#3B82F6',
      gap: '#9CA3AF',
      selected: '#F59E0B',
      // Soft tints for icon chips and coverage-bar fills (~12% of the accent).
      staySoft: 'rgba(34, 197, 94, 0.12)',
      tripSoft: 'rgba(59, 130, 246, 0.12)',
      gapSoft: 'rgba(156, 163, 175, 0.16)',
      selectedSoft: 'rgba(245, 158, 11, 0.14)',
      rail: '#E5E7EB',
      node: '#FFFFFF',
      coverageTrack: '#EDEFF2',
      sheetSurface: '#FFFFFF',
      sheetHandle: '#D1D5DB',
      mapScrim: 'rgba(17, 24, 39, 0.12)',
    },
    loader: {
      shoeBaseStroke: 'rgba(17, 24, 39, 0.12)',
      shoeTrailStart: '#FF38BB',
      shoeTrailEnd: '#F5CF8E',
    },

    // Brand / logo
    primaryGreen: '#16A34A',
    brightGreen: '#22C55E',
    deepGreen: '#15803D',
    softGreen: '#DCFCE7',
    brandLogo: {
      step: '#231F20',
      whereGradientStart: '#F5CF8E',
      whereGradientEnd: '#FF66CB',
      emblemDark: '#231F20',
      emblemGradientStart: '#F5CF8D',
      emblemGradientEnd: '#E36FAB',
    },

    // Chrome surfaces
    safeZone: 'rgba(34, 197, 94, 0.12)', // Geofence and safety ambient fills
    mapHeader: 'rgba(248, 249, 250, 0.95)', // Header backing when content sits over the map
    geofence: {
      breached: '#DC2626',
      breachedCard: '#FEE2E2',
      breachedCardBorder: '#DC2626',
      breachedCardText: '#DC2626',
      breachedHalo: 'rgba(220, 38, 38, 0.18)',
      breachedRingFill: 'rgba(220, 38, 38, 0.12)',
      breachedRingStroke: 'rgba(220, 38, 38, 0.72)',
      disabled: '#FF6A00',
      disabledHalo: 'rgba(156, 163, 175, 0.22)',
      editing: '#2563EB',
      editingHalo: 'rgba(37, 99, 235, 0.18)',
      enabled: '#009944',
      enabledHalo: 'rgba(0, 153, 68, 0.18)',
      inactive: '#9CA3AF',
      ringFill: 'rgba(255, 56, 187, 0.13)',
      ringStroke: 'rgba(255, 56, 187, 0.72)',
      sliderTrack: '#D9E2FF',
      sliderTrackMuted: '#E5E7EB',
      unset: '#8B5CF6',
      unsetHalo: 'rgba(139, 92, 246, 0.18)',

      // Saturated fills (FAB, active segment). Darkened from the plain accents
      // above so `onFill` clears 4.5:1 — the plain accents do not.
      fill: {
        breached: '#DC2626',
        disabled: '#C2410C',
        editing: '#2563EB',
        enabled: '#047A38',
        inactive: '#6B7280',
        unset: '#7C3AED',
      },
      onFill: {
        breached: '#FFFFFF',
        disabled: '#FFFFFF',
        editing: '#FFFFFF',
        enabled: '#FFFFFF',
        inactive: '#FFFFFF',
        unset: '#FFFFFF',
      },
      // Tinted surface + accent text. Replaces white-on-saturated-accent, which
      // measured 1.74:1 in dark mode and failed in every state in both themes.
      pillSurface: {
        breached: '#FEE2E2',
        disabled: '#FFEDD5',
        editing: '#DBEAFE',
        enabled: '#DCFCE7',
        unset: '#EDE9FE',
      },
      pillText: {
        breached: '#991B1B',
        disabled: '#9A3412',
        editing: '#1E40AF',
        enabled: '#14532D',
        unset: '#5B21B6',
      },
    },
    chrome: {
      topBarSurface: '#FFFFFF',
      topBarBorder: '#E5E7EB',
      cardBorder: '#E5E7EB',
      navBorder: 'rgba(229, 231, 235, 0.7)',
      homeIndicator: '#111827',
    },

    // Buttons / interactive controls
    button: {
      surface: '#FFFFFF',
      border: '#E5E7EB',
      icon: '#4B5563',
      pressedOpacity: 0.82,
      highlight: 'transparent',
      highlightActive: 'rgba(37, 99, 235, 0.08)',
      iconActive: '#2563EB',
    },

    // Avatar fallback tones
    avatar: {
      parentGradientEnd: '#F4C87D',
      parentGradientStart: '#FF38BB',
      // The parent gradient uses the same two colors in both themes, so its ink
      // must NOT flip with the theme. Dark ink clears AA on both stops; white
      // fails the amber stop. Pairs with parentGradient* like onFill/fill.
      onParentGradient: '#231F20',
      text: '#111827',
      tones: {
        mint: '#B7F0D0',
        amber: '#F9D875',
        blue: '#A7D1FF',
        rose: '#F4B8D6',
      },
    },

    // Telemetry / health accents
    telemetry: {
      accent: '#16A34A',
      danger: '#DC2626',
      muted: '#9CA3AF',
      positive: '#16A34A',
      positiveText: '#15803D',
      sleep: '#2563EB',
      warning: '#D97706',
    },

    // Shared status surfaces
    transitMain: '#F59E0B',
    transitBorder: '#F97316',
    transitBackground: '#FEF3C7',
    transitText: '#D97706',
    alertMain: '#EF4444',
    alertBorder: '#DC2626',
    alertBackground: '#FEE2E2',
    alertText: '#DC2626',
    offlineMain: '#9CA3AF',
    offlineBorder: '#9CA3AF',
    offlineBackground: '#F3F4F6',
    offlineText: '#6B7280',

    badge: '#EF4444',
    badgeText: '#FFFFFF',
    shadow: 'rgba(0, 0, 0, 0.08)',
    shadowStrong: 'rgba(0, 0, 0, 0.15)',
    markerShadow: 'rgba(34, 197, 94, 0.25)',

    // Map / environmental accents
    haze: 'rgba(255, 255, 255, 0.3)', // Soft atmospheric overlay tint
    water: '#E0F2FE', // Decorative water blocks in map fallback
    park: '#DCFCE7', // Decorative park blocks in map fallback
  },
  status,
  spacing,
  radius,
  typography,
  shadows,
} as const;

export const darkTheme = {
  colors: {
    // Layout surfaces
    background: '#000000',
    surface: '#121212',
    surfaceMuted: '#1C1C1E', // Secondary cards and muted panels
    map: '#080808',
    divider: '#2C2C2E',

    // Text and neutral UI
    text: '#F9FAFB',
    textSecondary: '#A1A1A6',
    textMuted: '#636366',
    textVeryMuted: '#3A3A3C',
    icon: '#A1A1A6',
    navInactive: '#8E8E93',
    navActive: '#F4C87D',
    navIndicator: 'rgba(244, 200, 125, 0.16)',
    navRipple: 'rgba(244, 200, 125, 0)',
    movementTrail: {
      main: '#F4C87D',
    },
    history: {
      stay: '#4ADE80',
      trip: '#60A5FA',
      gap: '#8E8E93',
      selected: '#F4C87D',
      // Soft tints for icon chips and coverage-bar fills (~14% of the accent).
      staySoft: 'rgba(74, 222, 128, 0.14)',
      tripSoft: 'rgba(96, 165, 250, 0.14)',
      gapSoft: 'rgba(142, 142, 147, 0.18)',
      selectedSoft: 'rgba(244, 200, 125, 0.16)',
      rail: '#2C2C2E',
      node: '#121212',
      coverageTrack: '#1C1C1E',
      sheetSurface: '#121212',
      sheetHandle: '#636366',
      mapScrim: 'rgba(0, 0, 0, 0.18)',
    },
    loader: {
      shoeBaseStroke: 'rgba(249, 250, 251, 0.16)',
      shoeTrailStart: '#F4C87D',
      shoeTrailEnd: '#FF8DDB',
    },

    // Brand / logo
    primaryGreen: '#22C55E',
    brightGreen: '#4ADE80',
    deepGreen: '#15803D',
    softGreen: 'rgba(34, 197, 94, 0.15)',
    brandLogo: {
      step: '#F9FAFB',
      whereGradientStart: '#F7D9A4',
      whereGradientEnd: '#FF8DDB',
      emblemDark: '#F9FAFB',
      emblemGradientStart: '#F7D9A4',
      emblemGradientEnd: '#F08CC0',
    },

    // Chrome surfaces
    safeZone: 'rgba(74, 222, 128, 0.12)', // Geofence and safety ambient fills
    mapHeader: 'rgba(0, 0, 0, 0.85)', // Header backing when content sits over the map
    geofence: {
      breached: '#F87171',
      breachedCard: '#2A1518',
      breachedCardBorder: '#EF4444',
      breachedCardText: '#FECACA',
      breachedHalo: 'rgba(248, 113, 113, 0.18)',
      breachedRingFill: 'rgba(248, 113, 113, 0.14)',
      breachedRingStroke: 'rgba(248, 113, 113, 0.78)',
      disabled: '#FB923C',
      disabledHalo: 'rgba(156, 163, 175, 0.18)',
      editing: '#60A5FA',
      editingHalo: 'rgba(96, 165, 250, 0.18)',
      enabled: '#4ADE80',
      enabledHalo: 'rgba(74, 222, 128, 0.18)',
      inactive: '#9CA3AF',
      ringFill: 'rgba(244, 200, 125, 0.15)',
      ringStroke: 'rgba(244, 200, 125, 0.72)',
      sliderTrack: 'rgba(148, 163, 184, 0.26)',
      sliderTrackMuted: 'rgba(148, 163, 184, 0.18)',
      unset: '#A78BFA',
      unsetHalo: 'rgba(167, 139, 250, 0.18)',

      // Dark-mode accents are lighter than their light-mode counterparts, so a
      // saturated fill needs dark ink on top, not white.
      fill: {
        breached: '#F87171',
        disabled: '#FB923C',
        editing: '#60A5FA',
        enabled: '#4ADE80',
        inactive: '#9CA3AF',
        unset: '#A78BFA',
      },
      onFill: {
        breached: '#2A0E0E',
        disabled: '#2A1A0C',
        editing: '#0A1A2E',
        enabled: '#0B1F14',
        inactive: '#1F2937',
        unset: '#1E1836',
      },
      pillSurface: {
        breached: '#2A1518',
        disabled: '#2A1A0C',
        editing: '#12243D',
        enabled: '#10281B',
        unset: '#1E1836',
      },
      pillText: {
        breached: '#FECACA',
        disabled: '#FDBA74',
        editing: '#93C5FD',
        enabled: '#86EFAC',
        unset: '#C4B5FD',
      },
    },
    chrome: {
      topBarSurface: '#121212',
      topBarBorder: '#2C2C2E',
      cardBorder: '#3A3A3C',
      navBorder: '#2C2C2E',
      homeIndicator: '#A1A1A6',
    },

    // Buttons / interactive controls
    button: {
      surface: '#121212',
      border: '#3A3A3C',
      icon: '#A1A1A6',
      pressedOpacity: 0.78,
      highlight: 'transparent',
      highlightActive: 'rgba(244, 200, 125, 0.14)',
      iconActive: '#F4C87D',
    },

    // Avatar fallback tones
    avatar: {
      parentGradientEnd: '#FF38BB',
      parentGradientStart: '#F4C87D',
      // Same value as light mode on purpose — the gradient stops are identical
      // between themes, so the ink cannot flip. See the light-theme note.
      onParentGradient: '#231F20',
      text: '#F9FAFB',
      tones: {
        mint: '#1D4D35',
        amber: '#6A4B12',
        blue: '#1F4C7C',
        rose: '#6C2D4F',
      },
    },

    // Telemetry / health accents
    telemetry: {
      accent: '#4ADE80',
      danger: '#F87171',
      muted: '#9CA3AF',
      positive: '#4ADE80',
      positiveText: '#86EFAC',
      sleep: '#60A5FA',
      warning: '#FBBF24',
    },

    // Shared status surfaces
    transitMain: '#FBBF24',
    transitBorder: '#F59E0B',
    transitBackground: 'rgba(245, 158, 11, 0.15)',
    transitText: '#FDE68A',
    alertMain: '#F87171',
    alertBorder: '#EF4444',
    alertBackground: 'rgba(239, 68, 68, 0.15)',
    alertText: '#FECACA',
    offlineMain: '#9CA3AF',
    offlineBorder: '#6B7280',
    offlineBackground: 'rgba(156, 163, 175, 0.15)',
    offlineText: '#E5E7EB',

    badge: '#F87171',
    badgeText: '#FFFFFF',
    shadow: 'rgba(0, 0, 0, 0.8)',
    shadowStrong: 'rgba(0, 0, 0, 1)',
    markerShadow: 'rgba(74, 222, 128, 0.2)',

    // Map / environmental accents
    haze: 'rgba(0, 0, 0, 0.4)', // Soft atmospheric overlay tint
    water: '#091520', // Decorative water blocks in map fallback
    park: '#0A1A10', // Decorative park blocks in map fallback
  },
  status: {
    safe: {
      main: '#4ADE80',
      border: '#22C55E',
      background: 'rgba(34, 197, 94, 0.15)',
      text: '#86EFAC',
    },
    transit: {
      main: '#FBBF24',
      border: '#F59E0B',
      background: 'rgba(245, 158, 11, 0.15)',
      text: '#FDE68A',
    },
    alert: {
      main: '#F87171',
      border: '#EF4444',
      background: 'rgba(239, 68, 68, 0.15)',
      text: '#FECACA',
    },
    offline: {
      main: '#9CA3AF',
      border: '#6B7280',
      background: 'rgba(156, 163, 175, 0.15)',
      text: '#E5E7EB',
    },
  },
  spacing,
  radius,
  typography,
  shadows: {
    card: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.6,
      shadowRadius: 16,
      elevation: 6,
    },
    floating: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.8,
      shadowRadius: 20,
      elevation: 8,
    },
    marker: {
      shadowColor: '#4ADE80',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.25,
      shadowRadius: 20,
      elevation: 9,
    },
    nav: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.5,
      shadowRadius: 20,
      elevation: 12,
    },
    sheet: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: -6 },
      shadowOpacity: 0.7,
      shadowRadius: 24,
      elevation: 14,
    },
  },
} as const;

export const breakpoints = {
  phone: 0,
  plus: 390,
  tablet: 768,
} as const;
