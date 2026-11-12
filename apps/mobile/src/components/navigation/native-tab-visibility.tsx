import React from 'react';

type NativeTabVisibilityContextValue = {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
};

const NativeTabVisibilityContext = React.createContext<NativeTabVisibilityContextValue | null>(null);

export function NativeTabVisibilityProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = React.useState(false);

  const value = React.useMemo(() => ({
    hidden,
    setHidden,
  }), [hidden]);

  return (
    <NativeTabVisibilityContext.Provider value={value}>
      {children}
    </NativeTabVisibilityContext.Provider>
  );
}

export function useNativeTabVisibility() {
  const value = React.useContext(NativeTabVisibilityContext);

  if (!value) {
    throw new Error('useNativeTabVisibility must be used within NativeTabVisibilityProvider.');
  }

  return value;
}
