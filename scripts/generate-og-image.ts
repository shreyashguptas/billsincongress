import sharp from 'sharp';
import { join } from 'path';

// Generates the default Open Graph / social-share image (1200×630) from the
// Capitol panoramic photo: darkened, with the site name + tagline overlaid.
// Run manually with `pnpm exec tsx scripts/generate-og-image.ts` and commit
// the resulting public/images/og-default.png — it is NOT part of the build
// (text rendering depends on locally installed fonts, so CI output would be
// nondeterministic).

const WIDTH = 1200;
const HEIGHT = 630;
const inputFile = join(process.cwd(), 'public', 'images', 'Capitol Panoramic.jpg');
const outputFile = join(process.cwd(), 'public', 'images', 'og-default.png');

const overlay = `
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0b0d12" stop-opacity="0.35"/>
      <stop offset="60%" stop-color="#0b0d12" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#0b0d12" stop-opacity="0.78"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#shade)"/>
  <text x="80" y="400" font-family="Georgia, 'Times New Roman', serif"
        font-size="72" font-weight="600" fill="#f6f3ec" letter-spacing="-1">
    Congressional Bill Tracker
  </text>
  <text x="80" y="470" font-family="Georgia, 'Times New Roman', serif"
        font-size="32" fill="#d8d2c4">
    Every bill in the U.S. Congress — clear, current, independent.
  </text>
  <rect x="80" y="320" width="64" height="5" fill="#c4a265"/>
  <text x="80" y="560" font-family="Helvetica, Arial, sans-serif"
        font-size="24" font-weight="500" fill="#b9b2a2" letter-spacing="2">
    BILLSINCONGRESS.COM
  </text>
</svg>
`;

async function generateOgImage() {
  await sharp(inputFile)
    .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'attention' })
    .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
    .png({ compressionLevel: 9, quality: 90 })
    .toFile(outputFile);
  console.log(`Generated ${outputFile}`);
}

generateOgImage().catch((error) => {
  console.error('OG image generation failed:', error);
  process.exit(1);
});
