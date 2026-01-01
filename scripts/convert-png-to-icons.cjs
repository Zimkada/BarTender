const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

/**
 * Convertit icon_app.png (transparent) en tous les formats PNG nécessaires
 * sans passer par SVG
 */

const ICON_SIZES = [
  16, 32, 48, 72, 96, 120, 128, 144, 152, 180, 192, 384, 512
];

const inputPNG = path.join(__dirname, '..', 'public', 'icons', 'icon_app.png');
const outputDir = path.join(__dirname, '..', 'public', 'icons');

async function convertPNGToIcons() {
  console.log('🎨 Conversion de icon_app.png en tous les formats PNG...\n');

  // Vérifier que le PNG transparent existe
  if (!fs.existsSync(inputPNG)) {
    console.error('❌ Erreur: icon_app.png n\'existe pas');
    process.exit(1);
  }

  // Redimensionner pour chaque taille
  for (const size of ICON_SIZES) {
    const outputPath = path.join(outputDir, `icon-${size}x${size}.png`);

    try {
      await sharp(inputPNG)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 } // Fond transparent
        })
        .png()
        .toFile(outputPath);

      console.log(`✅ Généré: icon-${size}x${size}.png`);
    } catch (error) {
      console.error(`❌ Erreur pour ${size}x${size}:`, error.message);
    }
  }

  // Générer les icônes maskable (avec padding pour safe zone)
  console.log('\n🎭 Génération des icônes maskable (avec padding)...\n');

  const maskableSizes = [192, 512];
  for (const size of maskableSizes) {
    const outputPath = path.join(outputDir, `icon-${size}x${size}-maskable.png`);
    const padding = Math.floor(size * 0.1); // 10% de padding
    const iconSize = size - (padding * 2);

    try {
      // Créer un canvas transparent avec padding
      await sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      })
      .composite([{
        input: await sharp(inputPNG)
          .resize(iconSize, iconSize, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          })
          .png()
          .toBuffer(),
        top: padding,
        left: padding
      }])
      .png()
      .toFile(outputPath);

      console.log(`✅ Généré: icon-${size}x${size}-maskable.png`);
    } catch (error) {
      console.error(`❌ Erreur pour maskable ${size}x${size}:`, error.message);
    }
  }

  // Générer l'icône Apple Touch
  console.log('\n🍎 Génération de l\'icône Apple Touch...\n');

  const appleIconPath = path.join(outputDir, 'apple-touch-icon.png');
  try {
    await sharp(inputPNG)
      .resize(180, 180, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(appleIconPath);

    console.log('✅ Généré: apple-touch-icon.png');
  } catch (error) {
    console.error('❌ Erreur pour apple-touch-icon:', error.message);
  }

  // Copier les icônes vers public/ pour les favicons
  console.log('\n📋 Copie des favicons vers public/...\n');

  const faviconSizes = [16, 32, 180];
  for (const size of faviconSizes) {
    const source = path.join(outputDir, `icon-${size}x${size}.png`);
    let dest;

    if (size === 180) {
      dest = path.join(__dirname, '..', 'public', 'icon-180x180.png');
    } else {
      dest = path.join(__dirname, '..', 'public', `icon-${size}x${size}.png`);
    }

    try {
      fs.copyFileSync(source, dest);
      console.log(`✅ Copié: ${path.basename(dest)}`);
    } catch (error) {
      console.error(`❌ Erreur pour ${path.basename(dest)}:`, error.message);
    }
  }

  console.log('\n🎉 Toutes les icônes ont été générées avec succès!');
  console.log('📝 Basées sur: icon_app.png (avec fond transparent)');
}

convertPNGToIcons().catch(error => {
  console.error('❌ Erreur lors de la conversion:', error);
  process.exit(1);
});
