"use client";

import Link from "next/link";
import { X } from "lucide-react";

import { analytics } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { AUTHED_CHAT_DAILY_LIMIT, PRO_CHAT_DAILY_LIMIT } from "@/convex/plan";

interface RateLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: "anonymous" | "authed";
  max: number;
  resetAt: number;
  /** Where to redirect after sign-in / sign-up. Defaults to current URL. */
  redirectTo?: string;
}

function formatResetTime(resetAtMs: number): string {
  const date = new Date(resetAtMs);
  const now = new Date();

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return sameDay ? time : `${date.toLocaleDateString()} at ${time}`;
}

export function RateLimitDialog({
  open,
  onOpenChange,
  kind,
  max,
  resetAt,
  redirectTo,
}: RateLimitDialogProps) {
  const resetLabel = formatResetTime(resetAt);
  const signUpHref = `/sign-up${redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`;
  const signInHref = `/sign-in${redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`;

  // Clears the 40px close button in the corner.
  const titleClass = "pr-10";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // DialogContent draws its own 16px close glyph as its last child; it is
        // hidden for the 40px close button below, which sits where this
        // dialog's always has.
        hideClose
        className="block w-[92%] max-w-md rounded-lg border-line p-6 sm:p-7"
      >
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

        {kind === "anonymous" ? (
          <>
            <DialogTitle className={titleClass}>
              You&apos;ve hit the free daily limit
            </DialogTitle>
            <DialogDescription className="mt-3 text-[15px] leading-relaxed text-ink-2">
              Anonymous browsers can ask up to <span className="font-medium text-ink">{max} questions a day</span>.{" "}
              Create a free account and ask up to <span className="font-medium text-ink">{AUTHED_CHAT_DAILY_LIMIT} a day</span>.
            </DialogDescription>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button asChild className="w-full sm:flex-1">
                <Link href={signUpHref} onClick={() => analytics.rateLimitSignupClicked(kind)}>
                  Sign up free
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full sm:flex-1">
                <Link href={signInHref} onClick={() => analytics.rateLimitSigninClicked(kind)}>
                  I have an account
                </Link>
              </Button>
            </div>

            <p className="mt-4 text-[13px] leading-5 text-ink-3">
              Or come back after <span className="font-medium text-ink">{resetLabel}</span> when your daily quota resets.
            </p>
          </>
        ) : (
          <>
            <DialogTitle className={titleClass}>
              Daily chat limit reached
            </DialogTitle>
            <DialogDescription className="mt-3 text-[15px] leading-relaxed text-ink-2">
              You&apos;ve asked the maximum of <span className="font-medium text-ink">{max} questions</span> today. Your quota resets at{" "}
              <span className="font-medium text-ink">{resetLabel}</span>.
            </DialogDescription>

            {/* Free accounts can raise the cap; Pro readers are already at the top. */}
            {max < PRO_CHAT_DAILY_LIMIT ? (
              <>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
                  Pro raises this to <span className="font-medium text-ink">{PRO_CHAT_DAILY_LIMIT} a day</span>{" "}
                  and emails you when bills you follow move.
                </p>
                <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                  <Button asChild className="w-full sm:flex-1">
                    <Link href="/pro" onClick={() => analytics.rateLimitUpgradeClicked()}>
                      See Pro
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:flex-1"
                    onClick={() => onOpenChange(false)}
                  >
                    Not now
                  </Button>
                </div>
              </>
            ) : (
              <div className="mt-6">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => onOpenChange(false)}
                >
                  Got it
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
