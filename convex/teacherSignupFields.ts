// The teacher sign-up form's answers as Convex validators, shared by the table
// (convex/schema.ts) and the mutation (convex/teacherSignups.ts). Each list is
// built from the same constants the form renders (lib/teachers.ts), so the
// server accepts exactly the choices a reader could have made.
import { v, type Validator } from "convex/values";
import {
  SIGNUP_SOURCES,
  STUDENT_BANDS,
  TEACHER_LEVELS,
  TEACHER_WANTS,
  WOULD_PAY,
  type SchoolSite,
  type SignupSource,
  type StudentBand,
  type TeacherLevel,
  type TeacherWant,
  type WouldPay,
} from "../lib/teachers";

function oneOf<T extends string>(values: readonly T[]): Validator<T> {
  const [first, second, ...rest] = values.map((value) => v.literal(value));
  return v.union(first, second, ...rest) as unknown as Validator<T>;
}

const SCHOOL_SITES: readonly SchoolSite[] = ["google_classroom", "canvas", "teams", "schoology"];

export const levelValidator = oneOf<TeacherLevel>(TEACHER_LEVELS.map((o) => o.value));
export const studentsValidator = oneOf<StudentBand>(STUDENT_BANDS.map((o) => o.value));
export const wantValidator = oneOf<TeacherWant>(TEACHER_WANTS.map((o) => o.value));
export const wouldPayValidator = oneOf<WouldPay>(WOULD_PAY.map((o) => o.value));
export const sourceValidator = oneOf<SignupSource>(SIGNUP_SOURCES);
export const schoolSiteValidator = oneOf<SchoolSite>(SCHOOL_SITES);
