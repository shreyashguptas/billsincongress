// Relative, not '@/…', so the glossary test can load it under plain `tsx`.
import { BillStages, isStageOnPath, stagePath, type BillStage } from './utils/bill-stages';

/**
 * The site's one dictionary of civics words (documentation/brand.md, "Term").
 *
 * Every definition is written for a sixth-grader: one or two short sentences,
 * no word that itself needs a definition, and nothing a reader could take as
 * an opinion. `<Term>` (components/brand/term.tsx) shows one in a popover where
 * the word appears; the Learn page lists them all under "Words you'll see"
 * (`/learn#words`), each with its own anchor (`/learn#word-<id>`).
 *
 * Add a word here, not in a component. Keep it to words a reader actually meets
 * on the site.
 */

export type TermGroup = 'people' | 'measures' | 'steps' | 'votes';

export interface TermEntry {
  /** The word as a heading: sentence case, the way the site prints it. */
  word: string;
  /** One or two plain sentences. */
  definition: string;
  group: TermGroup;
  /** A stage this word names, so Learn and the popover can show its dot. */
  stage?: BillStage;
  /**
   * Phrases `termify()` finds in running text, longest first. Matched whole
   * word and case-insensitively. Empty: the word is only ever placed by hand.
   */
  match?: string[];
}

