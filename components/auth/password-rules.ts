/**
 * The password rules, checked in the browser before a request goes out.
 * `convex/auth.ts` (validatePasswordRequirements) enforces the same rules on
 * the server; keep the two in step.
 */
export const PASSWORD_RULES = "At least 10 characters, with upper-, lower-case, and a number.";

/** The reason a password fails the rules, or null when it passes. */
export function validatePassword(pw: string): string | null {
  if (pw.length < 10) return "Password must be at least 10 characters.";
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) {
    return "Password needs upper-, lower-case, and a number.";
  }
  return null;
}
