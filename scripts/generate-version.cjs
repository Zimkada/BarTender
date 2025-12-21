#!/usr/bin/env node

/**
 * Script pour générer automatiquement le fichier version.json
 * Exécuté à chaque build via un hook npm
 */

const fs = require('fs');
const path = require('path');

// Lire le package.json pour obtenir la version
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = require(packageJsonPath);

// Créer le fichier version.json
const versionData = {
  version: packageJson.version,
  buildTime: new Date().toISOString(),
  deployed: true,
  buildNumber: process.env.BUILD_NUMBER || 'local',
  gitCommit: process.env.GITHUB_SHA || process.env.GIT_COMMIT || 'unknown'
};

// Créer le dossier public s'il n'existe pas
const publicDir = path.join(__dirname, '..', 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Écrire le fichier version.json
const versionJsonPath = path.join(publicDir, 'version.json');
fs.writeFileSync(versionJsonPath, JSON.stringify(versionData, null, 2));

console.log(`✅ version.json généré: ${versionJsonPath}`);
console.log(`   Version: ${versionData.version}`);
console.log(`   Build Time: ${versionData.buildTime}`);
console.log(`   Commit: ${versionData.gitCommit}`);
