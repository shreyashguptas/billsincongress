"use client";

import * as React from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { X } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { analytics } from "@/lib/analytics";
import { safeLocalStorage, safeSessionStorage } from "@/lib/safe-storage";
import { ChamberMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
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
    <Dialog open={open} onOpenChange={setOpen}>
      {/* hideClose: Dialog's own close is a bare 16px icon; this one keeps the 40px target below. */}
      <DialogContent hideClose className="w-[92%] max-w-md rounded-lg border-line bg-raised p-6 sm:p-8">
        <DialogClose asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close"
            className="absolute right-3 top-3 text-ink-2 hover:text-ink touchable:h-10 touchable:w-10"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </Button>
        </DialogClose>

        <div className="flex flex-col items-center pt-2 text-center">
          {/* The spectrum mark: once on this surface, at 48px (brand.md, "Logo"). */}
          <ChamberMark spectrum className="h-12 w-12" />
          <DialogTitle className="mt-5">
            Thank you for joining
          </DialogTitle>
          <DialogDescription className="mt-3 max-w-sm text-[15px] leading-relaxed text-ink-2">
            Your free account is ready. You can ask up to 100 bill chat questions each day and keep your conversations tied to your profile.
          </DialogDescription>
          <Button size="lg" className="mt-6 w-full" onClick={() => setOpen(false)}>
            Start exploring
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
