import React, { createContext, useContext, useRef, useState } from 'react';

import { darkTheme, lightTheme } from '@/theme/tokens';
import { switchRuntimeTheme } from '@/components/theme/switch-runtime-theme';
import { themeTransitionController } from '@/components/theme/theme-transition-controller';

const THEME_TRANSITION_DURATION_MS = 850;
const THEME_TRANSITION_SETTLE_DELAY_MS_DEFAULT = 32;

type RunThemeTransitionArgs = {
  origin: {
    x: number;
    y: number;
  };
  settleDelayMs?: number;
  targetTheme: 'light' | 'dark';
};

type ThemeTransitionContextValue = {
  isTransitioning: boolean;
  runThemeTransition: (args: RunThemeTransitionArgs) => Promise<void>;
  transitionTargetTheme: 'light' | 'dark' | null;
};

const ThemeTransitionContext = createContext<ThemeTransitionContextValue | null>(null);

function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

function getOverlayColor(targetTheme: 'light' | 'dark') {
  return targetTheme === 'dark'
    ? darkTheme.colors.background
    : lightTheme.colors.background;
}

export function ThemeTransitionProvider({ children }: { children: React.ReactNode }) {
  const inFlightRef = useRef(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionTargetTheme, setTransitionTargetTheme] = useState<'light' | 'dark' | null>(null);

  async function runThemeTransition({
    origin,
    settleDelayMs = THEME_TRANSITION_SETTLE_DELAY_MS_DEFAULT,
    targetTheme,
  }: RunThemeTransitionArgs) {
    if (inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    setIsTransitioning(true);
    setTransitionTargetTheme(targetTheme);

    const overlayColor = getOverlayColor(targetTheme);

    try {
      if (!themeTransitionController.isAvailable) {
        switchRuntimeTheme(targetTheme);
        return;
      }

      await themeTransitionController.prepare({
        cx: origin.x,
        cy: origin.y,
        overlayColor,
      });

      switchRuntimeTheme(targetTheme);
      await delay(settleDelayMs);
      await themeTransitionController.commit({
        durationMs: THEME_TRANSITION_DURATION_MS,
      });
    } catch (error) {
      if (__DEV__) {
        console.warn('Theme transition failed', error);
      }

      try {
        await themeTransitionController.cancel();
      } catch (cancelError) {
        if (__DEV__) {
          console.warn('Theme transition cleanup failed', cancelError);
        }
      }

      switchRuntimeTheme(targetTheme);
    } finally {
      inFlightRef.current = false;
      setIsTransitioning(false);
      setTransitionTargetTheme(null);
    }
  }

  return (
    <ThemeTransitionContext.Provider value={{ isTransitioning, runThemeTransition, transitionTargetTheme }}>
      {children}
    </ThemeTransitionContext.Provider>
  );
}

export function useThemeTransitionContext() {
  const context = useContext(ThemeTransitionContext);

  if (!context) {
    throw new Error('useThemeTransition must be used within ThemeTransitionProvider');
  }

  return context;
}
