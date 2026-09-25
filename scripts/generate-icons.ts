import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import { join } from 'path';

// Builds every favicon and app icon from the brand marks in public/brand/
// (Documentation/brand.md, "Logo"). Below 64px the favicon cut is used — five
// seats, the well and the floor — because the full mark's inner row turns to
// mush at that size. Runs before every build (`pnpm build`).

const brandDir = join(process.cwd(), 'public', 'brand');
const small = join(brandDir, 'favicon.svg');
const large = join(brandDir, 'app-icon.svg');
const outputDir = join(process.cwd(), 'public', 'icons');

const sizes = [16, 32, 48, 64, 96, 128, 192, 384, 512];

const render = (source: string, size: number, file: string) =>
  sharp(source, { density: 600 }).resize(size, size).png().toFile(file);

async function generateIcons() {
  try {
    await mkdir(outputDir, { recursive: true });

    for (const size of sizes) {
      await render(size < 64 ? small : large, size, join(outputDir, `icon-${size}x${size}.png`));
      console.log(`Generated ${size}x${size} icon`);
    }

    await render(small, 32, join(process.cwd(), 'public', 'favicon.png'));
    console.log('Generated favicon.png');

    await render(large, 180, join(process.cwd(), 'public', 'apple-touch-icon.png'));
    console.log('Generated apple-touch-icon.png');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
