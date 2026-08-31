import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  // `authTables` provides authAccounts, authSessions, authRefreshTokens,
  // authVerificationCodes and authRateLimits. `users` is overridden below to add
  // app-managed billing columns alongside the auth-managed identity fields.
  ...authTables,

  users: defineTable({
    // Auth-managed (mirrors authTables.users shape so the library can write here)
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),

    // App-managed billing. `plan` is optional because @convex-dev/auth inserts
    // new users with only the auth fields; every read treats undefined as "free".
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
    progressStage: v.optional(v.number()), // 20, 40, 60, 80, 85 (vetoed), 90, 95, 100
    progressDescription: v.optional(v.string()),
    latestActionDate: v.optional(v.string()),
    // Denormalised copy of billSubjects.policyAreaName: a topic filter must be
    // an indexed lookup. The cross-table intersection it replaced matched the
    // oldest 2,000 subject rows against the newest 1,200 bills of one congress
    // and silently returned 0 of 2,070 real Health matches. Kept in sync by
    // `upsertBillSubject`; populated for existing rows by `policyAreaBackfill`.
    policyAreaName: v.optional(v.string()),
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
    .index("by_congress_and_policy_area", ["congress", "policyAreaName"])
    // The PAIRS below each need their own index, and the reason is correctness,
    // not speed. A filter the chosen index does not enforce is applied in memory
    // over a capped window, so anything outside that window is invisible — and an
    // empty result then reads as "none exist". Both of these shipped wrong
    // answers to readers:
    //   {policyArea, progressStage} scanned the 200 newest bills in a topic (all
    //     still in committee) and reported that no Health bill had become law.
    //   {sponsorState, progressStage} answered "we don't have data on Texas bills
    //     that became law" when eleven had, including H.R. 1.
    // Same failure as the `policyAreaName` note above, one filter further along.
    .index("by_congress_policy_area_and_stage", [
      "congress",
      "policyAreaName",
      "progressStage",
    ])
    .index("by_congress_state_and_stage", ["congress", "sponsorState", "progressStage"])
    // Ordering indexes. Without a real sort the answer engine had none at all:
    // it read rows in insertion order and then asserted a date sort that did not
    // exist, once naming a "most recent" law while a later row in its own result
    // carried a later date. Row order is only ever claimed when an index or a
    // complete in-memory set actually guarantees it.
    .index("by_congress_and_latest_action", ["congress", "latestActionDate"])
    .index("by_congress_and_introduced", ["congress", "introducedDate"])
    .index("by_congress_stage_and_action", [
      "congress",
      "progressStage",
      "latestActionDate",
    ])
    .index("by_progress_stage", ["progressStage"])
    .index("by_sponsor_state", ["sponsorState"])
    .index("by_updated_at", ["updatedAt"])
    // Lets the repair job + completeness diagnostic find INCOMPLETE bills via a
    // range scan (syncedEndpoints < 31) instead of scanning the whole table.
    // Convex orders undefined < numbers, so the range also returns legacy bills
    // (field missing). Complete bills (31) are never read.
    .index("by_syncedEndpoints", ["syncedEndpoints"])
    .index("by_congress_and_bill_number", ["congress", "billNumber"])
    // Congress-scoped sponsor lookups for the answer engine. `by_sponsor_state`
    // above is NOT congress-scoped: without these, "bills from Maryland this
    // Congress" scanned only the newest 200 of ~18,000 rows and filtered in
    // memory — the same class of silent miss as the policyArea note above.
    .index("by_congress_and_sponsor_state", ["congress", "sponsorState"])
    .index("by_congress_and_sponsor_last", ["congress", "sponsorLastName"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["congress", "billType", "progressStage", "sponsorState"],
    }),

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
    // Measures of each type. Optional so the schema accepts rows written before
    // this existed; a missing value means "we cannot break the total down".
    //
    // Without it, "how many BILLS have been introduced" had no exact answer: the
    // 119th holds 18,476 measures, far past any scan ceiling, so counting hr and
    // s directly comes back incomplete — and the only number on hand, 18,476,
    // counts resolutions too. The assistant either quoted it as "bills" or said
    // it could not find out. It is 15,550.
    typeCounts: v.optional(
      v.array(v.object({ billType: v.string(), count: v.number() })),
    ),
    updatedAt: v.string(),
  }).index("by_congress", ["congress"]),

  // Bills whose page has meaningfully changed and that IndexNow has not been
  // told about yet. Drained twice a day by `convex/indexNow.ts`.
  //
  // A separate table rather than a field on `bills`: mutations.ts writes through
  // the trigger-wrapped `internalMutation`, so marking and unmarking a bill
  // would fire both bill aggregates' triggers twice per change.
  indexNowQueue: defineTable({
    billId: v.string(),
    queuedAt: v.string(), // ISO
    reason: v.string(), // "new" | "status" | "action" | "summary" | "topic" | "seed"
    // 0 = a change a reader would see, 1 = the one-time backlog seed. Changes
    // must never queue behind the seed; see `convex/indexNow.ts`.
    priority: v.number(),
  })
    .index("by_billId", ["billId"]) // dedupe
    .index("by_priority_and_queuedAt", ["priority", "queuedAt"]), // drain order

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
    .index("by_congress_and_count", ["congress", "billCount"])
    // A state's members must be readable WITHOUT first ranking every member in
    // the Congress. The answer engine used to take the top 300 by bill count and
    // then filter to a state, so California came back as 29 of its 54 members —
    // flagged complete — and "who introduced the fewest bills in California"
    // named the wrong person by 20 places. 250 of the 550 members of the 119th
    // were unreachable entirely.
    .index("by_congress_and_state", ["congress", "sponsorState"]),

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
    // Per-stage counts FOR THIS CHAMBER. Optional so the schema accepts rows
    // written before this field existed; the answer engine treats a missing
    // value as "no chamber-scoped stage figures available" rather than falling
    // back to the whole-Congress ladder.
    //
    // Its absence was a critical defect: a chamber-filtered stats row carried the
    // whole-Congress `stageCounts`, so "how many House bills became law" was
    // answered 104 — the figure for both chambers — when the answer is 64. The
    // model then printed the party split in the next sentence, which sums to 64,
    // and did not notice it had contradicted itself.
    stageCounts: v.optional(
      v.array(
        v.object({
          stage: v.number(),
          description: v.string(),
          count: v.number(),
        }),
      ),
    ),
    updatedAt: v.string(),
  }).index("by_congress_and_chamber", ["congress", "chamber"]),

  // Precomputed committee "base rates": for bills from FINISHED Congresses that
  // were still in committee N days after introduction, what share ever advanced
  // past committee. ~8 rows (chamber × day-bucket). Read by the bill detail page
  // to show honest historical context, never a per-bill prediction.
  committeeBaseRates: defineTable({
    chamber: v.union(v.literal("house"), v.literal("senate")),
    bucketStart: v.number(), // days in committee (inclusive lower bound)
    bucketEnd: v.number(), // exclusive upper bound; OPEN_BUCKET_END for 365+
    advancedCount: v.number(),
    totalCount: v.number(),
    ratePercent: v.number(),
    sampleSize: v.number(),
    updatedAt: v.string(),
  }).index("by_chamber", ["chamber"]),

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

  billChatMessages: defineTable({
    chatId: v.id("billChats"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    createdAt: v.string(),
  }).index("by_chatId", ["chatId"]),

  // Saved conversations for signed-in readers (spec §4.7). Distinct from the
  // bill-scoped `billChats`.
  //
  // `userId` is REQUIRED, not optional, and that is the point: an anonymous
  // conversation cannot be represented here at all, so it cannot be leaked or
  // exposed by a forgotten ownership check. Anonymous transcripts stay in the
  // browser's session storage and are never sent here.
  chats: defineTable({
    userId: v.id("users"),
    title: v.string(), // first question, truncated
    createdAt: v.number(),
    lastActivityAt: v.number(),
    messageCount: v.number(),
  }).index("by_user_and_lastActivity", ["userId", "lastActivityAt"]),

  // Turns within a saved conversation. Citations, entities and the work log are
  // stored WITH the message so reopening re-renders identically without
  // re-running any tool, freezing the answer as it was given even after the
  // bill's status changes.
  //
  // `userId` is denormalised as defence in depth (spec §4.8 Rule 4); the primary
  // control is always resolving the parent chat through `requireOwnedChat`.
  chatMessages: defineTable({
    chatId: v.id("chats"),
    userId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    citations: v.optional(v.array(v.string())),
    allowed: v.optional(v.array(v.string())),
    entities: v.optional(v.any()),
    webReason: v.optional(v.string()),
    webSources: v.optional(
      v.array(
        v.object({
          handle: v.string(),
          url: v.string(),
          title: v.string(),
          excerpt: v.string(),
        }),
      ),
    ),
    workLog: v.optional(v.array(v.object({ tool: v.string(), detail: v.string() }))),
    createdAt: v.number(),
  })
    .index("by_chat_and_createdAt", ["chatId", "createdAt"])
    .index("by_user", ["userId"]),

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
    // Which OpenRouter upstream actually served the turn, when it reports one.
    provider: v.optional(v.string()),
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
