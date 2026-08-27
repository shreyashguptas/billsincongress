"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { LogOut, User as UserIcon } from "lucide-react";

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

function initialsFor(nameOrEmail: string | undefined | null): string {
  if (!nameOrEmail) return "·";
  const trimmed = nameOrEmail.trim();
  const atIdx = trimmed.indexOf("@");
  const base = atIdx > 0 ? trimmed.slice(0, atIdx) : trimmed;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "·";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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

  if (isLoading) {
    return (
      <div
        aria-hidden
        className="h-9 w-9 rounded-full border border-border bg-muted/40"
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <Button asChild variant="ghost" size="sm" className="font-medium">
        <Link href="/sign-in">Sign in</Link>
      </Button>
    );
  }

  const displayName = user?.name ?? user?.email ?? "Account";
  const initials = initialsFor(user?.name ?? user?.email);
  const verified = Boolean(user?.emailVerificationTime);

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
        <button
          type="button"
          aria-label="Account menu"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted/30 text-xs font-semibold uppercase text-foreground transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="px-2 pb-1 pt-2">
          <div className="space-y-0.5 normal-case tracking-normal">
            <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
            {user?.email && user.email !== displayName && (
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {user?.plan === "pro" ? "Pro plan" : "Free plan"}
              {!verified && " · email unverified"}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account" className="cursor-pointer">
            <UserIcon className="mr-2 h-4 w-4" /> Account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut} className="cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
