import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { notFound } from 'next/navigation';
import { policyAreaFromSlug, TOPIC_HUBS, topicSlug } from '@/lib/hubs';
import { HubView, hubMetadata, parseHubPage } from '../../_hub/hub-view';

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** The hub for this slug, or null when the slug names no known policy area. */
function hubFor(slug: string) {
  const policyArea = policyAreaFromSlug(slug);
  if (!policyArea) return null;
  return TOPIC_HUBS.find((h) => h.path === `/bills/topic/${topicSlug(policyArea)}`) ?? null;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const hub = hubFor((await params).slug);
  if (!hub) return { title: 'Topic not found' };
  return await hubMetadata(hub, parseHubPage((await searchParams).page));
}

export default async function Page({ params, searchParams }: PageProps): Promise<ReactElement> {
  const hub = hubFor((await params).slug);
  // An unknown slug is a genuine 404 rather than an empty topic page.
  if (!hub) notFound();
  return <HubView hub={hub} page={parseHubPage((await searchParams).page)} />;
}
