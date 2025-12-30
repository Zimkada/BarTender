/**
 * Script de génération des icônes PWA à partir de l'icône source
 * Génère toutes les tailles requises pour PWA (16x16 → 512x512)
 * Crée aussi les maskable icons pour Android
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ICONS_DIR = path.join(__dirname, '../public/icons');
const SOURCE_ICON = path.join(ICONS_DIR, 'icon_source.jpeg');

// Tailles d'icônes PWA standards
const ICON_SIZES = [
  16, 32, 48, 72, 96, 120, 128, 144, 152, 180, 192, 384, 512
];

async function generateIcons() {
  console.log('🎨 Génération des icônes PWA...\n');

  // Vérifier que l'icône source existe
  if (!fs.existsSync(SOURCE_ICON)) {
    console.error(`❌ Icône source non trouvée: ${SOURCE_ICON}`);
    process.exit(1);
  }

  try {
    // Convertir en PNG avec fond transparent si nécessaire
    const sourceBuffer = await sharp(SOURCE_ICON)
      .png()
      .toBuffer();

    // Générer toutes les tailles standard
    for (const size of ICON_SIZES) {
      const outputPath = path.join(ICONS_DIR, `icon-${size}x${size}.png`);

      await sharp(sourceBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 245, g: 158, b: 11, alpha: 1 } // #f59e0b
        })
        .png()
        .toFile(outputPath);

      console.log(`✅ Généré: icon-${size}x${size}.png`);
    }

    // Générer les maskable icons pour Android (avec safe zone 80%)
    // On garde 80% au centre pour la partie visible garantie
    for (const size of [192, 512]) {
      const outputPath = path.join(ICONS_DIR, `icon-${size}x${size}-maskable.png`);

      // Créer un canvas plus grand avec padding pour safe zone
      const paddedSize = Math.round(size / 0.8);
      const padding = Math.round((paddedSize - size) / 2);

      await sharp(sourceBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 245, g: 158, b: 11, alpha: 1 }
        })
        .extend({
          top: padding,
          bottom: padding,
          left: padding,
          right: padding,
          background: { r: 245, g: 158, b: 11, alpha: 1 }
        })
        .resize(size, size, { fit: 'cover' })
        .png()
        .toFile(outputPath);

      console.log(`✅ Généré: icon-${size}x${size}-maskable.png (Android adaptive)`);
    }

    // Générer apple-touch-icon (180x180)
    const appleTouchPath = path.join(ICONS_DIR, 'apple-touch-icon.png');
    await sharp(sourceBuffer)
      .resize(180, 180, {
        fit: 'contain',
        background: { r: 245, g: 158, b: 11, alpha: 1 }
      })
      .png()
      .toFile(appleTouchPath);

    console.log('✅ Généré: apple-touch-icon.png (iOS)');

    // Générer favicon.ico (utilise 32x32)
    const faviconPath = path.join(__dirname, '../public/favicon.ico');
    await sharp(sourceBuffer)
      .resize(32, 32, {
        fit: 'contain',
        background: { r: 245, g: 158, b: 11, alpha: 1 }
      })
      .png()
      .toFile(faviconPath);

    console.log('✅ Généré: favicon.ico');

    console.log('\n🎉 Toutes les icônes ont été générées avec succès!');
    console.log(`📦 Total: ${ICON_SIZES.length} icônes standard + 2 maskable + apple-touch-icon + favicon`);

  } catch (error) {
    console.error('❌ Erreur lors de la génération des icônes:', error);
    process.exit(1);
  }
}

// Créer le dossier icons s'il n'existe pas
if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

generateIcons();
