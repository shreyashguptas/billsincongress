import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Builds app/fonts/newsreader-*.woff2: Newsreader, the serif of
// documentation/brand.md, with its vertical metrics moved so its capitals sit
// in the middle of the line box.
//
// Why: as Google ships it, Newsreader reserves 0.735em above the baseline and
// 0.265em below, but its capitals are only ~0.675em tall. A browser centres
// the whole box, so the letters ride ~0.12em high — 3px at a 26px panel
// title. Every icon, pill or circle centred beside serif text looked low (see
// "Icons beside text" in documentation/brand.md). Geist needs no fix: its box
// is already centred on its capitals.
//
// The fix keeps the box the same height (1em) and only moves the baseline in
// it: ascent + descent is unchanged, and ascent - descent becomes the cap
// height, so the centre of the box is the centre of a capital. Line heights
// are set explicitly everywhere, so nothing reflows; single lines just sit
// where the eye expects them. It is done in the font file, not in CSS,
// because Safari ignores the CSS way (`ascent-override`).
//
// Run manually and commit the result — it is NOT part of the build:
//
//   pip install fonttools brotli
//   pnpm exec tsx scripts/generate-serif-font.ts
//
// It prints each subset's unicode-range; app/fonts/index.ts must carry the same
// ranges (next/font only takes literals, so they are copied there by hand).
// Newsreader is under the SIL Open Font License 1.1 with no Reserved Font
// Name, which permits a modified copy; app/fonts/OFL.txt travels with it.

// Same request next/font/google made: both axes, every weight.
const FAMILY = 'Newsreader:opsz,wght@6..72,200..800';
// A current browser's user agent makes Google Fonts answer with WOFF2 split
// into unicode-range subsets.
const MODERN_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const SUBSETS = ['latin', 'latin-ext', 'vietnamese'] as const;
// The cap height is measured on this cut: the panel-title size (display-sm,
// 26px), in the middle of the 16–34px range where serif text meets icons.
// Across that range the cap height moves by under 0.01em.
const MEASURE_AT = { opsz: 26, wght: 500 };

const outDir = join(process.cwd(), 'app', 'fonts');

// measure <file> <opsz> <wght>: prints the height of a capital H on that cut.
// patch <in> <out> <cap>: moves ascent/descent so the box centres on <cap>.
const PY = `
import sys
from fontTools.ttLib import TTFont

if sys.argv[1] == 'measure':
    from fontTools.varLib.instancer import instantiateVariableFont
    from fontTools.pens.boundsPen import BoundsPen
    cut = instantiateVariableFont(TTFont(sys.argv[2]), {'opsz': float(sys.argv[3]), 'wght': float(sys.argv[4])})
    glyphs = cut.getGlyphSet()
    pen = BoundsPen(glyphs)
    glyphs[cut.getBestCmap()[ord('H')]].draw(pen)
    print(round(pen.bounds[3]))
else:
    font = TTFont(sys.argv[2])
    cap = int(sys.argv[4])
    hhea, os2 = font['hhea'], font['OS/2']
    total = hhea.ascent - hhea.descent
    ascent = round((total + cap) / 2)
    descent = ascent - total
    hhea.ascent, hhea.descent, hhea.lineGap = ascent, descent, 0
    os2.sTypoAscender, os2.sTypoDescender, os2.sTypoLineGap = ascent, descent, 0
    # USE_TYPO_METRICS: Windows browsers lay text out from the typo values
    # above only with this bit set (Google's files have it; keep it so).
    # usWinAscent/usWinDescent stay as shipped: they are clipping bounds, and
    # shrinking them would clip accented capitals.
    # The bit only means USE_TYPO_METRICS from OS/2 version 4 on; below that it
    # is reserved and Windows would keep using the win metrics, so stop rather
    # than ship a font whose fix silently does nothing there.
    if os2.version < 4:
        sys.exit(f'OS/2 table is version {os2.version}; USE_TYPO_METRICS needs 4 or later')
    os2.fsSelection |= 1 << 7
    font.flavor = 'woff2'
    font.save(sys.argv[3])
    print(f'cap {cap}/{font["head"].unitsPerEm}: ascent {ascent}, descent {descent}')
`;

const py = (...args: string[]) => execFileSync('python3', ['-c', PY, ...args]).toString().trim();

async function main() {
  const res = await fetch(`https://fonts.googleapis.com/css2?family=${FAMILY}&display=swap`, {
    headers: { 'user-agent': MODERN_UA },
  });
  if (!res.ok) throw new Error(`Google Fonts CSS: HTTP ${res.status}`);
  const css = await res.text();

  const dir = await mkdtemp(join(tmpdir(), 'serif-font-'));
  try {
    const faces = [];
    for (const subset of SUBSETS) {
      const block = css.match(new RegExp(`/\\* ${subset} \\*/\\s*@font-face\\s*{([^}]+)}`));
      const url = block?.[1].match(/url\((https:[^)]+\.woff2)\)/)?.[1];
      const range = block?.[1].match(/unicode-range:\s*([^;]+);/)?.[1];
      if (!url || !range) throw new Error(`No ${subset} face in:\n${css}`);
      const raw = join(dir, `${subset}.woff2`);
      const file = await fetch(url);
      if (!file.ok) throw new Error(`${url}: HTTP ${file.status}`);
      await writeFile(raw, Buffer.from(await file.arrayBuffer()));
      faces.push({ subset, raw, range });
    }

    // Measured on the Latin file (the others hold no H) and applied to all
    // three, so a line mixing subsets keeps one baseline.
    const cap = py('measure', faces[0].raw, String(MEASURE_AT.opsz), String(MEASURE_AT.wght));
    for (const { subset, raw, range } of faces) {
      const log = py('patch', raw, join(outDir, `newsreader-${subset}.woff2`), cap);
      console.log(`${subset}: ${log}\n  unicode-range: ${range}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('Serif font generation failed:', error);
  process.exit(1);
});
