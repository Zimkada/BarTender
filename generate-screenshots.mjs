import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const publicDir = join(__dirname, 'public');
const iconsDir = join(publicDir, 'icons');
const iconBasePath = join(iconsDir, 'icon_base.png');

console.log('📸 Génération des screenshots PWA...\n');

// Screenshots: Desktop (wide) 1280x720 et Mobile (narrow) 390x844
const screenshots = [
  {
    name: 'screenshot-desktop.png',
    width: 1280,
    height: 720,
    bgColor: { r: 245, g: 158, b: 11, alpha: 1 }, // amber-500
  },
  {
    name: 'screenshot-mobile.png',
    width: 390,
    height: 844,
    bgColor: { r: 245, g: 158, b: 11, alpha: 1 }, // amber-500
  },
];

for (const screenshot of screenshots) {
  try {
    // Créer un fond de couleur avec l'icône au centre
    const outputPath = join(publicDir, screenshot.name);

    // Créer le fond
    const image = await sharp({
      create: {
        width: screenshot.width,
        height: screenshot.height,
        channels: 3,
        background: screenshot.bgColor,
      },
    });

    // Redimensionner l'icône à 20% de la largeur
    const iconSize = Math.floor(screenshot.width * 0.2);

    // Composer l'icône au centre
    const composite = await image
      .composite([
        {
          input: await sharp(iconBasePath)
            .resize(iconSize, iconSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer(),
          top: Math.floor((screenshot.height - iconSize) / 2),
          left: Math.floor((screenshot.width - iconSize) / 2),
        },
      ])
      .png()
      .toFile(outputPath);

    console.log(`✅ ${screenshot.name} (${screenshot.width}x${screenshot.height}px)`);
  } catch (error) {
    console.error(`❌ Erreur avec ${screenshot.name}:`, error.message);
  }
}

console.log('\n✨ Screenshots générés!');
