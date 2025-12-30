#!/usr/bin/env node

/**
 * Génère toutes les icônes PWA à partir de icon_bartender.jpg
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ICON_SIZES = [
  16, 32, 48, 72, 96, 120, 128, 144, 152, 180, 192, 384, 512
];

const inputJPG = path.join(__dirname, '..', 'public', 'icons', 'icon_bartender.jpg');
const outputDir = path.join(__dirname, '..', 'public', 'icons');

async function generatePNGIconsFromJPG() {
  console.log('🎨 Génération des icônes PNG à partir de icon_bartender.jpg...\n');

  // Vérifier que le JPG existe
  if (!fs.existsSync(inputJPG)) {
    console.error('❌ Erreur: icon_bartender.jpg n\'existe pas');
    process.exit(1);
  }

  const jpgBuffer = fs.readFileSync(inputJPG);

  // Étape 1: Retirer le fond beige/blanc + Améliorer le contraste
  console.log('🔄 Suppression du fond beige/blanc + Amélioration du contraste...\n');

  // Convertir JPG en PNG avec suppression du fond clair + renforcement des couleurs
  const transparentBuffer = await sharp(jpgBuffer)
    .ensureAlpha() // Ajouter le canal alpha
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => {
      // Parcourir les pixels et traiter le fond + renforcer les couleurs
      const pixels = new Uint8ClampedArray(data);
      const bgThreshold = 240; // Seuil pour détecter le fond clair
      const contrastBoost = 0.7; // Réduction de luminosité pour assombrir les éléments (0-1, plus bas = plus sombre)

      for (let i = 0; i < pixels.length; i += info.channels) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];

        // Si le pixel est proche du blanc/beige (fond)
        if (r > bgThreshold && g > bgThreshold && b > bgThreshold) {
          pixels[i + 3] = 0; // Rendre transparent
        } else {
          // 🎨 AMÉLIORATION: Assombrir les couleurs pour plus de contraste
          // Multiplier par contrastBoost pour réduire la luminosité
          pixels[i] = Math.floor(r * contrastBoost);     // Rouge plus sombre
          pixels[i + 1] = Math.floor(g * contrastBoost); // Vert plus sombre
          pixels[i + 2] = Math.floor(b * contrastBoost); // Bleu plus sombre
          // Alpha reste inchangé (opaque)
        }
      }

      return sharp(pixels, {
        raw: {
          width: info.width,
          height: info.height,
          channels: info.channels
        }
      })
      .png()
      .toBuffer();
    });

  // Générer chaque taille à partir de l'image sans fond
  for (const size of ICON_SIZES) {
    const outputPath = path.join(outputDir, `icon-${size}x${size}.png`);

    try {
      await sharp(transparentBuffer)
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
        input: await sharp(transparentBuffer)
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
    await sharp(transparentBuffer)
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
  console.log('\n📦 Prochaine étape:');
  console.log('   Rebuilder l\'application: npm run build');
  console.log('   Puis tester: npm run preview');
}

generatePNGIconsFromJPG().catch(error => {
  console.error('❌ Erreur lors de la génération:', error);
  process.exit(1);
});
