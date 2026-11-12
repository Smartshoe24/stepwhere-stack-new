import { StyleSheet } from 'react-native-unistyles';

import { breakpoints, darkTheme, lightTheme } from './src/theme/tokens';

declare module 'react-native-unistyles' {
  export interface UnistylesThemes {
    light: typeof lightTheme;
    dark: typeof darkTheme;
  }

  export interface UnistylesBreakpoints {
    phone: 0;
    plus: 390;
    tablet: 768;
  }
}

StyleSheet.configure({
  settings: {
    adaptiveThemes: true,
  },
  breakpoints,
  themes: {
    light: lightTheme,
    dark: darkTheme,
  },
});
