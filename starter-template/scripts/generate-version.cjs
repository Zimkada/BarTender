/**
 * generate-version.cjs
 *
 * Génère public/version.json à chaque build.
 * Utilisé par le service de vérification de version (PWA update prompt).
 *
 * Exécuté en prebuild :  "prebuild": "node scripts/generate-version.cjs"
 */

const fs            = require('fs');
const path          = require('path');
const packageJson   = require('../package.json');

const versionData = {
  version:     packageJson.version,
  buildTime:   new Date().toISOString(),
  buildNumber: process.env.GITHUB_RUN_NUMBER ?? 'local',
  gitCommit:   process.env.GITHUB_SHA        ?? 'unknown',
};

const outputPath = path.join(__dirname, '../public/version.json');
fs.writeFileSync(outputPath, JSON.stringify(versionData, null, 2));

console.log('[generate-version] version.json généré :', versionData);
