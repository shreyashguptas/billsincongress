import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  // ─── Auth + billing ─────────────────────────────────────────────────────────
  // `authTables` provides: authAccounts, authSessions, authRefreshTokens,
  // authVerificationCodes, authRateLimits. We override `users` below to add
  // app-managed billing columns alongside the auth-managed identity fields.
  ...authTables,

  users: defineTable({
    // Auth-managed (mirrors authTables.users shape so the library can write here)
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),

    // App-managed billing. `plan` is optional in the schema because the
    // @convex-dev/auth library inserts new users with only the auth fields
    // (email/name/image) — it doesn't know about our app fields. Anywhere we
    // read `plan`, treat undefined as "free". The `requirePro` helper checks
    // for === "pro" so undefined is correctly excluded from Pro access.
    plan: v.optional(v.union(v.literal("free"), v.literal("pro"))),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    stripeSubscriptionStatus: v.optional(
      v.union(
        v.literal("active"),
        v.literal("trialing"),
        v.literal("past_due"),
        v.literal("canceled"),
        v.literal("incomplete"),
        v.literal("incomplete_expired"),
        v.literal("unpaid"),
        v.literal("paused"),
      ),
    ),
    stripePriceId: v.optional(v.string()),
    stripeCurrentPeriodEnd: v.optional(v.number()), // unix seconds
    cancelAtPeriodEnd: v.optional(v.boolean()),
  })
    .index("email", ["email"])
    .index("by_stripeCustomerId", ["stripeCustomerId"])
    .index("by_stripeSubscriptionId", ["stripeSubscriptionId"]),

  // Stripe webhook idempotency. Every incoming event id is recorded; duplicate
  // deliveries short-circuit to a 200 ack without re-applying side effects.
  stripeEvents: defineTable({
    eventId: v.string(),
    type: v.string(),
    receivedAt: v.number(),
    processedAt: v.optional(v.number()),
    status: v.union(
      v.literal("received"),
      v.literal("processed"),
      v.literal("failed"),
    ),
    error: v.optional(v.string()),
  }).index("by_eventId", ["eventId"]),

  // Forward-compat audit log for Pro feature usage. `kind` is intentionally a
  // free-form string so adding a new feature later doesn't require a migration.
  usageEvents: defineTable({
    userId: v.id("users"),
    kind: v.string(),
    billId: v.optional(v.string()),
    createdAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_user_and_kind", ["userId", "kind"])
    .index("by_user_and_createdAt", ["userId", "createdAt"]),

  // Saved bills (plain bookmarks). One row per (user, bill); unsave deletes
  // the row, so a re-save gets a fresh _creationTime and sorts as newest.
  savedBills: defineTable({
    userId: v.id("users"),
    billId: v.string(), // References bills.billId composite key, e.g. "1hr119"
    savedAt: v.number(), // epoch ms
  })
    .index("by_user", ["userId"])
    .index("by_user_and_bill", ["userId", "billId"]),

  // ─── Bills domain ──────────────────────────────────────────────────────────
  // Main bill info table
  bills: defineTable({
    billId: v.string(), // Composite key: "{number}{type}{congress}" e.g. "1234hr119"
    congress: v.number(),
    billType: v.string(), // "hr", "s", "hjres", etc.
    billNumber: v.string(),
    billTypeLabel: v.string(), // "H.R.", "S.", etc.
    title: v.string(),
    titleWithoutNumber: v.optional(v.string()),
    introducedDate: v.string(), // ISO date string
    sponsorFirstName: v.optional(v.string()),
    sponsorLastName: v.optional(v.string()),
    sponsorParty: v.optional(v.string()),
    sponsorState: v.optional(v.string()),
    progressStage: v.optional(v.number()), // 20, 40, 60, 80, 90, 95, 100
    progressDescription: v.optional(v.string()),
    latestActionDate: v.optional(v.string()),
    syncedEndpoints: v.optional(v.number()), // bitmask: 1=detail, 2=actions, 4=subjects, 8=summaries, 16=text
    // Enrichment progress, kept SEPARATE from syncedEndpoints so the existing
    // repair logic / SYNC_COMPLETE checks are untouched. Bits:
    //   1 = all legislativeSubjects stored, 2 = all text versions stored.
    extraSyncedBits: v.optional(v.number()),
    lastSyncAttempt: v.optional(v.string()), // ISO timestamp of last sync attempt
    updatedAt: v.string(),
  })
    .index("by_billId", ["billId"])
    .index("by_congress", ["congress"])
    .index("by_congress_and_type", ["congress", "billType"])
    .index("by_congress_and_progress_stage", ["congress", "progressStage"])
    .index("by_progress_stage", ["progressStage"])
    .index("by_sponsor_state", ["sponsorState"])
    .index("by_updated_at", ["updatedAt"])
    // Lets the repair job + completeness diagnostic find INCOMPLETE bills via a
    // range scan (syncedEndpoints < 31) instead of scanning the whole table.
    // Convex orders undefined < numbers, so the range also returns legacy bills
    // (field missing). Complete bills (31) are never read.
    .index("by_syncedEndpoints", ["syncedEndpoints"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["congress", "billType", "progressStage", "sponsorState"],
    }),

  // Bill actions (one-to-many: bill -> actions)
  billActions: defineTable({
    billId: v.string(), // References bills.billId
    actionCode: v.optional(v.string()),
    actionDate: v.string(),
    sourceSystemCode: v.optional(v.number()),
    sourceSystemName: v.optional(v.string()),
    text: v.string(),
    type: v.optional(v.string()),
  }).index("by_billId", ["billId"]),

  // Bill subjects / policy areas (one-to-one: bill -> subject)
  billSubjects: defineTable({
    billId: v.string(),
    policyAreaName: v.optional(v.string()),
    policyAreaUpdateDate: v.optional(v.string()),
  })
    .index("by_billId", ["billId"])
    .index("by_policy_area", ["policyAreaName"]),

  // Bill summaries (one-to-many: bill -> summaries)
  billSummaries: defineTable({
    billId: v.string(),
    actionDate: v.optional(v.string()),
    actionDesc: v.optional(v.string()),
    text: v.string(),
    updateDate: v.string(),
    versionCode: v.optional(v.string()),
  })
    .index("by_billId", ["billId"])
    .index("by_billId_and_date", ["billId", "updateDate"]),

  // Bill text versions (one-to-many: bill -> text versions)
  billText: defineTable({
    billId: v.string(),
    date: v.optional(v.string()),
    formatsUrlTxt: v.optional(v.string()),
    formatsUrlPdf: v.optional(v.string()),
    type: v.optional(v.string()),
  }).index("by_billId", ["billId"]),

  // Detailed legislative subjects (one-to-many: bill -> subjects). Distinct
  // from the single policy area kept in billSubjects — the Library of Congress
  // returns a rich list of legislative subjects per bill (e.g. HR1/119 has
  // 239). Stored replace-all per bill by the sync + enrichment backfill, and
  // indexed by name to support a future "filter by subject" feature.
  billLegislativeSubjects: defineTable({
    billId: v.string(),
    name: v.string(),
    updateDate: v.optional(v.string()),
  })
    .index("by_billId", ["billId"])
    .index("by_name", ["name"]),

  // Bill title variations (one-to-many: bill -> titles)
  billTitles: defineTable({
    billId: v.string(),
    title: v.string(),
    titleType: v.optional(v.string()),
    titleTypeCode: v.optional(v.number()),
    updateDate: v.optional(v.string()),
    billTextVersionCode: v.optional(v.string()),
    billTextVersionName: v.optional(v.string()),
    chamberCode: v.optional(v.string()),
    chamberName: v.optional(v.string()),
  }).index("by_billId", ["billId"]),

  // Precomputed analytics — tiny table read by homepage instead of scanning all bills
  congressStats: defineTable({
    congress: v.number(),
    totalCount: v.number(),
    houseCount: v.number(),
    senateCount: v.number(),
    stageCounts: v.array(
      v.object({
        stage: v.number(),
        description: v.string(),
        count: v.number(),
      })
    ),
    updatedAt: v.string(),
  }).index("by_congress", ["congress"]),

  // Precomputed policy areas per congress
  congressPolicyAreas: defineTable({
    congress: v.number(),
    policyAreaName: v.string(),
    count: v.number(),
  })
    .index("by_congress", ["congress"])
    .index("by_congress_and_count", ["congress", "count"]),

  // Precomputed sponsors per congress
  congressSponsors: defineTable({
    congress: v.number(),
    sponsorName: v.string(),
    sponsorParty: v.optional(v.string()),
    sponsorState: v.optional(v.string()),
    billCount: v.number(),
  })
    .index("by_congress", ["congress"])
    .index("by_congress_and_count", ["congress", "billCount"]),

  // Precomputed party / state / monthly aggregations per (congress, chamber).
  // Replaces the per-load 13K-doc scan in getChamberDeepBreakdown — homepage
  // reads a single row via the by_congress_and_chamber index.
  congressChamberBreakdowns: defineTable({
    congress: v.number(),
    chamber: v.union(v.literal("house"), v.literal("senate")),
    total: v.number(),
    partyCounts: v.object({
      D: v.number(),
      R: v.number(),
      I: v.number(),
      U: v.number(),
    }),
    partyLawCounts: v.object({
      D: v.number(),
      R: v.number(),
      I: v.number(),
      U: v.number(),
    }),
    // Stored as array (not record) to keep the validator simple — Convex
    // object keys must be valid identifiers and we don't want to risk
    // edge-case state codes breaking the schema.
    stateCounts: v.array(
      v.object({ state: v.string(), count: v.number() }),
    ),
    monthly: v.array(
      v.object({
        month: v.string(),
        count: v.number(),
        becameLaw: v.number(),
      }),
    ),
    updatedAt: v.string(),
  }).index("by_congress_and_chamber", ["congress", "chamber"]),

  // Bill chat sessions — one per signed-in user and bill. `sessionId` is kept
  // only for compatibility with rows created before chat required sign-in.
  billChats: defineTable({
    billId: v.string(),
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
    createdAt: v.string(),
  })
    .index("by_billId_and_session", ["billId", "sessionId"])
    .index("by_billId_and_userId", ["billId", "userId"])
    .index("by_userId", ["userId"]),

  // Bill chat messages — individual turns in a chat session
  billChatMessages: defineTable({
    chatId: v.id("billChats"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    createdAt: v.string(),
  }).index("by_chatId", ["chatId"]),

  // Signed-in bill chat analytics. Times are recorded by Convex in UTC as both
  // epoch milliseconds and ISO strings so analysis is timezone-independent.
  billChatAnalyticsSessions: defineTable({
    userId: v.id("users"),
    billId: v.string(),
    clientSessionId: v.string(),
    chatId: v.id("billChats"),
    startedAtUtc: v.number(),
    startedAtIso: v.string(),
    lastActivityAtUtc: v.number(),
    lastActivityIso: v.string(),
    questionCount: v.number(),
    planAtTime: v.union(v.literal("free"), v.literal("pro")),
  })
    .index("by_user_and_startedAt", ["userId", "startedAtUtc"])
    .index("by_user_and_clientSession", ["userId", "clientSessionId"])
    .index("by_user_and_clientSession_and_billId", [
      "userId",
      "clientSessionId",
      "billId",
    ])
    .index("by_billId", ["billId"])
    .index("by_chatId", ["chatId"]),

  billChatAnalyticsTurns: defineTable({
    analyticsSessionId: v.id("billChatAnalyticsSessions"),
    userId: v.id("users"),
    billId: v.string(),
    chatId: v.id("billChats"),
    userMessageId: v.id("billChatMessages"),
    assistantMessageId: v.id("billChatMessages"),
    billSnapshot: v.object({
      billId: v.string(),
      congress: v.number(),
      billType: v.string(),
      billNumber: v.string(),
      billTypeLabel: v.string(),
      title: v.string(),
      introducedDate: v.string(),
      sponsorFirstName: v.string(),
      sponsorLastName: v.string(),
      sponsorParty: v.string(),
      sponsorState: v.string(),
      progressStage: v.number(),
      progressDescription: v.string(),
      policyArea: v.string(),
      hasSummary: v.boolean(),
      summaryLength: v.number(),
      hasPdf: v.boolean(),
    }),
    model: v.string(),
    createdAtUtc: v.number(),
    createdAtIso: v.string(),
    answeredAtUtc: v.number(),
    answeredAtIso: v.string(),
    latencyMs: v.number(),
    planAtTime: v.union(v.literal("free"), v.literal("pro")),
  })
    .index("by_user_and_createdAt", ["userId", "createdAtUtc"])
    .index("by_session_and_createdAt", [
      "analyticsSessionId",
      "createdAtUtc",
    ])
    .index("by_billId_and_createdAt", ["billId", "createdAtUtc"])
    .index("by_chatId", ["chatId"]),

  // Sync snapshots for audit trail
  syncSnapshots: defineTable({
    syncType: v.string(), // "historical" or "daily"
    congress: v.number(),
    billType: v.optional(v.string()),
    startedAt: v.string(),
    completedAt: v.optional(v.string()),
    status: v.string(), // "running", "completed", "failed"
    totalProcessed: v.optional(v.number()),
    totalSuccess: v.optional(v.number()),
    totalFailed: v.optional(v.number()),
    totalSkipped: v.optional(v.number()),
    errorDetails: v.optional(v.string()),
  })
    .index("by_congress", ["congress"])
    .index("by_status", ["status"]),
});
