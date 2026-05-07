import { NextResponse } from "next/server";
import { applyCors, preflight } from "../_shared";
import { buildOpenApiSpec } from "@/lib/openapi-spec";


export async function OPTIONS() {
  return preflight();
}

export async function GET() {
  const spec = buildOpenApiSpec();
  return applyCors(
    NextResponse.json(spec, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    }),
  );
}