export const TERMS = {
  // ── People and places ──────────────────────────────────────────────
  congress: {
    word: 'Congress',
    group: 'people',
    definition:
      'The 535 senators and representatives Americans elect to make the country’s laws, plus six delegates who cannot cast final votes. They meet in two rooms: the House and the Senate.',
  },
  'congress-number': {
    word: 'Congress numbers',
    group: 'people',
    definition:
      'Congress is counted in two-year rounds: the 119th meets in 2025 and 2026. Anything not finished when its round ends has to start over.',
    match: ['119th Congress', '118th Congress', '117th Congress'],
  },
  chamber: {
    word: 'Chamber',
    group: 'people',
    definition: 'One of the two rooms of Congress: the House or the Senate. Each one votes on its own.',
    match: ['chambers', 'chamber'],
  },
  house: {
    word: 'House of Representatives',
    group: 'people',
    definition:
      'The bigger room of Congress, with 435 voting members, elected every two years. States with more people get more seats.',
    match: ['House of Representatives'],
  },
  senate: {
    word: 'Senate',
    group: 'people',
    definition: 'The smaller room of Congress, with 100 members: two from every state. Senators serve six-year terms.',
  },
  representative: {
    word: 'Representative',
    group: 'people',
    definition:
      'A voting member of the House, elected by one district in a state. Six more members, for D.C. and the territories, can bring in bills but cannot vote on passing them.',
  },
  senator: {
    word: 'Senator',
    group: 'people',
    definition: 'A member of the Senate. Each one speaks for their whole state.',
  },
  district: {
    word: 'District',
    group: 'people',
    definition:
      'The part of a state that one Representative speaks for. Each holds about 760,000 people, so big states have many and the smallest states have just one.',
  },
  committee: {
    word: 'Committee',
    group: 'people',
    definition:
      'A small group of members who study bills on one subject, like health or farms, before the whole room votes. Most bills stop here.',
    match: ['committees', 'committee'],
  },
  floor: {
    word: 'The floor',
    group: 'people',
    definition: 'The full room, where members debate and vote. “Sent to the floor” means it is ready for that vote.',
    match: ['floor'],
  },
  crs: {
    word: 'Congressional Research Service',
    group: 'people',
    definition:
      'A team of experts who work for all of Congress, not for any party. They write plain summaries of bills, often weeks after a bill is introduced.',
    match: ['Congressional Research Service'],
  },

  // ── Kinds of measure ───────────────────────────────────────────────
  bill: {
    word: 'Bill',
    group: 'measures',
    definition:
      'A written idea for a new law. Once both rooms pass the same words, it becomes law if the President signs it, if 10 days pass without a veto while Congress meets, or if Congress overrides a veto.',
  },
  resolution: {
    word: 'Resolution',
    group: 'measures',
    definition:
      'A statement one or both rooms vote on, like honoring a person or setting their own rules. Most resolutions can never become law.',
    match: ['resolutions', 'resolution'],
  },
  'simple-resolution': {
    word: 'Simple resolution',
    group: 'measures',
    definition:
      'A resolution for one room only (H.Res. or S.Res.), finished once that room agrees to it. It is not a law.',
    match: ['simple resolutions', 'simple resolution'],
  },
  'concurrent-resolution': {
    word: 'Concurrent resolution',
    group: 'measures',
    definition:
      'A resolution both rooms agree to, often about how Congress itself runs. It never goes to the President, so it is not a law.',
    match: ['concurrent resolutions', 'concurrent resolution'],
  },
  'joint-resolution': {
    word: 'Joint resolution',
    group: 'measures',
    definition:
      'Usually works like a bill: both rooms pass it and the President signs it. One that proposes a change to the Constitution needs two-thirds of each room, then goes to the states instead.',
    match: ['joint resolutions', 'joint resolution'],
  },
  sponsor: {
    word: 'Sponsor',
    group: 'measures',
    definition: 'The member of Congress who brings a bill or resolution in and leads it. There is always exactly one.',
  },
  cosponsor: {
    word: 'Cosponsor',
    group: 'measures',
    definition:
      'A member who signs on to support another member’s bill or resolution. There can be none or hundreds.',
  },

  // ── Steps on the road ──────────────────────────────────────────────
  introduced: {
    word: 'Introduced',
    group: 'steps',
    stage: BillStages.INTRODUCED,
    definition: 'A member has formally handed it in. It gets a number, like H.R. 1276 or H.Res. 5, and its journey starts.',
  },
  'in-committee': {
    word: 'In committee',
    group: 'steps',
    stage: BillStages.IN_COMMITTEE,
    definition:
      'It was sent to a committee, which usually decides whether the whole room ever votes on it. Most bills and resolutions never leave this step.',
  },
  'out-of-committee': {
    word: 'Out of committee',
    group: 'steps',
    stage: BillStages.OUT_OF_COMMITTEE,
    definition:
      'It is ready for the full room: it left committee, or never went to one. It is waiting for a vote.',
  },
  'passed-one-chamber': {
    word: 'Passed one chamber',
    group: 'steps',
    stage: BillStages.PASSED_ONE_CHAMBER,
    definition:
      'One room said yes. The other room has to say yes too, and in the end both must agree to the very same words.',
  },
  'passed-both-chambers': {
    word: 'Passed both chambers',
    group: 'steps',
    stage: BillStages.PASSED_BOTH_CHAMBERS,
    definition:
      'The House and the Senate have each passed it. If their versions differ, they must agree on one text before it can go further.',
  },
  'to-president': {
    word: 'To the President',
    group: 'steps',
    stage: BillStages.TO_PRESIDENT,
    definition:
      'The President has 10 days (not counting Sundays) to sign or veto it. If neither happens it becomes law anyway, unless Congress is away so it can’t be sent back; then it dies.',
  },
  veto: {
    word: 'Veto',
    group: 'steps',
    stage: BillStages.VETOED,
    definition:
      'The President says no. Congress can override a veto, making the bill law, if two in three of the members voting in each room agree.',
  },
  signed: {
    word: 'Signed by the President',
    group: 'steps',
    stage: BillStages.SIGNED_BY_PRESIDENT,
    definition: 'The President said yes. The bill is a law now; its official law number comes later.',
  },
  'became-law': {
    word: 'Became law',
    group: 'steps',
    stage: BillStages.BECAME_LAW,
    definition:
      'The bill finished the whole road. It is a law of the United States now.',
  },
  'public-law': {
    word: 'Public Law',
    group: 'steps',
    definition:
      'The number a new law goes by. Public Law 119-105 is the 105th law of the 119th Congress.',
  },
  'agreed-to': {
    word: 'Agreed to',
    group: 'steps',
    definition:
      'The word Congress uses when a room approves a resolution. For a simple resolution that is the finish line; a concurrent resolution needs both rooms to agree.',
  },

  // ── How a room votes ───────────────────────────────────────────────
  'voice-vote': {
    word: 'Voice vote',
    group: 'votes',
    definition:
      'Members call out “yes” or “no” together, and the member running the vote decides which side was louder. No one’s vote is written down.',
    match: ['voice vote'],
  },
  'unanimous-consent': {
    word: 'Unanimous consent',
    group: 'votes',
    definition: 'The member running the session asks if anyone objects. If no one does, it passes without a vote.',
    match: ['unanimous consent'],
  },
  'recorded-vote': {
    word: 'Recorded vote',
    group: 'votes',
    definition: 'Each member’s yes or no is counted and written down, so anyone can look up how they voted.',
  },
} satisfies Record<string, TermEntry>;

