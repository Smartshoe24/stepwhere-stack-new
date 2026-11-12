import React from 'react';
import { useUnistyles } from 'react-native-unistyles';

import { StepwhereLogoMark } from '@/components/brand/stepwhere-logo-mark';

type StepwhereLogoProps = {
  height?: number;
};

export function StepwhereLogo({ height = 22 }: StepwhereLogoProps) {
  const { theme } = useUnistyles();

  return (
    <StepwhereLogoMark
      colors={theme.colors.brandLogo}
      height={height}
    />
  );
}

export type { StepwhereLogoProps };
