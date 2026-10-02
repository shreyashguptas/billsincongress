import { Suspense } from "react";
import type { Metadata } from "next";

import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Forgot your password?",
  description: "Reset your Bills in Congress password.",
  alternates: { canonical: '/forgot-password' },
};

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="Enter the email you signed up with and we'll send you a code to set a new password."
    >
      <Suspense fallback={<div className="h-48" aria-hidden />}>
        <ResetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
