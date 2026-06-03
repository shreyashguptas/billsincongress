'use client';

import { analytics } from '@/lib/analytics';
import { Headphones, Podcast } from 'lucide-react';

// Cross-promotion for the site owner's podcast, "The Federalist Papers:
// Explained". Rendered on the home page, the Learn page and at the end of
// every bill detail page. All podcast facts (links, art, copy) live here so
// future changes happen in one place.
const PODCAST = {
  title: 'The Federalist Papers: Explained',
  art: '/images/federalist-papers-podcast.webp',
  spotifyUrl: 'https://open.spotify.com/show/4WDAio2kR6DbCkyuMRX8ea',
  appleUrl:
    'https://podcasts.apple.com/us/podcast/the-federalist-papers-explained/id1885411973',
};

export type PodcastPromoPlacement = 'home' | 'learn' | 'bill';

interface PodcastPromoProps {
  /** Which page the promo is rendered on — recorded on every click. */
  placement: PodcastPromoPlacement;
  /** `full` = art + heading + pitch + buttons. `compact` = slim end-of-article row. */
  variant?: 'full' | 'compact';
  /** Override the small uppercase label above the title. */
  eyebrow?: string;
  /** Present only when the promo sits on a bill detail page. */
  billId?: string;
}

export default function PodcastPromo({
  placement,
  variant = 'full',
  eyebrow,
  billId,
}: PodcastPromoProps) {
  const trackClick = (platform: 'spotify' | 'apple') =>
    analytics.podcastPromoClicked({
      placement,
      platform,
      ...(billId ? { bill_id: billId } : {}),
    });

  if (variant === 'compact') {
    return (
      <div className="flex items-start sm:items-center gap-5 sm:gap-6">
        <img
          src={PODCAST.art}
          alt={`${PODCAST.title} — podcast show art`}
          width={640}
          height={640}
          loading="lazy"
          className="w-20 sm:w-24 h-auto rounded-sm border border-border shrink-0"
        />
        <div className="min-w-0">
          <p className="label-eyebrow mb-1.5">{eyebrow ?? 'Before you go'}</p>
          <p className="font-serif text-xl font-semibold tracking-tight">
            {PODCAST.title}
          </p>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
            The ideas behind everything Congress does — each Federalist Paper
            explained in plain English, one short episode at a time.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            <a
              href={PODCAST.spotifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackClick('spotify')}
              className="inline-flex items-center gap-1.5 text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground"
            >
              <Headphones className="h-3.5 w-3.5" />
              Listen on Spotify
            </a>
            <a
              href={PODCAST.appleUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackClick('apple')}
              className="inline-flex items-center gap-1.5 text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground"
            >
              <Podcast className="h-3.5 w-3.5" />
              Listen on Apple Podcasts
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row gap-8 sm:gap-10 items-start">
      <img
        src={PODCAST.art}
        alt={`${PODCAST.title} — podcast show art`}
        width={640}
        height={640}
        loading="lazy"
        className="w-40 sm:w-48 h-auto rounded-sm border border-border shrink-0"
      />
      <div className="max-w-xl">
        <p className="label-eyebrow mb-2">{eyebrow ?? 'From our podcast'}</p>
        <h2 className="font-serif text-display-sm font-semibold tracking-tight leading-tight">
          {PODCAST.title}
        </h2>
        <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed">
          The essays that argued America into existence — and that explain why
          Congress works the way it does. Each Federalist Paper, retold in
          plain English, one short episode at a time.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={PODCAST.spotifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackClick('spotify')}
            className="inline-flex items-center gap-2 rounded-sm bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:bg-foreground/85 transition-colors"
          >
            <Headphones className="h-4 w-4" />
            Listen on Spotify
          </a>
          <a
            href={PODCAST.appleUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackClick('apple')}
            className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
          >
            <Podcast className="h-4 w-4" />
            Listen on Apple Podcasts
          </a>
        </div>
      </div>
    </div>
  );
}
