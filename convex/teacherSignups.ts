// The teacher sign-up test (/teachers): the form's one write, and the read the
// owner's scheduled check uses. See "Teacher sign-up test" in
// documentation/overview.md.
//
// Privacy: the email and school are stored here and nowhere else. Nothing in
// this file sends them to PostHog, logs them or emails them; the page's
// analytics event carries only the multiple-choice answers.
import { ConvexError, v } from "convex/values";
import { internalQuery, mutation } from "./_generated/server";
import { rateLimiter } from "./rateLimits";
import {
  levelValidator,
  schoolSiteValidator,
  sourceValidator,
  studentsValidator,
  wantValidator,
  wouldPayValidator,
} from "./teacherSignupFields";
import { SCHOOL_MAX_LENGTH, TEACHER_WANTS, isPlausibleEmail, normalizeEmail } from "../lib/teachers";

/**
 * Saves one send of the form as a new row. Rows are never replaced: the form
 * is public, so anyone can type a teacher's address, and replacing would let
 * them erase that teacher's real answers. The owner's report groups rows by
 * email instead. Returns null whether or not the email was seen before, so the
 * reply never tells a caller that an address is on the list. (The two limits
 * below still differ: after using up the shared 50, a caller could tell a known
 * address from which one stops them. Accepted for a four-week test; see
 * overview.md.)
 *
 * Errors are ConvexError codes the form turns into copy: INVALID_EMAIL,
 * SCHOOL_REQUIRED, WANTS_INVALID, and the rate limiter's RateLimited object.
 */
export const submit = mutation({
  args: {
    email: v.string(),
    school: v.string(),
    level: levelValidator,
    students: studentsValidator,
    wants: v.array(wantValidator),
    wouldPay: wouldPayValidator,
    source: sourceValidator,
    schoolSite: v.optional(schoolSiteValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    if (!isPlausibleEmail(email)) throw new ConvexError("INVALID_EMAIL");
    const school = args.school.trim().replace(/\s+/g, " ");
    if (school.length === 0 || school.length > SCHOOL_MAX_LENGTH) throw new ConvexError("SCHOOL_REQUIRED");
    const wants = [...new Set(args.wants)];
    if (wants.length > TEACHER_WANTS.length) throw new ConvexError("WANTS_INVALID");

    const seenBefore = await ctx.db
      .query("teacherSignups")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    // A resend is limited per email, so a teacher who sends the form twice
    // never uses up the day's shared allowance for new sign-ups.
    if (seenBefore) {
      await rateLimiter.limit(ctx, "teacherSignupResendsPerDay", { key: email, throws: true });
    } else {
      await rateLimiter.limit(ctx, "teacherSignupsPerDay", { key: "all", throws: true });
    }

    await ctx.db.insert("teacherSignups", {
      email,
      school,
      level: args.level,
      students: args.students,
      wants,
      wouldPay: args.wouldPay,
      source: args.source,
      schoolSite: args.schoolSite,
      sentAt: Date.now(),
    });
    return null;
  },
});

/** Most rows one check returns. The test expects tens, not hundreds. */
const LIST_LIMIT = 500;
/** Most earlier sends counted for one email; resends are capped at 10 a day. */
const EARLIER_SENDS_LIMIT = 300;

/**
 * Every send of the form at or after `since` (ms since the epoch), newest
 * first, for the owner's scheduled check:
 *
 *   pnpm exec convex run --prod teacherSignups:listSince '{"since": 0}'
 *
 * `earlierSends` counts the rows the same email sent before this one, at any
 * time. A row with earlierSends > 0 is a teacher changing their answers, or
 * someone else typing their address: the report shows both versions rather
 * than trusting the newest. `complete` is false when there were more than
 * LIST_LIMIT rows, so a count read from `rows` is never mistaken for the whole
 * set. `since` is passed in because a query must not read the clock.
 */
export const listSince = internalQuery({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const rows = await ctx.db
      .query("teacherSignups")
      .withIndex("by_sentAt", (q) => q.gte("sentAt", since))
      .order("desc")
      .take(LIST_LIMIT + 1);
    const page = rows.slice(0, LIST_LIMIT);
    return {
      complete: rows.length <= LIST_LIMIT,
      rows: await Promise.all(
        page.map(async (row) => {
          const earlier = await ctx.db
            .query("teacherSignups")
            .withIndex("by_email", (q) => q.eq("email", row.email).lt("sentAt", row.sentAt))
            .take(EARLIER_SENDS_LIMIT);
          return {
            email: row.email,
            school: row.school,
            level: row.level,
            students: row.students,
            wants: row.wants,
            wouldPay: row.wouldPay,
            source: row.source,
            schoolSite: row.schoolSite ?? null,
            sentAt: new Date(row.sentAt).toISOString(),
            earlierSends: earlier.length,
          };
        }),
      ),
    };
  },
});
