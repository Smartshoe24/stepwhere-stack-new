import {
  GoogleOneTapSignIn,
  isCancelledResponse,
  isErrorWithCode,
  isNoSavedCredentialFoundResponse,
  isSuccessResponse,
  statusCodes,
} from 'react-native-nitro-google-signin';
import { Platform } from 'react-native';

let configured = false;
const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();

function logGoogleSignInDebug(label: string, data: Record<string, unknown> = {}) {
  if (__DEV__) {
    console.info('[google-sign-in]', label, data);
  }
}

function configureGoogleSignIn() {
  if (configured) {
    return;
  }

  if (Platform.OS === 'ios' && !googleWebClientId) {
    throw new Error(
      'Google sign-in is not configured. Rebuild the app with EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.',
    );
  }

  GoogleOneTapSignIn.configure({
    webClientId: googleWebClientId || 'autoDetect',
    offlineAccess: false,
    scopes: null,
    autoSelectOnSignIn: false,
  });
  configured = true;
}

function toGoogleSignInError(error: unknown) {
  if (!isErrorWithCode(error)) {
    return new Error('Google sign-in was not completed. Try again.');
  }

  switch (error.code) {
    case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
      return new Error('Google Play services is unavailable or needs an update.');
    case statusCodes.SIGN_IN_CANCELLED:
      return new Error('Google sign-in was closed before completion.');
    case statusCodes.IN_PROGRESS:
      return new Error('Google sign-in is already in progress.');
    default:
      return new Error('Google sign-in was not completed. Try again.');
  }
}

export async function getGoogleIdToken() {
  configureGoogleSignIn();

  try {
    logGoogleSignInDebug('start');
    await GoogleOneTapSignIn.checkPlayServices();

    let response = await GoogleOneTapSignIn.presentExplicitSignIn();
    logGoogleSignInDebug('presentExplicitSignIn response', { type: response.type });

    if (isNoSavedCredentialFoundResponse(response)) {
      response = await GoogleOneTapSignIn.createAccount();
      logGoogleSignInDebug('createAccount fallback response', { type: response.type });
    }

    if (isCancelledResponse(response)) {
      throw new Error('Google sign-in was closed before completion.');
    }

    if (!isSuccessResponse(response)) {
      throw new Error('Google sign-in was not completed. Try again.');
    }

    if (!response.data.idToken) {
      throw new Error('Google did not return an ID token. Rebuild the app with the updated Google config.');
    }

    return response.data.idToken;
  } catch (error) {
    if (isErrorWithCode(error)) {
      logGoogleSignInDebug('native error', {
        code: error.code,
        message: error.message,
        userInfo: error.userInfo ?? null,
      });
    }

    if (error instanceof Error && !isErrorWithCode(error)) {
      logGoogleSignInDebug('error', { message: error.message });
      throw error;
    }

    throw toGoogleSignInError(error);
  }
}
