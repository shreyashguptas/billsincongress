import sharp from 'sharp';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const sizes = [16, 32, 48, 64, 96, 128, 192, 384, 512];
const inputFile = join(process.cwd(), 'public', 'images', 'logo.webp');
const outputDir = join(process.cwd(), 'public', 'icons');

async function generateIcons() {
  try {
    // Create output directory if it doesn't exist
    await mkdir(outputDir, { recursive: true });

    // Generate PNG icons
    for (const size of sizes) {
      await sharp(inputFile)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toFile(join(outputDir, `icon-${size}x${size}.png`));
      
      console.log(`Generated ${size}x${size} icon`);
    }

    // Generate favicon.ico (32x32 PNG)
    await sharp(inputFile)
      .resize(32, 32, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toFile(join(process.cwd(), 'public', 'favicon.png'));
    
    console.log('Generated favicon.png');

    // Generate Apple Touch Icon
    await sharp(inputFile)
      .resize(180, 180, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toFile(join(process.cwd(), 'public', 'apple-touch-icon.png'));
    
    console.log('Generated apple-touch-icon.png');

  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons(); 