import { useAuthContext } from './auth-provider';

export function useAuth() {
  return useAuthContext();
}
