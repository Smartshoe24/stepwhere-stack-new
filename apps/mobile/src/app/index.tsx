import { Redirect } from 'expo-router';

import { AppBootstrapScreen } from '@/components/loading/app-bootstrap-screen';
import { useAuth } from '@/features/auth/use-auth';

export default function IndexRoute() {
  const auth = useAuth();

  if (auth.status === 'loading') {
    return <AppBootstrapScreen />;
  }

  if (auth.status === 'signedOut') {
    return <Redirect href="/auth/sign-in" />;
  }

  return <Redirect href={auth.onboardingCompleted ? '/home' : auth.nextOnboardingHref} />;
}
