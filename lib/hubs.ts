/**
 * The hub taxonomy: the browse pages that sit between the homepage and the
 * 55,000 individual bill pages.
 *
 * Why these exist: the site has exactly two kinds of page today — one homepage
 * and 55,533 bill pages — with nothing in between. That is a problem twice
 * over. People search for lists ("house bills", "bills that became law",
 * "healthcare bills") and land on a generic tracker that answers none of them;
 * and a crawler starting at the homepage can reach ten bills by following
 * links, so 99.98% of the corpus is discoverable only by reading the sitemap.
 *
 * The trap being avoided: a hub that is just the bills list with a different
 * heading is a doorway page, and shipping hundreds of them can cost more than
 * it earns. So every hub here carries an `explainer` — a plain-language account
 * of what that status, chamber or topic actually means — and the set is
 * deliberately small. Sponsor pages (~535) and legislative-subject pages
 * (~5,000) are excluded for exactly this reason.
 *
 * Pure module (no imports beyond the shared constants) so it can carry unit
 * tests and run unchanged on the server render and in the browser.
 */
import { POLICY_AREAS } from './constants/filters';

export type HubKind = 'chamber' | 'status' | 'topic';

export interface HubDefinition {
  kind: HubKind;
  /** Path under the site root, e.g. `/bills/house`. */
  path: string;
  /** The <h1>. */
  heading: string;
  /** <title>. */
  metaTitle: string;
  /** <meta name="description">. */
  metaDescription: string;
  /**
   * Plain-language explanation of what this grouping means, shown on the page.
   * This is the thing that makes a hub a document rather than a filtered list
   * with a new heading.
   */
  explainer: string;
  /** Filter args handed to the bills service. */
  filter: {
    chamber?: 'house' | 'senate';
    progressStage?: string;
    policyArea?: string;
  };
}

