import { UnistylesRuntime } from 'react-native-unistyles';

export function getRuntimeThemeName(): 'light' | 'dark' {
  return UnistylesRuntime.themeName === 'dark' ? 'dark' : 'light';
}

export function switchRuntimeTheme(targetTheme: 'light' | 'dark') {
  try {
    if (UnistylesRuntime.hasAdaptiveThemes) {
      UnistylesRuntime.setAdaptiveThemes(false);
    }

    UnistylesRuntime.setTheme(targetTheme);
  } catch (error) {
    if (__DEV__) {
      console.warn('Theme switch failed', error);
    }
  }
}
