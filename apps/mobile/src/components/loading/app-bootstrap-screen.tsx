import { useWindowDimensions, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ShoeLoader } from '@/components/loading/shoe-loader';

export function AppBootstrapScreen() {
  const { width } = useWindowDimensions();
  const { theme } = useUnistyles();
  const loaderSize = Math.min(92, width * 0.22);

  return (
    <View style={styles.container(theme.colors.background)}>
      <ShoeLoader size={loaderSize} />
    </View>
  );
}

const styles = StyleSheet.create(() => ({
  container: (backgroundColor: string) => ({
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor,
  }),
}));
