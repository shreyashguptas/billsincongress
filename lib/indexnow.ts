/**
 * The IndexNow key, and the public file that proves we control this domain.
 *
 * Bing carries essentially all of this site's search traffic (200,340
 * impressions all-time against Google's 364 in 78 days) and has listed "Set up
 * IndexNow" as its top recommendation for weeks. The fit is unusually good
 * here: a bill sits at "in committee" for months and then becomes law, and
 * nothing about its URL changes when it does, so a crawler has no way to know.
 *
 * **Google does not participate.** The engines behind api.indexnow.org are
 * Bing, Yandex, Seznam and Naver. This moves Bing; it does nothing for Google,
 * and it should not be described as if it did.
 *
 * ── On the key being committed ────────────────────────────────────────────
 *
 * INDEXNOW_KEY is not a credential. The protocol requires it to be served in
 * plain text at a public URL on this domain — that publication *is* the proof
 * of domain control, in the same way a DNS TXT record is. Anyone can read it,
 * and knowing it grants no access to anything. It does look exactly like a
 * secret to a scanner, which is the point of this paragraph.
 *
 * ── On it existing twice ──────────────────────────────────────────────────
 *
 * The submitting code lives in `convex/indexNow.ts`, which cannot import this
 * file: Convex bundles its own directory, nothing in `convex/` imports from
 * outside it, and the `@/` alias does not resolve there. So the key is written
 * out in both places, and `lib/indexnow.test.ts` reads all three copies — this
 * constant, the Convex constant, and the served file — and fails if any two
 * disagree. A comment asking people to keep them in sync would not have been
 * enough; the symptom of drift is every submission returning 403 with nothing
 * on our side saying why.
 */

/** 8–128 chars of `a-z A-Z 0-9 -`, per the IndexNow spec. */
export const INDEXNOW_KEY = '0e777a2e9680e516333e5d77dd7c37b9';

/** The site whose URLs this key may announce. */
export const INDEXNOW_HOST = 'billsincongress.com';

/** Where the key file is served. Its location is what scopes which URLs may be
 *  submitted — at the root, all of them. */
export function indexNowKeyUrl(): string {
  return `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`;
}
