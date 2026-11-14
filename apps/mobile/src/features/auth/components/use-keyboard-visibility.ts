import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

// Moving from the phone step to the OTP step unmounts the focused phone input,
// which dismisses the keyboard, and the OTP input then re-opens it a moment
// later. Reporting that hide immediately makes the layout collapse and expand
// again, which looks like a blink. Delaying the "hidden" state lets a quick
// re-show cancel it, so the layout stays steady across the step change.
const HIDE_DEBOUNCE_MS = 300;

export function useKeyboardVisibility() {
  const [keyboardState, setKeyboardState] = useState({
    height: 0,
    visible: false,
  });

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    function cancelPendingHide() {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    }

    const showSubscription = Keyboard.addListener(showEvent, event => {
      cancelPendingHide();
      const height = event.endCoordinates?.height ?? 0;

      setKeyboardState(current =>
        current.visible && current.height === height
          ? current
          : { height, visible: true },
      );
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      cancelPendingHide();
      hideTimer = setTimeout(() => {
        hideTimer = null;
        setKeyboardState({ height: 0, visible: false });
      }, HIDE_DEBOUNCE_MS);
    });

    return () => {
      cancelPendingHide();
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return keyboardState;
}
