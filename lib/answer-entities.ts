/**
 * Entity directives (spec §6.6).
 *
 * Two distinct affordances, deliberately not conflated:
 *   - citations  -> "how do you know that?"  (lib/answer-format.ts)
 *   - entities   -> "show me"                 (this file)
 *
 * Directives are resolved against the handles the model actually received, so
 * an entity it invents cannot render — the same guarantee as citations.
 *
 * Pure module so it carries unit tests.
 */

export interface EntityRef {
  kind: 'bill' | 'sponsor' | 'topic' | 'state';
  id: string;
  href: string;
}

export type AnswerBlock =
  | { type: 'prose'; text: string }
  | { type: 'entities'; kind: EntityRef['kind']; refs: EntityRef[] };

/**
 * `[[bills:a,b,c]]`, `[[topic:Health]]`, `[[sponsor:John Sarbanes]]`, `[[state:MD]]`.
 * The negative lookahead keeps citation markers (`[[cite:...]]`) out.
 */
export const ENTITY_PATTERN = /\[\[(?!cite:)(bills|topic|sponsor|state):([^\]]+?)\]\]/g;

/**
 * Any other `[[word:…]]`: a card in a form we do not render. Removed from the
 * prose rather than shown, the way an invented entity is dropped. Live on
 * 2026-10-05 a reader saw "[[sponsors:119:James Gallagher]]" as raw text.
 */
const UNKNOWN_DIRECTIVE = /\[\[(?!cite:)[a-z_]+:[^\]]*\]\]/g;

function withoutUnknownDirectives(text: string): string {
  return text.replace(UNKNOWN_DIRECTIVE, '');
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toRef(directive: string, rawId: string, allowed: Set<string>): EntityRef | null {
  const id = rawId.trim();
  if (id === '') return null;

  switch (directive) {
    case 'bills':
      // Must correspond to a row the model actually fetched.
      if (!allowed.has(`bills:${id}`)) return null;
      return { kind: 'bill', id, href: `/bills/${id}` };

    case 'topic': {
      // Handles are `topics:<congress>:<name>` — match on the name part.
      const ok = [...allowed].some((h) => h.startsWith('topics:') && h.endsWith(`:${id}`));
      if (!ok) return null;
      return { kind: 'topic', id, href: `/bills/topic/${slugify(id)}` };
    }

    case 'sponsor': {
      const ok = [...allowed].some((h) => h.startsWith('sponsors:') && h.endsWith(`:${id}`));
      if (!ok) return null;
      return {
        kind: 'sponsor',
        id,
        href: `/bills?sponsor=${encodeURIComponent(id).replace(/%20/g, '+')}`,
      };
    }

    case 'state':
      // A state is a filter value, not a fetched row, so it needs no handle.
      // It is also inert: at worst it links to an empty, honest result page.
      if (!/^[A-Z]{2}$/.test(id)) return null;
      return { kind: 'state', id, href: `/bills?state=${id}` };

    default:
      return null;
  }
}

/** Split an answer into prose and entity blocks, dropping invented entities. */
export function splitAnswer(text: string, allowed: Set<string>): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let cursor = 0;

  for (const match of text.matchAll(ENTITY_PATTERN)) {
    const start = match.index ?? 0;
    const [full, directive, rawIds] = match;

    const refs = rawIds
      .split(',')
      .map((id) => toRef(directive, id, allowed))
      .filter((r): r is EntityRef => r !== null);

    // Emit the prose before this directive regardless of whether it resolved.
    const before = withoutUnknownDirectives(text.slice(cursor, start));
    if (before !== '') blocks.push({ type: 'prose', text: before });
    cursor = start + full.length;

    if (refs.length > 0) {
      blocks.push({ type: 'entities', kind: refs[0].kind, refs });
    }
  }

  const rest = withoutUnknownDirectives(text.slice(cursor));
  if (rest !== '') blocks.push({ type: 'prose', text: rest });

  return blocks.length > 0 ? blocks : [{ type: 'prose', text: withoutUnknownDirectives(text) }];
}