/** Turn a policy area name into a URL slug. */
export function topicSlug(policyArea: string): string {
  return policyArea
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Reverse of `topicSlug`, or null when the slug names no known policy area. */
export function policyAreaFromSlug(slug: string): string | null {
  return POLICY_AREAS.find((area) => topicSlug(area) === slug) ?? null;
}

const CHAMBER_HUBS: HubDefinition[] = [
  {
    kind: 'chamber',
    path: '/bills/house',
    heading: 'House bills',
    metaTitle: 'House Bills — Every Bill Introduced in the U.S. House',
    metaDescription:
      'Every bill and resolution introduced in the U.S. House of Representatives, with current status, sponsor and progress. Updated daily from Congress.gov.',
    explainer:
      'Legislation that originates in the House of Representatives. This covers ordinary House bills (H.R.) as well as the three kinds of resolution the House uses: simple resolutions (H.Res.), which bind only the House; joint resolutions (H.J.Res.), which go to the President and carry the force of law; and concurrent resolutions (H.Con.Res.), which express the position of both chambers without becoming law.',
    filter: { chamber: 'house' },
  },
  {
    kind: 'chamber',
    path: '/bills/senate',
    heading: 'Senate bills',
    metaTitle: 'Senate Bills — Every Bill Introduced in the U.S. Senate',
    metaDescription:
      'Every bill and resolution introduced in the U.S. Senate, with current status, sponsor and progress. Updated daily from Congress.gov.',
    explainer:
      'Legislation that originates in the Senate. This covers ordinary Senate bills (S.) as well as simple resolutions (S.Res.), which bind only the Senate; joint resolutions (S.J.Res.), which go to the President and carry the force of law; and concurrent resolutions (S.Con.Res.), which express the position of both chambers without becoming law.',
    filter: { chamber: 'senate' },
  },
];

/**
 * Status hubs, restricted to stages that actually hold bills.
 *
 * Measured against production (re-checked 2026-08-29): stages 90 (to President)
 * and 95 (signed) are 0 in all three Congresses, and stage 80 (passed both
 * chambers) holds just 2 bills, both in the 117th — the pipeline records those
 * transitions as "became law" instead. Pages for them would be empty or
 * near-empty, so they are deliberately absent.
 *
 * Note stage 85 (vetoed) IS here: it is small but real (13 in the 118th, 2 in
 * the 119th), and a status the site can filter by must be a status the site can
 * show.
 */
const STATUS_HUBS: HubDefinition[] = [
  {
    kind: 'status',
    path: '/bills/enacted',
    heading: 'Bills that became law',
    metaTitle: 'Bills That Became Law — Enacted Legislation in Congress',
    metaDescription:
      'Every bill that completed the legislative process and became law, with the date it was enacted and who sponsored it.',
    explainer:
      'These bills finished the whole journey: passed the House, passed the Senate in identical form, and were signed by the President — or became law without a signature, or over a veto. This is the small minority. Of roughly 18,000 bills introduced in a typical Congress, a few hundred reach this point.',
    filter: { progressStage: '100' },
  },
  {
    kind: 'status',
    path: '/bills/in-committee',
    heading: 'Bills in committee',
    metaTitle: 'Bills in Committee — Legislation Awaiting Action',
    metaDescription:
      'Bills currently referred to a congressional committee, the stage where the large majority of legislation stops.',
    explainer:
      'After introduction a bill is referred to the committee with jurisdiction over its subject. The committee may hold hearings, amend it, vote it forward — or, far more often, never take it up at all. A bill that is never scheduled simply dies when the Congress ends. This is where most legislation is at any given moment, and where most of it stays.',
    filter: { progressStage: '40' },
  },
  {
    kind: 'status',
    path: '/bills/passed-one-chamber',
    heading: 'Bills that passed one chamber',
    metaTitle: 'Bills That Passed One Chamber — Half-Way Through Congress',
    metaDescription:
      'Bills approved by either the House or the Senate but not yet by both, and so not yet law.',
    explainer:
      'These bills cleared a floor vote in one chamber and now await the other. To become law, the second chamber must pass the identical text — any differences have to be reconciled first. Passing one chamber is real progress and still no guarantee: many bills stop here when the other chamber never takes them up.',
    filter: { progressStage: '60' },
  },
  {
    kind: 'status',
    path: '/bills/introduced',
    heading: 'Newly introduced bills',
    metaTitle: 'Newly Introduced Bills in Congress',
    metaDescription:
      'Bills formally introduced in Congress and not yet referred onward or acted upon.',
    explainer:
      'A bill enters the record when a member formally introduces it. At this point it has a number and a sponsor but no committee action behind it yet. Introduction is a low bar — any member may introduce any bill — so this stage says what someone proposed, not what Congress is likely to do.',
    filter: { progressStage: '20' },
  },
  {
    kind: 'status',
    path: '/bills/vetoed',
    heading: 'Vetoed bills',
    metaTitle: 'Vetoed Bills — Legislation Rejected by the President',
    metaDescription:
      'Bills passed by both chambers of Congress and rejected by the President.',
    explainer:
      'These bills passed both the House and the Senate and were then rejected by the President. A veto is not necessarily the end: Congress can override one with a two-thirds vote in both chambers, though that threshold is high enough that overrides are rare. Vetoes are uncommon, so this is a short list by nature — and a complete one.',
    filter: { progressStage: '85' },
  },
];

function topicHub(policyArea: string): HubDefinition {
  return {
    kind: 'topic',
    path: `/bills/topic/${topicSlug(policyArea)}`,
    heading: `${policyArea} bills`,
    metaTitle: `${policyArea} Bills in Congress — Status and Progress`,
    metaDescription: `Every bill before Congress on ${policyArea.toLowerCase()}, with current status, sponsor and progress. Updated daily from Congress.gov.`,
    explainer: `Every bill whose primary policy area is ${policyArea}. The Congressional Research Service assigns each bill exactly one policy area out of ${POLICY_AREAS.length}, chosen to reflect what the bill is mainly about — so a bill appears here rather than under a second, related heading.`,
    filter: { policyArea },
  };
}

export const TOPIC_HUBS: HubDefinition[] = POLICY_AREAS.map(topicHub);

/** Every hub, in the order they should be listed. */
export const ALL_HUBS: HubDefinition[] = [
  ...CHAMBER_HUBS,
  ...STATUS_HUBS,
  ...TOPIC_HUBS,
];

/** Hubs of one kind, for cross-linking between siblings. */
export function hubsOfKind(kind: HubKind): HubDefinition[] {
  return ALL_HUBS.filter((h) => h.kind === kind);
}

/** Look up a hub by its path, or null. */
export function hubByPath(path: string): HubDefinition | null {
  return ALL_HUBS.find((h) => h.path === path) ?? null;
}

/**
 * The single-segment slugs that live directly under `/bills`, which is also
 * where individual bill pages live. Kept here so a test can assert they can
 * never collide: a bill id is always digits, then letters, then digits
 * ("9631hr119"), and every slug below starts with a letter.
 */
export const RESERVED_BILL_SLUGS: string[] = [
  ...CHAMBER_HUBS,
  ...STATUS_HUBS,
].map((h) => h.path.replace('/bills/', ''));
