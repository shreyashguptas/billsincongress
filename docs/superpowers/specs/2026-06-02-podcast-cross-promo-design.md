# Podcast cross-promotion — design

**Date:** 2026-06-02
**Status:** Approved by owner

## Goal

Cross-promote the owner's podcast, **The Federalist Papers: Explained**, on the
Bills in Congress website. People interested in what Congress is doing are a
natural audience for a plain-English podcast about the founding ideas behind
Congress.

## Podcast facts

- Show name: The Federalist Papers: Explained
- Spotify: https://open.spotify.com/show/4WDAio2kR6DbCkyuMRX8ea
- Apple Podcasts: https://podcasts.apple.com/us/podcast/the-federalist-papers-explained/id1885411973
- Show art source (read-only, never modified):
  `~/Library/Mobile Documents/com~apple~CloudDocs/My Podcasts/Federalist Papers Explained/Show Art.png`

## What gets built

### 1. Show art asset

Copy the show art into `public/images/` under a clean name
(`federalist-papers-podcast.*`), converted/resized to a web-friendly format and
size. The original podcast folder is never modified.

### 2. One reusable promo component, two variants

`components/podcast-promo.tsx`

- **`full` variant** — show art, podcast name, one-line pitch
  ("The founding ideas behind Congress — one paper at a time, in plain
  English"), and two link buttons: Listen on Spotify / Listen on Apple
  Podcasts.
- **`compact` variant** — slim single-row version: small art, one line of
  text, the two links.
- Styled to match the site's editorial design system (label-eyebrow, serif
  headings, border/card patterns).
- Podcast URLs live in this one component so future changes happen in one
  place.

### 3. Placements

| Page | Variant | Position |
|---|---|---|
| Home page (`app/components/dashboard/DashboardClient.tsx`) | full | New section near the bottom of the dashboard |
| Learn page (`app/learn/page.tsx`) | full | Before the final "Now you're ready → Browse the bills" CTA |
| Bill detail (`components/bills/bill-details.tsx`) | compact | Last section of the page, after the Q&A |

Rationale for bill pages (owner's concern: don't interrupt someone mid-research):
the promo sits at the very end of the page, the "I'm done, what's next?" moment.

### 4. Analytics (per project rules in CLAUDE.md)

- New event: `podcast_promo_clicked`
  - Properties: `placement` (`home` | `learn` | `bill`), `platform`
    (`spotify` | `apple`), `bill_id` (only on bill pages)
- Typed helper in `lib/analytics.ts`; component never calls
  `posthog.capture()` with raw strings.
- Registered in the events table in `ANALYTICS.md`.
- Purpose: settle with data whether the bill-page placement earns its spot.
  Click-through per placement can be compared against existing page-view
  events.

## Out of scope

- No changes to the podcast folder.
- No removal or rearrangement of existing page content.
- No per-episode pages or embedded audio player (could be a future step).
