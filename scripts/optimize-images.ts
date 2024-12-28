import sharp from 'sharp';
import { readdir, mkdir } from 'fs/promises';
import { join, parse } from 'path';

const inputDir = join(process.cwd(), 'public', 'images');
const outputDir = join(process.cwd(), 'public', 'optimized');

async function optimizeImages() {
  try {
    // Create output directory if it doesn't exist
    await mkdir(outputDir, { recursive: true });

    // Read all files from input directory
    const files = await readdir(inputDir);

    // Process each file
    for (const file of files) {
      const { name, ext } = parse(file);
      
      // Skip if it's not an image
      if (!['.jpg', '.jpeg', '.png'].includes(ext.toLowerCase())) {
        console.log(`Skipping ${file} - not a supported image format`);
        continue;
      }

      const inputPath = join(inputDir, file);
      const outputPath = join(outputDir, `${name}.webp`);

      // Optimize and convert to WebP
      await sharp(inputPath)
        .webp({
          quality: 80, // Good balance between quality and file size
          effort: 6,   // Higher effort = better compression but slower
        })
        .toFile(outputPath);

      // Also create a responsive version for larger screens
      const outputPathLarge = join(outputDir, `${name}-large.webp`);
      await sharp(inputPath)
        .resize(1920, null, { // Max width 1920px, maintain aspect ratio
          withoutEnlargement: true,
        })
        .webp({
          quality: 80,
          effort: 6,
        })
        .toFile(outputPathLarge);

      console.log(`Optimized ${file} -> ${name}.webp`);
    }

    console.log('Image optimization complete!');

  } catch (error) {
    console.error('Error optimizing images:', error);
    process.exit(1);
  }
}

optimizeImages(); 