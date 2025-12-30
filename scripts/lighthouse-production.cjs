#!/usr/bin/env node

/**
 * Lighthouse Audit - Production
 * Lance un audit PWA complet sur l'URL de production
 */

const lighthouse = require('lighthouse');
const chromeLauncher = require('chrome-launcher');
const fs = require('fs');
const path = require('path');

// URL de production
const PRODUCTION_URL = 'https://bar-tender-ten.vercel.app';

async function runLighthouse() {
  console.log(`\n🚀 Lancement de l'audit Lighthouse sur: ${PRODUCTION_URL}\n`);

  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });

  const options = {
    logLevel: 'info',
    output: 'html',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'pwa'],
    port: chrome.port,
  };

  const runnerResult = await lighthouse(PRODUCTION_URL, options);

  // Scores
  const { lhr } = runnerResult;
  const categories = lhr.categories;

  console.log('\n📊 SCORES LIGHTHOUSE - PRODUCTION\n');
  console.log('='.repeat(60));
  console.log(`⚡ Performance:     ${Math.round(categories.performance.score * 100)}/100`);
  console.log(`♿ Accessibility:   ${Math.round(categories.accessibility.score * 100)}/100`);
  console.log(`✅ Best Practices: ${Math.round(categories['best-practices'].score * 100)}/100`);
  console.log(`📱 PWA:            ${Math.round(categories.pwa.score * 100)}/100`);
  console.log('='.repeat(60));

  // Sauvegarder le rapport HTML
  const reportPath = path.join(__dirname, '..', 'lighthouse-production-report.html');
  fs.writeFileSync(reportPath, runnerResult.report);
  console.log(`\n✅ Rapport HTML sauvegardé: ${reportPath}`);

  // Métriques de performance
  const metrics = lhr.audits;
  console.log('\n⏱️  MÉTRIQUES CLÉS\n');
  console.log(`  FCP (First Contentful Paint):    ${metrics['first-contentful-paint'].displayValue}`);
  console.log(`  LCP (Largest Contentful Paint):  ${metrics['largest-contentful-paint'].displayValue}`);
  console.log(`  TBT (Total Blocking Time):       ${metrics['total-blocking-time'].displayValue}`);
  console.log(`  CLS (Cumulative Layout Shift):   ${metrics['cumulative-layout-shift'].displayValue}`);
  console.log(`  Speed Index:                     ${metrics['speed-index'].displayValue}`);

  // Problèmes critiques PWA
  console.log('\n🔍 VÉRIFICATIONS PWA\n');

  const pwaAudits = [
    'installable-manifest',
    'service-worker',
    'works-offline',
    'viewport',
    'themed-omnibox',
    'maskable-icon'
  ];

  pwaAudits.forEach(auditId => {
    const audit = metrics[auditId];
    if (audit) {
      const status = audit.score === 1 ? '✅' : '❌';
      console.log(`  ${status} ${audit.title}`);
      if (audit.score !== 1 && audit.description) {
        console.log(`     → ${audit.description.substring(0, 80)}...`);
      }
    }
  });

  // Recommandations
  console.log('\n💡 RECOMMANDATIONS PRIORITAIRES\n');

  const opportunities = Object.values(metrics)
    .filter(audit => audit.details && audit.details.type === 'opportunity')
    .sort((a, b) => (b.numericValue || 0) - (a.numericValue || 0))
    .slice(0, 5);

  opportunities.forEach((opp, index) => {
    const savings = opp.numericValue ? `(~${Math.round(opp.numericValue / 1000)}s saved)` : '';
    console.log(`  ${index + 1}. ${opp.title} ${savings}`);
  });

  await chrome.kill();

  console.log('\n✅ Audit terminé!\n');
}

runLighthouse().catch(error => {
  console.error('❌ Erreur:', error);
  process.exit(1);
});
