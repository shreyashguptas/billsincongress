import { Suspense } from "react";
import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Sign up for a Bills in Congress account.",
  alternates: { canonical: '/sign-up' },
};

export default function SignUpPage() {
  return (
    <AuthCard title="Create your account" description="Free, with no paid tier.">
      <Suspense fallback={<div className="h-96" aria-hidden />}>
        <SignUpForm />
      </Suspense>
    </AuthCard>
  );
}
