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
 * which is why 99.98% of the corpus was reachable only via the sitemap.
 *
 * Nothing else covers all 40. The sitewide footer carries the seven chamber and
 * stage hubs and no topics; the homepage policy-area list links the eight
 * biggest topics of the current Congress; a hub page links its own siblings,
 * which is a closed loop a crawler can only enter from outside. So this block
 * is the only inbound link the remaining topic hubs have.
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
 * into columns of quiet, hairline-ruled link lists.
 */
export function HubDirectory(): ReactElement {
  const groups = [
    { title: 'By chamber', hubs: hubsOfKind('chamber') },
    { title: 'By stage', hubs: hubsOfKind('status') },
  ];
  const topics = hubsOfKind('topic');

  const linkClass =
    'flex min-h-10 items-center py-2 text-sm text-ink-2 transition-colors hover:text-ink hover:underline hover:decoration-line-strong hover:underline-offset-[3px] focus-ring';

  return (
    <details className="group mt-4 border-y border-line">
      <summary className="flex h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xs text-sm font-medium text-ink-2 transition-colors hover:text-ink focus-ring [&::-webkit-details-marker]:hidden">
        <span>Guides to every topic and stage</span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-xs font-normal tabular text-ink-3">
            {topics.length + groups.reduce((n, g) => n + g.hubs.length, 0)} pages
          </span>
          <ChevronDown
            className="h-4 w-4 text-ink-3 transition-transform group-open:rotate-180"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </span>
      </summary>

      <HubLinkTracker placement="directory" className="pb-6 pt-2">
        <p className="mb-5 max-w-measure text-sm text-ink-2">
          Each of these is a page in its own right, with an explanation of what the
          grouping means and the bills currently in it.
        </p>

        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="label-eyebrow border-b border-line pb-2">{group.title}</p>
              <ul>
                {group.hubs.map((hub) => (
                  <li key={hub.path} className="border-b border-line">
                    <Link href={hub.path} className={linkClass}>
                      {hub.heading}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="sm:col-span-2">
            <p className="label-eyebrow border-b border-line pb-2">By policy area</p>
            {/* CSS columns rather than a grid: 33 items of uneven length flow
                into balanced columns without ordering them across the page. */}
            <ul className="columns-1 gap-x-8 min-[480px]:columns-2">
              {topics.map((hub) => (
                <li key={hub.path} className="break-inside-avoid border-b border-line">
                  <Link href={hub.path} className={linkClass}>
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
