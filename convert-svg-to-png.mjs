import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const sizes = [16, 32, 48, 72, 96, 120, 128, 144, 152, 180, 192, 384, 512];
const svgPath = './public/icons/icon.svg';
const outputDir = './public/icons';

async function convertSvgToPng() {
  for (const size of sizes) {
    const outputPath = path.join(outputDir, `icon-${size}x${size}.png`);

    try {
      await sharp(svgPath)
        .resize(size, size)
        .png()
        .toFile(outputPath);

      console.log(`✓ Generated ${size}x${size} PNG`);
    } catch (error) {
      console.error(`✗ Failed to generate ${size}x${size}:`, error.message);
    }
  }
}

convertSvgToPng().then(() => {
  console.log('\n✓ All PNG conversions complete!');
}).catch(error => {
  console.error('Conversion failed:', error);
  process.exit(1);
});
