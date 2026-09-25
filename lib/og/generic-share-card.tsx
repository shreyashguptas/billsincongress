import type { ReactElement } from 'react';
import { CardFrame, INK_2 } from './card-parts';

/**
 * The site's generic share card (public/images/og-default.png, built by
 * scripts/generate-og-image.ts): what pages without a card of their own — About,
 * Learn, Pro — unfurl into, and what a card route sends when it cannot read
 * the figures it needs. Same frame as every other card; with no data to draw,
 * it says what the site is.
 */
export function GenericShareCard(): ReactElement {
  return (
    <CardFrame>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            fontFamily: 'Newsreader',
            fontWeight: 500,
            fontSize: 76,
            lineHeight: 1.08,
            letterSpacing: '-0.02em',
            maxWidth: 1000,
          }}
        >
          Every bill in the U.S. Congress, drawn so anyone can read it.
        </div>
        <div style={{ fontSize: 30, color: INK_2, marginTop: 32 }}>
          Independent · sourced from Congress.gov
        </div>
      </div>
    </CardFrame>
  );
}
