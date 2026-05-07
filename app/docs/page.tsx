import Link from "next/link";
import type { Metadata } from "next";
import { CodeTabs } from "@/components/docs/code-tabs";
import { buildSamples } from "@/lib/code-samples";

export const metadata: Metadata = {
  title: "Developers · Bills.Congress",
  description:
    "Read-only REST API for the same data that powers billsincongress.com. Free, generous limits, no SDK required.",
};

export default function DocsLanding() {
  const samples = buildSamples({
    method: "GET",
    path: "/bills?limit=3",
  });
  return (
    <>
      <p className="label-eyebrow">Developers</p>
      <h1 className="font-serif text-4xl font-semibold tracking-tight">
        Build with the data behind Bills.Congress.
      </h1>
      <p className="lead">
        A read-only REST API for every bill, sponsor, action, and summary
        you see on this site. JSON in, JSON out. No SDK to install — the
        examples below run as-is in the language of your choice.
      </p>

      <div className="not-prose grid gap-3 sm:grid-cols-3 my-8">
        <FeatureCard title="Free" subtitle="No card required to start." />
        <FeatureCard
          title="1,000 / hour"
          subtitle="And 10,000 a day, per token."
        />
        <FeatureCard
          title="Read-only"
          subtitle="Public data. No write access."
        />
      </div>

      <h2>Try it now</h2>
      <p>
        <Link href="/account">Sign in and create a token</Link>, then send
        a request. Every endpoint takes the token as a Bearer header and
        returns a stable, snake_case JSON response.
      </p>

      <div className="not-prose">
        <CodeTabs samples={samples} />
      </div>

      <h2>Where to next?</h2>
      <ul>
        <li>
          <Link href="/docs/quickstart">Quickstart</Link> — five minutes
          from token to first chart.
        </li>
        <li>
          <Link href="/docs/authentication">Authentication</Link> — how
          tokens work, and how to handle them safely.
        </li>
        <li>
          <Link href="/docs/rate-limits">Rate limits</Link> — what the
          headers mean and how to back off.
        </li>
        <li>
          <Link href="/docs/api/bills">Bills reference</Link> — the
          biggest endpoint, with every filter explained.
        </li>
        <li>
          <a href="/api/v1/openapi.json">openapi.json</a> — pipe this
          into Postman, Insomnia, or your own SDK generator.
        </li>
      </ul>
    </>
  );
}

function FeatureCard({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-md border border-border bg-secondary/30 p-4">
      <p className="font-serif text-xl font-semibold">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}
