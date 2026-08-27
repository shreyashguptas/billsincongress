import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { hubByPath } from '@/lib/hubs';
import { HubView, hubMetadata, parseHubPage } from './hub-view';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Every hub is a static segment under /bills, which also holds /bills/[id].
// Next resolves the static route first; lib/hubs.test.ts asserts these slugs can
// never look like a bill id, so the two can never fight over a URL.
export function makeHubPage(path: string) {
  const hub = hubByPath(path)!;

  return {
    generateMetadata: async ({ searchParams }: PageProps): Promise<Metadata> =>
      await hubMetadata(hub, parseHubPage((await searchParams).page)),

    Page: async ({ searchParams }: PageProps): Promise<ReactElement> => (
      <HubView hub={hub} page={parseHubPage((await searchParams).page)} />
    ),
  };
}
