"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useConvexAuth, useQuery } from "convex/react";
import { X } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useConvexEnabled } from "@/app/ConvexClientProvider";

const SIGNUP_CELEBRATION_PENDING_KEY = "bic_signup_celebration_pending";
const SIGNUP_CELEBRATION_WINDOW_MS = 10 * 60 * 1000;

export function markSignupCelebrationPending() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(SIGNUP_CELEBRATION_PENDING_KEY, "1");
}

export function WelcomeNewUser() {
  const enabled = useConvexEnabled();
  const auth = useConvexAuth();
  const isAuthenticated = auth?.isAuthenticated ?? false;
  const user = useQuery(api.users.currentUser, enabled && isAuthenticated ? {} : "skip");
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!user || typeof window === "undefined") return;

    const hasPendingCelebration =
      window.sessionStorage.getItem(SIGNUP_CELEBRATION_PENDING_KEY) === "1";
    if (!hasPendingCelebration) return;

    window.sessionStorage.removeItem(SIGNUP_CELEBRATION_PENDING_KEY);

    const seenKey = `bic_joined_celebration_seen:${user._id}`;
    const isFreshAccount = Date.now() - user._creationTime < SIGNUP_CELEBRATION_WINDOW_MS;
    if (!isFreshAccount || window.localStorage.getItem(seenKey) === "1") return;

    window.localStorage.setItem(seenKey, "1");
    setOpen(true);
  }, [user]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/65 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-50 w-[92%] max-w-md translate-x-[-50%] translate-y-[-50%] overflow-hidden",
            "rounded-xl border border-border bg-background p-0 shadow-2xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
          )}
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            {Array.from({ length: 22 }).map((_, index) => (
              <span
                key={index}
                className="absolute h-2 w-2 rounded-[2px]"
                style={{
                  left: `${10 + ((index * 37) % 80)}%`,
                  top: `${18 + ((index * 19) % 20)}%`,
                  backgroundColor: ["#2563eb", "#f59e0b", "#10b981", "#ef4444"][index % 4],
                  animation: "welcome-confetti 900ms ease-out forwards",
                  animationDelay: `${index * 28}ms`,
                  transform: `rotate(${index * 23}deg)`,
                  "--confetti-x": `${((index % 2 === 0 ? 1 : -1) * (24 + (index % 5) * 11))}px`,
                } as React.CSSProperties}
              />
            ))}
          </div>

          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute right-3 top-3 rounded-sm p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>

          <div className="relative px-6 pb-6 pt-8 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-border bg-secondary/70">
              <span className="font-serif text-3xl leading-none">B</span>
            </div>
            <DialogPrimitive.Title className="font-serif text-3xl font-semibold tracking-tight">
              Thank you for joining
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Your free account is ready. You can ask up to 100 bill chat questions each day and keep your conversations tied to your profile.
            </DialogPrimitive.Description>
            <Button className="mt-6 w-full" onClick={() => setOpen(false)}>
              Start exploring
            </Button>
          </div>

          <style>{`
            @keyframes welcome-confetti {
              0% {
                opacity: 0;
                transform: translate3d(0, -18px, 0) scale(0.5) rotate(0deg);
              }
              18% {
                opacity: 1;
              }
              100% {
                opacity: 0;
                transform: translate3d(var(--confetti-x, 0), 150px, 0) scale(1) rotate(220deg);
              }
            }
          `}</style>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
