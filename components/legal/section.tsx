import type { ReactNode } from 'react';

// Shared building blocks for /privacy and /terms. Both pages render the same
// layout — a reading column, the plain-English summary first, then numbered
// sections divided by hairlines — and keeping one copy stops the two drifting
// apart (Documentation/brand.md, "Layout and shape").

export function LegalPage({
  title,
  standfirst,
  lastUpdated,
  summaryTitle,
  summary,
  summaryNote,
  children,
}: {
  title: string;
  standfirst: ReactNode;
  lastUpdated: string;
  /** The one-line headline over the plain-English summary. */
  summaryTitle: string;
  summary: string[];
  /** Small print under the summary: contact, the sibling legal page. */
  summaryNote: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="animate-fade-in">
      <header className="container-prose pb-10 pt-12 sm:pb-12 sm:pt-16">
        <p className="label-eyebrow">Legal</p>
        <h1 className="mt-3 text-display-lg text-ink sm:text-display-xl">{title}</h1>
        <p className="mt-5 max-w-[60ch] text-[17px] leading-relaxed text-ink-2 sm:text-lg">{standfirst}</p>
        <p className="mt-5 font-mono text-xs leading-4 text-ink-3 tabular">Last updated: {lastUpdated}</p>
      </header>

      {/* The short version — a quiet hairline list before the full text. */}
      <section aria-labelledby="legal-summary" className="container-prose">
        <div className="border-t border-line py-10 sm:py-12">
          <p className="label-eyebrow">The short version</p>
          <h2 id="legal-summary" className="mt-3 text-display-sm text-ink">
            {summaryTitle}
          </h2>
          <ul className="mt-6 border-t border-line">
            {summary.map((item) => (
              <li key={item} className="border-b border-line py-3 text-[15px] leading-relaxed text-ink-2">
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm leading-relaxed text-ink-3">{summaryNote}</p>
        </div>
      </section>

      <div className="container-prose pb-16 sm:pb-24">{children}</div>
    </article>
  );
}

export function Section({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-line py-10 sm:py-12">
      <p className="font-mono text-xs leading-4 text-ink-3 tabular">{String(number).padStart(2, '0')}</p>
      <h2 className="mt-2 text-display-sm text-ink">{title}</h2>
      <div className="mt-4 space-y-4 text-base leading-[1.7] text-ink-2 [&_li]:marker:text-ink-3">
        {children}
      </div>
    </section>
  );
}

export function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="link focus-ring rounded-xs">
      {children}
    </a>
  );
}
