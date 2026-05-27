import { QueryClient } from '@tanstack/react-query';
import { isAuthExpiredError } from '../services/api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => !isAuthExpiredError(error) && failureCount < 1,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
    },
  },
});
