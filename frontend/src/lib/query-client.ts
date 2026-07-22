import { QueryClient } from '@tanstack/react-query';
import { isServer } from '@tanstack/react-query';

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (isServer) {
    return new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          refetchInterval: 10_000,
          retry: 1,
        },
      },
    });
  }
  if (!browserQueryClient) {
    browserQueryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          refetchInterval: 10_000,
          retry: 1,
        },
      },
    });
  }
  return browserQueryClient;
}
