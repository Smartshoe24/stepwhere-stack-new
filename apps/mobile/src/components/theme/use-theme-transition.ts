import { useThemeTransitionContext } from '@/components/theme/theme-transition-provider';

export function useThemeTransition() {
  return useThemeTransitionContext();
}
