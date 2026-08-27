"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import { createContext, ReactNode, useContext } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

const ConvexEnabledContext = createContext(false);

/**
 * Returns true when Convex is configured and the ConvexAuthNextjsProvider is
 * active. Components that call Convex hooks (useQuery, useMutation, useAuth,
 * etc.) must gate on this to avoid the "missing provider" runtime error in
 * environments where NEXT_PUBLIC_CONVEX_URL isn't set (e.g. pre-build SSR).
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
      <ConvexAuthNextjsProvider client={convex}>
        {children}
      </ConvexAuthNextjsProvider>
    </ConvexEnabledContext.Provider>
  );
}
