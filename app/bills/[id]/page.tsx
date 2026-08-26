import { cache } from 'react';
import { notFound } from 'next/navigation';
import BillDetails from '../../../components/bills/bill-details';
import { billsService } from '@/lib/services/bills-service';
import type { Bill } from '@/lib/types/bill';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import {
  SITE_NAME,
  SITE_URL,
  DEFAULT_OG_IMAGE,
  billSeoDescription,
  billSeoTitle,
  billSummaryText,
  congressOrdinal,
  congressGovUrl,
  legislationTypeLabel,
  truncateAtWord,
} from '@/lib/seo';
import { JsonLd } from '@/components/seo/json-ld';

// schema.org Legislation + BreadcrumbList nodes for a bill page. Stage
// thresholds mirror convex/billStage.ts (80 = passed both chambers,
// 100 = signed into law).
function billJsonLd(bill: Bill, id: string): object {
  const url = `${SITE_URL}/bills/${id}`;
  const identifier = `${bill.bill_type_label} ${bill.bill_number}`;
  const summary = billSummaryText(bill);
  const officialUrl = congressGovUrl(bill);

  const legislation: Record<string, unknown> = {
    '@type': 'Legislation',
    '@id': url,
    url,
    name: bill.title,
    legislationIdentifier: identifier,
    legislationType: legislationTypeLabel(bill.bill_type),
    legislationJurisdiction: 'United States',
    inLanguage: 'en',
    isPartOf: { '@id': `${SITE_URL}/#website` },
  };
  if (bill.introduced_date) {
    legislation.legislationDate = bill.introduced_date;
    legislation.dateCreated = bill.introduced_date;
  }
  if (summary) {
    legislation.abstract = truncateAtWord(summary, 500);
  }
  if (bill.sponsor_first_name || bill.sponsor_last_name) {
    legislation.sponsor = {
      '@type': 'Person',
      name: `${bill.sponsor_first_name ?? ''} ${bill.sponsor_last_name ?? ''}`.trim(),
    };
  }
  if (bill.progress_stage >= 80) {
    legislation.legislationPassedBy = {
      '@type': 'Organization',
      name: 'United States Congress',
    };
  }
  // Signed-into-law bills are in force; everything still moving (introduced, in
  // committee, passed one/both chambers) has no legal force yet.
  legislation.legislationLegalForce =
    bill.progress_stage === 100
      ? 'https://schema.org/InForce'
      : 'https://schema.org/NotInForce';
  if (officialUrl) {
    legislation.sameAs = officialUrl;
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [
      legislation,
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Bills', item: `${SITE_URL}/bills` },
          {
            '@type': 'ListItem',
            position: 3,
            name: `${identifier} (${congressOrdinal(bill.congress)} Congress)`,
          },
        ],
      },
    ],
  };
}

interface PageProps {
  params: Promise<{ id: string }>;
}

// Bill IDs look like "1hr119" / "4199s118": number + type + congress. Anything
// else can 404 without a Convex round-trip.
const BILL_ID_PATTERN = /^\d{1,5}[a-z]{1,7}\d{2,3}$/;

// Fetch the bill once per request. React's `cache()` dedupes the call shared
// between generateMetadata and the page render (request-scoped only — no
// persistent cache). The page renders dynamically on each request; returns
// null on any failure so the caller can route to notFound() cleanly.
const getBill = cache(async (id: string): Promise<Bill | null> => {
  if (!BILL_ID_PATTERN.test(id)) {
    return null;
  }
  try {
    return await billsService.fetchBillById(id);
  } catch (error) {
    console.error(`getBill(${id}) failed:`, error);
    return null;
  }
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const bill = await getBill(id);

  if (!bill) {
    return { title: 'Bill Not Found' };
  }

  const title = billSeoTitle(bill);
  const description = billSeoDescription(bill);
  const canonical = `/bills/${id}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      // Page-level openGraph replaces the root object, so re-include the
      // shared image.
      type: 'article',
      url: canonical,
      title,
      description,
      siteName: SITE_NAME,
      images: [DEFAULT_OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function BillPage({ params }: PageProps): Promise<ReactElement> {
  const { id } = await params;
  const bill = await getBill(id);

  if (!bill) {
    notFound();
  }

  // No Suspense boundary here, deliberately. `bill` is already awaited above,
  // and nothing inside BillDetails suspends, so a boundary could never do the
  // one thing a boundary is for — let the page paint while something loads.
  // What it did instead was defer the whole article into a streaming segment:
  // the shell (header, a ~150px skeleton, footer) painted first, then the real
  // page was swapped in underneath. Two costs, both measured:
  //
  //   Layout shift. Bill pages scored 0.304 at the 75th percentile against
  //   Google's 0.25 "poor" threshold, and 0.521 at the 90th, while the
  //   homepage and hubs — which have no such boundary — scored 0.000.
  //
  //   Crawlers. The article was delivered inside `<div hidden id="S:0">` and
  //   only revealed when a script ran. Verified against a real Bingbot
  //   user-agent, and Bing is the engine sending this site nearly all of its
  //   traffic.
  return (
    <>
      <JsonLd data={billJsonLd(bill, id)} />
      <BillDetails bill={bill} />
    </>
  );
}
