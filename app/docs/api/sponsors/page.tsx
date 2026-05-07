import type { Metadata } from "next";
import { EndpointPage } from "@/components/docs/endpoint-page";
import { ENDPOINTS } from "@/lib/openapi-spec";

export const metadata: Metadata = {
  title: "Sponsors",
  description: "Every sponsor across every congress, deduplicated by full name.",
};

export default function SponsorsRefPage() {
  const ep = ENDPOINTS.find((e) => e.operationId === "listSponsors")!;
  return <EndpointPage endpoint={ep} examplePath="/sponsors" />;
}
