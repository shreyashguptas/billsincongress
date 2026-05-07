/**
 * OpenAPI 3.1 spec for the Bills.Congress public API.
 *
 * This is the single source of truth used by:
 *  - GET /api/v1/openapi.json  (machine-readable, served to customers)
 *  - The /docs/api/* reference pages (build-time read; renders param tables
 *    and example responses from this same object)
 *  - Code sample generation (curl, JS, Python, Go, Ruby, PHP, Rust, Java)
 *
 * If you add a new endpoint, add it here and the docs + code samples will
 * pick it up automatically.
 */

export const API_BASE_URL = "https://billsincongress.com/api/v1";

export type ApiParameter = {
  name: string;
  in: "path" | "query";
  required?: boolean;
  description: string;
  schema: { type: string; enum?: string[]; example?: unknown };
};

export type ApiEndpoint = {
  method: "GET";
  path: string;
  operationId: string;
  summary: string;
  description: string;
  parameters?: ApiParameter[];
  exampleResponse: unknown;
};

export const ENDPOINTS: ApiEndpoint[] = [
  {
    method: "GET",
    path: "/bills",
    operationId: "listBills",
    summary: "List bills",
    description:
      "Returns a paginated list of bills with optional filtering by status, sponsor, congress, policy area, and free-text title.",
    parameters: [
      {
        name: "limit",
        in: "query",
        description: "Number of results per page. Default 25, max 50.",
        schema: { type: "integer", example: 25 },
      },
      {
        name: "cursor",
        in: "query",
        description:
          "Opaque pagination cursor returned in `pagination.next_cursor` of the previous response.",
        schema: { type: "string" },
      },
      {
        name: "congress",
        in: "query",
        description:
          "Restrict to a specific congress number (e.g. 119). Defaults to the latest.",
        schema: { type: "integer", example: 119 },
      },
      {
        name: "status",
        in: "query",
        description:
          "Filter by bill status. One of: `introduced`, `in_committee`, `passed_one_chamber`, `passed_both_chambers`, `vetoed`, `to_president`, `signed`, `became_law`.",
        schema: {
          type: "string",
          enum: [
            "introduced",
            "in_committee",
            "passed_one_chamber",
            "passed_both_chambers",
            "vetoed",
            "to_president",
            "signed",
            "became_law",
          ],
        },
      },
      {
        name: "sponsor_state",
        in: "query",
        description: "Two-letter state code (e.g. `CA`).",
        schema: { type: "string", example: "CA" },
      },
      {
        name: "bill_type",
        in: "query",
        description:
          "Bill type code: `hr`, `s`, `hjres`, `sjres`, `hconres`, `sconres`, `hres`, `sres`.",
        schema: { type: "string", example: "hr" },
      },
      {
        name: "policy_area",
        in: "query",
        description:
          "Exact policy area name (e.g. `Health`). Use `/policy-areas` to discover values.",
        schema: { type: "string" },
      },
      {
        name: "bill_number",
        in: "query",
        description: "Filter by exact bill number string.",
        schema: { type: "string" },
      },
      {
        name: "q",
        in: "query",
        description:
          "Free-text title filter. Matches if every word appears in the title.",
        schema: { type: "string" },
      },
      {
        name: "sponsor",
        in: "query",
        description:
          "Comma-separated list of sponsor full names (`First Last`). Up to 10.",
        schema: { type: "string" },
      },
      {
        name: "introduced_after",
        in: "query",
        description:
          "Time window: `week`, `month`, `3months`, `6months`, `year`, or `all`.",
        schema: {
          type: "string",
          enum: ["week", "month", "3months", "6months", "year", "all"],
        },
      },
      {
        name: "last_action_after",
        in: "query",
        description:
          "Time window for last action date: same values as `introduced_after`.",
        schema: {
          type: "string",
          enum: ["week", "month", "3months", "6months", "year", "all"],
        },
      },
    ],
    exampleResponse: {
      data: [
        {
          bill_id: "1234hr119",
          congress: 119,
          bill_type: "hr",
          bill_number: "1234",
          bill_type_label: "H.R.",
          title: "Example Bill Title Act of 2025",
          title_without_number: "Example Bill Title Act of 2025",
          introduced_date: "2025-03-04",
          latest_action_date: "2025-04-12",
          status: "in_committee",
          status_stage: 40,
          status_description: "In Committee",
          sponsor: {
            first_name: "Jane",
            last_name: "Doe",
            party: "D",
            state: "CA",
          },
          policy_area: "Health",
          latest_summary: null,
          pdf_url: null,
          updated_at: "2025-04-13T08:00:00.000Z",
        },
      ],
      pagination: {
        next_cursor: "eyJvIjoyNX0",
        has_more: true,
      },
      meta: { request_id: "req_d4f1…" },
    },
  },
  {
    method: "GET",
    path: "/bills/{bill_id}",
    operationId: "getBill",
    summary: "Get one bill",
    description:
      "Returns a single bill, including its policy area, the latest summary text, and the PDF link if available.",
    parameters: [
      {
        name: "bill_id",
        in: "path",
        required: true,
        description:
          "Composite bill identifier `{number}{type}{congress}` — e.g. `1234hr119`.",
        schema: { type: "string", example: "1234hr119" },
      },
    ],
    exampleResponse: {
      data: {
        bill_id: "1234hr119",
        congress: 119,
        bill_type: "hr",
        bill_number: "1234",
        bill_type_label: "H.R.",
        title: "Example Bill Title Act of 2025",
        title_without_number: "Example Bill Title Act of 2025",
        introduced_date: "2025-03-04",
        latest_action_date: "2025-04-12",
        status: "in_committee",
        status_stage: 40,
        status_description: "In Committee",
        sponsor: {
          first_name: "Jane",
          last_name: "Doe",
          party: "D",
          state: "CA",
        },
        policy_area: "Health",
        latest_summary: "This bill would …",
        pdf_url: "https://www.congress.gov/…/text.pdf",
        updated_at: "2025-04-13T08:00:00.000Z",
      },
      meta: { request_id: "req_…" },
    },
  },
  {
    method: "GET",
    path: "/bills/{bill_id}/actions",
    operationId: "listBillActions",
    summary: "List bill actions",
    description:
      "Chronological action history (introduction, committee referrals, votes, amendments, etc.) newest first.",
    parameters: [
      {
        name: "bill_id",
        in: "path",
        required: true,
        description: "Composite bill identifier.",
        schema: { type: "string", example: "1234hr119" },
      },
      {
        name: "limit",
        in: "query",
        description: "Default 100, max 500.",
        schema: { type: "integer", example: 100 },
      },
    ],
    exampleResponse: {
      data: [
        {
          action_date: "2025-04-12",
          text: "Referred to the Subcommittee on Health.",
          action_code: "H11100",
          type: "Committee",
          source_system_name: "House",
          source_system_code: 2,
        },
      ],
      meta: { request_id: "req_…" },
    },
  },
  {
    method: "GET",
    path: "/bills/{bill_id}/summaries",
    operationId: "listBillSummaries",
    summary: "List bill summaries",
    description:
      "All available CRS summaries for the bill, newest first by update date.",
    parameters: [
      {
        name: "bill_id",
        in: "path",
        required: true,
        description: "Composite bill identifier.",
        schema: { type: "string", example: "1234hr119" },
      },
      {
        name: "limit",
        in: "query",
        description: "Default 25, max 200.",
        schema: { type: "integer", example: 25 },
      },
    ],
    exampleResponse: {
      data: [
        {
          action_date: "2025-03-04",
          action_desc: "Introduced in House",
          version_code: "00",
          update_date: "2025-03-05",
          text: "This bill would …",
        },
      ],
      meta: { request_id: "req_…" },
    },
  },
  {
    method: "GET",
    path: "/bills/{bill_id}/text",
    operationId: "listBillText",
    summary: "List bill text versions",
    description:
      "All published text versions of the bill with TXT and PDF download URLs.",
    parameters: [
      {
        name: "bill_id",
        in: "path",
        required: true,
        description: "Composite bill identifier.",
        schema: { type: "string", example: "1234hr119" },
      },
      {
        name: "limit",
        in: "query",
        description: "Default 25, max 200.",
        schema: { type: "integer", example: 25 },
      },
    ],
    exampleResponse: {
      data: [
        {
          date: "2025-03-04",
          type: "Introduced in House",
          formats_url_txt: "https://www.congress.gov/…/text",
          formats_url_pdf: "https://www.congress.gov/…/text.pdf",
        },
      ],
      meta: { request_id: "req_…" },
    },
  },
  {
    method: "GET",
    path: "/bills/{bill_id}/titles",
    operationId: "listBillTitles",
    summary: "List bill title variants",
    description:
      "Alternate titles for the bill — short titles, official titles, popular titles.",
    parameters: [
      {
        name: "bill_id",
        in: "path",
        required: true,
        description: "Composite bill identifier.",
        schema: { type: "string", example: "1234hr119" },
      },
      {
        name: "limit",
        in: "query",
        description: "Default 25, max 200.",
        schema: { type: "integer", example: 25 },
      },
    ],
    exampleResponse: {
      data: [
        {
          title: "Example Bill Title Act of 2025",
          title_type: "Short Titles as Introduced",
          title_type_code: 6,
          update_date: "2025-03-05",
          bill_text_version_code: "IH",
          bill_text_version_name: "Introduced in House",
          chamber_code: "H",
          chamber_name: "House",
        },
      ],
      meta: { request_id: "req_…" },
    },
  },
  {
    method: "GET",
    path: "/congresses",
    operationId: "listCongresses",
    summary: "List all congresses",
    description:
      "Returns every congress for which we have data, with chamber + status breakdowns.",
    exampleResponse: {
      data: [
        {
          congress: 119,
          total_count: 19342,
          house_count: 12013,
          senate_count: 7329,
          stage_counts: [
            { stage: 20, description: "Introduced", count: 11210 },
          ],
          updated_at: "2025-04-13T08:00:00.000Z",
        },
      ],
      meta: { request_id: "req_…" },
    },
  },
  {
    method: "GET",
    path: "/congresses/{congress}",
    operationId: "getCongressDashboard",
    summary: "Get a congress dashboard",
    description:
      "Aggregated stats for one congress: chamber counts, status breakdown, top sponsors, top policy areas.",
    parameters: [
      {
        name: "congress",
        in: "path",
        required: true,
        description: "Congress number, e.g. 119.",
        schema: { type: "integer", example: 119 },
      },
    ],
    exampleResponse: {
      data: {
        congress: 119,
        total_bills: 19342,
        house_count: 12013,
        senate_count: 7329,
        status_breakdown: {
          introduced: 11210,
          inCommittee: 4012,
          becameLaw: 47,
        },
        top_sponsors: [
          { name: "Jane Doe", count: 78, party: "D", state: "CA" },
        ],
        top_policy_areas: [{ name: "Health", count: 1432 }],
      },
      meta: { request_id: "req_…" },
    },
  },
  {
    method: "GET",
    path: "/congresses/{congress}/chambers/{chamber}",
    operationId: "getChamberBreakdown",
    summary: "Get chamber breakdown",
    description:
      "Party / state / monthly breakdown for one chamber of one congress.",
    parameters: [
      {
        name: "congress",
        in: "path",
        required: true,
        description: "Congress number.",
        schema: { type: "integer", example: 119 },
      },
      {
        name: "chamber",
        in: "path",
        required: true,
        description: "`house` or `senate`.",
        schema: { type: "string", enum: ["house", "senate"] },
      },
    ],
    exampleResponse: {
      data: {
        congress: 119,
        chamber: "house",
        total: 12013,
        party_counts: { D: 5512, R: 6480, I: 11, U: 10 },
        party_law_counts: { D: 21, R: 26, I: 0, U: 0 },
        state_counts: { CA: 832, TX: 614 },
        monthly: [{ month: "2025-01", count: 1432, became_law: 0 }],
      },
      meta: { request_id: "req_…" },
    },
  },
  {
    method: "GET",
    path: "/policy-areas",
    operationId: "listPolicyAreas",
    summary: "List all policy areas",
    description:
      "Distinct policy area names across all congresses. Use these as the `policy_area` filter on `/bills`.",
    exampleResponse: {
      data: [{ name: "Agriculture and Food" }, { name: "Health" }],
      meta: { request_id: "req_…" },
    },
  },
  {
    method: "GET",
    path: "/sponsors",
    operationId: "listSponsors",
    summary: "List all sponsors",
    description:
      "Every sponsor across every congress, deduplicated by full name. Use the `name` field as the `sponsor` filter on `/bills`.",
    exampleResponse: {
      data: [
        { name: "Jane Doe", party: "D", state: "CA", bill_count: 78 },
      ],
      meta: { request_id: "req_…" },
    },
  },
  {
    method: "GET",
    path: "/sync-status",
    operationId: "getSyncStatus",
    summary: "Last sync status",
    description:
      "Returns the most recent completed sync run. Useful for cache invalidation or staleness checks.",
    exampleResponse: {
      data: {
        sync_type: "daily",
        completed_at: "2026-05-07T01:14:32.000Z",
        total_processed: 432,
        total_success: 432,
        total_failed: 0,
      },
      meta: { request_id: "req_…" },
    },
  },
];

