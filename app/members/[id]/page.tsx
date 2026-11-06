import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { cache } from 'react';
import { api } from '@/convex/_generated/api';
import { getConvexHttpClient } from '@/lib/convex-client';
import { SITE_NAME, pageTitle } from '@/lib/seo';
import { STATE_NAMES } from '@/lib/constants/filters';
import { MemberPage } from '@/components/members/member-page';

interface PageProps {
  params: Promise<{ id: string }>;
}

const BIOGUIDE = /^[A-Z]\d{6}$/;

// One Convex call per request, shared by generateMetadata and the page.
// Returns null only when there is no such member; any other failure throws,
// so the reader gets the error page and its "Try again", never a 404 that a
// crawler would cache (see app/bills/[id]/get-bill.ts).
const getMember = cache(async (id: string) => {
  if (!BIOGUIDE.test(id)) return null;
  const client = getConvexHttpClient();
  if (!client) throw new Error('Convex not configured');
  return await client.query(api.members.getPage, { bioguideId: id });
});

export type MemberPageData = NonNullable<Awaited<ReturnType<typeof getMember>>>;

function roleWord(chamber: 'house' | 'senate'): string {
  return chamber === 'senate' ? 'Senator' : 'Representative';
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const page = await getMember(id);
  if (!page) return { title: 'Member Not Found' };
  const { member } = page;
  const state = STATE_NAMES[member.state] ?? member.state;
  const title = `${member.name}, ${roleWord(member.chamber)} from ${state}`;
  const description = `${member.name}'s official social media accounts and newest bills in Congress. Accounts are shown only when ${member.name}'s own .gov website links them.`;
  const canonical = `/members/${id}`;
  return {
    title: pageTitle(title),
    description,
    alternates: { canonical },
    openGraph: { type: 'profile', url: canonical, title, description, siteName: SITE_NAME },
    twitter: { card: 'summary', title, description },
    // A member out of office keeps a page for links already shared, but it is
    // not a page search engines should send new readers to.
    ...(member.inOffice ? {} : { robots: { index: false } }),
  };
}

export default async function Page({ params }: PageProps): Promise<ReactElement> {
  const { id } = await params;
  const page = await getMember(id);
  if (!page) notFound();
  return <MemberPage page={page} />;
}
