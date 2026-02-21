# Interactive Dashboard & Precomputed Analytics

## Overview

This document describes the interactive Congress dashboard implemented in the main branch, including the frontend components and the precomputed analytics approach using Convex.

## The Problem

The original homepage used simple bar charts with limited interactivity. The goal was to create a Power BI-style interactive dashboard that:
- Shows comprehensive Congress statistics at a glance
- Allows drilling down into specific metrics
- Works with production data (current and previous 2 congresses)
- Remains fast and cost-effective

## The Solution: Precomputed Tables

Instead of running expensive queries on every page load, we use **precomputed tables** that are updated during the existing daily sync. This is the industry-standard approach for analytics dashboards.

### Why This Works

1. **Cost-efficient**: Reads are nearly free (single document lookups)
2. **Fast**: No complex queries or full table scans
3. **Scalable**: Works regardless of data size
4. **Maintained**: Updates automatically during sync

## Precomputed Tables

### 1. `congressStats`

This table stores aggregated stats per Congress:

```typescript
// Schema (from convex/schema.ts)
congressStats: defineTable({
  congress: v.number(),
  totalCount: v.number(),
  houseCount: v.number(),
  senateCount: v.number(),
  stageCounts: v.array(v.object({
    stage: v.number(),
    description: v.string(),
    count: v.number(),
  })),
  updatedAt: v.string(),
}).withIndex("by_congress")
```

**Updated by**: `recomputeCongressStats` mutation in `convex/mutations.ts`

### 2. `congressPolicyAreas`

Stores bills grouped by policy area for each Congress:

```typescript
congressPolicyAreas: defineTable({
  congress: v.number(),
  policyAreaName: v.string(),
  count: v.number(),
}).withIndex("by_congress", ["congress"])
   .withIndex("by_congress_and_count", ["congress", "count"])
```

**Updated by**: `recomputeCongressPolicyAreas` mutation

### 3. `congressSponsors`

Stores top sponsors per Congress:

```typescript
congressSponsors: defineTable({
  congress: v.number(),
  sponsorName: v.string(),
  sponsorParty: v.optional(v.string()),
  sponsorState: v.optional(v.string()),
  billCount: v.number(),
}).withIndex("by_congress", ["congress"])
   .withIndex("by_congress_and_count", ["congress", "billCount"])
```

**Updated by**: `recomputeCongressSponsors` mutation

## Convex Queries

### Existing Queries (Fast - Use Precomputed Tables)

```typescript
// Get all congress overview - reads congressStats table
export const getAllCongressOverview = query({
  handler: async (ctx) => {
    const stats = await ctx.db.query("congressStats").collect();
    return stats.sort((a, b) => a.congress - b.congress);
  },
});

// Get dashboard for specific congress - single indexed lookup
export const getCongressDashboard = query({
  args: { congress: v.number() },
  handler: async (ctx, args) => {
    const stats = await ctx.db
      .query("congressStats")
      .withIndex("by_congress", (q) => q.eq("congress", args.congress))
      .first();
    // Return precomputed data
  },
});
```

### Queries to Avoid (Slow - Full Table Scans)

```typescript
// BAD - times out with 38,000+ bills
export const getCongressDashboard = query({
  handler: async (ctx) => {
    const bills = await ctx.db.query("bills").collect(); // NEVER DO THIS
    // Process all bills...
  },
});
```

## Frontend Implementation

### File Structure

```
app/
├── components/
│   └── dashboard/
│       └── DashboardClient.tsx    # Main dashboard component
├── page.tsx                       # Homepage (wraps dashboard)
└── globals.css                    # Design system
```

### Design System

**Typography**:
- Headings: Playfair Display (serif, editorial feel)
- Body: Source Sans 3 (clean, readable)

**Color Palette**:
```css
--congress-navy-950: #0a1628  /* Background */
--congress-navy-800: #1e3a5f  /* Cards */
--congress-gold-500: #c9a227   /* Accents */
--congress-crimson-500: #9b1b30 /* Highlights */
```

### Dashboard Features

1. **Congress Selector**: Pill buttons to switch between Congresses
2. **Stats Overview Cards**: Total Bills, House, Senate, Became Law
3. **Status Donut Chart**: Visual breakdown of bill stages
4. **Historical Comparison**: Bar chart comparing all Congresses

