import type { ImageSourcePropType } from 'react-native';

export type NativeTabIconName =
  | 'home'
  | 'activity'
  | 'logs'
  | 'profile';

const startedAt = Date.now();

export const nativeTabIconSources: Record<NativeTabIconName, ImageSourcePropType> = {
  home: require('../../../assets/images/tabIcons/native-home.png') as ImageSourcePropType,
  activity: require('../../../assets/images/tabIcons/native-activity.png') as ImageSourcePropType,
  logs: require('../../../assets/images/tabIcons/native-logs.png') as ImageSourcePropType,
  profile: require('../../../assets/images/tabIcons/native-profile.png') as ImageSourcePropType,
};

if (__DEV__) {
  console.info('[tabs] icon sources ready', {
    durationMs: Date.now() - startedAt,
  });
}
