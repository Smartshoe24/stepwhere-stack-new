import type {
  AccountDeletionChallengeDto,
  AccountDeletionConfirmationDto,
  AccountDeletionImpactDto,
} from '@stepwhere/types';

import {
  confirmAccountDeletion as confirmAccountDeletionRequest,
  getAccountDeletionImpact as getAccountDeletionImpactRequest,
  requestAccountDeletionChallenge as requestAccountDeletionChallengeRequest,
} from '@/lib/api-client';

export type AccountDeletionConfirmation = AccountDeletionConfirmationDto;

export function getAccountDeletionImpact(): Promise<AccountDeletionImpactDto> {
  return getAccountDeletionImpactRequest({ operationName: 'account-deletion-impact' });
}

export function requestAccountDeletionChallenge(): Promise<AccountDeletionChallengeDto> {
  return requestAccountDeletionChallengeRequest({ operationName: 'account-deletion-challenge' });
}

export function confirmAccountDeletion(input: {
  challengeToken: string;
  code: string;
}): Promise<AccountDeletionConfirmationDto> {
  return confirmAccountDeletionRequest(input, { operationName: 'account-deletion-confirm' });
}

export function getUndoPeriodHours() {
  return 72;
}

export function getCleanupDeadlineDays() {
  return 30;
}
