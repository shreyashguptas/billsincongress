# Project Overview

## Mission

The Congressional Bill Tracker makes Congress accessible to everyone by providing a user-friendly platform to browse, search, and track legislative bills.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, React 19, TypeScript |
| Backend | Convex (serverless functions + database) |
| Charts | Recharts |
| Styling | Tailwind CSS |
| Deployment | Vercel + Convex Cloud |

## Data Flow

```
Congress.gov API
       ↓
  Sync Cron Jobs (convex/crons.ts)
       ↓
  Congress API Functions (convex/congressApi.ts)
       ↓
  Mutations (convex/mutations.ts)
       ↓
  Convex Database (tables in convex/schema.ts)
       ↓
  Queries (convex/bills.ts)
       ↓
  Next.js Frontend
```

---

# Architecture

## Directory Structure

```
project/
├── app/                        # Next.js App Router
│   ├── page.tsx               # Homepage with dashboard
│   ├── bills/                 # Bills listing page
│   │   ├── [id]/             # Individual bill detail
│   │   └── page.tsx          # Bills list with filters
│   ├── learn/                 # Learn page with US map
│   ├── about/                 # About page
│   └── components/
│       └── dashboard/         # Dashboard components
│
├── components/               # Shared React components
│   ├── ui/                   # shadcn/ui components (button, card, input, select, etc.)
│   ├── bills/                # Bill-related components
│   └── navigation.tsx        # Site navigation
│
├── lib/                      # Client-side utilities
│   ├── services/             # Convex client wrappers
│   ├── types/                # TypeScript types
│   └── utils/                # Helper functions (cn, bill-stages)
│
├── convex/                   # Backend logic
│   ├── schema.ts             # Database schema
│   ├── bills.ts              # Query functions
│   ├── mutations.ts          # Data modification functions
│   ├── congressApi.ts        # Congress.gov API integration
│   ├── sync.ts               # Sync orchestration
│   └── crons.ts              # Scheduled jobs
│
└── Documentation/            # This folder
```

---

# Database Schema

## Core Tables

### `bills` - Main bill data

```typescript
{
  billId: string,           // Composite key: "1234hr119"
  congress: number,          // Congress number (108-119)
  billType: string,         // "hr", "s", "hjres", etc.
  billNumber: string,       // "1234"
  billTypeLabel: string,    // "H.R.", "S.", etc.
  title: string,            // Full bill title
  sponsorFirstName: string,
  sponsorLastName: string,
  sponsorParty: string,     // "R", "D", "I"
  sponsorState: string,     // Two-letter state code
  progressStage: number,    // 20, 40, 60, 80, 85, 90, 95, 100
  progressDescription: string,
}
```

**Indexes**: `by_billId`, `by_congress`, `by_congress_and_type`, `by_progress_stage`, `by_sponsor_state`

### Related Tables

| Table | Description |
|-------|-------------|
| `billActions` | Legislative actions on bills (one-to-many) |
| `billSubjects` | Policy areas/categories (one-to-one) |
| `billSummaries` | Bill summaries (one-to-many) |
| `billText` | PDF/text versions (one-to-many) |
| `billTitles` | Title variations (one-to-many) |

## Precomputed Tables

For performance, analytics data is precomputed during sync:

| Table | Purpose |
|-------|---------|
| `congressStats` | Aggregated stats per Congress |
| `congressPolicyAreas` | Bills grouped by policy area |
| `congressSponsors` | Bills grouped by sponsor |
| `syncSnapshots` | Audit trail for sync runs |
| `billChats` | Per-bill chat sessions keyed by (billId, sessionId) |
| `billChatMessages` | Individual chat turns (user + assistant) |

---

# Bill Chat Feature

## Overview

Each bill detail page includes a full **chat panel** powered by the NVIDIA Nemotron model via OpenRouter. Users can ask questions in natural language and have a multi-turn conversation — follow-up questions have full context from prior turns.

## Architecture

```
User types question (components/bills/bill-qa.tsx)
    ↓
billsService.sendChatMessage(billId, sessionId, question)
    ↓
Convex action: api.llm.sendChatMessage
    ↓
  1. Get/create billChats row for (billId, sessionId)
  2. Fetch prior turns from billChatMessages
  3. Save user message to billChatMessages
  4. Call OpenRouter API with:
       - system prompt (bill context)
       - full conversation history
       - current user question
  5. Save assistant response to billChatMessages
    ↓
Answer rendered as Markdown in the chat UI
```

## Session Persistence

Chat history is persisted per user **browser session** using an anonymous `sessionId` stored in `localStorage` (`bill_chat_session_id`). On every visit to a bill page the component:

1. Reads the session ID from `localStorage` (or creates one on first visit)
2. Queries `getBillChatHistory(billId, sessionId)` to restore prior messages
3. Displays the conversation thread; new messages are appended in real-time

Each browser retains its own private history per bill — there is no shared global chat.

## Convex Functions (`convex/llm.ts`)

| Function | Type | Purpose |
|----------|------|---------|
| `getBillChatHistory` | public query | Fetch chat history for a (billId, sessionId) |
| `sendChatMessage` | public action | Send a message and get AI response (persists both turns) |
| `getOrCreateBillChat` | internal mutation | Get or create a chat session row |
| `addChatMessage` | internal mutation | Append a message to a session |
| `getMessagesForChat` | internal query | Read all messages for a session |
| `askBillQuestion` | public action (legacy) | Single-turn Q&A (kept for backward compat) |

## Database Tables

### `billChats`
One row per (billId × sessionId) pair:
```typescript
{ billId: string, sessionId: string, createdAt: string }
```

### `billChatMessages`
One row per message turn:
```typescript
{ chatId: Id<"billChats">, role: "user" | "assistant", content: string, createdAt: string }
```

## LLM Prompt Strategy

The conversation history is passed to OpenRouter using the standard `messages` array format:

```
[system]   → bill metadata + instructions (rebuilt each request)
[user]     → first question
[assistant]→ first answer
[user]     → follow-up
...
[user]     → current question
```

This gives the model full context for coherent multi-turn answers.

## Testing the Chat Feature

1. Visit any bill detail page, e.g. `/bills/1hr119`
2. The chat panel is at the bottom — ask any question using the example chips or free text
3. Ask a follow-up that references the first answer (e.g. "Tell me more about that") — the model should maintain context
4. Reload the page — history should be restored from Convex
5. Open the same bill in a different browser/incognito — history should be empty (different session)

To inspect persisted chats in Convex dashboard:
- Table: `billChats` — one row per user session + bill
- Table: `billChatMessages` — all turns in order

---

# Convex Functions

## Queries (`convex/bills.ts`)

| Function | Purpose |
|----------|---------|
| `getById` | Get single bill with related data |
| `list` | List bills with filtering/pagination |
| `getCongressInfo` | Get current Congress number |
| `getCongressNumbers` | Get all available Congress numbers |
| `billCountsByCongress` | Homepage analytics |
| `latestCongressStatus` | Current Congress status breakdown |
| `getPolicyAreas` | All policy areas for filters |
| `getSyncStatus` | Latest sync status |
| `getCongressDashboard` | Full dashboard for specific Congress |

## Mutations (`convex/mutations.ts`)

| Function | Purpose |
|----------|---------|
| `upsertBill` | Insert or update a bill |
| `upsertBillActions` | Update bill actions |
| `upsertBillSubject` | Update policy area |
| `upsertBillSummary` | Update summaries |
| `upsertBillText` | Update text versions |
| `recomputeCongressStats` | Recompute stats for one Congress |
| `recomputeCongressPolicyAreas` | Recompute policy areas |
| `recomputeCongressSponsors` | Recompute sponsors |
| `deleteCongressBills` | Delete all bills for a specific Congress |

## AI Chat (`convex/llm.ts`)

| Function | Type | Purpose |
|----------|------|---------|
| `getBillChatHistory` | public query | Return persisted messages for a (billId, sessionId) |
| `sendChatMessage` | public action | Multi-turn chat with persistence |
| `askBillQuestion` | public action | Legacy single-turn Q&A |

## API Integration (`convex/congressApi.ts`)

| Function | Purpose |
|----------|---------|
| `incrementalSync` | Daily sync - only recently updated bills |
| `fullSync` | Weekly full sync |
| `repairIncompleteBills` | Fix bills with missing data |
| `recomputeAllStats` | Refresh all precomputed tables |
| `triggerRecomputeStats` | Public action to manually trigger stats recompute |
| `deleteCongress` | Public action to delete all bills for a Congress |

---

# Sync Process

## Scheduled Jobs (`convex/crons.ts`)

| Job | Schedule | Purpose |
|-----|----------|---------|
| `daily-incremental-sync` | Daily 1 AM UTC | Update recently changed bills |
| `weekly-full-sync` | Sunday 2 AM UTC | Full refresh of all bills |
| `weekly-repair-incomplete` | Wednesday 3 AM UTC | Fix missing data |
| `daily-recompute-stats` | Daily 4 AM UTC | Update all precomputed tables |

**Note**: The sync only pulls data for the **current Congress and previous 2 Congresses**. For 2026, this is Congress 117, 118, and 119.

## Sync Bitmask

The `syncedEndpoints` field tracks what data has been fetched:

```typescript
const SYNC_ENDPOINTS = {
  DETAIL: 1,    // Bill details
  ACTIONS: 2,   // Legislative actions
  SUBJECTS: 4,  // Policy areas
  SUMMARIES: 8, // Summaries
  TEXT: 16,     // Bill text
};
```

## Progress Stages

```typescript
const BILL_STAGES = {
  20: "Introduced",
  40: "In Committee",
  60: "Passed One Chamber",
  80: "Passed Both Chambers",
  85: "Vetoed",
  90: "To President",
  95: "Signed by President",
  100: "Became Law",
};
```

---

# Development Guidelines

## Adding a New Query

1. Add query function in `convex/bills.ts`
2. Use indexes for filtering - avoid full table scans
3. For analytics, use precomputed tables
4. Return data from frontend via `useQuery`

```typescript
// convex/bills.ts
export const myNewQuery = query({
  args: { congress: v.number() },
  handler: async (ctx, args) => {
    // Use indexes!
    const bills = await ctx.db
      .query("bills")
      .withIndex("by_congress", q => q.eq("congress", args.congress))
      .take(100);
    return bills;
  },
});
```

## Adding a New Mutation

1. Add mutation in `convex/mutations.ts`
2. Use `internalMutation` if called internally
3. Call via `useMutation` in frontend

```typescript
// convex/mutations.ts
export const myNewMutation = internalMutation({
  args: { billId: v.string(), data: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(/* ... */);
  },
});
```

## Adding a Precomputed Table

1. Add schema to `convex/schema.ts`
2. Create recompute mutation in `convex/mutations.ts`
3. Call recompute in `convex/congressApi.ts` during sync
4. Create query to read the table

See `interactive-dashboard.md` for detailed walkthrough.

## Performance Rules

| Rule | Why |
|------|-----|
| Always use indexes | Avoids full table scans |
| Use precomputed tables for analytics | Single lookups vs. aggregation |
| Limit query results | Use `.take(n)` for large tables |
| No cross-table joins in queries | Fetch related data in parallel |
| Cache expensive queries | Use Convex's built-in caching |

---

# Environment Variables

## Required

```env
# Production Convex only for this repo
CONVEX_DEPLOYMENT=prod:industrious-llama-331
NEXT_PUBLIC_CONVEX_URL=https://industrious-llama-331.convex.cloud

# Congress.gov API
CONGRESS_API_KEY=      # Get from https://api.congress.gov/sign-up/
```

Do not use `npx convex dev` for this project. Local frontend development should still point at the production Convex deployment.

## Optional

```env
# AI Bill Chat (required for chat feature)
OPENROUTER_API_KEY=   # Get from https://openrouter.ai/

# Analytics (if using Vercel)
NEXT_PUBLIC_ANALYTICS_ID=
```

---

# Deployment

## Production Deployments

| Service | URL | Managed by |
|---------|-----|------------|
| Frontend | billsincongress.com | Vercel |
| Backend | industrious-llama-331.convex.cloud | Convex |

## Deploying Changes

1. **Frontend changes**: Push to GitHub → Vercel auto-deploys
2. **Convex functions**: Run `npx convex deploy`
3. **Both**: Can be done together - changes are independent

```bash
# Deploy Convex functions
npx convex deploy
```

## Monitoring

- **Convex**: Check Convex dashboard for function logs
- **Vercel**: Check Vercel dashboard for deployment status

---

# Common Issues

## Query Timeouts

- You're doing a full table scan
- Switch to using precomputed tables
- Add proper indexes

## Data Not Showing

- Check if sync has run: `getSyncStatus` query
- Verify Congress number is correct (only 117, 118, 119 are pulled)
- Check browser console for errors
- Wait for 4 AM UTC cron job to run (recomputes stats)

## Extra/Unexpected Congress Showing

If a Congress appears with 0 bills (like Congress 108), it means:
1. The recompute process found no bills for that Congress
2. Wait for the next 4 AM UTC cron job to clean it up
3. Or manually delete using: `npx convex run --prod congressApi:deleteCongress '{"congress": 108}'`

## Production vs Development

- Always use production deployment: `CONVEX_DEPLOYMENT=prod:industrious-llama-331`
- Local development uses production database
- This avoids storing duplicate data and extra costs

## Build Errors

- Ensure Convex functions are deployed: `npx convex deploy`
- Check `.env.local` has correct variables
- Run `npm run build` locally to catch TypeScript errors

---

# Resources

- [Convex Docs](https://docs.convex.dev)
- [Congress.gov API](https://api.congress.gov/)
- [Next.js Docs](https://nextjs.org/docs)
- [Recharts](https://recharts.org/)
