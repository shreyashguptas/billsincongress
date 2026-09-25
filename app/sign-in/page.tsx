import { Suspense } from "react";
import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Bills in Congress account.",
  alternates: { canonical: '/sign-in' },
};

export default function SignInPage() {
  return (
    <AuthCard title="Welcome back" description="Sign in to save bills and ask more questions each day.">
      <Suspense fallback={<div className="h-72" aria-hidden />}>
        <SignInForm />
      </Suspense>
    </AuthCard>
  );
}
