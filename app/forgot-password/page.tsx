import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";

export const metadata: Metadata = {
  title: "Forgot your password?",
  description: "Reset your Bills in Congress password.",
  alternates: { canonical: '/forgot-password' },
};

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      description={
        <>
          Password reset by email is coming soon. While we finish wiring it
          up, please reach out and we&apos;ll reset it manually.
        </>
      }
    >
      <div className="space-y-2 rounded-md bg-sunken px-4 py-4 text-sm">
        <p className="font-medium text-ink">In the meantime</p>
        <ul className="list-disc space-y-1 pl-5 leading-relaxed text-ink-2 marker:text-ink-3">
          <li>Sign in with Google if you used Google before</li>
          <li>
            Email{" "}
            <a href="mailto:hi@billsincongress.com" className="link focus-ring rounded-xs">
              hi@billsincongress.com
            </a>{" "}
            and we&apos;ll reset it for you
          </li>
        </ul>
      </div>
      <p className="mt-6 text-center text-sm">
        <Link href="/sign-in" className="link focus-ring rounded-xs">
          ← Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}
