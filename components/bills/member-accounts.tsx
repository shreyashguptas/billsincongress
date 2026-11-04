'use client';

import { ArrowUpRight } from 'lucide-react';
import { analytics, type MemberAccountSurface } from '@/lib/analytics';
import { SourceLine } from '@/components/brand/section';
import type { OfficialAccounts } from '@/convex/memberAccounts';
import type { Platform } from '@/convex/memberAccountsParse';

/** The platform's name in words: no brand logos (documentation/brand.md, "Official accounts"). */
const PLATFORM_NAMES: Record<Platform, string> = {
  x: 'X',
  facebook: 'Facebook',
  instagram: 'Instagram',
  youtube: 'YouTube',
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * A member's official social media accounts and website: one hairline-ruled
 * row each, the platform on the left and the handle on the right, opening in a
 * new tab. Only accounts the member's own .gov website links reach here
 * (convex/memberAccounts.ts); a member with none confirmed gets only their
 * website, and one with no website either renders nothing.
 */
export function MemberAccounts({
  data,
  surface,
  billId,
  className,
}: {
  data: OfficialAccounts | null | undefined;
  surface: MemberAccountSurface;
  billId?: string;
  className?: string;
}) {
  if (!data || (data.accounts.length === 0 && !data.officialWebsiteUrl)) return null;

  const rows = [
    ...data.accounts.map((a) => ({ key: a.platform, name: PLATFORM_NAMES[a.platform], label: a.label, url: a.url })),
    ...(data.officialWebsiteUrl
      ? [{ key: 'website' as const, name: 'Official website', label: hostOf(data.officialWebsiteUrl), url: data.officialWebsiteUrl }]
      : []),
  ];

  return (
    <div className={className}>
      <p className="label-eyebrow">Official accounts</p>
      <ul className="mt-2 text-sm">
        {rows.map((row) => (
          <li key={row.key} className="border-t border-line first:border-t-0">
            <a
              href={row.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex min-h-11 items-center justify-between gap-3 py-2.5"
              onClick={() =>
                analytics.memberAccountClicked({
                  platform: row.key,
                  bioguide_id: data.bioguideId,
                  surface,
                  ...(billId ? { bill_id: billId } : {}),
                })
              }
            >
              <span className="text-ink-2">{row.name}</span>
              <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-ink group-hover:underline">
                <span className="truncate">{row.label}</span>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-3" strokeWidth={1.75} aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
      {data.accounts.length > 0 && (
        <SourceLine className="mt-3">Source: each account is linked from the member&rsquo;s own .gov website, checked daily</SourceLine>
      )}
    </div>
  );
}