export function buildOpenApiSpec(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const ep of ENDPOINTS) {
    paths[ep.path] = paths[ep.path] ?? {};
    paths[ep.path][ep.method.toLowerCase()] = {
      operationId: ep.operationId,
      summary: ep.summary,
      description: ep.description,
      parameters: (ep.parameters ?? []).map((p) => ({
        name: p.name,
        in: p.in,
        required: p.required ?? p.in === "path",
        description: p.description,
        schema: p.schema,
      })),
      security: [{ bearerAuth: [] }],
      responses: {
        "200": {
          description: "Success",
          content: {
            "application/json": {
              example: ep.exampleResponse,
            },
          },
        },
        "401": { $ref: "#/components/responses/Unauthorized" },
        "404": { $ref: "#/components/responses/NotFound" },
        "429": { $ref: "#/components/responses/RateLimited" },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Bills.Congress API",
      version: "1.0.0",
      description:
        "Read-only access to the same data that powers billsincongress.com — bills, sponsors, actions, summaries, text, congresses.",
      contact: { url: "https://billsincongress.com/docs" },
    },
    servers: [{ url: API_BASE_URL }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "bic_live_…",
        },
      },
      responses: {
        Unauthorized: {
          description: "Missing, invalid, or revoked token.",
          content: {
            "application/json": {
              example: {
                error: {
                  type: "invalid_token",
                  message: "Token is invalid, revoked, or expired.",
                  docs_url:
                    "https://billsincongress.com/docs/authentication",
                },
              },
            },
          },
        },
        NotFound: {
          description: "Resource not found.",
          content: {
            "application/json": {
              example: {
                error: {
                  type: "not_found",
                  message: "Bill not found.",
                  docs_url: "https://billsincongress.com/docs/errors",
                },
              },
            },
          },
        },
        RateLimited: {
          description: "Hourly or daily request limit exceeded.",
          content: {
            "application/json": {
              example: {
                error: {
                  type: "rate_limit_exceeded",
                  message:
                    "You've exceeded your hourly request limit (1000/hour).",
                  retry_after_seconds: 412,
                  docs_url: "https://billsincongress.com/docs/rate-limits",
                },
              },
            },
          },
        },
      },
    },
    paths,
  };
}
