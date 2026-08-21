import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url'; // Import fileURLToPath
import * as critical from 'critical';

// Polyfill __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Supprime recursivement tous les fichiers .map du dossier de build.
 * Les source maps exposent le code source original en clair si elles
 * sont servies publiquement.
 */
function removeSourceMaps(dir) {
  let removed = 0;

  const walk = (current) => {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.map')) {
        fs.rmSync(full, { force: true });
        removed++;
      }
    }
  };

  walk(dir);
  console.log(`🛡️ Source maps supprimees du build : ${removed}`);
  return removed;
}

async function inlineCriticalCss() {
  console.log('📦 Building Vite application...');
  // 1. Perform a standard Vite build
  execSync('vite build', { stdio: 'inherit' });
  console.log('✅ Vite build completed.');

  // 🛡️ Filet de securite source maps.
  // Le plugin Sentry (filesToDeleteAfterUpload) nettoie les .map des assets,
  // mais le service worker est build APRES son hook writeBundle : sa map
  // survit. Sans ce nettoyage, dist/sw.js.map expose src/sw.ts en clair.
  // Place avant tout return conditionnel pour s'executer aussi sur Vercel.
  removeSourceMaps(path.resolve(__dirname, '../dist'));

  // Skip critical CSS inlining on Vercel (doesn't have chromium system dependencies)
  if (process.env.VERCEL === '1') {
    console.log('⏭️ Skipping critical CSS inlining on Vercel (uses standard CSS loading)');
    return;
  }

  const buildDir = path.resolve(__dirname, '../dist');
  const htmlFilePath = path.join(buildDir, 'index.html');

  if (!fs.existsSync(htmlFilePath)) {
    console.error(`❌ index.html not found at ${htmlFilePath}`);
    process.exit(1);
  }

  // Find the main CSS file dynamically (e.g., assets/index-*.css)
  const cssFiles = fs.readdirSync(path.join(buildDir, 'assets')).filter(file => file.endsWith('.css'));
  if (cssFiles.length === 0) {
    console.warn('⚠️ No CSS file found in assets directory. Skipping critical CSS inlining.');
    return;
  }
  const mainCssFilePath = path.join(buildDir, 'assets', cssFiles[0]); // Assuming the first CSS file is the main one

  console.log(`🔍 Extracting critical CSS from ${htmlFilePath} using ${mainCssFilePath}...`);
  try {
    const { css } = await critical.generate({
      base: buildDir,
      html: fs.readFileSync(htmlFilePath, 'utf8'),
      css: [mainCssFilePath],
      inline: false, // We'll manually inline
      extract: true, // Extract the rest of CSS
      width: 1300, // Standard desktop width
      height: 900, // Standard desktop height
    });

    let htmlContent = fs.readFileSync(htmlFilePath, 'utf8');

    // 2. Inject this critical CSS directly into the <head> of the index.html
    const criticalCssStyleTag = `<style type="text/css">${css}</style>`;
    htmlContent = htmlContent.replace('</head>', `${criticalCssStyleTag}</head>`);
    console.log('✅ Critical CSS inlined into index.html.');

    // 3. Modify the link to the main CSS bundle to load asynchronously
    //    Find the <link rel="stylesheet"> tag for the main CSS file
    const cssLinkRegex = new RegExp(`<link rel="stylesheet" crossorigin href="/assets/${cssFiles[0]}">`);
    const asyncCssLink = `<link rel="stylesheet" crossorigin href="/assets/${cssFiles[0]}" media="print" onload="this.media='all'">`;
    htmlContent = htmlContent.replace(cssLinkRegex, asyncCssLink);
    console.log('✅ Main CSS link modified for asynchronous loading.');

    fs.writeFileSync(htmlFilePath, htmlContent);
    console.log('🚀 Critical CSS inlining and async loading setup complete!');

  } catch (error) {
    console.error('❌ Error inlining critical CSS:', error);
    process.exit(1);
  }
}

inlineCriticalCss();
