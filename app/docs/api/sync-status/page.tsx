import type { Metadata } from "next";
import { EndpointPage } from "@/components/docs/endpoint-page";
import { ENDPOINTS } from "@/lib/openapi-spec";

export const metadata: Metadata = {
  title: "Sync status",
  description: "Last completed sync run — useful for staleness checks.",
};

export default function SyncStatusRefPage() {
  const ep = ENDPOINTS.find((e) => e.operationId === "getSyncStatus")!;
  return <EndpointPage endpoint={ep} examplePath="/sync-status" />;
}
