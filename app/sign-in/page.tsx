import { Suspense } from "react";
import type { Metadata } from "next";

import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Bills.Congress account.",
  alternates: { canonical: '/sign-in' },
};

export default function SignInPage() {
  return (
    <div className="container-editorial flex flex-1 items-center justify-center py-16">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="font-serif text-3xl font-semibold tracking-tight">
            Welcome back
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in to follow bills, save your work, and access Pro features.
          </p>
        </div>
        <Suspense fallback={<div className="h-72" aria-hidden />}>
          <SignInForm />
        </Suspense>
      </div>
    </div>
  );
}
