import sharp from 'sharp';
import { readFile } from 'fs/promises';
import { join } from 'path';

// Generates the default Open Graph / social-share image (1200×630): the
// spectrum chamber mark and the wordmark on the Night stage, the way
// Documentation/brand.md draws the home hero. Run manually with
// `pnpm exec tsx scripts/generate-og-image.ts` and commit the resulting
// public/images/og-default.png — it is NOT part of the build (text rendering
// depends on locally installed fonts, so CI output would be nondeterministic).
// Install Newsreader and Geist locally first for the brand faces; without them
// the text falls back to Iowan Old Style / Georgia and Helvetica.

const WIDTH = 1200;
const HEIGHT = 630;
const markFile = join(process.cwd(), 'public', 'brand', 'mark-spectrum.svg');
const outputFile = join(process.cwd(), 'public', 'images', 'og-default.png');

// Night palette (brand.md, "Colour").
const PAPER = '#0b0d10';
const INK = '#edeeea';
const INK_2 = '#b4b9c0';
const INK_3 = '#8d949d';
const LINE = '#23272d';

async function generateOgImage() {
  // The spectrum mark's well and floor are Day ink; on the stage they are paper-on-ink.
  const mark = (await readFile(markFile, 'utf8'))
    .replace(/fill="#101418"/g, `fill="${INK}"`)
    .replace(/fill="#666d77"/g, `fill="${INK_3}"`)
    .replace(/width="48" height="48"/, 'width="220" height="220"');

  const text = `
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect x="80" y="486" width="${WIDTH - 160}" height="1" fill="${LINE}"/>
  <text x="80" y="330" font-family="Newsreader, 'Iowan Old Style', Georgia, serif"
        font-size="88" font-weight="500" fill="${INK}" letter-spacing="-2">Bills in Congress</text>
  <text x="80" y="400" font-family="Newsreader, 'Iowan Old Style', Georgia, serif"
        font-size="34" fill="${INK_2}">Every bill in the U.S. Congress, drawn so anyone can read it.</text>
  <text x="80" y="545" font-family="'Geist Mono', Menlo, monospace"
        font-size="22" fill="${INK_3}" letter-spacing="1">billsincongress.com · independent · sourced from Congress.gov</text>
</svg>`;

  await sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: PAPER } })
    .composite([
      { input: Buffer.from(mark), top: 36, left: WIDTH - 80 - 220 },
      { input: Buffer.from(text), top: 0, left: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toFile(outputFile);
  console.log(`Generated ${outputFile}`);
}

generateOgImage().catch((error) => {
  console.error('OG image generation failed:', error);
  process.exit(1);
});
