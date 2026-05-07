import Link from "next/link";
import type { Metadata } from "next";
import { ResponseExample } from "@/components/docs/response-example";

export const metadata: Metadata = {
  title: "Pagination",
  description:
    "Cursor-based pagination, with a single next_cursor and has_more flag.",
};

export default function PaginationPage() {
  return (
    <>
      <p className="label-eyebrow">Reference</p>
      <h1 className="font-serif text-4xl font-semibold tracking-tight">
        Pagination
      </h1>
      <p className="lead">
        Endpoints that return lists are paginated with a cursor. You read{" "}
        <code>pagination.next_cursor</code> from the response and pass it
        as the <code>cursor</code> query parameter on the next request.
        Stop when <code>has_more</code> is <code>false</code>.
      </p>

      <h2>Shape</h2>
      <div className="not-prose">
        <ResponseExample
          value={{
            data: ["… items …"],
            pagination: {
              next_cursor: "eyJvIjoyNX0",
              has_more: true,
            },
            meta: { request_id: "req_…" },
          }}
        />
      </div>

      <h2>Looping safely</h2>
      <p>
        Two reasonable patterns; pick whichever your code reads cleaner in.
      </p>
      <pre>
        <code>{`# Python
cursor = None
while True:
    params = {"limit": 50}
    if cursor:
        params["cursor"] = cursor
    res = requests.get(url, headers=auth, params=params).json()
    for bill in res["data"]:
        process(bill)
    if not res["pagination"]["has_more"]:
        break
    cursor = res["pagination"]["next_cursor"]`}</code>
      </pre>

      <h2>Limits</h2>
      <ul>
        <li>
          <code>limit</code> can be 1 to 50 on{" "}
          <Link href="/docs/api/bills"><code>/bills</code></Link>; the
          default is 25.
        </li>
        <li>
          We cap total offset at 500 to keep latency predictable. If
          you&apos;re paginating past that you&apos;re probably better off
          adding filters — by congress, status, or sponsor.
        </li>
        <li>
          The cursor is opaque. Treat it as a string; don&apos;t parse or
          generate it. (Today it&apos;s base64url-encoded JSON; that may
          change.)
        </li>
      </ul>
    </>
  );
}
