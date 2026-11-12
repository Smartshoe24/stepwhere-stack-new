import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import { bindQueryLifecycle, createQueryClient } from '@/query/query-client';

export function AppQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(() => createQueryClient());

  React.useEffect(() => bindQueryLifecycle(), []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
