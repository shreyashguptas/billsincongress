import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Forgot your password?",
  description: "Reset your Bills.Congress password.",
  alternates: { canonical: '/forgot-password' },
};

export default function ForgotPasswordPage() {
  return (
    <div className="container-editorial flex flex-1 items-center justify-center py-16">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="font-serif text-3xl font-semibold tracking-tight">
            Reset your password
          </h1>
          <p className="text-sm text-muted-foreground">
            Password reset by email is coming soon. While we finish wiring it
            up, please reach out and we&apos;ll reset it manually.
          </p>
        </div>
        <div className="rounded-sm border border-border bg-background/50 px-4 py-4 text-left text-sm space-y-2">
          <p className="text-foreground font-medium">In the meantime</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            <li>Sign in with Google if you used Google before</li>
            <li>
              Email{" "}
              <a
                href="mailto:hi@billsincongress.com"
                className="text-foreground underline"
              >
                hi@billsincongress.com
              </a>{" "}
              and we&apos;ll reset it for you
            </li>
          </ul>
        </div>
        <Link
          href="/sign-in"
          className="inline-block text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to sign in
        </Link>
      </div>
    </div>
  );
}