export type TermId = keyof typeof TERMS;

export const TERM_IDS = Object.keys(TERMS) as TermId[];

export function getTerm(id: TermId): TermEntry {
  return TERMS[id];
}

/** The anchor of a word on the Learn page. */
export function termHref(id: TermId): string {
  return `/learn#word-${id}`;
}

export const TERM_GROUPS: { id: TermGroup; title: string }[] = [
  { id: 'people', title: 'Who and where' },
  { id: 'measures', title: 'What they vote on' },
  { id: 'steps', title: 'Steps on the road' },
  { id: 'votes', title: 'How a room votes' },
];

/**
 * The word that explains a stage as the page names it. A resolution that was
 * agreed to is stage 60 or 80 in the data, but the page says "Agreed to", so it
 * takes that word, not "Passed one chamber": a concurrent resolution one room
 * agreed to ("Agreed to by one chamber") too, since "Agreed to" says it needs
 * both rooms (/bills/93hconres119 listed "Passed one chamber" under it).
 */
export function stageTermId(stage: number, billType?: string | null): TermId | null {
  const path = stagePath(billType);
  if (path === 'simple_resolution' && stage >= BillStages.PASSED_ONE_CHAMBER && stage <= BillStages.PASSED_BOTH_CHAMBERS) {
    return 'agreed-to';
  }
  if (
    path === 'concurrent_resolution' &&
    (stage === BillStages.PASSED_ONE_CHAMBER || stage === BillStages.PASSED_BOTH_CHAMBERS)
  ) {
    return 'agreed-to';
  }
  switch (stage) {
    case BillStages.INTRODUCED:
      return 'introduced';
    case BillStages.IN_COMMITTEE:
      return 'in-committee';
    case BillStages.OUT_OF_COMMITTEE:
      return 'out-of-committee';
    case BillStages.PASSED_ONE_CHAMBER:
      return 'passed-one-chamber';
    case BillStages.PASSED_BOTH_CHAMBERS:
      return 'passed-both-chambers';
    case BillStages.VETOED:
      return 'veto';
    case BillStages.TO_PRESIDENT:
      return 'to-president';
    case BillStages.SIGNED_BY_PRESIDENT:
      return 'signed';
    case BillStages.BECAME_LAW:
      return 'became-law';
    default:
      return null;
  }
}

/** The word for a measure's own kind, from its type code or printed type. */
export function measureTermId(billType?: string | null): TermId {
  const path = stagePath(billType);
  if (path === 'simple_resolution') return 'simple-resolution';
  if (path === 'concurrent_resolution') return 'concurrent-resolution';
  const t = (billType ?? '').toLowerCase().replace(/[^a-z]/g, '');
  return t === 'hjres' || t === 'sjres' ? 'joint-resolution' : 'bill';
}

export type TermPiece = string | { id: TermId; text: string };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Split running text into plain strings and the first match of each listed
 * word, so a sentence written as a string (a hub's explainer, a resolution's
 * road note, a timeline action) can carry `<Term>`s. Only the FIRST time each
 * word appears is marked: underlining every "committee" in a paragraph turns
 * help into noise.
 */
