import type { ReactElement } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { hubsOfKind } from '@/lib/hubs';
import { HubLinkTracker } from './hub-view-tracker';

/**
 * The full hub index, server-rendered inside the /bills filter band.
 *
 * This is the page that hands a crawler the whole middle layer in one document:
 * two chambers, five stages and every policy area, as real anchors. Before
 * these existed, /bills offered ten links to individual bills and nothing else,
 * which is why 99.98% of the corpus was reachable only via the sitemap. The
 * footer carries the seven chamber and stage hubs on every page; the 33 topic
 * hubs are linked from here and nowhere else, so this block is the only thing
 * standing between them and being orphaned.
 *
 * Two rules follow from that, and both are load-bearing:
 *
 *  - **Never move these links into a Popover, Sheet or DropdownMenu.** Radix
 *    renders that content inside a portal with no `forceMount`, so the anchors
 *    would not exist in the DOM until someone clicked. Googlebot renders but
 *    does not interact. That is deletion wearing a redesign's clothes.
 *  - **Never wrap the children in `{open && …}`.** A native `<details>` keeps
 *    its contents in the document when closed; a JavaScript conditional does
 *    not. Collapsed is a presentation state here, not a mounting one.
 *
 * It used to sit at the very bottom of the page as a single 920px column of 40
 * links, which read as a dump rather than an index and which nobody scrolled
 * to. Closed by default, next to the filters, it costs 44px at rest and opens
 * into columns.
 */
export function HubDirectory(): ReactElement {
  const groups = [
    { title: 'By chamber', hubs: hubsOfKind('chamber') },
    { title: 'By stage', hubs: hubsOfKind('status') },
  ];
  const topics = hubsOfKind('topic');

  return (
    <details className="group border-t border-border">
      <summary className="flex h-11 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span className="label-eyebrow !mb-0">Guides to every topic and stage</span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-xs tabular text-muted-foreground">
            {topics.length + groups.reduce((n, g) => n + g.hubs.length, 0)} pages
          </span>
          <ChevronDown
            className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </span>
      </summary>

      <HubLinkTracker placement="directory" className="pb-5 pt-1">
        <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
          Each of these is a page in its own right, with an explanation of what the
          grouping means and the bills currently in it.
        </p>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="label-eyebrow mb-2">{group.title}</p>
              <ul className="space-y-1.5 text-sm">
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

          <div className="sm:col-span-2">
            <p className="label-eyebrow mb-2">By policy area</p>
            {/* CSS columns rather than a grid: 33 items of uneven length flow
                into balanced columns without ordering them across the page. */}
            <ul className="columns-2 gap-6 space-y-1.5 text-sm lg:columns-2">
              {topics.map((hub) => (
                <li key={hub.path} className="break-inside-avoid">
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
        </div>
      </HubLinkTracker>
    </details>
  );
}
