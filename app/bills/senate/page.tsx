import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { hubByPath } from '@/lib/hubs';
import { HubView, hubMetadata, parseHubPage } from '../_hub/hub-view';

// Static segment under /bills, which also holds /bills/[id]. Next resolves the
// static route first; lib/hubs.test.ts asserts these slugs can never look like
// a bill id, so the two can never fight over a URL.
const HUB = hubByPath('/bills/senate')!;

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  return await hubMetadata(HUB, parseHubPage((await searchParams).page));
}

export default async function Page({ searchParams }: PageProps): Promise<ReactElement> {
  return <HubView hub={HUB} page={parseHubPage((await searchParams).page)} />;
}
