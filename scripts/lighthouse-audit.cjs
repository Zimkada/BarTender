/**
 * Lighthouse PWA Audit Script
 *
 * Runs Lighthouse audit on the PWA and generates a detailed report
 *
 * Usage: node scripts/lighthouse-audit.cjs
 */

const { default: lighthouse } = require('lighthouse');
const chromeLauncher = require('chrome-launcher');
const fs = require('fs');
const path = require('path');

async function runLighthouseAudit() {
  const url = 'http://localhost:4179'; // Preview server URL
  const outputPath = path.join(__dirname, '..', 'lighthouse-report.html');
  const jsonPath = path.join(__dirname, '..', 'lighthouse-report.json');

  console.log('🚀 Lancement de l\'audit Lighthouse PWA...\n');
  console.log(`📍 URL cible: ${url}`);
  console.log(`📄 Rapport HTML: ${path.relative(process.cwd(), outputPath)}`);
  console.log(`📊 Rapport JSON: ${path.relative(process.cwd(), jsonPath)}\n`);

  let chrome;

  try {
    // Lancer Chrome en mode headless
    console.log('🌐 Démarrage de Chrome...');
    chrome = await chromeLauncher.launch({
      chromeFlags: ['--headless', '--disable-gpu', '--no-sandbox']
    });

    // Configuration Lighthouse
    const options = {
      logLevel: 'info',
      output: ['html', 'json'],
      onlyCategories: ['performance', 'accessibility', 'best-practices'],
      port: chrome.port,
      // Désactiver la simulation mobile pour tester en desktop
      formFactor: 'desktop',
      screenEmulation: {
        mobile: false,
        width: 1350,
        height: 940,
        deviceScaleFactor: 1,
        disabled: false,
      },
      // Throttling désactivé pour des résultats plus rapides
      throttlingMethod: 'provided',
    };

    console.log('🔍 Exécution de l\'audit Lighthouse...\n');
    const runnerResult = await lighthouse(url, options);

    // Sauvegarder les rapports
    const reportHtml = runnerResult.report[0];
    const reportJson = runnerResult.report[1];

    fs.writeFileSync(outputPath, reportHtml);
    fs.writeFileSync(jsonPath, reportJson);

    console.log('✅ Rapports générés avec succès!\n');

    // Extraire et afficher les scores
    const { lhr } = runnerResult;
    const scores = {
      performance: lhr.categories.performance.score * 100,
      accessibility: lhr.categories.accessibility.score * 100,
      bestPractices: lhr.categories['best-practices'].score * 100,
    };

    console.log('================================================================================');
    console.log('📊 SCORES LIGHTHOUSE');
    console.log('================================================================================\n');

    console.log(`🚀 Performance:      ${formatScore(scores.performance)}`);
    console.log(`♿ Accessibilité:    ${formatScore(scores.accessibility)}`);
    console.log(`✅ Best Practices:   ${formatScore(scores.bestPractices)}\n`);

    // Détails des audits PWA manuels
    console.log('================================================================================');
    console.log('📱 VÉRIFICATIONS PWA MANUELLES');
    console.log('================================================================================\n');

    const pwaChecks = {
      'service-worker': lhr.audits['service-worker'],
      'installable-manifest': lhr.audits['installable-manifest'],
      'splash-screen': lhr.audits['splash-screen'],
      'themed-omnibox': lhr.audits['themed-omnibox'],
      'maskable-icon': lhr.audits['maskable-icon'],
      'viewport': lhr.audits['viewport'],
    };

    Object.entries(pwaChecks).forEach(([key, audit]) => {
      if (audit) {
        const status = audit.score === 1 ? '✅' : audit.score === null ? '⚪' : '❌';
        console.log(`${status} ${audit.title}`);
        if (audit.score !== 1 && audit.displayValue) {
          console.log(`   ${audit.displayValue}`);
        }
      }
    });

    // Recommandations principales
    console.log('\n================================================================================');
    console.log('💡 RECOMMANDATIONS PRINCIPALES');
    console.log('================================================================================\n');

    const opportunities = Object.values(lhr.audits)
      .filter(audit => audit.details && audit.details.type === 'opportunity')
      .sort((a, b) => (b.details.overallSavingsMs || 0) - (a.details.overallSavingsMs || 0))
      .slice(0, 5);

    if (opportunities.length > 0) {
      opportunities.forEach((audit, index) => {
        const savings = audit.details.overallSavingsMs
          ? `(~${(audit.details.overallSavingsMs / 1000).toFixed(2)}s)`
          : '';
        console.log(`${index + 1}. ${audit.title} ${savings}`);
        if (audit.displayValue) {
          console.log(`   ${audit.displayValue}`);
        }
      });
    } else {
      console.log('✨ Aucune opportunité majeure d\'optimisation détectée!');
    }

    console.log('\n================================================================================');
    console.log(`📄 Rapport complet: ${path.relative(process.cwd(), outputPath)}`);
    console.log('================================================================================\n');

    // Score global
    const avgScore = (scores.performance + scores.accessibility + scores.bestPractices) / 3;
    console.log(`🎯 Score moyen global: ${formatScore(avgScore)}\n`);

    return scores;

  } catch (error) {
    console.error('❌ Erreur lors de l\'audit:', error.message);

    if (error.code === 'ECONNREFUSED') {
      console.log('\n⚠️  Le serveur ne semble pas être en cours d\'exécution sur', url);
      console.log('   Assurez-vous que le serveur preview est démarré: npm run preview\n');
    }

    throw error;
  } finally {
    if (chrome) {
      await chrome.kill();
      console.log('🔒 Chrome fermé\n');
    }
  }
}

function formatScore(score) {
  const rounded = Math.round(score);
  let emoji = '🔴';
  if (rounded >= 90) emoji = '🟢';
  else if (rounded >= 50) emoji = '🟡';

  return `${emoji} ${rounded}/100`;
}

// Exécution
runLighthouseAudit().catch(err => {
  console.error('💥 Échec de l\'audit:', err);
  process.exit(1);
});
