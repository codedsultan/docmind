'use client';

import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { getQueryClient } from '@/lib/query-client';
import { initClientToken } from '@/lib/api';

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  // Kick off token initialization as early as possible. Any API call that
  // fires before init completes will transparently await the shared promise
  // via getAuthToken() — no blocking rendering needed.
  useEffect(() => {
    initClientToken();
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </ThemeProvider>
  );
}