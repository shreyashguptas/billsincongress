"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import { createContext, ReactNode, useContext, useState } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

const ConvexEnabledContext = createContext(false);

/**
 * Builds the Convex client, or returns null when Convex cannot run here. The
 * constructor throws when the browser has no WebSocket global (seen on some
 * iOS Safari sessions). Catch that and fall back to the disabled state so the
 * server-rendered content still renders instead of the whole client tree
 * failing.
 */
function createConvexClient(): ConvexReactClient | null {
  if (!convexUrl) {
    return null;
  }
  try {
    return new ConvexReactClient(convexUrl);
  } catch {
    return null;
  }
}

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
  const [convex] = useState(createConvexClient);
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
