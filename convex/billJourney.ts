/**
 * A bill's journey, read from its actions: the day it reached each stage, and
 * the handful of moments a reader cares about along the way (the committee
 * vote, each chamber's passage and its tally, the signature).
 *
 * Pure (no Convex imports), like billStage.ts, so it is unit tested directly
 * and runs unchanged in a query.
 *
 * Stages come ONLY from `calculateBillStage`, run over every prefix of the
 * actions in date order. There is no second definition of "passed a chamber"
 * here: when that calculator learns a new wording, the journey learns it too,
 * and the journey can never disagree with the stage the rest of the site shows.
 * The bill page checks that the journey's last stage is the bill's stored stage
 * and draws nothing if they differ.
 */
import { BillStages, calculateBillStage, passedChamber } from "./billStage";

export type JourneyAction = {
  text: string;
  type?: string;
  actionCode?: string;
  actionDate?: string;
};

/** The bill reached `stage` on `date`. In date order; the first is Introduced. */
export type JourneyStep = { stage: number; date: string };

export type JourneyEventKind =
  | "introduced"
  | "referred"
  | "committee_vote"
  | "reported"
  | "passed"
  | "to_president"
  | "vetoed"
  | "signed"
  | "became_law";

export type JourneyEvent = {
  date: string;
  kind: JourneyEventKind;
  /** A plain sentence written here, from the record. Never model output. */
  label: string;
  chamber?: "house" | "senate";
  /** A recorded vote, when the action gives one. */
  yeas?: number;
  nays?: number;
  /** How it passed when there was no recorded vote. */
  how?: "unanimous consent" | "voice vote";
};

export type BillJourney = {
  steps: JourneyStep[];
  events: JourneyEvent[];
  /** `calculateBillStage` over every action, dated or not. */
  finalStage: number;
  actionCount: number;
};

const KIND_ORDER: Record<JourneyEventKind, number> = {
  introduced: 0,
  referred: 1,
  committee_vote: 2,
  reported: 3,
  passed: 4,
  to_president: 5,
  vetoed: 6,
  signed: 7,
  became_law: 8,
};

/**
 * "366 - 57" from "On passage Passed by the Yeas and Nays: 366 - 57 (Roll no.
 * 151)", "Ordered to be Reported (Amended) by the Yeas and Nays: 36 - 13.",
 * "Passed Senate ... by Yea-Nay Vote. 68 - 30." or "by recorded vote: 218 - 214".
 */
export function parseTally(text: string): { yeas: number; nays: number } | null {
  const m = /(?:yeas and nays|recorded vote|yea-nay vote)\s*[:.]?\s*(\d+)\s*-\s*(\d+)/i.exec(text);
  if (!m) return null;
  return { yeas: Number(m[1]), nays: Number(m[2]) };
}

function parseHow(text: string): JourneyEvent["how"] {
  const t = text.toLowerCase();
  if (t.includes("unanimous consent")) return "unanimous consent";
  if (t.includes("voice vote")) return "voice vote";
  return undefined;
}

/**
 * "Energy and Commerce" from "Referred to the Committee on Energy and Commerce,
 * and in addition to the Committees on …", and "Health, Education, Labor, and
 * Pensions" from "… referred to the Committee on Health, Education, Labor, and
 * Pensions." (and "the Judiciary", article kept) — so it stops at a full stop or the clause after the name, not at
 * the first comma.
 */
export function committeeName(text: string): string | null {
  const m = /Committee on (.+?)(?:\.|,? and in addition|, for a period|;|$)/i.exec(text);
  return m ? m[1].trim() : null;
}

const CHAMBER_NAME = { house: "House", senate: "Senate" } as const;

