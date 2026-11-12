import React from "react";

type OnboardingScrollContextValue = {
  revealFocusedField: () => void;
};

export const OnboardingScrollContext = React.createContext<OnboardingScrollContextValue>({
  revealFocusedField: () => undefined,
});

export function useOnboardingScroll() {
  return React.useContext(OnboardingScrollContext);
}
