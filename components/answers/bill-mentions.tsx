'use client';

import Link from 'next/link';
import { analytics } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { CompactBillCard } from '@/components/bills/bill-card';
import { billTypeOfLabel } from '@/lib/utils/bill-stages';
import { billNoun } from '@/lib/seo';
import type { AnswerBills, BillMention } from '@/lib/answer-bill-links';

type HastLike = { type: string; properties?: Record<string, unknown> };

const prop = (node: unknown, name: string) => (node as HastLike | undefined)?.properties?.[name];
const isCards = (node: unknown) => Boolean(prop(node, 'dataCards'));
const isPending = (node: unknown) => Boolean(prop(node, 'dataPending'));

/** What the renderers read: replaced on every render, read when they run. */
export interface BillContext {
  bills: AnswerBills;
  order: Map<string, number>;
  surface: string;
}

function billOf(node: unknown, bills: AnswerBills): BillMention | undefined {
  const id = (node as HastLike | undefined)?.properties?.dataBill;
  return typeof id === 'string' ? bills.byId.get(id) : undefined;
}

/**
 * The markdown renderers that make an answer's bills clickable where they are
 * named (lib/answer-bill-links.ts marks them). `base` is the thread's own set:
 * paragraph, list and bold styles.
 *
 * - An item of a list of bills is drawn as that bill's card, the same compact
 *   card the answer puts after its prose: number, title, sponsor and stage.
 *   The item's own words are not repeated inside it — the card already says
 *   which bill it is, and a sentence inside every card made the list a wall.
 * - Only a list of bills gets cards, decided as a whole (`cardLists`); its
 *   bullets or numerals go, because the cards are the list.
 * - A bill named in running text, and every citation of one, is a plain link.
 *
 * - A list held back (`data-pending`: the answer's sources have not arrived,
 *   so it cannot be judged yet) is drawn as nothing for that moment.
 *
 * Built ONCE per answer and reading `ctx` when they run: if these functions
 * changed when the sources arrived, React would treat every list and link on
 * screen as a new kind of element and rebuild it, fading its words in again.
 *
 * `order` is each bill's place in the answer (first mention first), so
 * `position` means the same thing wherever the reader clicks it.
 */
export function billMarkdownComponents<T extends object>(base: T, ctx: { current: BillContext }) {
  const track = (bill: BillMention, placement: 'in_list' | 'in_text') =>
    analytics.answerEntityClicked({
      surface: ctx.current.surface,
      entity_kind: 'bill',
      position: ctx.current.order.get(bill.id) ?? 0,
      entity_id: bill.id,
      placement,
    });

  return {
    ...base,
    a: ({ node, href, children }: { node?: unknown; href?: string; children?: React.ReactNode }) => {
      const bill = billOf(node, ctx.current.bills);
      if (!bill) return <a href={href}>{children}</a>;
      const cite = prop(node, 'dataMention') === 'cite';
      return (
        <Link
          href={bill.href}
          onClick={() => track(bill, 'in_text')}
          // "[1]" alone says nothing to a screen reader, or where it goes.
          aria-label={cite ? `Source ${String(prop(node, 'dataCite'))}: open ${bill.label}` : undefined}
          className={cn(
            'focus-ring rounded-xs transition-colors',
            cite
              ? 'font-sans text-[0.8em] text-ink-2 no-underline hover:text-ink'
              : 'underline decoration-line-strong decoration-1 underline-offset-[3px] hover:decoration-ink',
          )}
        >
          {children}
        </Link>
      );
    },
    ul: ({ node, children }: { node?: unknown; children?: React.ReactNode }) =>
      isPending(node) ? null : isCards(node) ? (
        <ul className="mb-3 list-none space-y-2">{children}</ul>
      ) : (
        <ul className="mb-3 ml-5 list-disc space-y-1.5 marker:text-ink-3">{children}</ul>
      ),
    ol: ({ node, children }: { node?: unknown; children?: React.ReactNode }) =>
      isPending(node) ? null : isCards(node) ? (
        // A ranked list of bills keeps its order on the page, not its numerals:
        // the cards stack in the order the answer gave.
        <ol className="mb-3 list-none space-y-2">{children}</ol>
      ) : (
        <ol className="mb-3 ml-5 list-decimal space-y-1.5 marker:font-mono marker:text-ink-3">
          {children}
        </ol>
      ),
    li: ({ node, children }: { node?: unknown; children?: React.ReactNode }) => {
      const bill = billOf(node, ctx.current.bills);
      if (!bill) return <li>{children}</li>;
      const billType = billTypeOfLabel(bill.label);
      return (
        // font-sans resets the answer prose around it: the card sets its own type.
        <li className="font-sans text-base">
          <CompactBillCard
            href={bill.href}
            label={bill.label}
            title={bill.title}
            sponsorLastName={bill.sponsor?.split(' ').slice(-1)[0]}
            sponsorParty={bill.sponsorParty}
            stage={bill.stage}
            billType={billType}
            noun={billNoun(billType)}
            onClick={() => track(bill, 'in_list')}
          />
        </li>
      );
    },
  };
}