export function buildJourney(
  actions: JourneyAction[],
  introducedDate: string,
): BillJourney {
  const dated = actions
    .filter((a): a is JourneyAction & { actionDate: string } => Boolean(a.actionDate))
    .sort((a, b) => (a.actionDate < b.actionDate ? -1 : a.actionDate > b.actionDate ? 1 : 0));

  // Stage after each day's actions. Monotone in practice, because the
  // calculator's flags only ever switch on; a change is recorded either way.
  const steps: JourneyStep[] = [{ stage: BillStages.INTRODUCED, date: introducedDate }];
  const days = [...new Set(dated.map((a) => a.actionDate))];
  let end = 0;
  for (const day of days) {
    while (end < dated.length && dated[end].actionDate <= day) end++;
    const { stage } = calculateBillStage(dated.slice(0, end));
    if (stage !== steps[steps.length - 1].stage) steps.push({ stage, date: day });
  }

  const events: JourneyEvent[] = [];
  if (introducedDate) events.push({ date: introducedDate, kind: "introduced", label: "Introduced" });
  const seen = new Set<string>();
  const once = (key: string) => {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };

  for (const a of dated) {
    const text = a.text || "";
    const lower = text.toLowerCase();

    if (lower.includes("referred to") && once("referred")) {
      const name = committeeName(text);
      events.push({
        date: a.actionDate,
        kind: "referred",
        label: name
          ? `Sent to the Committee on ${name}${/in addition/i.test(text) ? " and others" : ""}`
          : "Sent to committee",
      });
      continue;
    }

    if (lower.includes("ordered to be reported")) {
      const tally = parseTally(text);
      const how = parseHow(text);
      if (once(`committee_vote:${a.actionDate}`)) {
        events.push({
          date: a.actionDate,
          kind: "committee_vote",
          label: "A committee voted to send it to the floor",
          ...(tally ?? {}),
          ...(tally ? {} : how ? { how } : {}),
        });
      }
      continue;
    }

    if (/^reported\b/i.test(text) && lower.includes("by the committee") && once("reported")) {
      events.push({ date: a.actionDate, kind: "reported", label: "Reported to the floor" });
      continue;
    }

    const chamber = passedChamber(a);
    if (chamber && once(`passed:${chamber}`)) {
      // The tally is often on a sibling action from another source system the
      // same day ("On passage Passed by the Yeas and Nays: 366 - 57").
      const sameDay = dated.filter((s) => s.actionDate === a.actionDate);
      const withTally = [a, ...sameDay].find(
        (s) => (passedChamber(s) === chamber || /on passage/i.test(s.text)) && parseTally(s.text),
      );
      const tally = withTally ? parseTally(withTally.text) : null;
      const how = tally ? undefined : sameDay.map((s) => parseHow(s.text)).find(Boolean);
      events.push({
        date: a.actionDate,
        kind: "passed",
        chamber,
        label: `Passed the ${CHAMBER_NAME[chamber]}`,
        ...(tally ?? {}),
        ...(how ? { how } : {}),
      });
      continue;
    }

    if (lower.includes("presented to president") && once("to_president")) {
      events.push({ date: a.actionDate, kind: "to_president", label: "Presented to the President" });
      continue;
    }
    if ((lower.includes("vetoed") || lower.includes("pocket veto")) && once("vetoed")) {
      events.push({ date: a.actionDate, kind: "vetoed", label: "Vetoed by the President" });
      continue;
    }
    if (lower.includes("signed by president") && once("signed")) {
      events.push({ date: a.actionDate, kind: "signed", label: "Signed by the President" });
      continue;
    }
    const law = /became (public|private) law no:\s*([\d-]+)/i.exec(text);
    if (law && once("became_law")) {
      events.push({
        date: a.actionDate,
        kind: "became_law",
        // "Became Public Law 119-44", the name the law goes by.
        label: `Became ${law[1][0].toUpperCase()}${law[1].slice(1).toLowerCase()} Law ${law[2]}`,
      });
    }
  }

  events.sort((x, y) =>
    x.date < y.date ? -1 : x.date > y.date ? 1 : KIND_ORDER[x.kind] - KIND_ORDER[y.kind],
  );

  return {
    steps,
    events,
    finalStage: calculateBillStage(actions).stage,
    actionCount: actions.length,
  };
}
