import type { UserProfileDto } from '@stepwhere/types';

import { verifyGoogleEmail } from '@/lib/api-client';

import { getGoogleIdToken } from './google-sign-in-client';

export async function connectGoogleEmail(): Promise<UserProfileDto> {
  const idToken = await getGoogleIdToken();
  return verifyGoogleEmail({ idToken }, { operationName: 'verifyGoogleEmail' });
}
