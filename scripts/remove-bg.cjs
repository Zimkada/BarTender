const sharp = require('sharp');
const path = require('path');

async function removeBackgroundAdvanced() {
  try {
    const inputPath = 'public/icons/icon_app.png';
    const outputPath = 'public/icons/icon_app.png';

    console.log('🎨 Removing background from icon_app.png...\n');

    // Read image metadata
    const image = sharp(inputPath);
    const metadata = await image.metadata();

    console.log(`📊 Image size: ${metadata.width}x${metadata.height}px`);
    console.log(`📷 Format: ${metadata.format}, Has alpha: ${metadata.hasAlpha}`);

    // Get raw pixel data
    const { data, info } = await image
      .raw()
      .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;
    const channels = info.channels;

    console.log(`💾 Processing ${width * height} pixels...\n`);

    // Analyze histogram to find background (most common color)
    const colorFreq = {};
    for (let i = 0; i < data.length; i += channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Group colors with tolerance for better detection
      const key = `${Math.round(r / 20) * 20},${Math.round(g / 20) * 20},${Math.round(b / 20) * 20}`;
      colorFreq[key] = (colorFreq[key] || 0) + 1;
    }

    // Get the most frequent color (background)
    let maxFreq = 0;
    let bgColorStr = '0,0,0';

    for (const [color, freq] of Object.entries(colorFreq)) {
      if (freq > maxFreq) {
        maxFreq = freq;
        bgColorStr = color;
      }
    }

    const bgColor = bgColorStr.split(',').map(Number);
    console.log(`🎯 Detected background color: RGB(${bgColor[0]}, ${bgColor[1]}, ${bgColor[2]})`);
    console.log(`   Frequency: ${((maxFreq / (width * height)) * 100).toFixed(1)}% of pixels\n`);

    // Convert to RGBA with transparency for background
    const rgba = Buffer.alloc(width * height * 4);
    const tolerance = 60; // Tolerance for color matching
    let transparentPixels = 0;

    for (let i = 0; i < data.length; i += channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const outIdx = Math.floor(i / channels) * 4;
      rgba[outIdx] = r;      // R
      rgba[outIdx + 1] = g;  // G
      rgba[outIdx + 2] = b;  // B

      // Check if pixel is similar to background color
      const diff = Math.abs(r - bgColor[0]) + Math.abs(g - bgColor[1]) + Math.abs(b - bgColor[2]);

      if (diff > tolerance) {
        rgba[outIdx + 3] = 255;  // Opaque
      } else {
        rgba[outIdx + 3] = 0;    // Transparent
        transparentPixels++;
      }
    }

    console.log(`✨ Transparent pixels: ${transparentPixels} (${((transparentPixels / (width * height)) * 100).toFixed(1)}%)\n`);

    // Create image from RGBA buffer
    await sharp(rgba, {
      raw: {
        width: width,
        height: height,
        channels: 4
      }
    })
    .png({
      quality: 100,
      force: true,
      compressionLevel: 9
    })
    .toFile(outputPath);

    console.log(`✅ Background removed successfully!`);
    console.log(`📝 Saved to: ${outputPath}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

removeBackgroundAdvanced();
