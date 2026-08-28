'use client';

import * as React from 'react';
import { useConvexAuth, useQuery } from 'convex/react';

import { api } from '@/convex/_generated/api';
import { analytics } from '@/lib/analytics';
import { useConvexEnabled } from '@/components/convex-client-provider';

// How recently an account must have been created for a Google OAuth return to
// count as a sign-UP rather than a sign-IN. Mirrors the welcome-modal window.
const FRESH_ACCOUNT_WINDOW_MS = 10 * 60 * 1000;

/**
 * Keeps PostHog's notion of "who is this?" in sync with Convex auth.
 *
 * - Signed in  → posthog.identify(<user id>, { plan, email, … }) so anonymous
 *   history merges into the real person.
 * - Signed out / session expired → posthog.reset() so the next visitor on this
 *   device isn't attributed to the previous user.
 * - Also attributes Google OAuth completions (signup_completed /
 *   signin_completed), which can't be captured in a click handler because
 *   OAuth does a full-page redirect.
 *
 * Mounted once in app/layout.tsx. Renders nothing.
 */
export function PostHogAuthSync() {
  const enabled = useConvexEnabled();
  // Same defensive pattern as UserMenu: Convex auth context isn't populated
  // during prerender, so only render the inner hook-using component on the client.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!enabled || !mounted) return null;
  return <PostHogAuthSyncInner />;
}

function PostHogAuthSyncInner() {
  const auth = useConvexAuth();
  const isAuthenticated = auth?.isAuthenticated ?? false;
  const isLoading = auth?.isLoading ?? true;
  const user = useQuery(api.users.currentUser, isAuthenticated ? {} : 'skip');

  React.useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated && user) {
      analytics.identify(
        user._id,
        {
          email: user.email,
          name: user.name,
          plan: user.plan === 'pro' ? 'pro' : 'free',
          email_verified: Boolean(user.emailVerificationTime),
        },
        user._creationTime,
      );

      // If this load is the return leg of a Google OAuth flow, attribute it.
      const isFreshAccount = Date.now() - user._creationTime < FRESH_ACCOUNT_WINDOW_MS;
      analytics.consumePendingGoogleAuth(isFreshAccount);
    } else if (!isAuthenticated && analytics.isIdentified()) {
      // Session ended outside the explicit sign-out buttons (expiry, another tab).
      analytics.reset();
    }
  }, [isAuthenticated, isLoading, user]);

  return null;
}
