"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/lib/hooks/use-toast";
import { Copy, Check, Trash2, KeyRound, Loader2 } from "lucide-react";

type TokenRow = {
  tokenId: Id<"apiTokens">;
  name: string;
  tokenLast4: string;
  scopes: string[];
  createdAt: number;
  lastUsedAt: number | null;
  expiresAt: number | null;
  revokedAt: number | null;
  isExpired: boolean;
  isActive: boolean;
};

type Step =
  | { kind: "idle" }
  | { kind: "naming"; name: string; expiry: "30d" | "90d" | "1y" | "never" }
  | {
      kind: "otp";
      name: string;
      expiry: "30d" | "90d" | "1y" | "never";
      challengeId: Id<"apiTokenReauthChallenges">;
      sentTo: string;
      code: string;
      submitting: boolean;
      error: string | null;
    }
  | { kind: "submitting" }
  | {
      kind: "revealed";
      token: string;
      name: string;
      last4: string;
      expiresAt: number | null;
    };

const MAX_NAME = 80;

export function ApiTokensCard() {
  const tokens = useQuery(api.apiTokens.listMyTokens, {}) as
    | TokenRow[]
    | undefined;
  const [step, setStep] = React.useState<Step>({ kind: "idle" });
  const { toast } = useToast();

  const activeCount =
    tokens?.filter((t) => t.isActive).length ?? 0;

  async function startCreate() {
    setStep({ kind: "naming", name: "", expiry: "1y" });
  }

  async function submitName(name: string, expiry: "30d" | "90d" | "1y" | "never") {
    setStep({ kind: "submitting" });
    // Try the create call directly; if Convex rejects with REAUTH_REQUIRED
    // (password-auth users), we issue an OTP and retry after verify.
    try {
      const res = await fetch("/api/account/api-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, expiry }),
      });
      if (res.status === 403) {
        const body = (await res.json()) as { error?: string };
        if (body.error === "REAUTH_REQUIRED") {
          // Issue an OTP and move to the otp step.
          const otpRes = await fetch("/api/account/api-tokens/reauth", {
            method: "POST",
          });
          if (!otpRes.ok) throw new Error("Could not send verification code.");
          const otp = (await otpRes.json()) as {
            challengeId: Id<"apiTokenReauthChallenges">;
            sentTo: string;
            expiresAt: number;
          };
          setStep({
            kind: "otp",
            name,
            expiry,
            challengeId: otp.challengeId,
            sentTo: otp.sentTo,
            code: "",
            submitting: false,
            error: null,
          });
          return;
        }
        if (body.error === "EMAIL_NOT_VERIFIED") {
          toast({
            title: "Email not verified",
            description: "Verify your email before creating an API token.",
            variant: "destructive",
          });
          setStep({ kind: "idle" });
          return;
        }
      }
      if (res.status === 409) {
        toast({
          title: "Token limit reached",
          description: "Revoke an existing token to free up a slot.",
          variant: "destructive",
        });
        setStep({ kind: "idle" });
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? "Could not create token.");
      }
      const created = (await res.json()) as {
        plaintextToken: string;
        name: string;
        last4: string;
        expiresAt: number | null;
      };
      setStep({
        kind: "revealed",
        token: created.plaintextToken,
        name: created.name,
        last4: created.last4,
        expiresAt: created.expiresAt,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not create token.";
      toast({
        title: "Couldn't create token",
        description: message,
        variant: "destructive",
      });
      setStep({ kind: "idle" });
    }
  }

  async function verifyOtpAndCreate(challenge: Extract<Step, { kind: "otp" }>) {
    setStep({ ...challenge, submitting: true, error: null });
    try {
      const verify = await fetch("/api/account/api-tokens/reauth", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          code: challenge.code,
        }),
      });
      if (!verify.ok) {
        const body = (await verify.json().catch(() => null)) as
          | { error?: string }
          | null;
        const code = body?.error ?? "INVALID_CODE";
        const message =
          code === "CHALLENGE_EXPIRED"
            ? "That code expired. Please request a new one."
            : code === "CHALLENGE_LOCKED"
              ? "Too many wrong attempts. Request a new code."
              : code === "CHALLENGE_NOT_FOUND"
                ? "Verification session not found. Try again."
                : "That code didn't match.";
        setStep({ ...challenge, submitting: false, error: message });
        return;
      }
      const create = await fetch("/api/account/api-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: challenge.name,
          expiry: challenge.expiry,
          reauthChallengeId: challenge.challengeId,
        }),
      });
      if (!create.ok) {
        const body = (await create.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? "Could not create token.");
      }
      const created = (await create.json()) as {
        plaintextToken: string;
        name: string;
        last4: string;
        expiresAt: number | null;
      };
      setStep({
        kind: "revealed",
        token: created.plaintextToken,
        name: created.name,
        last4: created.last4,
        expiresAt: created.expiresAt,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not create token.";
      setStep({ ...challenge, submitting: false, error: message });
    }
  }

  async function revoke(tokenId: Id<"apiTokens">, name: string) {
    if (
      !window.confirm(
        `Revoke "${name}"? Active scripts using this token will start failing immediately.`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/account/api-tokens/${tokenId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? "Could not revoke token.");
      }
      toast({ title: "Token revoked" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not revoke.";
      toast({
        title: "Couldn't revoke token",
        description: message,
        variant: "destructive",
      });
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> API access
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Build with the same data that powers this site.{" "}
            <a
              href="/docs"
              className="underline underline-offset-4 decoration-border hover:decoration-foreground"
            >
              Read the docs
            </a>
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={startCreate}
          disabled={step.kind !== "idle"}
        >
          + Create API token
        </Button>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        <p className="text-xs text-muted-foreground">
          {activeCount} of 10 active tokens
        </p>

        {tokens === undefined ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : tokens.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            You haven&apos;t created any tokens yet.
          </p>
        ) : (
          <ul className="divide-y divide-border border-y border-border -mx-6 px-6">
            {tokens.map((t) => (
              <li
                key={String(t.tokenId)}
                className="py-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{t.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground truncate">
                    bic_live_••••••••{t.tokenLast4}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {t.revokedAt
                      ? "Revoked"
                      : t.isExpired
                        ? "Expired"
                        : `Created ${formatDate(t.createdAt)}`}
                    {t.lastUsedAt && t.isActive
                      ? ` · last used ${formatRelative(t.lastUsedAt)}`
                      : null}
                    {t.expiresAt && t.isActive
                      ? ` · expires ${formatDate(t.expiresAt)}`
                      : null}
                  </p>
                </div>
                {t.isActive ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Revoke ${t.name}`}
                    onClick={() => revoke(t.tokenId, t.name)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {step.kind === "naming" && (
        <NameModal
          initial={step}
          onCancel={() => setStep({ kind: "idle" })}
          onSubmit={(name, expiry) => submitName(name, expiry)}
        />
      )}
      {step.kind === "otp" && (
        <OtpModal
          challenge={step}
          onCancel={() => setStep({ kind: "idle" })}
          onChange={(code) => setStep({ ...step, code, error: null })}
          onSubmit={() => verifyOtpAndCreate(step)}
        />
      )}
      {step.kind === "submitting" && <SubmittingOverlay />}
      {step.kind === "revealed" && (
        <RevealModal step={step} onClose={() => setStep({ kind: "idle" })} />
      )}
    </Card>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function NameModal({
  initial,
  onCancel,
  onSubmit,
}: {
  initial: Extract<Step, { kind: "naming" }>;
  onCancel: () => void;
  onSubmit: (name: string, expiry: "30d" | "90d" | "1y" | "never") => void;
}) {
  const [name, setName] = React.useState(initial.name);
  const [expiry, setExpiry] = React.useState<
    "30d" | "90d" | "1y" | "never"
  >(initial.expiry);
  return (
    <ModalShell title="Create API token" onClose={onCancel}>
      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="api-token-name">Name</Label>
          <Input
            id="api-token-name"
            placeholder="e.g. Research script on my laptop"
            maxLength={MAX_NAME}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <p className="text-[11px] text-muted-foreground">
            Just for you — pick whatever helps you remember which token is which.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="api-token-expiry">Expires</Label>
          <Select
            value={expiry}
            onValueChange={(v) =>
              setExpiry(v as "30d" | "90d" | "1y" | "never")
            }
          >
            <SelectTrigger id="api-token-expiry">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30d">30 days</SelectItem>
              <SelectItem value="90d">90 days</SelectItem>
              <SelectItem value="1y">1 year</SelectItem>
              <SelectItem value="never">Never</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() => onSubmit(name.trim(), expiry)}
          disabled={!name.trim()}
        >
          Continue
        </Button>
      </div>
    </ModalShell>
  );
}

function OtpModal({
  challenge,
  onChange,
  onSubmit,
  onCancel,
}: {
  challenge: Extract<Step, { kind: "otp" }>;
  onChange: (code: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <ModalShell title="Verify it's you" onClose={onCancel}>
      <p className="text-sm text-muted-foreground">
        We sent a 6-digit code to{" "}
        <span className="font-medium text-foreground">{challenge.sentTo}</span>.
        Enter it to reveal your new token.
      </p>
      <div className="mt-4 space-y-1">
        <Label htmlFor="api-token-otp">Verification code</Label>
        <Input
          id="api-token-otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="[0-9]*"
          value={challenge.code}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
          autoFocus
        />
        {challenge.error ? (
          <p className="text-[11px] text-destructive">{challenge.error}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Code expires in 10 minutes.
          </p>
        )}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={challenge.submitting}>
          Cancel
        </Button>
        <Button
          onClick={onSubmit}
          disabled={challenge.code.length !== 6 || challenge.submitting}
        >
          {challenge.submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
            </>
          ) : (
            "Verify and create"
          )}
        </Button>
      </div>
    </ModalShell>
  );
}

function RevealModal({
  step,
  onClose,
}: {
  step: Extract<Step, { kind: "revealed" }>;
  onClose: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  return (
    <ModalShell title="Save your new token" onClose={onClose} hideClose>
      <p className="text-sm text-muted-foreground">
        This is the only time we&apos;ll show you the full token. Copy it now —
        if you lose it, you&apos;ll need to create a new one.
      </p>
      <div className="mt-4 rounded-sm border border-border bg-secondary/40 px-3 py-2 font-mono text-xs break-all">
        {step.token}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(step.token);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              // Ignore — user can select-and-copy by hand.
            }
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button onClick={onClose}>I&apos;ve saved it</Button>
      </div>
    </ModalShell>
  );
}

function SubmittingOverlay() {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/60 backdrop-blur-sm">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function ModalShell({
  title,
  children,
  onClose,
  hideClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  hideClose?: boolean;
}) {
  // Esc-to-close + click-outside-to-close. Lightweight; we don't pull in
  // Radix Dialog because the rest of the app doesn't yet.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !hideClose) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hideClose, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !hideClose) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-md border border-border bg-background shadow-lg">
        <div className="border-b border-border px-5 py-3">
          <p className="font-serif text-lg font-semibold">{title}</p>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// ─── Date formatting ───────────────────────────────────────────────────────

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(ms);
}
