/**
 * Turn provenance handles into the printed source apparatus (spec §7.2).
 *
 * Every database source links somewhere the reader can verify it. Handles that
 * do not map to a page get a label and no link rather than a broken one.
 *
 * Pure module so it carries unit tests.
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
