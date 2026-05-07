import type { Metadata } from "next";
import { EndpointPage } from "@/components/docs/endpoint-page";
import { ENDPOINTS } from "@/lib/openapi-spec";

export const metadata: Metadata = {
  title: "Policy areas",
  description: "Distinct policy area names — use as the policy_area filter.",
};

export default function PolicyAreasRefPage() {
  const ep = ENDPOINTS.find((e) => e.operationId === "listPolicyAreas")!;
  return <EndpointPage endpoint={ep} examplePath="/policy-areas" />;
}