### Drill-Down Navigation

Clicking any chart element navigates to `/bills` with filters:
```typescript
router.push(`/bills?congress=${congress}&status=${statusCode}`);
```

## How to Add New Dashboard Features

### Option 1: Use Existing Data (Fastest)

If the data exists in `congressStats`, just query it:

```typescript
export const getNewMetric = query({
  handler: async (ctx) => {
    const stats = await ctx.db
      .query("congressStats")
      .withIndex("by_congress", (q) => q.eq("congress", 119))
      .first();
    return stats; // Use precomputed data
  },
});
```

### Option 2: Add New Precomputed Table

1. Add schema to `convex/schema.ts`
2. Add recompute mutation to `convex/mutations.ts`
3. Call mutation during sync in `convex/congressApi.ts`
4. Create query to read the table

### Option 3: Limited Query (If Necessary)

If you must query bills directly, use strict limits:

```typescript
const bills = await ctx.db
  .query("bills")
  .withIndex("by_congress", (q) => q.eq("congress", args.congress))
  .take(1000); // NEVER exceed 5000
```

## Performance Guidelines

| Query Type | Example | Acceptable? |
|------------|---------|-------------|
| Single row lookup | `getCongressStats(119)` | ✅ Yes |
| Collection (small) | `getAllCongressNumbers()` | ✅ Yes |
| Collection + filter | `bills.take(100)` | ⚠️ Careful |
| Full collection | `bills.collect()` | ❌ No |
| Cross-table joins | Multiple full collections | ❌ Never |

## Deployment

The dashboard is part of the main branch. To run locally:

```bash
npm run dev
```

The Convex functions are deployed to production:
```
CONVEX_DEPLOYMENT=prod:industrious-llama-331
NEXT_PUBLIC_CONVEX_URL=https://industrious-llama-331.convex.cloud
```

## Cron Jobs & Data Updates

### Scheduled Jobs (in `convex/crons.ts`)

| Job | Schedule | Purpose |
|-----|----------|---------|
| `daily-incremental-sync` | Daily 1 AM UTC | Update recently changed bills |
| `weekly-full-sync` | Sunday 2 AM UTC | Full refresh of all bills |
| `weekly-repair-incomplete` | Wednesday 3 AM UTC | Fix missing data |
| `daily-recompute-stats` | Daily 4 AM UTC | Update all precomputed tables |

### How Data is Pulled

The sync process only pulls data for the **current Congress and the previous 2 Congresses**:

```typescript
// In congressApi.ts - initialHistoricalPull and dailySync
const currentCongress = Math.floor((currentYear - 1789) / 2) + 1;
const congressesToSync = [
  currentCongress,        // e.g., 119 (2025-2027)
  currentCongress - 1,    // e.g., 118 (2023-2025)
  currentCongress - 2,    // e.g., 117 (2021-2023)
];
```

For 2026, this means Congress 117, 118, and 119 are synced.

### Recompute Process

The `recomputeAllStats` action runs at 4 AM UTC and:
1. Loops through congresses 93-120 to find which have data
2. Only creates `congressStats` entries for congresses that have actual bills
3. Skips empty congresses (no remnant rows)

### Manual Actions

Two public actions are available for manual control:

1. **triggerRecomputeStats** - Forces a recompute of all stats:
   ```bash
   npx convex run --prod congressApi:triggerRecomputeStats '{}'
   ```

2. **deleteCongress** - Deletes all bills for a specific congress:
   ```bash
   npx convex run --prod congressApi:deleteCongress '{"congress": 108}'
   ```

## Future Enhancements

1. **Add precomputed tables** for policy areas, sponsors, states
2. **Timeline metrics** - track average days from introduced to law
3. **Sponsor leaderboard** - show top bill sponsors
4. **Policy area charts** - visualize bill topics
5. **Interactive tooltips** - hover for more details

## Troubleshooting

### Query Timeout
- You're likely doing a full table scan
- Switch to using precomputed `convexStats` table
- Or add a new precomputed table

### Data Not Showing
- Check if `congressStats` has data for that Congress
- Verify the sync has run and recomputed stats

### Build Errors
- Ensure Convex functions are deployed: `npx convex deploy`
- Check `.env.local` has correct `CONVEX_DEPLOYMENT`
