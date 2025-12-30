/**
 * Script pour analyser les problèmes spécifiques du rapport Lighthouse
 * et générer des recommandations actionnables
 */

const fs = require('fs');
const path = require('path');

const reportPath = path.join(__dirname, '..', 'lighthouse-report.json');

if (!fs.existsSync(reportPath)) {
  console.error('❌ Rapport Lighthouse non trouvé. Exécutez d\'abord: node scripts/lighthouse-audit.cjs');
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));

console.log('🔍 ANALYSE DES PROBLÈMES LIGHTHOUSE\n');
console.log('================================================================================\n');

// Analyser l'accessibilité
console.log('♿ ACCESSIBILITÉ (Score: ' + Math.round(report.categories.accessibility.score * 100) + '/100)\n');

const accessibilityAudits = report.categories.accessibility.auditRefs
  .map(ref => report.audits[ref.id])
  .filter(audit => audit.score !== null && audit.score < 1);

if (accessibilityAudits.length > 0) {
  accessibilityAudits.forEach((audit, index) => {
    console.log(`${index + 1}. ❌ ${audit.title}`);
    if (audit.description) {
      console.log(`   ${audit.description.substring(0, 150)}...`);
    }
    if (audit.displayValue) {
      console.log(`   📊 ${audit.displayValue}`);
    }
    console.log();
  });
} else {
  console.log('✅ Aucun problème d\'accessibilité majeur détecté!\n');
}

// Analyser les best practices
console.log('================================================================================\n');
console.log('✅ BEST PRACTICES (Score: ' + Math.round(report.categories['best-practices'].score * 100) + '/100)\n');

const bestPracticesAudits = report.categories['best-practices'].auditRefs
  .map(ref => report.audits[ref.id])
  .filter(audit => audit.score !== null && audit.score < 1);

if (bestPracticesAudits.length > 0) {
  bestPracticesAudits.forEach((audit, index) => {
    console.log(`${index + 1}. ❌ ${audit.title}`);
    if (audit.description) {
      console.log(`   ${audit.description.substring(0, 150)}...`);
    }
    if (audit.displayValue) {
      console.log(`   📊 ${audit.displayValue}`);
    }
    console.log();
  });
} else {
  console.log('✅ Aucun problème de best practices détecté!\n');
}

// Vérifications PWA spécifiques
console.log('================================================================================\n');
console.log('📱 VÉRIFICATIONS PWA\n');

const pwaAudits = {
  'service-worker': 'Service Worker',
  'installable-manifest': 'Manifest installable',
  'splash-screen': 'Splash screen',
  'themed-omnibox': 'Barre d\'adresse thématisée',
  'maskable-icon': 'Icône maskable',
  'viewport': 'Viewport configuré',
  'apple-touch-icon': 'Icône Apple Touch',
  'content-width': 'Largeur du contenu'
};

Object.entries(pwaAudits).forEach(([auditId, title]) => {
  const audit = report.audits[auditId];
  if (audit) {
    const status = audit.score === 1 ? '✅' : audit.score === null ? '⚪' : '❌';
    console.log(`${status} ${title}`);
    if (audit.score !== 1 && audit.description) {
      console.log(`   ${audit.description.substring(0, 150)}...`);
    }
  }
});

console.log('\n================================================================================\n');
console.log('💡 RECOMMANDATIONS PRIORITAIRES\n');

// Recommandations basées sur les scores
const scores = {
  accessibility: Math.round(report.categories.accessibility.score * 100),
  bestPractices: Math.round(report.categories['best-practices'].score * 100)
};

const recommendations = [];

if (scores.accessibility < 90) {
  recommendations.push({
    priority: 'HAUTE',
    category: 'Accessibilité',
    action: `Corriger les ${accessibilityAudits.length} problèmes d'accessibilité détectés`,
    impact: `+${90 - scores.accessibility} points potentiels`
  });
}

if (scores.bestPractices < 85) {
  recommendations.push({
    priority: 'MOYENNE',
    category: 'Best Practices',
    action: `Corriger les ${bestPracticesAudits.length} problèmes de best practices`,
    impact: `+${85 - scores.bestPractices} points potentiels`
  });
}

// Vérifier les problèmes de performance
const performanceOpportunities = Object.values(report.audits)
  .filter(audit => audit.details && audit.details.type === 'opportunity' && audit.details.overallSavingsMs > 100)
  .sort((a, b) => b.details.overallSavingsMs - a.details.overallSavingsMs);

if (performanceOpportunities.length > 0) {
  const topOpportunity = performanceOpportunities[0];
  recommendations.push({
    priority: 'MOYENNE',
    category: 'Performance',
    action: topOpportunity.title,
    impact: `~${(topOpportunity.details.overallSavingsMs / 1000).toFixed(2)}s`
  });
}

recommendations.forEach((rec, index) => {
  console.log(`${index + 1}. [${rec.priority}] ${rec.category}`);
  console.log(`   Action: ${rec.action}`);
  console.log(`   Impact: ${rec.impact}\n`);
});

console.log('================================================================================\n');
console.log('📋 FICHIERS À MODIFIER\n');

// Suggestions de fichiers à modifier basées sur les audits
const fileSuggestions = [];

if (accessibilityAudits.some(a => a.id.includes('color-contrast'))) {
  fileSuggestions.push('src/index.css - Améliorer les contrastes de couleurs');
}

if (accessibilityAudits.some(a => a.id.includes('label') || a.id.includes('aria'))) {
  fileSuggestions.push('Composants React - Ajouter des labels et attributs ARIA manquants');
}

if (bestPracticesAudits.some(a => a.id.includes('csp') || a.id.includes('https'))) {
  fileSuggestions.push('vite.config.ts - Configurer les headers de sécurité');
}

if (fileSuggestions.length > 0) {
  fileSuggestions.forEach((suggestion, index) => {
    console.log(`${index + 1}. ${suggestion}`);
  });
} else {
  console.log('✨ Aucune modification majeure nécessaire!\n');
}

console.log('\n================================================================================');
