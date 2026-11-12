import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useKeyboardVisibility() {
  const [keyboardState, setKeyboardState] = useState({
    height: 0,
    visible: false,
  });

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, event => {
      setKeyboardState({
        height: event.endCoordinates?.height ?? 0,
        visible: true,
      });
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardState({
        height: 0,
        visible: false,
      });
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return keyboardState;
}
