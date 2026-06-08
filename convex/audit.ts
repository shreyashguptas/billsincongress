/**
 * TEMPORARY read-only audit module. Deployed to prod for a one-time data
 * verification pass; performs NO writes. Not intended to be committed — safe to
 * delete and redeploy. Compares the database against the live Library of
 * Congress API and cross-checks internal consistency.
 */
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { calculateBillStage } from "./billStage";
import {
  EXTRA_LEGISLATIVE_SUBJECTS,
  EXTRA_TEXT_VERSIONS,
  EXTRA_COMPLETE,
} from "./sync";

const BASE_URL = "https://api.congress.gov/v3";
const BILL_TYPES = [
  "hr",
  "s",
  "hjres",
  "sjres",
  "hconres",
  "sconres",
  "hres",
  "sres",
];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function apiGet(path: string): Promise<any | null> {
  const apiKey = process.env.CONGRESS_API_KEY;
  if (!apiKey) throw new Error("CONGRESS_API_KEY not configured");
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const resp = await fetch(`${BASE_URL}${path}`, {
        headers: { "X-Api-Key": apiKey },
      });
      if (resp.status === 429) {
        await sleep(3000 * (attempt + 1));
        continue;
      }
      if (!resp.ok) return null;
      return await resp.json();
    } catch {
      await sleep(1000 * (attempt + 1));
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Stage recompute + integrity audit (DB only)
// ─────────────────────────────────────────────────────────────────────────

export const auditStagePage = internalQuery({
  args: {
    congress: v.number(),
    cursor: v.union(v.string(), v.null()),
    numItems: v.number(),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("bills")
      .withIndex("by_congress", (q) => q.eq("congress", args.congress))
      .paginate({ cursor: args.cursor, numItems: args.numItems });

    let stageMismatchCount = 0;
    let noActions = 0;
    let missingIntroducedDate = 0;
    let undefinedStage = 0;
    let missingSponsor = 0;
    let latestActionDateMissing = 0;
    let latestActionDateStale = 0;
    const mismatches: Array<{
      billId: string;
      stored: number | undefined;
      recomputed: number;
    }> = [];
    const transitions: Record<string, number> = {};

    for (const bill of page.page) {
      if (!bill.introducedDate) missingIntroducedDate++;
      if (bill.progressStage === undefined) undefinedStage++;
      if (!bill.sponsorLastName) missingSponsor++;
      if (!bill.latestActionDate) latestActionDateMissing++;

      const actions = await ctx.db
        .query("billActions")
        .withIndex("by_billId", (q) => q.eq("billId", bill.billId))
        .take(250);

      if (actions.length === 0) {
        noActions++;
        continue;
      }

      // latestActionDate should equal the max actionDate of stored actions.
      let maxDate = "";
      for (const a of actions) if (a.actionDate > maxDate) maxDate = a.actionDate;
      if (bill.latestActionDate && maxDate && bill.latestActionDate !== maxDate) {
        latestActionDateStale++;
      }

      const { stage } = calculateBillStage(
        actions.map((a) => ({
          text: a.text,
          type: a.type,
          actionCode: a.actionCode,
        })),
      );
      if (bill.progressStage !== stage) {
        stageMismatchCount++;
        const key = `${bill.progressStage}->${stage}`;
        transitions[key] = (transitions[key] || 0) + 1;
        if (mismatches.length < 15) {
          mismatches.push({
            billId: bill.billId,
            stored: bill.progressStage,
            recomputed: stage,
          });
        }
      }
    }

    return {
      scanned: page.page.length,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      stageMismatchCount,
      noActions,
      missingIntroducedDate,
      undefinedStage,
      missingSponsor,
      latestActionDateMissing,
      latestActionDateStale,
      mismatches,
      transitions,
    };
  },
});

export const auditStages = internalAction({
  args: { congress: v.number() },
  handler: async (ctx, args): Promise<any> => {
    let cursor: string | null = null;
    let scanned = 0,
      stageMismatchCount = 0,
      noActions = 0,
      missingIntroducedDate = 0,
      undefinedStage = 0,
      missingSponsor = 0,
      latestActionDateMissing = 0,
      latestActionDateStale = 0;
    const transitions: Record<string, number> = {};
    const examples: any[] = [];

    for (;;) {
      const p: any = await ctx.runQuery(internal.audit.auditStagePage, {
        congress: args.congress,
        cursor,
        numItems: 40,
      });
      scanned += p.scanned;
      stageMismatchCount += p.stageMismatchCount;
      noActions += p.noActions;
      missingIntroducedDate += p.missingIntroducedDate;
      undefinedStage += p.undefinedStage;
      missingSponsor += p.missingSponsor;
      latestActionDateMissing += p.latestActionDateMissing;
      latestActionDateStale += p.latestActionDateStale;
      for (const k in p.transitions)
        transitions[k] = (transitions[k] || 0) + p.transitions[k];
      for (const m of p.mismatches) if (examples.length < 40) examples.push(m);
      if (p.isDone) break;
      cursor = p.continueCursor;
    }

    console.log(
      `auditStages c${args.congress}: scanned=${scanned} stageMismatches=${stageMismatchCount} noActions=${noActions}`,
    );
    return {
      congress: args.congress,
      scanned,
      stageMismatchCount,
      noActions,
      missingIntroducedDate,
      undefinedStage,
      missingSponsor,
      latestActionDateMissing,
      latestActionDateStale,
      transitions,
      examples,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Census vs precomputed congressStats (DB only)
// ─────────────────────────────────────────────────────────────────────────

export const getCongressStatsRow = internalQuery({
  args: { congress: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("congressStats")
      .withIndex("by_congress", (q) => q.eq("congress", args.congress))
      .first();
  },
});

export const auditCensus = internalAction({
  args: {},
  handler: async (ctx): Promise<any> => {
    let cursor: string | null = null;
    let grand = 0;
    let dupCheckSample = 0;
    const cong: Record<
      number,
      {
        total: number;
        house: number;
        senate: number;
        byType: Record<string, number>;
        byStage: Record<number, number>;
        missingStage: number;
        subjectsDone: number;
        textDone: number;
        bothDone: number;
        badType: number;
      }
    > = {};
    const seenIds = new Set<string>();
    let dupes = 0;
    const dupeExamples: string[] = [];

    for (;;) {
      const p: any = await ctx.runQuery(
        internal.mutations.getBillBackfillPage,
        { cursor, numItems: 2000 },
      );
      for (const b of p.bills) {
        grand++;
        dupCheckSample++;
        if (seenIds.has(b.billId)) {
          dupes++;
          if (dupeExamples.length < 10) dupeExamples.push(b.billId);
        } else {
          seenIds.add(b.billId);
        }
        const c =
          cong[b.congress] ??
          (cong[b.congress] = {
            total: 0,
            house: 0,
            senate: 0,
            byType: {},
            byStage: {},
            missingStage: 0,
            subjectsDone: 0,
            textDone: 0,
            bothDone: 0,
            badType: 0,
          });
        c.total++;
        if (b.billType.startsWith("h")) c.house++;
        else if (b.billType.startsWith("s")) c.senate++;
        if (!BILL_TYPES.includes(b.billType)) c.badType++;
        c.byType[b.billType] = (c.byType[b.billType] || 0) + 1;
        if (b.progressStage === undefined) c.missingStage++;
        else c.byStage[b.progressStage] = (c.byStage[b.progressStage] || 0) + 1;
        if (b.extraSyncedBits & EXTRA_LEGISLATIVE_SUBJECTS) c.subjectsDone++;
        if (b.extraSyncedBits & EXTRA_TEXT_VERSIONS) c.textDone++;
        if ((b.extraSyncedBits & EXTRA_COMPLETE) === EXTRA_COMPLETE)
          c.bothDone++;
      }
      if (p.isDone) break;
      cursor = p.continueCursor;
    }

    const comparison: any[] = [];
    for (const cs of Object.keys(cong)
      .map(Number)
      .sort((a, b) => a - b)) {
      const raw = cong[cs];
      const stats: any = await ctx.runQuery(internal.audit.getCongressStatsRow, {
        congress: cs,
      });
      const statsByStage = stats
        ? Object.fromEntries(stats.stageCounts.map((s: any) => [s.stage, s.count]))
        : null;
      // diff raw vs stats per stage
      const stageDiffs: Record<string, { raw: number; stats: number }> = {};
      if (statsByStage) {
        const allStages = new Set<number>([
          ...Object.keys(raw.byStage).map(Number),
          ...Object.keys(statsByStage).map(Number),
        ]);
        for (const st of allStages) {
          const r = raw.byStage[st] ?? 0;
          const s = statsByStage[st] ?? 0;
          if (r !== s) stageDiffs[st] = { raw: r, stats: s };
        }
      }
      comparison.push({
        congress: cs,
        rawTotal: raw.total,
        statsTotal: stats?.totalCount ?? null,
        totalMatch: stats ? raw.total === stats.totalCount : false,
        rawHouse: raw.house,
        statsHouse: stats?.houseCount ?? null,
        rawSenate: raw.senate,
        statsSenate: stats?.senateCount ?? null,
        houseMatch: stats ? raw.house === stats.houseCount : false,
        senateMatch: stats ? raw.senate === stats.senateCount : false,
        stageDiffs,
        byType: raw.byType,
        byStage: raw.byStage,
        missingStage: raw.missingStage,
        badType: raw.badType,
        subjectsDone: raw.subjectsDone,
        textDone: raw.textDone,
        bothDone: raw.bothDone,
      });
    }

    return { grand, dupes, dupeExamples, comparison };
  },
});

// ─────────────────────────────────────────────────────────────────────────
// 3. DB counts vs live API counts per (congress, billType)
// ─────────────────────────────────────────────────────────────────────────

export const auditCountsVsApi = internalAction({
  args: { congresses: v.optional(v.array(v.number())) },
  handler: async (ctx, args): Promise<any> => {
    let cursor: string | null = null;
    const db: Record<string, number> = {};
    const seen = new Set<number>();
    for (;;) {
      const p: any = await ctx.runQuery(
        internal.mutations.getBillBackfillPage,
        { cursor, numItems: 2000 },
      );
      for (const b of p.bills) {
        db[`${b.congress}/${b.billType}`] =
          (db[`${b.congress}/${b.billType}`] || 0) + 1;
        seen.add(b.congress);
      }
      if (p.isDone) break;
      cursor = p.continueCursor;
    }

    const congresses = args.congresses ?? [...seen].sort((a, b) => a - b);
    const rows: any[] = [];
    for (const c of congresses) {
      for (const t of BILL_TYPES) {
        await sleep(300);
        const data = await apiGet(`/bill/${c}/${t}?limit=1&format=json`);
        const apiCount = data?.pagination?.count ?? null;
        const dbCount = db[`${c}/${t}`] ?? 0;
        rows.push({
          congress: c,
          billType: t,
          dbCount,
          apiCount,
          diff: apiCount === null ? null : apiCount - dbCount,
        });
      }
    }
    return { rows };
  },
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Deep per-bill comparison: DB vs live API
// ─────────────────────────────────────────────────────────────────────────

export const getStoredBill = internalQuery({
  args: { billId: v.string() },
  handler: async (ctx, args) => {
    const bill = await ctx.db
      .query("bills")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .first();
    if (!bill) return null;
    const actions = await ctx.db
      .query("billActions")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .take(250);
    const subject = await ctx.db
      .query("billSubjects")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .first();
    const legSubjects = await ctx.db
      .query("billLegislativeSubjects")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .take(1000);
    const summaries = await ctx.db
      .query("billSummaries")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .take(100);
    const texts = await ctx.db
      .query("billText")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .take(100);
    let maxActionDate = "";
    for (const a of actions) if (a.actionDate > maxActionDate) maxActionDate = a.actionDate;
    return {
      billId: bill.billId,
      congress: bill.congress,
      billType: bill.billType,
      billNumber: bill.billNumber,
      progressStage: bill.progressStage,
      introducedDate: bill.introducedDate,
      latestActionDate: bill.latestActionDate,
      sponsorFirstName: bill.sponsorFirstName,
      sponsorLastName: bill.sponsorLastName,
      sponsorParty: bill.sponsorParty,
      sponsorState: bill.sponsorState,
      extraSyncedBits: bill.extraSyncedBits ?? 0,
      actionCount: actions.length,
      maxActionDate,
      recomputedStageFromStored: calculateBillStage(
        actions.map((a) => ({
          text: a.text,
          type: a.type,
          actionCode: a.actionCode,
        })),
      ).stage,
      policyAreaName: subject?.policyAreaName ?? null,
      legSubjectCount: legSubjects.length,
      summaryCount: summaries.length,
      textCount: texts.length,
      textTypes: texts.map((t) => t.type),
    };
  },
});

// Confirm whether the live /subjects pagination.count includes the policyArea
// (which would explain the uniform +1 vs our stored legislativeSubjects).
export const auditSubjectsRaw = internalAction({
  args: { billId: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const m = args.billId.match(/^(\d+)([a-z]+)(\d+)$/);
    if (!m) return { error: "unparseable" };
    const [, number, billType, congress] = m;
    const data = await apiGet(
      `/bill/${congress}/${billType}/${number}/subjects?format=json&limit=250`,
    );
    const legislativeSubjects = data?.subjects?.legislativeSubjects ?? [];
    const policyArea = data?.subjects?.policyArea ?? null;
    return {
      billId: args.billId,
      paginationCount: data?.pagination?.count ?? null,
      legislativeSubjectsLength: legislativeSubjects.length,
      hasPolicyArea: policyArea !== null,
      policyAreaName: policyArea?.name ?? null,
      // count - legislativeSubjects should equal 1 if policyArea is included.
      countMinusLegSubjects:
        (data?.pagination?.count ?? 0) - legislativeSubjects.length,
    };
  },
});

// Sample bills across a congress, recompute stage from LIVE actions, and
// compare to the stored stage — estimates the rate of stage staleness vs the
// live source. One API call per sampled bill (the actions endpoint).
export const auditStageVsApiSample = internalAction({
  args: { congress: v.number(), sampleSize: v.number() },
  handler: async (ctx, args): Promise<any> => {
    const all: Array<{
      billId: string;
      billType: string;
      billNumber: string;
      progressStage?: number;
    }> = [];
    let cursor: string | null = null;
    for (;;) {
      const p: any = await ctx.runQuery(internal.audit.getBillNumbersForCongress, {
        congress: args.congress,
        cursor,
        numItems: 2000,
      });
      for (const b of p.bills) all.push(b);
      if (p.isDone) break;
      cursor = p.continueCursor;
    }
    if (all.length === 0) return { congress: args.congress, sampled: 0 };
    const step = Math.max(1, Math.floor(all.length / args.sampleSize));
    const sample = [];
    for (let i = 0; i < all.length && sample.length < args.sampleSize; i += step)
      sample.push(all[i]);

    let checked = 0;
    let mismatches = 0;
    const examples: any[] = [];
    for (const b of sample) {
      await sleep(280);
      const data = await apiGet(
        `/bill/${args.congress}/${b.billType}/${b.billNumber}/actions?format=json&limit=250`,
      );
      if (!data) continue;
      const liveActions = (data.actions ?? []).map((a: any) => ({
        text: a.text || "",
        type: a.type,
        actionCode: a.actionCode,
      }));
      if (liveActions.length === 0) continue;
      checked++;
      const liveStage = calculateBillStage(liveActions).stage;
      if (liveStage !== b.progressStage) {
        mismatches++;
        if (examples.length < 25)
          examples.push({
            billId: b.billId,
            stored: b.progressStage,
            live: liveStage,
          });
      }
    }
    return {
      congress: args.congress,
      totalBills: all.length,
      requested: args.sampleSize,
      checked,
      mismatches,
      mismatchPct: checked ? ((mismatches / checked) * 100).toFixed(1) : null,
      examples,
    };
  },
});

export const getBillNumbersForCongress = internalQuery({
  args: {
    congress: v.number(),
    cursor: v.union(v.string(), v.null()),
    numItems: v.number(),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("bills")
      .withIndex("by_congress", (q) => q.eq("congress", args.congress))
      .paginate({ cursor: args.cursor, numItems: args.numItems });
    return {
      bills: page.page.map((b) => ({
        billId: b.billId,
        billType: b.billType,
        billNumber: b.billNumber,
        progressStage: b.progressStage,
      })),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const getBillNumbersPage = internalQuery({
  args: {
    congress: v.number(),
    billType: v.string(),
    cursor: v.union(v.string(), v.null()),
    numItems: v.number(),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("bills")
      .withIndex("by_congress_and_type", (q) =>
        q.eq("congress", args.congress).eq("billType", args.billType),
      )
      .paginate({ cursor: args.cursor, numItems: args.numItems });
    return {
      numbers: page.page.map((b) => b.billNumber),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

// Identify exactly which bills the live API has that the DB lacks (missing) and
// vice versa (extra/stale), for one (congress, billType).
export const auditMissingBills = internalAction({
  args: { congress: v.number(), billType: v.string() },
  handler: async (ctx, args): Promise<any> => {
    // DB set
    const dbSet = new Set<string>();
    let cursor: string | null = null;
    for (;;) {
      const p: any = await ctx.runQuery(internal.audit.getBillNumbersPage, {
        congress: args.congress,
        billType: args.billType,
        cursor,
        numItems: 2000,
      });
      for (const n of p.numbers) dbSet.add(String(n));
      if (p.isDone) break;
      cursor = p.continueCursor;
    }
    // API set (paginate the list endpoint)
    const apiSet = new Set<string>();
    let offset = 0;
    let apiCount: number | null = null;
    for (let i = 0; i < 250; i++) {
      await sleep(280);
      const data = await apiGet(
        `/bill/${args.congress}/${args.billType}?limit=250&offset=${offset}&format=json`,
      );
      if (!data) break;
      if (apiCount === null) apiCount = data?.pagination?.count ?? null;
      const bills = data.bills ?? [];
      for (const b of bills) apiSet.add(String(b.number));
      if (bills.length < 250) break;
      offset += 250;
    }
    const missingFromDb = [...apiSet].filter((n) => !dbSet.has(n));
    const extraInDb = [...dbSet].filter((n) => !apiSet.has(n));
    return {
      congress: args.congress,
      billType: args.billType,
      dbSize: dbSet.size,
      apiSize: apiSet.size,
      apiCount,
      missingFromDb: missingFromDb
        .map(Number)
        .sort((a, b) => a - b)
        .map((n) => `${n}${args.billType}${args.congress}`),
      extraInDb: extraInDb
        .map(Number)
        .sort((a, b) => a - b)
        .map((n) => `${n}${args.billType}${args.congress}`),
    };
  },
});

export const auditBillVsApi = internalAction({
  args: { billId: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const m = args.billId.match(/^(\d+)([a-z]+)(\d+)$/);
    if (!m) return { billId: args.billId, error: "unparseable billId" };
    const [, number, billType, congress] = m;

    const stored: any = await ctx.runQuery(internal.audit.getStoredBill, {
      billId: args.billId,
    });
    if (!stored) return { billId: args.billId, error: "not in DB" };

    const base = `/bill/${congress}/${billType}/${number}`;
    const detail = await apiGet(`${base}?format=json`);
    await sleep(250);
    const actionsResp = await apiGet(`${base}/actions?format=json&limit=250`);
    await sleep(250);
    const subjectsResp = await apiGet(`${base}/subjects?format=json&limit=250`);
    await sleep(250);
    const summariesResp = await apiGet(`${base}/summaries?format=json`);
    await sleep(250);
    const textResp = await apiGet(`${base}/text?format=json`);

    const liveActions = (actionsResp?.actions ?? []).map((a: any) => ({
      text: a.text || "",
      type: a.type,
      actionCode: a.actionCode,
      actionDate: a.actionDate || "",
    }));
    const liveStage =
      liveActions.length > 0 ? calculateBillStage(liveActions).stage : null;
    let liveMaxActionDate = "";
    for (const a of liveActions)
      if (a.actionDate > liveMaxActionDate) liveMaxActionDate = a.actionDate;

    const d = detail?.bill;
    const liveSponsor = d?.sponsors?.[0];
    const livePolicyArea = subjectsResp?.subjects?.policyArea?.name ?? null;
    const liveLegSubjectCount = subjectsResp?.pagination?.count ?? null;
    const liveSummaryCount = summariesResp?.summaries?.length ?? null;
    const liveTextCount = textResp?.textVersions?.length ?? null;

    const discrepancies: string[] = [];
    const norm = (s: any) => (s ?? "").toString().trim();
    if (liveStage !== null && liveStage !== stored.progressStage)
      discrepancies.push(
        `stage: stored=${stored.progressStage} liveRecomputed=${liveStage}`,
      );
    if (norm(d?.introducedDate) && norm(d?.introducedDate) !== norm(stored.introducedDate))
      discrepancies.push(
        `introducedDate: stored=${stored.introducedDate} live=${d?.introducedDate}`,
      );
    if (liveMaxActionDate && liveMaxActionDate !== norm(stored.latestActionDate))
      discrepancies.push(
        `latestActionDate: stored=${stored.latestActionDate} live=${liveMaxActionDate}`,
      );
    if (liveSponsor && norm(liveSponsor.lastName) !== norm(stored.sponsorLastName))
      discrepancies.push(
        `sponsorLast: stored=${stored.sponsorLastName} live=${liveSponsor.lastName}`,
      );
    if (liveSponsor && norm(liveSponsor.party) !== norm(stored.sponsorParty))
      discrepancies.push(
        `sponsorParty: stored=${stored.sponsorParty} live=${liveSponsor.party}`,
      );
    if (liveSponsor && norm(liveSponsor.state) !== norm(stored.sponsorState))
      discrepancies.push(
        `sponsorState: stored=${stored.sponsorState} live=${liveSponsor.state}`,
      );
    if (livePolicyArea && norm(livePolicyArea) !== norm(stored.policyAreaName))
      discrepancies.push(
        `policyArea: stored=${stored.policyAreaName} live=${livePolicyArea}`,
      );
    // Enrichment fidelity (only meaningful once the bill is enriched).
    const enrichedSubjects =
      (stored.extraSyncedBits & EXTRA_LEGISLATIVE_SUBJECTS) !== 0;
    if (
      enrichedSubjects &&
      liveLegSubjectCount !== null &&
      liveLegSubjectCount !== stored.legSubjectCount
    )
      discrepancies.push(
        `legSubjects: stored=${stored.legSubjectCount} live=${liveLegSubjectCount}`,
      );

    return {
      billId: args.billId,
      stored: {
        stage: stored.progressStage,
        recomputedFromStored: stored.recomputedStageFromStored,
        actionCount: stored.actionCount,
        latestActionDate: stored.latestActionDate,
        sponsor: `${stored.sponsorFirstName ?? ""} ${stored.sponsorLastName ?? ""} (${stored.sponsorParty ?? "?"}-${stored.sponsorState ?? "?"})`,
        policyArea: stored.policyAreaName,
        legSubjectCount: stored.legSubjectCount,
        summaryCount: stored.summaryCount,
        textCount: stored.textCount,
        enrichedBits: stored.extraSyncedBits,
      },
      live: {
        stage: liveStage,
        actionCount: liveActions.length,
        latestActionDate: liveMaxActionDate,
        sponsor: liveSponsor
          ? `${liveSponsor.firstName ?? ""} ${liveSponsor.lastName ?? ""} (${liveSponsor.party ?? "?"}-${liveSponsor.state ?? "?"})`
          : null,
        policyArea: livePolicyArea,
        legSubjectCount: liveLegSubjectCount,
        summaryCount: liveSummaryCount,
        textCount: liveTextCount,
        title: d?.title ?? null,
      },
      discrepancies,
      clean: discrepancies.length === 0,
    };
  },
});
