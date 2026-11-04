/**
 * The state map's five shades and the ink its state codes take on each
 * (components/dashboard/home/state-map.tsx). Pure, so the contrast of every
 * code on every shade is checked in a test against the theme tokens.
 *
 * One amber, `--heat`, stepped by opacity over the paper. In Day the codes are
 * ink on every shade: paper-coloured text on the two darkest measured 3.71:1
 * and 2.64:1, under the 4.5:1 that 13px text needs (WCAG 1.4.3). In Night the
 * amber is light, so the two darkest shades take `on-ink` (dark) text there.
 */
export const HEAT_ALPHA = [0.12, 0.3, 0.5, 0.72, 0.95] as const;

/** The shade from which Night sets its codes in `on-ink`. */
export const NIGHT_ON_INK_FROM_BIN = 3;

/*
 * The classes themselves are written in state-map.tsx, where Tailwind reads
 * them (it does not scan lib/): `bin >= NIGHT_ON_INK_FROM_BIN ? 'text-ink
 * dark:text-on-ink' : 'text-ink'`. lib/state-map-tiles.test.ts checks that
 * line is there.
 */
