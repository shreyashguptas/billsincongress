import type { Metadata } from "next";
import { EndpointPage } from "@/components/docs/endpoint-page";
import { ENDPOINTS } from "@/lib/openapi-spec";

export const metadata: Metadata = {
  title: "Congresses",
  description: "Per-congress overviews, dashboards, and chamber breakdowns.",
};

export default function CongressesRefPage() {
  const list = ENDPOINTS.find((e) => e.operationId === "listCongresses")!;
  const one = ENDPOINTS.find(
    (e) => e.operationId === "getCongressDashboard",
  )!;
  const chamber = ENDPOINTS.find(
    (e) => e.operationId === "getChamberBreakdown",
  )!;
  return (
    <>
      <EndpointPage endpoint={list} examplePath="/congresses" />
      <hr className="my-12" />
      <EndpointPage endpoint={one} examplePath="/congresses/119" />
      <hr className="my-12" />
      <EndpointPage
        endpoint={chamber}
        examplePath="/congresses/119/chambers/house"
      />
    </>
  );
}
