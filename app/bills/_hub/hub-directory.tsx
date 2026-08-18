import type { ReactElement } from 'react';
import Link from 'next/link';
import { hubsOfKind } from '@/lib/hubs';

/**
 * The full hub index, server-rendered at the bottom of /bills.
 *
 * This is the page that hands a crawler the whole middle layer in one document:
 * two chambers, five stages and every policy area, as real anchors. Before
 * these existed, /bills offered ten links to individual bills and nothing else,
 * which is why 99.98% of the corpus was reachable only via the sitemap.
 */
export function HubDirectory(): ReactElement {
  const groups = [
    { title: 'By chamber', hubs: hubsOfKind('chamber') },
    { title: 'By stage', hubs: hubsOfKind('status') },
    { title: 'By policy area', hubs: hubsOfKind('topic') },
  ];

  return (
    <section className="border-t mt-12 pt-8">
      <h2 className="text-lg font-semibold tracking-tight mb-1">Browse by category</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
        Each of these is a page in its own right, with an explanation of what the
        grouping means and the bills currently in it.
      </p>
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="label-eyebrow mb-3">{group.title}</p>
            <ul className="space-y-2 text-sm">
              {group.hubs.map((hub) => (
                <li key={hub.path}>
                  <Link
                    href={hub.path}
                    className="text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {hub.heading}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
