import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const iconsDir = join(__dirname, 'public', 'icons');

// Liste des icônes à redimensionner avec leurs dimensions cibles
const resizes = [
  { input: 'icon-192x192.png', output: 'icon-192x192.png', size: 192 },
  { input: 'icon-512x512.png', output: 'icon-512x512.png', size: 512 },
  { input: 'icon-180x180.png', output: 'icon-180x180.png', size: 180 },
  { input: 'icon-144x144.png', output: 'icon-144x144.png', size: 144 },
];

console.log('🔧 Redimensionnement des icônes pour PWA...\n');

for (const { input, output, size } of resizes) {
  const inputPath = join(iconsDir, input);
  const outputPath = join(iconsDir, output);

  try {
    await sharp(inputPath)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(outputPath + '.tmp');

    // Remplacer le fichier original
    await sharp(outputPath + '.tmp')
      .toFile(outputPath);

    // Supprimer le fichier temporaire
    const fs = await import('fs');
    fs.unlinkSync(outputPath + '.tmp');

    console.log(`✅ ${output} → ${size}x${size}px`);
  } catch (error) {
    console.error(`❌ Erreur avec ${input}:`, error.message);
  }
}

console.log('\n✨ Redimensionnement terminé!');
