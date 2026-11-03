/**
 * The teacher sign-up test (2026-11): what the /teachers form asks, and how a
 * visit from a school site is recognised. Pure — no React, no Convex imports —
 * so the form, the banner, the Convex mutation and the tests all read the same
 * lists, and the server never trusts a value the form could not have sent.
 *
 * Why it exists: students reach the site from Google Classroom, Canvas, Teams
 * and Schoology, sent by their teachers, and they ask a fifth of all
 * questions. The test asks those teachers whether they want class tools, and
 * whether they would pay for them, before any are built.
 */

/** The yearly price the form names. A question to teachers, not a live plan. */
export const TEACHER_PRICE_USD_YEAR = 50;

export const TEACHER_LEVELS = [
  { value: 'middle', label: 'Middle school' },
  { value: 'high', label: 'High school' },
  { value: 'college', label: 'College' },
  { value: 'other', label: 'Other' },
] as const;
export type TeacherLevel = (typeof TEACHER_LEVELS)[number]['value'];

export const STUDENT_BANDS = [
  { value: 'under_30', label: 'Under 30' },
  { value: '30_100', label: '30–100' },
  { value: '100_200', label: '100–200' },
  { value: '200_plus', label: '200+' },
] as const;
export type StudentBand = (typeof STUDENT_BANDS)[number]['value'];

/** The class tools a teacher can pick, any number of them. */
export const TEACHER_WANTS = [
  { value: 'assign_bills', label: 'Assign bills to a class' },
  { value: 'see_questions', label: 'See what the class asked' },
  { value: 'member_votes', label: 'How members voted' },
  { value: 'track_reading', label: 'See who opened each bill' },
] as const;
export type TeacherWant = (typeof TEACHER_WANTS)[number]['value'];

export const WOULD_PAY = [
  { value: 'yes_myself', label: 'Yes, myself' },
  { value: 'yes_school', label: 'Yes, if my school pays' },
  { value: 'no', label: 'No' },
  { value: 'not_sure', label: 'Not sure' },
] as const;
export type WouldPay = (typeof WOULD_PAY)[number]['value'];

/**
 * How the teacher reached the form: the line shown to school visitors, the
 * footer link, a link in an email the site's owner sent (`/teachers?from=email`),
 * or straight to the page.
 */
export const SIGNUP_SOURCES = ['banner', 'footer', 'email', 'direct'] as const;
export type SignupSource = (typeof SIGNUP_SOURCES)[number];

/** Reads `?from=` on /teachers; anything unknown counts as a direct visit. */
export function signupSourceFrom(param: string | null | undefined): SignupSource {
  return (SIGNUP_SOURCES as readonly string[]).includes(param ?? '') ? (param as SignupSource) : 'direct';
}

export const SCHOOL_MAX_LENGTH = 120;
/** RFC 5321's limit on a whole address. */
export const EMAIL_MAX_LENGTH = 254;

/** Trimmed and lower-cased, so one teacher signing up twice is one row. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * A plausible address: one @, something before it, a dot in the part after it,
 * no spaces, within the length limit. Loose on purpose; the only cost of a
 * typo that passes is a teacher we cannot reach.
 */
export function isPlausibleEmail(email: string): boolean {
  if (email.length === 0 || email.length > EMAIL_MAX_LENGTH) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** The school platforms whose links bring classes here. */
export type SchoolSite = 'google_classroom' | 'canvas' | 'teams' | 'schoology';

/**
 * Which school platform a referrer belongs to, or null. Matched on the host
 * only, so a path or query string can never make an ordinary site count.
 * Canvas runs on each school's own `*.instructure.com` host
 * (`sdhc.instructure.com` sent a class here in Oct 2026).
 */
export function schoolSiteFor(referrer: string | null | undefined): SchoolSite | null {
  if (!referrer) return null;
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
  const is = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (host === 'classroom.google.com') return 'google_classroom';
  if (is('instructure.com')) return 'canvas';
  if (is('teams.microsoft.com') || is('teams.live.com') || is('teams.cloud.microsoft')) return 'teams';
  if (is('schoology.com')) return 'schoology';
  return null;
}

/**
 * Pages the "Teaching with this?" line never appears on: the teachers page
 * itself, and the sign-in, account and billing pages, where it would be in
 * the way of something the reader came to do.
 */
const NO_BANNER_PREFIXES = ['/teachers', '/sign-in', '/sign-up', '/forgot-password', '/account', '/pro', '/alerts'];

export function bannerAllowedOn(pathname: string): boolean {
  return !NO_BANNER_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