export function termify(text: string, ids: TermId[]): TermPiece[] {
  const phrases: { id: TermId; phrase: string }[] = [];
  for (const id of ids) {
    const entry: TermEntry = TERMS[id];
    for (const phrase of entry.match ?? [entry.word]) phrases.push({ id, phrase });
  }
  if (phrases.length === 0) return [text];
  // Longest first, so "simple resolution" wins over "resolution".
  phrases.sort((a, b) => b.phrase.length - a.phrase.length);
  const re = new RegExp(`\\b(${phrases.map((p) => escapeRegExp(p.phrase)).join('|')})\\b`, 'gi');
  const used = new Set<TermId>();
  const out: TermPiece[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const hit = phrases.find((p) => p.phrase.toLowerCase() === m[0].toLowerCase());
    if (!hit || used.has(hit.id)) continue;
    used.add(hit.id);
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push({ id: hit.id, text: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * The current stage in one plain sentence, printed under the stage's name in a
 * bill's status card, so the most important word on the page never waits for
 * a tap. It says what the stage means, never what will happen to this bill.
 * Null for a word that is not a stage.
 *
 * `congressEnded`: the measure's Congress is over. A measure that had not
 * finished then expired with it, so a present-tense line ("a small group of
 * members is studying it") would be false; it gets no line, and the card's
 * "What happens next" says it expired.
 */
export function stageLine(id: TermId, billType?: string | null, congressEnded = false): string | null {
  if (congressEnded && id !== 'agreed-to' && id !== 'signed' && id !== 'became-law') return null;
  if (id === 'agreed-to') {
    return stagePath(billType) === 'concurrent_resolution'
      ? 'Both rooms said yes. For this kind of resolution, that is the finish line.'
      : 'The room said yes. For this kind of resolution, that is the finish line.';
  }
  if (id === 'passed-one-chamber' && stagePath(billType) === 'concurrent_resolution') {
    return 'One room said yes. The other room has to say yes too.';
  }
  return STAGE_LINES[id] ?? null;
}

/**
 * The status card's line for a measure, from its stage and type: what the bill
 * page prints under the stage's name. The type is passed all the way down, so a
 * concurrent resolution agreed to by both rooms says so ("Both rooms said
 * yes"), not "The room said yes". Null for a stage off the measure's road.
 */
export function statusCardLine(stage: number, billType: string | null | undefined, congressEnded = false): string | null {
  if (!isStageOnPath(stage, billType)) return null;
  // Agreed to by one chamber: its word is "Agreed to", its line half-way.
  if (stagePath(billType) === 'concurrent_resolution' && stage === BillStages.PASSED_ONE_CHAMBER) {
    return stageLine('passed-one-chamber', billType, congressEnded);
  }
  const id = stageTermId(stage, billType);
  return id ? stageLine(id, billType, congressEnded) : null;
}

const STAGE_LINES: Partial<Record<TermId, string>> = {
  introduced: 'A member handed it in. It is the first step for every bill.',
  'in-committee': 'It is with a small group of members, who decide whether it moves on. Most bills stop here.',
  'out-of-committee': 'It is out of committee, or never went to one, and is waiting for a vote by the whole room.',
  'passed-one-chamber': 'One room voted yes. The other room has to pass the same words too.',
  'passed-both-chambers':
    'The House and the Senate have each passed it. If their versions differ, they must agree on one text before it can go further.',
  'to-president': 'Both rooms said yes and sent it to the President, who can sign it or veto it.',
  veto: 'The President said no. Congress can overrule a veto only if two in three of the members voting in each room agree.',
  signed: 'The President signed it, so it is a law. Its law number comes later.',
  'became-law': 'It is a law of the United States now.',
};

/** At most this many words in a bill page's "Words to know" list. */
export const BILL_WORDS_MAX = 9;

/**
 * When a bill page uses more words than the list holds, these are kept first:
 * the words a reader is least likely to know and that only that page explains
 * (how its votes went, its law number), then the everyday ones. A journey's
 * other stage names come last: Learn's picture story covers the whole road.
 */
const BILL_WORDS_PRIORITY: TermId[] = [
  'public-law',
  'voice-vote',
  'unanimous-consent',
  'veto',
  'cosponsor',
  'sponsor',
  'crs',
  'floor',
  'congress-number',
];

/**
 * The words a bill page's "Words to know" list holds (documentation/brand.md,
 * "Words to know"): the measure's own kind first, then the words that page
 * prints, in the order a reader meets them, at most `BILL_WORDS_MAX`. Pass
 * every word the page used in reading order, and the current stage's word,
 * which is always kept; duplicates are dropped. When there are too many, the
 * kind, the current stage and `BILL_WORDS_PRIORITY` win the places.
 */
export function billPageWords(
  measure: TermId,
  used: (TermId | null | undefined | false)[],
  stage: TermId | null = null,
): TermId[] {
  const seen: TermId[] = [];
  for (const id of used) if (id && id !== measure && !seen.includes(id)) seen.push(id);
  const keep = new Set<TermId>([measure]);
  const take = (id: TermId) => {
    if (keep.size < BILL_WORDS_MAX && seen.includes(id)) keep.add(id);
  };
  if (stage) take(stage);
  BILL_WORDS_PRIORITY.forEach(take);
  seen.forEach(take);
  return [measure, ...seen.filter((id) => keep.has(id))];
}
