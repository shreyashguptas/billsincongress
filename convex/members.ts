/**
 * A member's page: who they are, their official accounts (only those their
 * own .gov site confirms, convex/memberAccounts.ts), and their newest bills
 * and cosponsorships in the current Congress.
 *
 * Only members in `memberAccounts` have a page: everyone in office since that
 * table began. Each list reads a fixed number of rows from an index, newest
 * first, and says how many it read, never a total: a member's full count is
 * one click away on /bills, which counts it properly.
 */
import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { officialAccounts } from "./memberAccounts";

/** Bills shown in each of the page's two lists. */
const BILLS_PER_LIST = 10;
/** Read a little past the list so withdrawn cosponsorships can be skipped. */
const COSPONSORSHIPS_READ = 30;
const BIOGUIDE = /^[A-Z]\d{6}$/;

async function currentCongress(ctx: QueryCtx): Promise<number | null> {
  const latest = await ctx.db.query("bills").withIndex("by_congress").order("desc").first();
  return latest?.congress ?? null;
}

function billRow(b: Doc<"bills">) {
  return {
    billId: b.billId,
    billTypeLabel: b.billTypeLabel,
    billNumber: b.billNumber,
    billType: b.billType,
    title: b.titleWithoutNumber || b.title,
    introducedDate: b.introducedDate,
    progressStage: b.progressStage ?? null,
  };
}

export const getPage = query({
  args: { bioguideId: v.string() },
  handler: async (ctx, args) => {
    if (!BIOGUIDE.test(args.bioguideId)) return null;
    const row = await ctx.db
      .query("memberAccounts")
      .withIndex("by_bioguideId", (q) => q.eq("bioguideId", args.bioguideId))
      .unique();
    if (!row) return null;

    const congress = await currentCongress(ctx);
    const sponsored =
      congress === null
        ? []
        : await ctx.db
            .query("bills")
            .withIndex("by_sponsorBioguideId_and_congress_and_introducedDate", (q) =>
              q.eq("sponsorBioguideId", args.bioguideId).eq("congress", congress),
            )
            .order("desc")
            .take(BILLS_PER_LIST);

    const cosponsorships =
      congress === null
        ? []
        : (
            await ctx.db
              .query("billCosponsors")
              .withIndex("by_bioguideId_and_congress_and_sponsorshipDate", (q) =>
                q.eq("bioguideId", args.bioguideId).eq("congress", congress),
              )
              .order("desc")
              .take(COSPONSORSHIPS_READ)
          )
            .filter((c) => !c.withdrawnDate)
            .slice(0, BILLS_PER_LIST);
    const cosponsored = (
      await Promise.all(
        cosponsorships.map(async (c) => {
          const bill = await ctx.db
            .query("bills")
            .withIndex("by_billId", (q) => q.eq("billId", c.billId))
            .first();
          return bill ? { ...billRow(bill), joined: c.sponsorshipDate } : null;
        }),
      )
    ).filter((b) => b !== null);

    return {
      member: {
        bioguideId: row.bioguideId,
        name: row.name,
        chamber: row.chamber,
        state: row.state,
        party: row.party ?? null,
        district: row.district ?? null,
        inOffice: row.inOffice,
      },
      accounts: await officialAccounts(ctx, row.bioguideId),
      congress,
      // The name the /bills sponsor filter matches: the spelling on the
      // member's own bills (Congress.gov's, which can differ from the
      // official full name above).
      sponsorFilterName:
        sponsored.length > 0
          ? `${sponsored[0].sponsorFirstName ?? ""} ${sponsored[0].sponsorLastName ?? ""}`.trim() || null
          : null,
      sponsored: sponsored.map(billRow),
      cosponsored,
    };
  },
});
