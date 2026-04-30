"use client";

import * as React from "react";
import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

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
            "fixed inset-0 z-50 bg-black/70 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-50 w-[92%] max-w-md translate-x-[-50%] translate-y-[-50%]",
            "rounded-md border border-border bg-background p-6 shadow-lg",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute right-3 top-3 rounded-sm p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>

          {kind === "anonymous" ? (
            <>
              <DialogPrimitive.Title className="font-serif text-2xl font-semibold tracking-tight">
                You&apos;ve hit the free daily limit
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Anonymous browsers can ask up to <span className="font-medium text-foreground">{max} questions a day</span>.{" "}
                Create a free account and ask up to <span className="font-medium text-foreground">100 a day</span>.
              </DialogPrimitive.Description>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <Button asChild className="w-full sm:flex-1">
                  <Link href={signUpHref}>Sign up free</Link>
                </Button>
                <Button asChild variant="outline" className="w-full sm:flex-1">
                  <Link href={signInHref}>I have an account</Link>
                </Button>
              </div>

              <p className="mt-4 text-xs text-muted-foreground">
                Or come back after <span className="font-medium text-foreground">{resetLabel}</span> when your daily quota resets.
              </p>
            </>
          ) : (
            <>
              <DialogPrimitive.Title className="font-serif text-2xl font-semibold tracking-tight">
                Daily chat limit reached
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground leading-relaxed">
                You&apos;ve asked the maximum of <span className="font-medium text-foreground">{max} questions</span> today. Your quota resets at{" "}
                <span className="font-medium text-foreground">{resetLabel}</span>.
              </DialogPrimitive.Description>

              <div className="mt-5">
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
