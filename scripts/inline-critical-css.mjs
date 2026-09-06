import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url'; // Import fileURLToPath
import * as critical from 'critical';

// Polyfill __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Supprime du dossier de build les artefacts qui divulguent le code source :
 * - les .map (code source original en clair via sourcesContent)
 * - stats.html (rapport rollup-plugin-visualizer : arborescence complete)
 *
 * Echoue le build si le dossier est introuvable : un outDir modifie rendrait
 * ce nettoyage silencieusement inoperant et re-exposerait les sources.
 */
function removeSourceDisclosingFiles(dir) {
  if (!fs.existsSync(dir)) {
    console.error(`❌ Dossier de build introuvable : ${dir}`);
    console.error('   Nettoyage des source maps impossible - build interrompu.');
    process.exit(1);
  }

  const removed = [];

  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.map') || entry.name === 'stats.html') {
        fs.rmSync(full, { force: true });
        removed.push(path.relative(dir, full));
      }
    }
  };

  walk(dir);
  console.log(`🛡️ Artefacts de divulgation supprimes : ${removed.length}`);
  if (removed.length > 0) {
    console.log(`   ${removed.join(', ')}`);
  }
  return removed.length;
}

/**
 * Verifie les types AVANT de construire.
 *
 * Vite transpile sans verifier les types : sans cette porte, une erreur
 * TypeScript passe le build et part en production. C'est ainsi que le crash
 * React #31 de ReturnsPage (fe87e25) a atteint les utilisateurs alors que tsc
 * le signalait par un TS2322 explicite.
 *
 * Perimetre : tsconfig.check.json (code applicatif livre, hors tests/stories).
 * Doit rester a 0 erreur - voir la section Typecheck du CLAUDE.md.
 *
 * execSync throw si tsc sort en erreur : le build s'arrete, et sur Vercel un
 * build en echec annule le deploiement.
 */
function typecheck() {
  console.log('🔍 Verification des types (tsconfig.check.json)...');
  try {
    execSync('tsc --noEmit -p tsconfig.check.json', { stdio: 'inherit' });
  } catch {
    console.error('');
    console.error('❌ Erreurs TypeScript ci-dessus : build interrompu.');
    console.error('   Ces erreurs partiraient en production - Vite ne les voit pas.');
    console.error('   Corrigez-les, ou relancez `npm run typecheck` pour les relire.');
    process.exit(1);
  }
  console.log('✅ Types verifies.');
}

async function inlineCriticalCss() {
  // 0. Porte de types - avant tout le reste : inutile de construire si les
  //    types sont casses.
  typecheck();

  console.log('📦 Building Vite application...');
  // 1. Perform a standard Vite build
  execSync('vite build', { stdio: 'inherit' });
  console.log('✅ Vite build completed.');

  // 🛡️ Filet de securite : artefacts divulguant le code source.
  // Le plugin Sentry (filesToDeleteAfterUpload) nettoie les .map des assets,
  // mais le service worker est build APRES son hook writeBundle : sa map
  // survit. Sans ce nettoyage, dist/sw.js.map expose src/sw.ts en clair.
  // Couvre aussi stats.html (arborescence complete du projet).
  // Place avant tout return conditionnel pour s'executer aussi sur Vercel.
  removeSourceDisclosingFiles(path.resolve(__dirname, '../dist'));

  // Un build sans token Sentry supprime quand meme les .map (la securite
  // prime) : la release ne sera pas symbolisable dans Sentry. Avertir, car
  // le plugin se contente d'un warning noye dans les logs.
  if (!process.env.SENTRY_AUTH_TOKEN) {
    console.warn('⚠️ SENTRY_AUTH_TOKEN absent : source maps supprimees sans upload.');
    console.warn('   Les erreurs de cette release ne seront pas symbolisables dans Sentry.');
  }

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
