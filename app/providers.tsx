"use client";

import { useState, type ReactNode } from "react";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { shouldToastMutationError } from "@/lib/mutation-errors";
import { showSaveFailed } from "@/lib/stores/toast";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // A failed mutation rolls its optimistic change back, and on its own
        // says nothing: the edit just disappears. One toast for all of them,
        // here, unless the mutation's screen already shows its own error.
        mutationCache: new MutationCache({
          onError: (_error, _vars, _ctx, mutation) => {
            if (shouldToastMutationError(mutation.options.meta)) showSaveFailed();
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {/* reducedMotion="user" makes all motion respect the OS "reduce motion" setting. */}
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </QueryClientProvider>
  );
}
