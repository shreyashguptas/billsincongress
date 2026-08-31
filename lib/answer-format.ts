/**
 * How a finished answer is rendered: the printed source apparatus (spec §7.2),
 * its numbering, and the stage labels its entity cards use.
 *
 * Every database source links somewhere the reader can verify it. Handles that
 * do not map to a page get a label and no link rather than a broken one.
 *
 * Pure module so it carries unit tests — the two defects fixed here (D23, D29)
 * were both untestable while they lived inside a React component.
 */

export interface Source {
  handle: string;
  kind: 'db' | 'web';
  dataset: string;
  id: string;
  label: string;
  href: string | null;
}

/** Matches `topicSlug` in lib/hubs.ts — topic links must resolve to real hubs. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function toSource(handle: string): Source {
  const firstColon = handle.indexOf(':');
  if (firstColon === -1) {
    return { handle, kind: 'db', dataset: '', id: handle, label: handle, href: null };
  }

  const dataset = handle.slice(0, firstColon);
  const id = handle.slice(firstColon + 1);

  switch (dataset) {
    case 'bills':
      return { handle, kind: 'db', dataset, id, label: id, href: `/bills/${id}` };

    case 'bill_actions':
    case 'bill_summaries': {
      // id is `<billId>:<discriminator>` — link back to the bill itself.
      const sep = id.indexOf(':');
      const billId = sep === -1 ? id : id.slice(0, sep);
      return {
        handle,
        kind: 'db',
        dataset,
        id: billId,
        label: dataset === 'bill_actions' ? `${billId} timeline` : `${billId} summary`,
        href: `/bills/${billId}`,
      };
    }

    case 'topics': {
      // id is `<congress>:<name>`
      const sep = id.indexOf(':');
      const name = sep === -1 ? id : id.slice(sep + 1);
      return {
        handle,
        kind: 'db',
        dataset,
        id: name,
        label: name,
        href: `/bills/topic/${slugify(name)}`,
      };
    }

    case 'sponsors': {
      const sep = id.indexOf(':');
      const name = sep === -1 ? id : id.slice(sep + 1);
      return {
        handle,
        kind: 'db',
        dataset,
        id: name,
        label: name,
        href: `/bills?sponsor=${encodeURIComponent(name).replace(/%20/g, '+')}`,
      };
    }

    case 'stats':
      return { handle, kind: 'db', dataset, id, label: `Congress ${id} totals`, href: null };

    case 'web':
      // Phase 5 replaces the label with the real domain from the url_citation.
      return { handle, kind: 'web', dataset, id, label: `Web source ${id}`, href: null };

    default:
      return { handle, kind: 'db', dataset, id, label: handle, href: null };
  }
}

export function toSources(handles: string[]): Source[] {
  return handles.map(toSource);
}

/**
 * A web result the model was shown. Shape mirrors what `searchWeb` in
 * convex/answer.ts mints; `components/answers/source-list.tsx` re-exports this
 * so its existing importers keep their import path.
 */
export interface WebSource {
  handle: string;
  url: string;
  title?: string;
  excerpt: string;
}

/** A source with the number the PROSE prints for it. */
export interface PrintedSource {
  /**
   * The number written into the prose by `resolveAnswer` — the handle's
   * position in `handles`, plus one. NEVER the row's position in the block it
   * renders in.
   */
  number: number;
  source: Source;
}

export interface PrintedWebSource {
  /** null when the search returned this but the answer never cited it. */
  number: number | null;
  handle: string;
  /** null when a cited web handle has no result detail left to show. */
  web: WebSource | null;
}

/**
 * Split cited handles into the two printed blocks, carrying the prose's own
 * numbering into each (defect D23 from the 2026-08-30 accuracy audit).
 *
 * `resolveAnswer` in convex/catalog/cite.ts numbers every cited handle in ONE
 * sequence, database rows and web results interleaved in first-appearance
 * order, and writes those numbers into the prose. The source list used to
 * number each block from 1 over its own filtered array, so an answer that
 * cited a web result before a database row printed [2] beside the row the
 * prose called [3] — the reader following a citation landed on the wrong
 * record. The number therefore comes from `handles`, and only from `handles`.
 *
 * Web results the search returned but the answer never cited keep their place
 * in the list with `number: null`: they are not the source of any sentence, so
 * no number may point at them, but hiding them would hide what the model read.
 *
 * A handle appearing twice in `handles` is printed once, at its first number —
 * the prose can only ever have printed that one.
 */
export function printedSources(
  handles: string[],
  webSources: WebSource[] = [],
): { db: PrintedSource[]; web: PrintedWebSource[] } {
  const db: PrintedSource[] = [];
  const numberByHandle = new Map<string, number>();
  const seen = new Set<string>();

  toSources(handles).forEach((source, i) => {
    if (seen.has(source.handle)) return;
    seen.add(source.handle);
    if (source.kind === 'db') db.push({ number: i + 1, source });
    else numberByHandle.set(source.handle, i + 1);
  });

  // First detail wins: `searchWeb` restarts its handles at `web:1` on every
  // call, so two searches in one answer can both mint `web:1` and a citation
  // cannot distinguish them.
  const detail = new Map<string, WebSource>();
  for (const w of webSources) if (!detail.has(w.handle)) detail.set(w.handle, w);

  const web: PrintedWebSource[] = [];
  const claimed = new Set<WebSource>();
  for (const [handle, number] of numberByHandle) {
    const d = detail.get(handle) ?? null;
    if (d) claimed.add(d);
    web.push({ number, handle, web: d });
  }
  for (const w of webSources) {
    if (!claimed.has(w)) web.push({ number: null, handle: w.handle, web: w });
  }

  return { db, web };
}
