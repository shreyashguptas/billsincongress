"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { Bell, LogOut, User as UserIcon } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { analytics } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConvexEnabled } from "@/components/convex-client-provider";
import { AvatarMark, initialsFor, ProPill } from "@/components/brand/pro-mark";
import {
  authCtaHref,
  authCtas,
  deviceKnowsAccount,
  rememberAccountOnDevice,
  type AuthCta,
} from "@/lib/auth-cta";

export function UserMenu() {
  const enabled = useConvexEnabled();
  // Only render after client mount. With Cache Components enabled at the
  // root layout, ConvexAuthNextjsProvider's React context isn't populated
  // during prerender — useConvexAuth() returns undefined and destructuring
  // crashes the build. Skipping render until mount avoids this and the
  // hydration happens cleanly once the client provider is live.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!enabled || !mounted) {
    // Reserve the slot's space so the layout doesn't shift after hydration.
    return <div aria-hidden className="h-9 w-9" />;
  }
  return <UserMenuInner />;
}

function UserMenuInner() {
  const auth = useConvexAuth();
  const { signOut } = useAuthActions();
  const router = useRouter();
  const isAuthenticated = auth?.isAuthenticated ?? false;
  const isLoading = auth?.isLoading ?? true;
  const user = useQuery(api.users.currentUser, isAuthenticated ? {} : "skip");

  // Kept after sign-out: it is what lets the signed-out slot say "Sign in"
  // rather than "Sign up" to someone who has an account (lib/auth-cta.ts).
  React.useEffect(() => {
    if (isAuthenticated) rememberAccountOnDevice();
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <div
        aria-hidden
        className="h-9 w-9 rounded-full border border-line-strong bg-sunken"
      />
    );
  }

  if (!isAuthenticated) return <SignedOutActions />;

  const displayName = user?.name ?? user?.email ?? "Account";
  const initials = initialsFor(user?.name ?? user?.email);
  const verified = Boolean(user?.emailVerificationTime);
  const isPro = user?.plan === "pro";

  async function onSignOut() {
    // Capture + reset PostHog identity before the auth state changes.
    analytics.signedOut();
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* The initials avatar, 36px. On Pro it wears the spectrum ring, the
            Pro mark (Documentation/brand.md, "Pro"); the label says so too. */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={isPro ? "Account menu, Pro plan" : "Account menu"}
          className="group h-9 w-9 rounded-full p-0 hover:bg-transparent touchable:h-9 touchable:w-9"
        >
          <AvatarMark initials={initials} pro={isPro} size="sm" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="px-2 pb-1 pt-2">
          <div className="space-y-0.5 normal-case tracking-normal">
            <p className="truncate text-sm font-medium text-ink">{displayName}</p>
            {user?.email && user.email !== displayName && (
              <p className="truncate font-mono text-xs text-ink-3">{user.email}</p>
            )}
            <p className="flex items-center gap-2 pt-1 text-xs text-ink-3">
              {isPro ? <ProPill /> : <span>Free plan</span>}
              {!verified && <span>email unverified</span>}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account" className="cursor-pointer">
            <UserIcon className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Account
          </Link>
        </DropdownMenuItem>
        {!isPro && (
          <DropdownMenuItem asChild>
            <Link href="/pro" className="cursor-pointer">
              <Bell className="mr-2 h-4 w-4" /> Get bill alerts (Pro)
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut} className="cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const CTA_LABEL: Record<AuthCta, string> = { sign_in: "Sign in", sign_up: "Sign up" };

/**
 * Signed out: "Sign up" for a device that has never had an account signed in,
 * "Sign in" for one that has, and on an auth page only the other form. When
 * both show, "Sign up" is the outline button at the edge and the only one kept
 * on phones; the sign-up page links to sign-in.
 */
function SignedOutActions() {
  const pathname = usePathname();
  // Read once on mount: this component only renders client-side (see UserMenu).
  const [knownDevice] = React.useState(deviceKnowsAccount);
  const ctas = authCtas(pathname, knownDevice);
  const search = typeof window === "undefined" ? "" : window.location.search;

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      {ctas.map((cta) => {
        const primary = cta === "sign_up";
        const hideOnPhone = ctas.length > 1 && !primary;
        return (
          <Button
            key={cta}
            asChild
            variant={primary ? "outline" : "ghost"}
            size="sm"
            className={hideOnPhone ? "hidden sm:inline-flex" : undefined}
          >
            <Link
              href={authCtaHref(cta, pathname, search)}
              onClick={() => analytics.headerAuthClicked(cta, knownDevice)}
            >
              {CTA_LABEL[cta]}
            </Link>
          </Button>
        );
      })}
    </div>
  );
}
