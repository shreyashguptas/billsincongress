/// <reference types="vite/client" />
/**
 * The teacher sign-up form's write and the owner's read
 * (convex/teacherSignups.ts), run as real Convex functions against an
 * in-memory database (convex-test).
 *
 * Each case is a way the test's numbers could go wrong: one teacher counted
 * twice, a junk row counted as a teacher, or the check reporting a partial
 * list as the whole.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

const answers = {
  email: "Teacher@School.org ",
  school: "  Riverview   High ",
  level: "high" as const,
  students: "100_200" as const,
  wants: ["assign_bills" as const, "member_votes" as const],
  wouldPay: "yes_school" as const,
  source: "email" as const,
};

describe("teacher sign-ups", () => {
  test("a sign-up is stored with its email and school tidied", async () => {
    const t = setup();
    expect(await t.mutation(api.teacherSignups.submit, answers)).toEqual({ isNew: true });
    const { rows, complete } = await t.query(internal.teacherSignups.listSince, { since: 0 });
    expect(complete).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: "teacher@school.org",
      school: "Riverview High",
      wants: ["assign_bills", "member_votes"],
      wouldPay: "yes_school",
      source: "email",
      schoolSite: null,
    });
  });

  test("the same teacher twice is one row with their newest answers", async () => {
    const t = setup();
    await t.mutation(api.teacherSignups.submit, answers);
    const again = await t.mutation(api.teacherSignups.submit, {
      ...answers,
      email: "teacher@school.org",
      wouldPay: "yes_myself",
      wants: ["see_questions", "see_questions"],
    });
    expect(again).toEqual({ isNew: false });
    const { rows } = await t.query(internal.teacherSignups.listSince, { since: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ wouldPay: "yes_myself", wants: ["see_questions"] });
  });

  test("a bad email or an empty school is refused and stores nothing", async () => {
    const t = setup();
    await expect(t.mutation(api.teacherSignups.submit, { ...answers, email: "not-an-email" })).rejects.toThrow(
      /INVALID_EMAIL/,
    );
    await expect(t.mutation(api.teacherSignups.submit, { ...answers, school: "   " })).rejects.toThrow(
      /SCHOOL_REQUIRED/,
    );
    await expect(
      t.mutation(api.teacherSignups.submit, { ...answers, school: "x".repeat(121) }),
    ).rejects.toThrow(/SCHOOL_REQUIRED/);
    const { rows } = await t.query(internal.teacherSignups.listSince, { since: 0 });
    expect(rows).toHaveLength(0);
  });

  test("an answer the form cannot send is refused by the validator", async () => {
    const t = setup();
    await expect(
      // @ts-expect-error a value outside the form's choices
      t.mutation(api.teacherSignups.submit, { ...answers, wouldPay: "maybe" }),
    ).rejects.toThrow();
  });

  test("a script sending more than 50 in a day is stopped", async () => {
    const t = setup();
    for (let i = 0; i < 50; i++) {
      await t.mutation(api.teacherSignups.submit, { ...answers, email: `t${i}@school.org` });
    }
    await expect(
      t.mutation(api.teacherSignups.submit, { ...answers, email: "late@school.org" }),
    ).rejects.toThrow(/RateLimited/);
  });

  test("the check returns only what was sent since the last check", async () => {
    const t = setup();
    await t.mutation(api.teacherSignups.submit, answers);
    const later = Date.now() + 60_000;
    const { rows } = await t.query(internal.teacherSignups.listSince, { since: later });
    expect(rows).toHaveLength(0);
  });

  test("the list of teachers is not a public function", () => {
    // Checked by the compiler: the read that returns emails is internal, so a
    // browser cannot call it. If it became public, this line would compile and
    // the unused @ts-expect-error would fail `tsc`.
    // @ts-expect-error listSince is internal
    expect(api.teacherSignups.listSince).toBeDefined();
  });
});
