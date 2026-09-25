import { Suspense } from 'react';
import type { Metadata } from 'next';

import { UnsubscribeForm } from './unsubscribe-form';

export const metadata: Metadata = {
  title: 'Stop bill alert emails',
  robots: { index: false, follow: false },
};

export default function UnsubscribePage() {
  return (
    <div className="container-editorial flex flex-1 items-center justify-center py-16">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2">
          <p className="label-eyebrow">Bill alerts</p>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">
            Stop bill alert emails
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This unfollows every bill you get alerts for, so the emails stop. Your plan,
            saved bills and account are not affected, and you can follow bills again at
            any time.
          </p>
        </div>
        <Suspense fallback={<div className="h-12" aria-hidden />}>
          <UnsubscribeForm />
        </Suspense>
      </div>
    </div>
  );
}
