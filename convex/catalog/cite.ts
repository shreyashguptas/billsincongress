/**
 * Provenance handles (spec §4.5).
 *
 * Every row handed to the model carries a handle like `bills:1234hr119`. The
 * model cites handles and NEVER writes a URL. On completion we resolve each
 * cited handle against the exact set of rows it was given this turn: matches
 * become numbered sources, and anything it invented is deleted.
 *
 * That is what makes a fabricated citation impossible rather than merely
 * discouraged — the model has no channel through which to express one.
 *
 * Pure module (no Convex imports) so it carries unit tests.
 */
import type { DatasetName } from "./types";

/** `[[cite:<dataset>:<id>]]` where id may itself contain colons. */
export const MARKER_PATTERN = /\[\[cite:([a-z_]+:[^\]]+?)\]\]/g;

export function mintHandle(dataset: DatasetName | "web", id: string): string {
  return `${dataset}:${id}`;
}

/** Every handle cited in `text`, in order of appearance, including repeats. */
export function parseMarkers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(MARKER_PATTERN)) out.push(m[1]);
  return out;
}

export interface ResolvedAnswer {
  /** Prose with markers replaced by `[n]`, and invented ones removed. */
  text: string;
  /** Cited handles, in first-appearance order. Index + 1 is the printed number. */
  sources: string[];
  /** How many invented handles were deleted. Reported to analytics. */
  dropped: number;
}

/**
 * Resolve an answer against the handles the model actually received.
 *
 * `allowed` MUST be built from rows returned by fetch_dataset during this turn.
 * Passing anything wider than that defeats the whole mechanism.
 */
export function resolveAnswer(text: string, allowed: Set<string>): ResolvedAnswer {
  const sources: string[] = [];
  let dropped = 0;

  const resolved = text.replace(MARKER_PATTERN, (_full, handle: string) => {
    if (!allowed.has(handle)) {
      dropped++;
      return "";
    }
    let n = sources.indexOf(handle);
    if (n === -1) {
      sources.push(handle);
      n = sources.length - 1;
    }
    return `[${n + 1}]`;
  });

  return { text: resolved, sources, dropped };
}
