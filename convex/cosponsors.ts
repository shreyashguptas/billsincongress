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
 * member listed twice keeps their current entry.
 */
export function cosponsorRows(items: unknown): CosponsorRow[] {
  if (!Array.isArray(items)) return [];
  const byMember = new Map<string, CosponsorRow>();
  for (const item of items) {
    if (!isRecord(item)) continue;
    const bioguideId = text(item.bioguideId);
    const sponsorshipDate = text(item.sponsorshipDate);
    if (!bioguideId || !BIOGUIDE.test(bioguideId)) continue;
    if (!sponsorshipDate || !DATE.test(sponsorshipDate)) continue;
    const fullName = text(item.fullName);
    const firstName = recaseFirstName(text(item.firstName), fullName) ?? text(item.firstName) ?? "";
    const lastName = recaseFromFullName(text(item.lastName), fullName) ?? text(item.lastName) ?? "";
    const district = typeof item.district === "number" ? item.district : Number(text(item.district) ?? NaN);
    const withdrawn = text(item.sponsorshipWithdrawnDate);
    const row: CosponsorRow = {
      bioguideId,
      firstName,
      lastName,
      ...(text(item.party) ? { party: text(item.party) } : {}),
      ...(text(item.state) ? { state: text(item.state) } : {}),
      ...(Number.isInteger(district) && district >= 0 ? { district } : {}),
      sponsorshipDate: sponsorshipDate.slice(0, 10),
      isOriginal: item.isOriginalCosponsor === true || item.isOriginalCosponsor === "True",
      ...(withdrawn && DATE.test(withdrawn) ? { withdrawnDate: withdrawn.slice(0, 10) } : {}),
    };
    // A member listed twice (withdrew, then signed on again): the current
    // entry wins, then the later one.
    const earlier = byMember.get(bioguideId);
    if (
      !earlier ||
      (earlier.withdrawnDate && !row.withdrawnDate) ||
      (Boolean(earlier.withdrawnDate) === Boolean(row.withdrawnDate) && row.sponsorshipDate > earlier.sponsorshipDate)
    ) {
      byMember.set(bioguideId, row);
    }
  }
  return sortCosponsors([...byMember.values()]);
}

/**
 * The order a bill page lists them in, as one string that sorts the same in a
 * database index as in code: current members before withdrawn ones, original
 * cosponsors first, then by the day they joined, then by last name, then by
 * member id (so no two rows tie).
 */
export function cosponsorSortKey(row: Pick<CosponsorRow, "bioguideId" | "isOriginal" | "sponsorshipDate" | "lastName" | "withdrawnDate">): string {
  const name = row.lastName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // Spaces between parts: a space sorts before every letter, so "Smith" comes
  // before "Smithson" the same way in the index as in code.
  return `${row.withdrawnDate ? 1 : 0} ${row.isOriginal ? 0 : 1} ${row.sponsorshipDate} ${name} ${row.bioguideId}`;
}

/** Rows in page order (`cosponsorSortKey`). */
export function sortCosponsors<T extends Parameters<typeof cosponsorSortKey>[0]>(rows: T[]): T[] {
  return [...rows]
    .map((row) => ({ row, key: cosponsorSortKey(row) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ row }) => row);
}

/**
 * A short code for "did this bill's cosponsors change", independent of order.
 * Short on purpose: it is stored on the bill row, which every bill read pays
 * for, and a full copy of a 300-member list is 17 KB. The member count plus
 * two different 32-bit hashes (FNV-1a and djb2) make a change that goes
 * unnoticed vanishingly unlikely.
 */
export function cosponsorsFingerprint(rows: CosponsorRow[]): string {
  const text = cosponsorsText(rows);
  let fnv = 0x811c9dc5;
  let djb = 5381;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    fnv = Math.imul(fnv ^ c, 0x01000193) >>> 0;
    djb = (Math.imul(djb, 33) + c) >>> 0;
  }
  return `${rows.length}:${fnv.toString(16).padStart(8, "0")}${djb.toString(16).padStart(8, "0")}`;
}

function cosponsorsText(rows: CosponsorRow[]): string {
  return JSON.stringify(
    // By member id: a total order, so the same set always gives the same text.
    [...rows].sort((a, b) => a.bioguideId.localeCompare(b.bioguideId)).map((r) => [
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
