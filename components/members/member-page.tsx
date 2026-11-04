import Link from 'next/link';
import type { ReactNode } from 'react';
import type { MemberPageData } from '@/app/members/[id]/page';
import { STATE_NAMES } from '@/lib/constants/filters';
import { measureStageLabel } from '@/lib/utils/bill-stages';
import { formatCongressOrdinal } from '@/lib/congress';
import { PartyDot } from '@/components/brand/party';
import { SourceLine } from '@/components/brand/section';
import { stageFill } from '@/components/brand/status';
import { MemberAccounts } from '@/components/bills/member-accounts';
import { Arrow } from '@/components/brand/arrow';

const PARTY_NAMES: Record<string, string> = { D: 'Democrat', R: 'Republican', I: 'Independent', L: 'Libertarian' };

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

/**
 * "Representative · California's 12th district", "Senator · New York". An
 * eyebrow label, so its words stay plain (brand.md, "Term": a dotted word
 * belongs in a sentence); Learn's "Words you'll see" defines each.
 */
function SeatLine({ member }: { member: MemberPageData['member'] }) {
  const state = STATE_NAMES[member.state] ?? member.state;
  if (member.chamber === 'senate') return <>Senator · {state}</>;
  if (member.district === null) return <>Representative · {state}</>;
  if (member.district === 0) return <>Representative · {state}, at large</>;
  return (
    <>
      Representative · {state}&rsquo;s {ordinal(member.district)} district
    </>
  );
}

type BillRow = MemberPageData['sponsored'][number] & { joined?: string };

function BillList({ title, id, bills, empty }: { title: ReactNode; id: string; bills: BillRow[]; empty: string }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="font-serif text-display-sm text-ink">
        {title}
      </h2>
      {bills.length === 0 ? (
        <p className="mt-4 text-ink-2">{empty}</p>
      ) : (
        <ul className="mt-6 border-t border-line">
          {bills.map((b) => (
            <li key={b.billId} className="border-b border-line">
              <Link href={`/bills/${b.billId}`} className="focus-ring group flex gap-4 rounded-sm py-4 sm:items-baseline">
                <span className="w-24 shrink-0 font-mono text-xs text-ink-2 tabular">
                  {b.billTypeLabel} {b.billNumber}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-ink group-hover:underline">{b.title}</span>
                  {b.progressStage !== null && (
                    <span className="mt-1 flex items-center gap-2 text-sm text-ink-3">
                      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${stageFill(b.progressStage, b.billType)}`} />
                      {measureStageLabel(b.progressStage, b.billType)}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One member: their seat, their official accounts (only those their own .gov
 * site links), and their newest bills and cosponsorships this Congress.
 * Lists are the newest ten, never a count: the full list is on /bills.
 */
export function MemberPage({ page }: { page: MemberPageData }) {
  const { member, accounts, congress, sponsored, cosponsored, sponsorFilterName } = page;
  const congressWords = congress ? `the ${formatCongressOrdinal(congress)} Congress` : 'this Congress';

  return (
    <article className="container-editorial py-12 sm:py-16">
      <header className="max-w-3xl">
        <p className="label-eyebrow">
          <SeatLine member={member} />
        </p>
        <h1 className="mt-3 font-serif text-display-md text-ink sm:text-display-lg">{member.name}</h1>
        {member.party && (
          <p className="mt-4 inline-flex items-center gap-2 text-ink-2">
            <PartyDot party={member.party} />
            {PARTY_NAMES[member.party] ?? member.party}
          </p>
        )}
        {!member.inOffice && (
          <p className="mt-4 text-ink-2">No longer in office. Official accounts are not shown for former members.</p>
        )}
      </header>

      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-20">
        <div className="min-w-0 space-y-14">
          <BillList
            id="member-sponsored"
            title={
              <>
                Newest bills {member.name} sponsored
              </>
            }
            bills={sponsored}
            empty={`None yet in ${congressWords}.`}
          />
          {sponsorFilterName && (
            <Link
              href={`/bills?sponsor=${encodeURIComponent(sponsorFilterName).replace(/%20/g, '+')}`}
              className="focus-ring -mt-8 inline-flex min-h-11 items-center text-ink underline underline-offset-4"
            >
              <span>
                All of {member.name}&rsquo;s bills <Arrow />
              </span>
            </Link>
          )}
          <BillList
            id="member-cosponsored"
            title={
              <>
                Newest bills they cosponsored
              </>
            }
            bills={cosponsored}
            empty={`None recorded yet in ${congressWords}.`}
          />
          <SourceLine>Source: Congress.gov · the newest ten of each in {congressWords}</SourceLine>
        </div>

        {/* First on a phone, where it is the reason most readers came; beside the lists from lg. */}
        <aside className="order-first min-w-0 lg:order-last">
          <div className="rounded-md border border-line bg-raised p-6">
            <MemberAccounts data={accounts} surface="member_page" />
            {(!accounts || (accounts.accounts.length === 0 && !accounts.officialWebsiteUrl)) && (
              <p className="text-sm text-ink-2">No official accounts shown.</p>
            )}
          </div>
        </aside>
      </div>
    </article>
  );
}
