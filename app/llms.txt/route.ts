// llms.txt — convention from llmstxt.org. A plaintext, machine-readable
// summary of the API, intended to help LLM-powered code editors and agents
// (Cursor, Claude, Copilot, etc.) suggest correct usage out of the box.
//
// Lives at https://billsincongress.com/llms.txt.

const BODY = `# Bills.Congress

A read-only public REST API for bills, sponsors, actions, summaries, and
text from the United States Congress. Powers billsincongress.com.

## Base URL

https://billsincongress.com/api/v1

## Authentication

Bearer tokens minted at https://billsincongress.com/account.
Send as: Authorization: Bearer bic_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

## Endpoints

GET /bills
GET /bills/{bill_id}
GET /bills/{bill_id}/actions
GET /bills/{bill_id}/summaries
GET /bills/{bill_id}/text
GET /bills/{bill_id}/titles
GET /congresses
GET /congresses/{congress}
GET /congresses/{congress}/chambers/{house|senate}
GET /policy-areas
GET /sponsors
GET /sync-status

## Filters on /bills

congress, status, bill_type, sponsor_state, policy_area, bill_number,
sponsor (comma-separated full names), q (free-text title), introduced_after,
last_action_after, limit, cursor.

## Status values

introduced, in_committee, passed_one_chamber, passed_both_chambers,
vetoed, to_president, signed, became_law.

## Bill ID format

Composite "{number}{type}{congress}" — e.g. "1234hr119".

## Rate limits

1000 requests/hour and 10000 requests/day per token, plus 100/min per IP.

## Response shape

Success: { data, pagination?, meta: { request_id } }
Error:   { error: { type, message, docs_url, retry_after_seconds? }, meta }

## OpenAPI spec

https://billsincongress.com/api/v1/openapi.json

## Docs

https://billsincongress.com/docs
`;

export function GET() {
  return new Response(BODY, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
