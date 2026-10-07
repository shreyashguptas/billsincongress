/**
 * Who sponsored a bill, as Congress.gov identifies them.
 *
 * Congress.gov gives every member a permanent id (the bioguide id, "R000608")
 * and spells the same member differently from bill to bill: "Jacky Rosen" on 73
 * of her 119th-Congress bills and "Jacklyn Rosen" on 7, "Bernie" and "Bernard"
 * Sanders, "C. Franklin" and "Scott Franklin", and some members in capitals
 * ("ROSA DELAURO") on whole Congresses. Counting members by spelling split all of
 * those in two, and merged two different members who share a name: in the 118th,
 * Senator Robert Menendez and his son, Representative Rob Menendez, were one
 * "Robert Menendez" with 89 bills. The id tells them apart.
 *
 * Pure module (no Convex imports) so it carries unit tests.
 */

/** The sponsor object on a Congress.gov bill detail (`bill.sponsors[0]`). */
export interface DetailSponsor {
  bioguideId?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  party?: string;
  state?: string;
}

export interface SponsorFields {
  sponsorFirstName?: string;
  sponsorLastName?: string;
  sponsorParty?: string;
  sponsorState?: string;
  sponsorBioguideId?: string;
}

/** Accent-free lower case, one char per char, so indexes line up with the original. */
function fold(value: string): string {
  return [...value]
    .map((ch) => ch.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().charAt(0) || ch)
    .join("");
}

function uniformCase(name: string): boolean {
  return name === name.toUpperCase() || name === name.toLowerCase();
}

/**
 * A name in one case throughout ("DELAURO") re-cased from the member's full
 * name, which Congress.gov keeps in mixed case ("Rep. DeLauro, Rosa L. [D-CT-3]").
 * Never guessed: title-casing "DELAURO" would give "Delauro", and "MCCARTHY"
 * "Mccarthy". When the full name does not contain the name, it is left as is.
 */
export function recaseFromFullName(name: string | undefined, fullName: string | undefined): string | undefined {
  if (!name || !fullName || !uniformCase(name) || !/[a-z]/i.test(name)) return name;
  const at = fold(fullName).indexOf(fold(name));
  if (at < 0) return name;
  const found = [...fullName].slice(at, at + [...name].length).join("");
  return found;
}

/**
 * A first name, re-cased like `recaseFromFullName`. When the full name uses
 * another form of it ("WILLIAM" on bills, "Pascrell, Bill, Jr." in the full
 * name; also "MIKE" Doyle and "JAMES" Cooper in the 117th), the name is put in
 * plain title case instead: a given name has no "Mc" or "De" whose capital a
 * guess could lose, and left alone it would read "WILLIAM Pascrell".
 */
export function recaseFirstName(name: string | undefined, fullName: string | undefined): string | undefined {
  const recased = recaseFromFullName(name, fullName);
  if (!recased || !uniformCase(recased) || !/[a-z]/i.test(recased)) return recased;
  return recased.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** The sponsor fields we store on a bill, from a Congress.gov bill detail. */
export function sponsorFields(sponsor: DetailSponsor | undefined): SponsorFields {
  if (!sponsor) return {};
  return {
    sponsorFirstName: recaseFirstName(sponsor.firstName, sponsor.fullName),
    sponsorLastName: recaseFromFullName(sponsor.lastName, sponsor.fullName),
    sponsorParty: sponsor.party,
    sponsorState: sponsor.state,
    sponsorBioguideId: sponsor.bioguideId || undefined,
  };
}
