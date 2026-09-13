"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import { createContext, ReactNode, useContext, useState } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

const ConvexEnabledContext = createContext(false);

/**
 * Builds the Convex client, or returns null when Convex cannot run here.
 *
 * `new ConvexReactClient()` throws synchronously when the browser has no
 * WebSocket global (seen on some iOS Safari sessions). At module scope that
 * threw while the chunk was still evaluating, before React could catch it, so
 * the whole client tree died and the visitor got a blank page instead of the
 * server-rendered bill content. Constructing lazily inside the provider is
 * what fixes that.
 *
 * The WebSocket global is checked directly rather than wrapping the
 * constructor in `try/catch`. A catch-all would also swallow the OTHER things
 * this constructor throws for — chiefly a malformed NEXT_PUBLIC_CONVEX_URL,
 * which it validates before it ever looks at WebSocket. That is a deploy-time
 * configuration mistake, and swallowing it would silently drop sign-in, saved
 * bills, the dashboard and the account page sitewide while every page still
 * rendered as though nothing were wrong — with nothing captured in error
 * tracking to say so. A config error should stay loud. This condition mirrors
 * the library's own (`!options.webSocketConstructor && typeof WebSocket ===
 * "undefined"`); no `webSocketConstructor` option is passed here.
 */
function createConvexClient(): ConvexReactClient | null {
  if (!convexUrl) {
    return null;
  }
  if (typeof WebSocket === "undefined") {
    return null;
  }
  return new ConvexReactClient(convexUrl);
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
