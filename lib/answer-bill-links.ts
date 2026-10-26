import { unified } from 'unified';
import remarkParse from 'remark-parse';

/**
 * Bills named in an answer's prose, made clickable where they are named.
 *
 * An answer used to list its bills twice: once as bullets in the prose, which
 * could not be clicked, and again as cards after them, which could. A reader
 * who wanted the first bullet had to find its card further down (2026-10-26,
 * "what is the tea for today"). This module finds which bill each part of the
 * prose is about, so the prose itself can link to it, and decides which lists
 * are lists OF bills, whose items can simply become the bills' cards.
 *
 * A bill is "named" when the prose cites it (`[n]`, where source n is that
 * bill's row, timeline or summary) or prints its number or title. Only bills
 * the answer was given count: the same guarantee as citations and cards.
 *
 * Pure module so it carries unit tests.
 */

export interface BillMention {
  id: string;
  href: string;
  label: string;
  title?: string;
  sponsor?: string;
  sponsorParty?: string;
  stage?: number;
  /** Whether the answer carries this bill's display projection (title, sponsor, stage). */
  known: boolean;
}

export interface AnswerBills {
  /** Citation number printed in the prose → the bill that source is about. */
  byNumber: Map<number, BillMention>;
  /** Every bill the answer can link, by id. */
  byId: Map<string, BillMention>;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

/** The bill a cited handle is about: its row, its timeline or its summary. */
function billIdOf(handle: string): string | null {
  const m = /^(bills|bill_actions|bill_summaries):([^:]+)/.exec(handle);
  return m ? m[2] : null;
}

export function answerBills(
  sources: string[],
  allowed: string[],
  entities: Record<string, Record<string, unknown>> = {},
): AnswerBills {
  const allowedSet = new Set(allowed);
  const byId = new Map<string, BillMention>();
  const mention = (id: string): BillMention => {
    const known = byId.get(id);
    if (known) return known;
    const d = entities[`bills:${id}`];
    const bill: BillMention = {
      id,
      href: `/bills/${id}`,
      label: str(d?.label) ?? id,
      title: str(d?.title),
      sponsor: str(d?.sponsor),
      sponsorParty: str(d?.sponsorParty),
      stage: typeof d?.progressStage === 'number' ? d.progressStage : undefined,
      known: Boolean(d),
    };
    byId.set(id, bill);
    return bill;
  };

  for (const handle of allowed) {
    if (handle.startsWith('bills:')) mention(handle.slice('bills:'.length));
  }
  const byNumber = new Map<number, BillMention>();
  sources.forEach((handle, i) => {
    const id = billIdOf(handle);
    // A cited handle the model was not given was already deleted from the
    // prose (convex/catalog/cite.ts); checked again so this never links one.
    if (id && allowedSet.has(handle) && !byNumber.has(i + 1)) byNumber.set(i + 1, mention(id));
  });
  return { byNumber, byId };
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** "H.R. 7022", "HR 7022" and "h.r.7022" are one name. */
function normal(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * A printed bill number, matched however the model punctuated it: the label's
 * letters and number with optional dots and spaces between them. Never inside
 * a longer number: "H.R. 1" must not match "H.R. 10".
 */
function labelPattern(label: string): string | null {
  const parts = label.match(/[A-Za-z]+|\d+/g);
  if (!parts || !/^\d+$/.test(parts[parts.length - 1]) || parts.length < 2) return null;
  const letters = parts
    .slice(0, -1)
    .map((p) => [...p].map((c) => `[${c.toUpperCase()}${c.toLowerCase()}]`).join(''));
  return `(?<![A-Za-z0-9.])${letters.join('\\.?\\s?')}\\.?\\s?${parts[parts.length - 1]}(?![A-Za-z0-9])`;
}

/**
 * One pattern for everything that names a bill: a citation `[n]`, a printed
 * number or a title. Longest first, so "Act of 2025" wins over a shorter title
 * it contains. Titles shorter than 8 characters are skipped: they match
 * ordinary words.
 */
const patterns = new WeakMap<AnswerBills, { re: RegExp; byText: Map<string, BillMention> }>();

function mentionPattern(bills: AnswerBills): { re: RegExp; byText: Map<string, BillMention> } {
  const cached = patterns.get(bills);
  if (cached) return cached;
  const candidates: { key: string; source: string; length: number; bill: BillMention }[] = [];
  for (const bill of bills.byId.values()) {
    const label = bill.known ? labelPattern(bill.label) : null;
    if (label) candidates.push({ key: normal(bill.label), source: label, length: bill.label.length, bill });
    if (bill.title && bill.title.length >= 8) {
      candidates.push({
        key: normal(bill.title),
        source: `(?<![\\w])${escape(bill.title)}(?![\\w])`,
        length: bill.title.length,
        bill,
      });
    }
  }
  // A name two bills share — House and Senate companions with one title, or
  // "H.R. 1" in two Congresses — names neither: linking or carding one of
  // them would be a guess. Their citations still say which is meant.
  const owners = new Map<string, Set<string>>();
  for (const c of candidates) owners.set(c.key, (owners.get(c.key) ?? new Set()).add(c.bill.id));
  const names = candidates.filter((c) => owners.get(c.key)!.size === 1);
  const byText = new Map(names.map((c) => [c.key, c.bill]));
  names.sort((a, b) => b.length - a.length);
  const re = new RegExp([String.raw`\[(\d+)\]`, ...names.map((n) => n.source)].join('|'), 'g');
  patterns.set(bills, { re, byText });
  return { re, byText };
}

/** The bill a match names, if any. */
function matchedBill(
  m: RegExpMatchArray,
  bills: AnswerBills,
  byText: Map<string, BillMention>,
): BillMention | undefined {
  return m[1] !== undefined ? bills.byNumber.get(Number(m[1])) : byText.get(normal(m[0]));
}

/** Every bill `text` names, in order of first mention. */
export function billsNamedIn(text: string, bills: AnswerBills): BillMention[] {
  if (bills.byId.size === 0) return [];
  const { re, byText } = mentionPattern(bills);
  const seen = new Map<string, BillMention>();
  for (const m of text.matchAll(re)) {
    const bill = matchedBill(m, bills, byText);
    if (bill && !seen.has(bill.id)) seen.set(bill.id, bill);
  }
  return [...seen.values()];
}

// ── Lists of bills ──────────────────────────────────────────────────────────

/**
 * Words a list item may use and still say nothing its card does not: the
 * glue of any English sentence, plus who sponsored the bill, where it stands
 * and when it last moved. Anything else — a noun or verb about what the bill
 * DOES ("would require flood alerts", "cuts taxes"), a vote tally, a dollar
 * figure — is the answer itself, and keeps the list as text.
 *
 * A list the model phrases in a way this misses stays text with its bills
 * linked: the safe way to be wrong. Every miss seen live is a test case in
 * lib/answer-bill-links.test.ts ("sponsored by…, with its latest action on…",
 * 2026-10-26).
 */
const CARD_SAYS = new Set(
  [
    // Sentence glue.
    'a an the and or but nor so yet as at by for from in into of off on onto out over per to up',
    'upon with within without via about after before since during until through between among',
    'it its it\'s this that these those which who whom whose what when where there here than then',
    'is are was were be been being has have had having do does did will would shall should can could may might',
    'he she they them his her their hers theirs one ones each both all any some other another same such',
    'also too just only still now already yet again most more very first second third last next new newest',
    'latest recent recently earlier later lately prior previous previously currently',
    // Who: the card prints the sponsor and the party dot.
    'rep reps representative representatives sen sens senator senators member members congressman',
    'congresswoman congressmember delegate commissioner resident lawmaker sponsor sponsors sponsored',
    'cosponsor cosponsors cosponsored introduced introducer filed authored led party republican',
    'republicans democrat democrats democratic independent independents gop',
    // What it is: the card prints the number and the title.
    'bill bills act measure measures resolution resolutions joint concurrent simple legislation',
    'law laws public private titled called named known short long official',
    // Where it stands and when: the card prints the stage.
    'status stage action actions acted activity move moved moving step date dated day days week weeks',
    'month months year years today yesterday ago referred committee committees subcommittee reported',
    'passed pass passes passing cleared agreed adopted enrolled presented signed sign signing vetoed veto',
    'became become becomes enacted enactment house senate chamber chambers floor congress president',
    'white vote voted voice unanimous consent received placed calendar ordered',
    'january february march april may june july august september october november december',
    'jan feb mar apr jun jul aug sep sept oct nov dec',
    'monday tuesday wednesday thursday friday saturday sunday',
    // Where the sponsor is from, which a sentence often adds.
    'district at-large alabama alaska arizona arkansas california colorado connecticut delaware florida',
    'georgia hawaii idaho illinois indiana iowa kansas kentucky louisiana maine maryland',
    'massachusetts michigan minnesota mississippi missouri montana nebraska nevada hampshire jersey',
    'mexico york carolina dakota ohio oklahoma oregon pennsylvania rhode island tennessee texas utah',
    'vermont virginia washington wisconsin wyoming puerto rico guam samoa islands columbia',
  ]
    .join(' ')
    .split(/\s+/),
);

const MONTH =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
/** "October 22, 2026", "Oct. 22", "22 October", "10/22/2026", "2026-10-22", "2026". */
const DATE = new RegExp(
  [
    `\\b${MONTH}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b`,
    `\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\b(?:,?\\s+\\d{4})?`,
    String.raw`\b\d{1,2}/\d{1,2}/\d{2,4}\b`,
    String.raw`\b\d{4}-\d{2}-\d{2}\b`,
    String.raw`\b(?:19|20)\d\d\b`,
  ].join('|'),
  'gi',
);

/**
 * The words of a list item about `bill` that its card would not say.
 *
 * The card prints the number, the title, the sponsor and the stage. The
 * sponsor's state, and dates, are not on it: an item that only adds those is
 * still a card (the reader taps through for them) — the owner chose the plain
 * card over a card carrying the answer's sentence. Any other number is the
 * answer ("passed 30 to 1", "$4 billion") and keeps the list as text, and so
 * does a citation of a source that is not this bill: that item states a fact
 * from somewhere else.
 */
export function wordsBeyondCard(item: string, bill: BillMention, bills: AnswerBills): string[] {
  // The bill's own number and title go first: "H.R. 1912" is not the year 1912.
  const { re } = mentionPattern({ byNumber: new Map(), byId: new Map([[bill.id, bill]]) });
  const rest = item
    .replace(/\[(\d+)\]/g, (cite, n) => (bills.byNumber.get(Number(n))?.id === bill.id ? ' ' : ' citedelsewhere '))
    .replace(re, ' ')
    .replace(/\b([RDIL]|ID)-[A-Z]{2}(-\d+|-AL)?\b/g, ' ')
    .replace(/\((?:[RDIL]|ID)\)/g, ' ')
    .replace(DATE, ' ');
  // The card prints the sponsor and the title, so their words say nothing new
  // either. Titles are paraphrased: "a resolution supporting National Marine
  // Sanctuary Day" for "Supporting the designation of October 23, 2026, as
  // 'National Marine Sanctuary Day'" (live, 2026-10-26).
  const cardWords = new Set(
    [...normalWords(bill.sponsor ?? ''), ...normalWords(bill.title ?? ''), ...acronyms(bill.title ?? '')].map(stem),
  );
  return normalWords(rest).filter((w) => !CARD_SAYS.has(w) && !cardWords.has(stem(w)));
}

/** Whether a list item about `bill` only identifies it — the card says all of it. */
export function onlyIdentifies(item: string, bill: BillMention, bills: AnswerBills): boolean {
  return wordsBeyondCard(item, bill, bills).length === 0;
}

/** "naming" and "name", "veterans" and "veteran": one word for this comparison. */
function stem(word: string): string {
  return word.replace(/(ing|ed|es|s|e)$/, '');
}

/** "Environmental Protection Agency" in a title lets an item say "EPA". */
function acronyms(title: string): string[] {
  const runs = title.match(/(?:\b[A-Z][a-z]+(?:\s+(?:of|and|for|the)\s+|\s+)?){2,}/g) ?? [];
  return runs.map((run) =>
    run
      .split(/\s+/)
      .filter((w) => /^[A-Z]/.test(w))
      .map((w) => w[0].toLowerCase())
      .join(''),
  );
}

function normalWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Text compared between the revealed answer and the full one: letters and digits only. */
function comparable(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** The few mdast fields read here (`mdast` types are only a transitive dependency). */
interface MdNode {
  type: string;
  value?: unknown;
  children?: MdNode[];
}

/** The plain text of a markdown node, with a space between its parts. */
function mdText(node: MdNode): string {
  if (typeof node.value === 'string') return node.value;
  return node.children ? node.children.map(mdText).join(' ') : '';
}

/**
 * The items of every top-level list in `text`, in order, as the page itself
 * will parse them: remark-parse is react-markdown's own parser, so a heading,
 * quote, code block or `* * *` ends a list here exactly where it ends on the
 * page. (A hand-written line parser did not, and handed one list's decision to
 * the next — a list of facts drawn as bill cards.)
 */
function topLevelLists(text: string): string[][] {
  const root = unified().use(remarkParse).parse(text) as MdNode;
  return (root.children ?? [])
    .filter((n) => n.type === 'list')
    .map((list) => (list.children ?? []).map(mdText));
}

/** A list of bills: the bill each item is, and each item's text to check the page against. */
export interface CardList {
  ids: string[];
  texts: string[];
}

/**
 * For each top-level list in `text`, in order: a `CardList` when it is a list
 * OF bills whose items can become the bills' cards; otherwise null. A list
 * qualifies only as a whole:
 *
 * - every item names exactly one bill, and no two items the same bill
 *   ("the key parts of H.R. 1", one bill per item, is a list of facts, and
 *   would otherwise turn into the same card three times);
 * - every bill has its card data (title, sponsor, stage);
 * - no item says more than its card would (`onlyIdentifies`). One item with
 *   the answer in it keeps the whole list as text, so a list never mixes.
 *
 * Read from the FULL answer, never the revealed part: a list must not start
 * as text and turn into cards, or back, as later items arrive.
 */
export function cardLists(text: string, bills: AnswerBills): (CardList | null)[] {
  return topLevelLists(text).map((items) => {
    if (bills.byId.size === 0) return null;
    const ids: string[] = [];
    for (const item of items) {
      const named = billsNamedIn(item, bills);
      if (named.length !== 1 || !named[0].known || !named[0].title) return null;
      if (ids.includes(named[0].id) || !onlyIdentifies(item, named[0], bills)) return null;
      ids.push(named[0].id);
    }
    return { ids, texts: items.map(comparable) };
  });
}

/** Every bill an answer shows as a card in one of its lists. */
export function cardListBills(text: string, bills: AnswerBills): Set<string> {
  return new Set(cardLists(text, bills).flatMap((list) => list?.ids ?? []));
}

// ── Rehype plugin ───────────────────────────────────────────────────────────
// Minimal structural hast types, as in lib/answer-reveal.ts.

interface HastText {
  type: 'text';
  value: string;
  position?: { start: { offset?: number }; end?: { offset?: number } };
}
interface HastElement {
  type: 'element';
  tagName: string;
  properties: Record<string, unknown>;
  children: HastNode[];
}
type HastNode = HastText | HastElement | { type: string; children?: HastNode[] };

function textOf(node: HastNode): string {
  if (node.type === 'text') return (node as HastText).value;
  return 'children' in node && node.children ? node.children.map(textOf).join('') : '';
}

const isElement = (n: HastNode): n is HastElement => n.type === 'element';

/**
 * Turns the bills an answer names into links, in place.
 *
 * - The n-th top-level list is a list of bills when `lists[n]` (from
 *   `cardLists` on the full text of this same block) says so AND the page's
 *   list agrees with it: every item's text is the start of the item it is
 *   meant to be, and names that item's bill or, while it is still being
 *   revealed, nothing yet. Then the list is marked `data-cards` and each item
 *   `data-bill`, and the renderers in components/answers/bill-mentions.tsx
 *   draw the items as the bills' cards — from an item's first revealed word,
 *   so it never shows as a bullet first. On any disagreement the list stays
 *   text: a wrong card is worse than a plain list.
 *   Nothing inside a card is linked: a link inside a link is invalid HTML.
 * - `hold`: the answer's sources have not arrived yet, so no list can be
 *   judged. Top-level lists are marked `data-pending` and drawn as nothing
 *   until they can be — otherwise a list of bills would show as bullets, then
 *   jump to cards.
 * - Everywhere else, the first time a paragraph or item names a bill links
 *   it, and every citation of a bill links to it.
 *
 * Runs BEFORE rehypeWordSpans, and keeps the position offsets of the text it
 * splits, so the word-by-word reveal still knows which words are new.
 */
export function rehypeBillLinks(options: {
  bills: AnswerBills;
  lists?: (CardList | null)[];
  hold?: boolean;
}) {
  const { bills, lists = [], hold = false } = options;
  return (tree: HastNode) => {
    if (bills.byId.size === 0 && !hold) return;
    const { re, byText } = mentionPattern(bills);
    let listIndex = 0;

    const linkText = (node: HastText, linked: Set<string>): HastNode[] => {
      if (bills.byId.size === 0) return [node];
      const origin = node.position?.start.offset;
      const at = (i: number): HastText['position'] =>
        origin === undefined ? undefined : { start: { offset: origin + i } };
      const out: HastNode[] = [];
      let cursor = 0;
      for (const m of node.value.matchAll(re)) {
        const bill = matchedBill(m, bills, byText);
        if (!bill) continue;
        const cite = m[1] !== undefined;
        // Names link once per block; citations always do.
        if (!cite && linked.has(bill.id)) continue;
        linked.add(bill.id);
        const start = m.index ?? 0;
        if (start > cursor) {
          out.push({ type: 'text', value: node.value.slice(cursor, start), position: at(cursor) });
        }
        out.push({
          type: 'element',
          tagName: 'a',
          properties: {
            href: bill.href,
            dataBill: bill.id,
            dataMention: cite ? 'cite' : 'name',
            ...(cite ? { dataCite: m[1] } : {}),
          },
          children: [{ type: 'text', value: m[0], position: at(start) }],
        });
        cursor = start + m[0].length;
      }
      if (out.length === 0) return [node];
      if (cursor < node.value.length) {
        out.push({ type: 'text', value: node.value.slice(cursor), position: at(cursor) });
      }
      return out;
    };

    /** Marks a list of bills as cards; false when the page's list disagrees. */
    const markCards = (list: HastElement, spec: CardList | null | undefined): boolean => {
      if (!spec) return false;
      const items = list.children.filter(isElement).filter((c) => c.tagName === 'li');
      const agrees =
        items.length > 0 &&
        items.length <= spec.ids.length &&
        items.every((li, i) => {
          const text = textOf(li);
          if (!spec.texts[i].startsWith(comparable(text))) return false;
          const named = billsNamedIn(text, bills);
          const last = i === items.length - 1;
          return named.length === 1 ? named[0].id === spec.ids[i] : named.length === 0 && last;
        });
      if (!agrees) return false;
      list.properties = { ...list.properties, dataCards: true };
      items.forEach((li, i) => (li.properties = { ...li.properties, dataBill: spec.ids[i] }));
      return true;
    };

    const walk = (node: HastNode, linked: Set<string>, nested: boolean) => {
      if (!('children' in node) || !node.children) return;
      if (isElement(node)) {
        if (['a', 'code', 'pre'].includes(node.tagName)) return;
        if ((node.tagName === 'ul' || node.tagName === 'ol') && !nested) {
          if (hold) {
            node.properties = { ...node.properties, dataPending: true };
            return;
          }
          if (markCards(node, lists[listIndex++])) return;
        }
        if (node.tagName === 'li' || node.tagName === 'blockquote') nested = true;
        // Each paragraph or list item links its own first mention.
        if (['p', 'li'].includes(node.tagName)) linked = new Set();
      }
      const next: HastNode[] = [];
      for (const child of node.children) {
        if (child.type === 'text') next.push(...linkText(child as HastText, linked));
        else {
          walk(child, linked, nested);
          next.push(child);
        }
      }
      node.children = next;
    };
    walk(tree, new Set(), false);
  };
}
