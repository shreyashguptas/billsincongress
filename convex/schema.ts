import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
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
    updatedAt: v.string(),
  })
    .index("by_billId", ["billId"])
    .index("by_congress", ["congress"])
    .index("by_congress_and_type", ["congress", "billType"])
    .index("by_progress_stage", ["progressStage"])
    .index("by_sponsor_state", ["sponsorState"])
    .index("by_updated_at", ["updatedAt"])
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
