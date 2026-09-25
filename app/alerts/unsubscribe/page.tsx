import { Suspense } from 'react';
import type { Metadata } from 'next';

import { Skeleton } from '@/components/ui/skeleton';
import { UnsubscribeForm } from './unsubscribe-form';

export const metadata: Metadata = {
  title: 'Stop bill alert emails',
  robots: { index: false, follow: false },
};

// One reading column, like the other short pages: the head, a hairline, then
// the one action (Documentation/brand.md, "Layout and shape").
export default function UnsubscribePage() {
  return (
    <article className="container-prose">
      <header className="pb-12 pt-12 sm:pb-16 sm:pt-16">
        <p className="label-eyebrow">Bill alerts</p>
        <h1 className="mt-3 text-display-lg text-ink sm:text-display-xl">Stop bill alert emails</h1>
        <p className="mt-5 max-w-[60ch] text-[17px] leading-relaxed text-ink-2 sm:text-lg">
          This unfollows every bill you get alerts for, so the emails stop. Your plan,
          saved bills and account are not affected, and you can follow bills again at
          any time.
        </p>
      </header>
      <div className="border-t border-line pb-16 pt-8 sm:pb-24">
        <Suspense fallback={<Skeleton aria-hidden="true" className="h-10 w-full sm:w-56" />}>
          <UnsubscribeForm />
        </Suspense>
      </div>
    </article>
  );
}
