import type { Metadata } from "next";
import { ResponseExample } from "@/components/docs/response-example";

export const metadata: Metadata = {
  title: "Errors",
  description: "JSON shape, status codes, and what each one actually means.",
};

const ROWS: Array<{
  status: number;
  type: string;
  meaning: string;
}> = [
  {
    status: 400,
    type: "invalid_request",
    meaning: "Your request was malformed. Check the message for the offending field.",
  },
  {
    status: 401,
    type: "missing_token",
    meaning:
      "No Authorization header. Send `Authorization: Bearer bic_live_…`.",
  },
  {
    status: 401,
    type: "invalid_token",
    meaning: "Token format is wrong, unknown, revoked, or expired.",
  },
  {
    status: 404,
    type: "not_found",
    meaning: "The bill / congress / resource doesn't exist.",
  },
  {
    status: 405,
    type: "method_not_allowed",
    meaning: "Endpoint only supports GET (and OPTIONS for preflight).",
  },
  {
    status: 429,
    type: "rate_limit_exceeded",
    meaning: "Per-token hourly or daily limit exceeded. Read `Retry-After`.",
  },
  {
    status: 429,
    type: "ip_rate_limit_exceeded",
    meaning: "Per-IP minute limit exceeded. Slow down.",
  },
  {
    status: 503,
    type: "service_unavailable",
    meaning: "Backend was momentarily unreachable. Retry with backoff.",
  },
  {
    status: 500,
    type: "internal_error",
    meaning: "Something broke on our side. Retry; if it persists, ping us.",
  },
];

export default function ErrorsPage() {
  return (
    <>
      <p className="label-eyebrow">Reference</p>
      <h1 className="font-serif text-4xl font-semibold tracking-tight">
        Errors
      </h1>
      <p className="lead">
        Every error returns the same JSON shape. The HTTP status tells you{" "}
        <em>broadly</em> what went wrong; <code>error.type</code> is the
        stable, machine-readable code your script should branch on.
      </p>

      <h2>Shape</h2>
      <div className="not-prose">
        <ResponseExample
          value={{
            error: {
              type: "rate_limit_exceeded",
              message: "You've exceeded your hourly request limit (1000/hour).",
              retry_after_seconds: 412,
              docs_url: "https://billsincongress.com/docs/rate-limits",
            },
            meta: { request_id: "req_…" },
          }}
        />
      </div>

      <p>
        <code>docs_url</code> always deep-links to the section of these
        docs that describes the error. <code>request_id</code> is unique
        per call and is what we&apos;ll ask for if you reach out about a
        specific failure.
      </p>

      <h2>Status codes</h2>
      <div className="not-prose border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-left">
              <th className="px-3 py-2 font-medium text-xs uppercase tracking-wider text-muted-foreground">
                Status
              </th>
              <th className="px-3 py-2 font-medium text-xs uppercase tracking-wider text-muted-foreground">
                Type
              </th>
              <th className="px-3 py-2 font-medium text-xs uppercase tracking-wider text-muted-foreground">
                Meaning
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr
                key={`${r.status}-${r.type}`}
                id={r.type}
                className="border-b border-border last:border-0"
              >
                <td className="px-3 py-2 align-top font-mono text-xs">
                  {r.status}
                </td>
                <td className="px-3 py-2 align-top">
                  <code className="font-mono text-[12px]">{r.type}</code>
                </td>
                <td className="px-3 py-2 align-top">{r.meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Common pitfalls</h2>
      <ul>
        <li>
          <strong>Trailing whitespace in the token.</strong> Copy-pasting
          from a terminal sometimes adds an invisible newline. The token
          will look right but auth will fail.
        </li>
        <li>
          <strong>Cookie-based auth.</strong> The API never reads cookies.
          A request that worked from your browser&apos;s logged-in session
          won&apos;t work from a script unless you&apos;re sending the Bearer
          token.
        </li>
        <li>
          <strong>URL-borne tokens.</strong> Reject by design. If your
          framework auto-stringifies an auth object into the URL, set the
          header explicitly.
        </li>
      </ul>
    </>
  );
}
