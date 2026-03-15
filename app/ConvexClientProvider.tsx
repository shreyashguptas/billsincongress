"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { createContext, ReactNode, useContext } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

const ConvexEnabledContext = createContext(false);

/**
 * Returns true when Convex is configured and the ConvexProvider is active.
 * Components that call Convex hooks (useQuery, useMutation, etc.) must
 * gate on this to avoid the "missing provider" runtime error.
 */
export function useConvexEnabled() {
  return useContext(ConvexEnabledContext);
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex) {
    return (
      <ConvexEnabledContext.Provider value={false}>
        {children}
      </ConvexEnabledContext.Provider>
    );
  }
  return (
    <ConvexEnabledContext.Provider value={true}>
      <ConvexProvider client={convex}>{children}</ConvexProvider>
    </ConvexEnabledContext.Provider>
  );
}
