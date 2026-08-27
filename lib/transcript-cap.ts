/**
 * The anonymous transcript (spec §4.7).
 *
 * Anonymous conversations are NEVER written to our database. They live here,
 * in session storage, and vanish with the tab. That is a deliberate security
 * property: there is no anonymous record that could be leaked or mis-keyed.
 *
 * `capTranscript` is pure and tested; the storage wrappers use the project's
 * existing safe-storage helpers so a blocked storage API degrades quietly.
 */
import { safeSessionStorage } from './safe-storage';

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

const KEY = 'bic_answer_transcript';
export const MAX_TURNS = 10;
export const MAX_CHARS = 8000;

/** Trim oldest-first. Mirrors the server-side cap in convex/answer.ts. */
export function capTranscript(turns: Turn[], maxTurns: number, maxChars: number): Turn[] {
  const recent = turns.slice(-maxTurns);
  const out: Turn[] = [];
  let chars = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (chars + recent[i].content.length > maxChars) break;
    chars += recent[i].content.length;
    out.unshift(recent[i]);
  }
  return out;
}

export function loadTranscript(): Turn[] {
  const raw = safeSessionStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    safeSessionStorage.removeItem(KEY);
    return [];
  }
}

export function saveTranscript(turns: Turn[]): void {
  safeSessionStorage.setItem(KEY, JSON.stringify(capTranscript(turns, MAX_TURNS, MAX_CHARS)));
}

export function clearTranscript(): void {
  safeSessionStorage.removeItem(KEY);
}
