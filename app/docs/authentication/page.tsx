import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Authentication",
  description: "Bearer tokens, format, rotation, and how to keep them safe.",
};

export default function AuthenticationPage() {
  return (
    <>
      <p className="label-eyebrow">Reference</p>
      <h1 className="font-serif text-4xl font-semibold tracking-tight">
        Authentication
      </h1>
      <p className="lead">
        Every request is authenticated with a bearer token you mint on{" "}
        <Link href="/account">your account page</Link>. Tokens are scoped to
        you, are read-only, and can be revoked at any time.
      </p>

      <h2>The header</h2>
      <p>
        Send your token in the standard <code>Authorization</code> header:
      </p>
      <pre>
        <code>{`Authorization: Bearer bic_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx`}</code>
      </pre>
      <p>
        We <strong>do not</strong> accept tokens in the URL query string. URL
        parameters end up in browser history, server logs, and{" "}
        <code>Referer</code> headers — none of which are places a secret
        belongs. A request with <code>?token=…</code> will be rejected with{" "}
        <code>400 invalid_request</code>.
      </p>

      <h2>Token format</h2>
      <ul>
        <li>
          Every live token is prefixed with <code>bic_live_</code>. The
          prefix is a stable signal for log-scanning tools (and for our
          future selves) to spot a leaked token.
        </li>
        <li>
          The portion after the prefix is 32 base64url characters of
          cryptographically random data — about 190 bits of entropy.
        </li>
        <li>
          We store only a SHA-256 hash plus the last 4 chars of the
          plaintext. After your one-time reveal, the original token cannot
          be recovered. If you lose it, create a new one.
        </li>
      </ul>

      <h2>Where to keep tokens</h2>
      <p>
        Treat them like a password to your data. Specifically:
      </p>
      <ul>
        <li>
          <strong>Use environment variables</strong> in scripts and servers
          (<code>BIC_TOKEN</code> by convention in our examples). Never hard-code
          tokens in source files you&apos;ll commit.
        </li>
        <li>
          <strong>Use a secret manager</strong> in production (Vercel
          Environment Variables, AWS Secrets Manager, Doppler, 1Password,
          etc.). Anything but plaintext at rest.
        </li>
        <li>
          <strong>Don&apos;t embed tokens in client-side code.</strong> Anyone
          who can view the page source will see them. If you&apos;re building
          a frontend, proxy through a server you control.
        </li>
      </ul>

      <h2>Rotation</h2>
      <p>
        Treat tokens as disposable. Create a new one for each environment or
        machine — that way revoking is precise (kill just the one that
        leaked, leave the rest alone). The hard cap is{" "}
        <strong>10 active tokens per user</strong>; you&apos;ll get a clear
        error before we silently truncate.
      </p>
      <p>
        To rotate: create the new token, update your secret store, deploy,
        then revoke the old one from{" "}
        <Link href="/account">your account page</Link>. Revocation takes
        effect on the next request — there is no cache to wait on.
      </p>

      <h2>Email verification + re-auth</h2>
      <p>
        Minting a token requires a verified email on your account. For
        password accounts, we also email a 6-digit code at create time and
        require you to enter it before revealing the token. Google-OAuth
        accounts skip this step (Google did the strong-auth at sign-in).
      </p>

      <h2>What if a token leaks?</h2>
      <ol>
        <li>
          <strong>Revoke it.</strong> Open{" "}
          <Link href="/account">your account page</Link>, find the token,
          click revoke. The next request bearing it returns{" "}
          <code>401 invalid_token</code>.
        </li>
        <li>
          <strong>Create a replacement</strong> and update wherever the old
          one was used.
        </li>
        <li>
          Tell us if you think the leak was our fault, or if the token was
          ever used to access something it shouldn&apos;t have. We can pull
          the request log for the past 90 days.
        </li>
      </ol>

      <h2>Errors</h2>
      <p>
        Auth failures all return JSON with an{" "}
        <code>error.type</code> you can branch on:
      </p>
      <ul>
        <li>
          <code>missing_token</code> — no <code>Authorization</code> header
        </li>
        <li>
          <code>invalid_token</code> — wrong format, unknown, revoked, or
          expired
        </li>
        <li>
          <code>rate_limit_exceeded</code> — see{" "}
          <Link href="/docs/rate-limits">rate limits</Link>
        </li>
      </ul>
      <p>
        See <Link href="/docs/errors">errors</Link> for the full reference.
      </p>
    </>
  );
}
