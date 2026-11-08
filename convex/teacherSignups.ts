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
 * Saves one teacher's answers. The same email again replaces the earlier
 * answers rather than adding a row, so a teacher who changes their mind is
 * counted once. Returns whether this email was new.
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
  returns: v.object({ isNew: v.boolean() }),
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    if (!isPlausibleEmail(email)) throw new ConvexError("INVALID_EMAIL");
    const school = args.school.trim().replace(/\s+/g, " ");
    if (school.length === 0 || school.length > SCHOOL_MAX_LENGTH) throw new ConvexError("SCHOOL_REQUIRED");
    const wants = [...new Set(args.wants)];
    if (wants.length > TEACHER_WANTS.length) throw new ConvexError("WANTS_INVALID");

    const existing = await ctx.db
      .query("teacherSignups")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    // A resend is limited per email, so a teacher who sends the form twice
    // never uses up the day's shared allowance for new sign-ups.
    if (existing) {
      await rateLimiter.limit(ctx, "teacherSignupResendsPerDay", { key: email, throws: true });
    } else {
      await rateLimiter.limit(ctx, "teacherSignupsPerDay", { key: "all", throws: true });
    }

    const fields = {
      email,
      school,
      level: args.level,
      students: args.students,
      wants,
      wouldPay: args.wouldPay,
      source: args.source,
      schoolSite: args.schoolSite,
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.replace("teacherSignups", existing._id, fields);
      return { isNew: false };
    }
    await ctx.db.insert("teacherSignups", fields);
    return { isNew: true };
  },
});

/** Most rows one check returns. The test expects tens, not hundreds. */
const LIST_LIMIT = 500;

/**
 * Every sign-up sent (new, or answers changed) at or after `since` (ms since
 * the epoch), newest first, for the owner's scheduled check:
 *
 *   pnpm exec convex run --prod teacherSignups:listSince '{"since": 0}'
 *
 * `complete` is false when there were more than LIST_LIMIT rows, so a count
 * read from `rows` is never mistaken for the whole set. `since` is passed in
 * because a query must not read the clock.
 */
export const listSince = internalQuery({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const rows = await ctx.db
      .query("teacherSignups")
      .withIndex("by_updatedAt", (q) => q.gte("updatedAt", since))
      .order("desc")
      .take(LIST_LIMIT + 1);
    return {
      complete: rows.length <= LIST_LIMIT,
      rows: rows.slice(0, LIST_LIMIT).map((row) => ({
        email: row.email,
        school: row.school,
        level: row.level,
        students: row.students,
        wants: row.wants,
        wouldPay: row.wouldPay,
        source: row.source,
        schoolSite: row.schoolSite ?? null,
        firstSentAt: new Date(row._creationTime).toISOString(),
        lastSentAt: new Date(row.updatedAt).toISOString(),
      })),
    };
  },
});
