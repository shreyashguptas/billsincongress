import Link from "next/link";
import type { Metadata } from "next";
import { EndpointPage } from "@/components/docs/endpoint-page";
import { ENDPOINTS } from "@/lib/openapi-spec";

export const metadata: Metadata = {
  title: "Bills",
  description: "List bills with filters by status, sponsor, congress, policy area, and free-text title.",
};

export default function BillsRefPage() {
  const list = ENDPOINTS.find((e) => e.operationId === "listBills")!;
  const one = ENDPOINTS.find((e) => e.operationId === "getBill")!;
  const actions = ENDPOINTS.find((e) => e.operationId === "listBillActions")!;
  const summaries = ENDPOINTS.find(
    (e) => e.operationId === "listBillSummaries",
  )!;
  const text = ENDPOINTS.find((e) => e.operationId === "listBillText")!;
  const titles = ENDPOINTS.find((e) => e.operationId === "listBillTitles")!;
  return (
    <>
      <EndpointPage
        endpoint={list}
        examplePath="/bills?congress=119&status=in_committee&limit=10"
        description={
          <p id="status">
            <a href="#status" className="anchor" />
            Bills are filtered with query parameters and paginated with
            cursors. See{" "}
            <Link href="/docs/pagination">pagination</Link> for the full
            cursor protocol. The <code>status</code> values are listed in
            the parameters table — they map to the same internal stages
            you see on the website&apos;s status chart.
          </p>
        }
      />

      <hr className="my-12" />

      <EndpointPage
        endpoint={one}
        examplePath="/bills/1234hr119"
        description={
          <p>
            The <code>bill_id</code> is the same composite ID used in the
            URL of every bill page on the site (e.g.{" "}
            <code>billsincongress.com/bills/1234hr119</code>).
          </p>
        }
      />

      <hr className="my-12" />

      <EndpointPage
        endpoint={actions}
        examplePath="/bills/1234hr119/actions?limit=20"
      />

      <hr className="my-12" />

      <EndpointPage
        endpoint={summaries}
        examplePath="/bills/1234hr119/summaries"
      />

      <hr className="my-12" />

      <EndpointPage
        endpoint={text}
        examplePath="/bills/1234hr119/text"
      />

      <hr className="my-12" />

      <EndpointPage
        endpoint={titles}
        examplePath="/bills/1234hr119/titles"
      />
    </>
  );
}
