import Link from "next/link";
import type { Metadata } from "next";
import { ResponseExample } from "@/components/docs/response-example";

export const metadata: Metadata = {
  title: "Rate limits",
  description: "Per-token request limits, response headers, and backoff.",
};

export default function RateLimitsPage() {
  return (
    <>
      <p className="label-eyebrow">Reference</p>
      <h1 className="font-serif text-4xl font-semibold tracking-tight">
        Rate limits
      </h1>
      <p className="lead">
        Every token gets <strong>1,000 requests per hour</strong> and{" "}
        <strong>10,000 per day</strong>. Free or paid, today they&apos;re the
        same — that&apos;s deliberate while we learn what real usage looks
        like. Both limits are tracked per token, not per user, so a project
        with three tokens has three independent buckets.
      </p>

      <h2>Headers on every response</h2>
      <p>
        Each successful response sets these headers so your client can
        track its own quota without an extra API call:
      </p>
      <pre>
        <code>{`X-RateLimit-Limit-Hour: 1000
X-RateLimit-Remaining-Hour: 942
X-RateLimit-Limit-Day: 10000
X-RateLimit-Remaining-Day: 8721`}</code>
      </pre>

      <h2>Bucket math</h2>
      <p>
        The hourly bucket is a <strong>token-bucket</strong>: it refills
        gradually and starts full. So a one-off backfill that runs 800
        requests in five minutes is fine — you&apos;ll just take a while to
        refill back to 1,000.
      </p>
      <p>
        The daily bucket is a <strong>fixed window</strong>, aligned to{" "}
        <strong>5:00 AM UTC</strong> (= midnight EST, or 1:00 AM during
        daylight savings). All 10,000 tokens are granted at once at the
        start of the window.
      </p>

      <h2>What 429 looks like</h2>
      <p>
        When you exceed either limit, the response is <code>429</code> with
        a <code>Retry-After</code> header (in seconds) and a JSON body:
      </p>
      <div className="not-prose">
        <ResponseExample
          value={{
            error: {
              type: "rate_limit_exceeded",
              message: "You've exceeded your hourly request limit (1000/hour).",
              retry_after_seconds: 412,
              docs_url: "https://billsincongress.com/docs/rate-limits",
              details: { which: "hourly", limit: "1000/hour" },
            },
            meta: { request_id: "req_…" },
          }}
        />
      </div>

      <h2>The right way to back off</h2>
      <p>
        On a 429, read <code>Retry-After</code>, sleep that long, then
        retry. If you&apos;re running long-lived workers, also pre-emptively
        slow down when <code>X-RateLimit-Remaining-Hour</code> drops below,
        say, 50 — that prevents an entire pod from hitting the wall at the
        same instant.
      </p>
      <pre>
        <code>{`# Pseudocode
while True:
    res = requests.get(url, headers=auth)
    if res.status_code == 429:
        time.sleep(int(res.headers.get("Retry-After", "60")))
        continue
    res.raise_for_status()
    handle(res.json())`}</code>
      </pre>

      <h2>Per-IP limit</h2>
      <p>
        We also enforce a 100-requests-per-minute per-IP limit, regardless
        of token. Honest single-machine clients will never hit this; it&apos;s
        a fast-reject path so an attacker spraying invalid tokens can&apos;t
        pummel the platform. If you do hit it, the body is{" "}
        <code>error.type: ip_rate_limit_exceeded</code>.
      </p>

      <h2>Need more headroom?</h2>
      <p>
        We&apos;d love to hear from you. The plan is to introduce paid tiers
        based on real usage, not guesses. Until then, write to us on the{" "}
        <Link href="/about">contact page</Link> with a sentence or two
        about your project and we&apos;ll see what we can do.
      </p>
    </>
  );
}
