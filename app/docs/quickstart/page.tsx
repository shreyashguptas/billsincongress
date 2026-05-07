import Link from "next/link";
import type { Metadata } from "next";
import { CodeTabs } from "@/components/docs/code-tabs";
import { ResponseExample } from "@/components/docs/response-example";
import { buildSamples } from "@/lib/code-samples";

export const metadata: Metadata = {
  title: "Quickstart",
  description: "Five minutes from token to first request.",
};

export default function QuickstartPage() {
  const oneBill = buildSamples({
    method: "GET",
    path: "/bills/1234hr119",
  });
  const list = buildSamples({
    method: "GET",
    path: "/bills?congress=119&status=became_law&limit=5",
  });
  return (
    <>
      <p className="label-eyebrow">Quickstart</p>
      <h1 className="font-serif text-4xl font-semibold tracking-tight">
        Your first request, in five minutes.
      </h1>
      <p className="lead">
        You&apos;ll mint a token, send a request, and pick out a few fields
        from the response. After that, every other endpoint works the same
        way.
      </p>

      <h2>1. Create a token</h2>
      <p>
        <Link href="/sign-in">Sign in</Link> if you haven&apos;t already, then
        head to <Link href="/account">your account page</Link> and click{" "}
        <strong>Create API token</strong>. Pick a name you&apos;ll recognize
        later (we suggest the project the token is for) and an expiry. We
        default to one year; pick <em>Never</em> if you&apos;re sure.
      </p>
      <p>
        After verifying it&apos;s you (we email a 6-digit code to your
        account address; OAuth users skip this), the token will appear once.
        <strong> Copy it.</strong> If you lose it, you&apos;ll need to make a
        new one.
      </p>
      <pre>
        <code>{`# Save the token to an environment variable so you never paste
# it into a script you'll commit later by accident.
export BIC_TOKEN="bic_live_..."`}</code>
      </pre>

      <h2>2. Fetch one bill</h2>
      <p>
        Every bill has a composite ID of the form{" "}
        <code>{"{number}{type}{congress}"}</code> — for example{" "}
        <code>1234hr119</code> is H.R. 1234 of the 119th Congress.
      </p>
      <div className="not-prose">
        <CodeTabs samples={oneBill} />
      </div>

      <p>The response looks like this:</p>
      <div className="not-prose">
        <ResponseExample
          value={{
            data: {
              bill_id: "1234hr119",
              congress: 119,
              bill_type: "hr",
              bill_number: "1234",
              title: "Example Bill Title Act of 2025",
              status: "in_committee",
              sponsor: {
                first_name: "Jane",
                last_name: "Doe",
                party: "D",
                state: "CA",
              },
              policy_area: "Health",
            },
            meta: { request_id: "req_…" },
          }}
        />
      </div>

      <h2>3. List, filter, paginate</h2>
      <p>
        Most things you&apos;ll want to do start at <code>GET /bills</code>.
        Add filters as query params; pass{" "}
        <code>cursor</code> from the previous response&apos;s{" "}
        <code>pagination.next_cursor</code> to keep going.
      </p>
      <div className="not-prose">
        <CodeTabs samples={list} />
      </div>

      <h2>4. What to read next</h2>
      <ul>
        <li>
          <Link href="/docs/authentication">Authentication</Link> — keeping
          your token safe, rotating, revoking.
        </li>
        <li>
          <Link href="/docs/rate-limits">Rate limits</Link> — what 429 means
          and the right way to retry.
        </li>
        <li>
          <Link href="/docs/api/bills">Bills reference</Link> — every
          parameter you can pass.
        </li>
      </ul>
    </>
  );
}
