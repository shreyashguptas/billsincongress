"use client";

import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { analytics } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            // The same paper scrim as components/ui/sheet.tsx: an ink tint would
            // lighten the page in the Night theme, where ink is near-white.
            "fixed inset-0 z-50 bg-paper/70 backdrop-blur-[2px]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-50 w-[92%] max-w-md translate-x-[-50%] translate-y-[-50%]",
            "rounded-lg border border-line bg-raised p-6 shadow-float sm:p-7",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <DialogPrimitive.Close
            aria-label="Close"
            className="focus-ring absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-sunken hover:text-ink"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </DialogPrimitive.Close>

          {kind === "anonymous" ? (
            <>
              <DialogPrimitive.Title className="pr-10 font-serif text-display-sm font-medium text-ink">
                You&apos;ve hit the free daily limit
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-3 text-[15px] leading-relaxed text-ink-2">
                Anonymous browsers can ask up to <span className="font-medium text-ink">{max} questions a day</span>.{" "}
                Create a free account and ask up to <span className="font-medium text-ink">100 a day</span>.
              </DialogPrimitive.Description>

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
              <DialogPrimitive.Title className="pr-10 font-serif text-display-sm font-medium text-ink">
                Daily chat limit reached
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-3 text-[15px] leading-relaxed text-ink-2">
                You&apos;ve asked the maximum of <span className="font-medium text-ink">{max} questions</span> today. Your quota resets at{" "}
                <span className="font-medium text-ink">{resetLabel}</span>.
              </DialogPrimitive.Description>

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
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
