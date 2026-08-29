import { Suspense } from "react";
import type { Metadata } from "next";

import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Sign up for a Bills.Congress account.",
  alternates: { canonical: '/sign-up' },
};

export default function SignUpPage() {
  return (
    <div className="container-editorial flex flex-1 items-center justify-center py-16">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="font-serif text-3xl font-semibold tracking-tight">
            Create your account
          </h1>
          <p className="text-sm text-muted-foreground">
            Free, with no paid tier.
          </p>
        </div>
        <Suspense fallback={<div className="h-96" aria-hidden />}>
          <SignUpForm />
        </Suspense>
      </div>
    </div>
  );
}
