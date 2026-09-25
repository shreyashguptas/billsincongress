"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useConvexAuth, useQuery } from "convex/react";
import { X } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { analytics } from "@/lib/analytics";
import { safeLocalStorage, safeSessionStorage } from "@/lib/safe-storage";
import { ChamberMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useConvexEnabled } from "@/components/convex-client-provider";

const SIGNUP_CELEBRATION_PENDING_KEY = "bic_signup_celebration_pending";
const SIGNUP_CELEBRATION_WINDOW_MS = 10 * 60 * 1000;

export function markSignupCelebrationPending() {
  safeSessionStorage.setItem(SIGNUP_CELEBRATION_PENDING_KEY, "1");
}

export function WelcomeNewUser() {
  const enabled = useConvexEnabled();
  const auth = useConvexAuth();
  const isAuthenticated = auth?.isAuthenticated ?? false;
  const user = useQuery(api.users.currentUser, enabled && isAuthenticated ? {} : "skip");
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!user) return;

    const hasPendingCelebration =
      safeSessionStorage.getItem(SIGNUP_CELEBRATION_PENDING_KEY) === "1";
    if (!hasPendingCelebration) return;

    safeSessionStorage.removeItem(SIGNUP_CELEBRATION_PENDING_KEY);

    const seenKey = `bic_joined_celebration_seen:${user._id}`;
    const isFreshAccount = Date.now() - user._creationTime < SIGNUP_CELEBRATION_WINDOW_MS;
    if (!isFreshAccount || safeLocalStorage.getItem(seenKey) === "1") return;

    safeLocalStorage.setItem(seenKey, "1");
    analytics.welcomeModalShown();
    setOpen(true);
  }, [user]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            // The same paper scrim as components/ui/sheet.tsx: an ink tint would
            // lighten the page in the Night theme, where ink is near-white.
            "fixed inset-0 z-50 bg-paper/70 backdrop-blur-[2px]",
            "data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-50 w-[92%] max-w-md translate-x-[-50%] translate-y-[-50%]",
            "rounded-lg border border-line bg-raised p-6 shadow-float sm:p-8",
            // Opacity only: a keyframe transform would replace the centring
            // translate above for the length of the animation.
            "data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out",
          )}
        >
          <DialogPrimitive.Close
            aria-label="Close"
            className="focus-ring absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-sunken hover:text-ink"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </DialogPrimitive.Close>

          <div className="flex flex-col items-center pt-2 text-center">
            {/* The spectrum mark: once on this surface, at 48px (brand.md, "Logo"). */}
            <ChamberMark spectrum className="h-12 w-12" />
            <DialogPrimitive.Title className="mt-5 font-serif text-display-sm font-medium text-ink">
              Thank you for joining
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-3 max-w-sm text-[15px] leading-relaxed text-ink-2">
              Your free account is ready. You can ask up to 100 bill chat questions each day and keep your conversations tied to your profile.
            </DialogPrimitive.Description>
            <Button size="lg" className="mt-6 w-full" onClick={() => setOpen(false)}>
              Start exploring
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
