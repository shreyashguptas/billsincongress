"use client";

import * as React from "react";
import { KeyRound } from "lucide-react";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * "Change password" on the account page, for readers who sign in with a
 * password. It runs the same emailed-code reset as /forgot-password, on the
 * reader's own address: proving the inbox stands in for the old password, so
 * someone who has forgotten it can change it here too.
 */
export function ChangePasswordButton({ email }: { email: string }) {
  const [open, setOpen] = React.useState(false);
  const [done, setDone] = React.useState(false);
  // A new key per opening starts the form over at "Email me a code".
  const [attempt, setAttempt] = React.useState(0);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setDone(false);
      setAttempt((n) => n + 1);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => onOpenChange(true)}>
        <KeyRound className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        Change password
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-sm gap-5 overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{done ? "Password changed" : "Change password"}</DialogTitle>
            <DialogDescription>
              {done
                ? "Use it next time you sign in. Every other device was signed out."
                : "We'll check it's you with a code sent to your email."}
            </DialogDescription>
          </DialogHeader>
          {done ? (
            <DialogFooter>
              <Button onClick={() => setOpen(false)} className="w-full sm:w-auto">
                Done
              </Button>
            </DialogFooter>
          ) : (
            <ResetPasswordForm key={attempt} accountEmail={email} onChanged={() => setDone(true)} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
