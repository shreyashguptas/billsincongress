import { writeFile } from 'fs/promises';
import { join } from 'path';
import { createElement } from 'react';
import { ImageResponse } from 'next/og';
import { SHARE_CARD_SIZE } from '@/lib/seo';
import { shareCardFonts } from '@/lib/og/card-parts';
import { GenericShareCard } from '@/lib/og/generic-share-card';

// Generates the site's generic Open Graph / social-share image (1200×630),
// public/images/og-default.png, from lib/og/generic-share-card.tsx — the same
// frame and embedded fonts as every live share card (Documentation/brand.md,
// "Share card"). Run manually after changing that card, and commit the PNG:
//
//   pnpm exec tsx scripts/generate-og-image.ts
//
// The fonts are embedded (lib/og/fonts.ts), so the output no longer depends on
// what is installed on the machine that runs it.

const outputFile = join(process.cwd(), 'public', 'images', 'og-default.png');

async function generateOgImage() {
  const res = new ImageResponse(createElement(GenericShareCard), {
    ...SHARE_CARD_SIZE,
    fonts: shareCardFonts(),
  });
  await writeFile(outputFile, Buffer.from(await res.arrayBuffer()));
  console.log(`Generated ${outputFile}`);
}

generateOgImage().catch((error) => {
  console.error('OG image generation failed:', error);
  process.exit(1);
});
