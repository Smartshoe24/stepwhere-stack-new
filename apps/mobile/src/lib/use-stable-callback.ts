import React from 'react';

/**
 * Returns a callback whose identity never changes but which always invokes the
 * latest render's implementation.
 *
 * Use this for handlers passed into `React.memo`'d subtrees where hand-auditing
 * `useCallback` dependencies is impractical. `HomeScreen` passed 11 plain
 * function declarations into `PastelMap`, which defeated its `React.memo`
 * entirely and forced the whole `MapView` child array to reconcile on every
 * render — including during slider drags.
 *
 * Do not use this to skip dependency arrays in `useEffect`; it is specifically
 * for event handlers, which are only ever called after render has committed.
 */
export function useStableCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
): (...args: Args) => Result {
  const callbackRef = React.useRef(callback);

  React.useEffect(() => {
    callbackRef.current = callback;
  });

  return React.useCallback((...args: Args) => callbackRef.current(...args), []);
}
