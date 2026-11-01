/**
 * A bill's cosponsors, as Congress.gov lists them
 * (`/bill/{congress}/{type}/{number}/cosponsors`).
 *
 * Names are re-cased from each member's official full name the same way the
 * sponsor's are (convex/sponsorIdentity.ts), and a member is identified by
 * their bioguide id, never by name. A withdrawn cosponsor is kept, with the
 * date, so the count of current cosponsors matches Congress.gov's own.
 *
 * Pure module (no Convex imports) so it carries unit tests
 * (convex/cosponsors.test.ts).
 */
import { recaseFirstName, recaseFromFullName } from "./sponsorIdentity";

export interface CosponsorRow {
  bioguideId: string;
  firstName: string;
  lastName: string;
  party?: string;
  state?: string;
  /** 0 for an at-large seat; absent for a senator. */
  district?: number;
  /** YYYY-MM-DD */
  sponsorshipDate: string;
  isOriginal: boolean;
  /** YYYY-MM-DD, when the member withdrew. */
  withdrawnDate?: string;
}

const BIOGUIDE = /^[A-Z]\d{6}$/;
const DATE = /^\d{4}-\d{2}-\d{2}/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * Rows from the API's `cosponsors` array. An item without a bioguide id or a
 * sponsorship date is dropped (a member is never guessed from a name); a
 * member listed twice keeps the first entry.
 */
export function cosponsorRows(items: unknown): CosponsorRow[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const rows: CosponsorRow[] = [];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const bioguideId = text(item.bioguideId);
    const sponsorshipDate = text(item.sponsorshipDate);
    if (!bioguideId || !BIOGUIDE.test(bioguideId) || seen.has(bioguideId)) continue;
    if (!sponsorshipDate || !DATE.test(sponsorshipDate)) continue;
    seen.add(bioguideId);
    const fullName = text(item.fullName);
    const firstName = recaseFirstName(text(item.firstName), fullName) ?? text(item.firstName) ?? "";
    const lastName = recaseFromFullName(text(item.lastName), fullName) ?? text(item.lastName) ?? "";
    const district = typeof item.district === "number" ? item.district : Number(text(item.district) ?? NaN);
    const withdrawn = text(item.sponsorshipWithdrawnDate);
    rows.push({
      bioguideId,
      firstName,
      lastName,
      ...(text(item.party) ? { party: text(item.party) } : {}),
      ...(text(item.state) ? { state: text(item.state) } : {}),
      ...(Number.isInteger(district) && district >= 0 ? { district } : {}),
      sponsorshipDate: sponsorshipDate.slice(0, 10),
      isOriginal: item.isOriginalCosponsor === true || item.isOriginalCosponsor === "True",
      ...(withdrawn && DATE.test(withdrawn) ? { withdrawnDate: withdrawn.slice(0, 10) } : {}),
    });
  }
  return sortCosponsors(rows);
}

/**
 * The order a bill page lists them in: original cosponsors first, then by the
 * day they joined, then by last name. Withdrawn members last.
 */
export function sortCosponsors<T extends Pick<CosponsorRow, "isOriginal" | "sponsorshipDate" | "lastName" | "withdrawnDate">>(
  rows: T[],
): T[] {
  return [...rows].sort(
    (a, b) =>
      Number(Boolean(a.withdrawnDate)) - Number(Boolean(b.withdrawnDate)) ||
      Number(b.isOriginal) - Number(a.isOriginal) ||
      a.sponsorshipDate.localeCompare(b.sponsorshipDate) ||
      a.lastName.localeCompare(b.lastName),
  );
}

/** Stable text for "did this bill's cosponsors change", independent of key order. */
export function cosponsorsFingerprint(rows: CosponsorRow[]): string {
  return JSON.stringify(
    sortCosponsors(rows).map((r) => [
      r.bioguideId,
      r.firstName,
      r.lastName,
      r.party ?? "",
      r.state ?? "",
      r.district ?? "",
      r.sponsorshipDate,
      r.isOriginal,
      r.withdrawnDate ?? "",
    ]),
  );
}
