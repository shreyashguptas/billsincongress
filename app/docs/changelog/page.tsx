import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Changelog",
  description:
    "Versioned, dated changes to the Bills.Congress API. Breaking changes are called out in bold.",
};

type Entry = {
  date: string;
  version: string;
  notes: string[];
};

// Hand-maintained on purpose — this is what people read to decide if it's
// safe to upgrade, and a generator can't capture intent.
const ENTRIES: Entry[] = [
  {
    date: "2026-05-07",
    version: "v1.0.0",
    notes: [
      "Initial public release.",
      "Endpoints: /bills, /bills/{id}, /bills/{id}/actions, /bills/{id}/summaries, /bills/{id}/text, /bills/{id}/titles, /congresses, /congresses/{n}, /congresses/{n}/chambers/{house|senate}, /policy-areas, /sponsors, /sync-status.",
      "Authentication via Bearer tokens minted on /account.",
      "Rate limits: 1,000/hour and 10,000/day per token; 100/min per IP.",
      "OpenAPI 3.1 spec at /api/v1/openapi.json.",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <>
      <p className="label-eyebrow">Updates</p>
      <h1 className="font-serif text-4xl font-semibold tracking-tight">
        Changelog
      </h1>
      <p className="lead">
        Every change to the public API, dated and described. Breaking
        changes will be called out in <strong>bold</strong> at the top of
        the entry, and we&apos;ll bump a major version (e.g. v2) before
        making them.
      </p>

      <div className="not-prose space-y-8 mt-8">
        {ENTRIES.map((e) => (
          <article
            key={e.version}
            className="border-l-2 border-border pl-5"
          >
            <header className="flex items-baseline gap-3">
              <h2 className="font-serif text-xl font-semibold">{e.version}</h2>
              <time className="text-xs text-muted-foreground">
                {new Date(e.date).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
            </header>
            <ul className="mt-2 list-disc pl-5 space-y-1 text-sm">
              {e.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </>
  );
}
