/**
 * Script pour extraire les erreurs de console du rapport Lighthouse
 */

const fs = require('fs');
const path = require('path');

const reportPath = path.join(__dirname, '..', 'lighthouse-report.json');

if (!fs.existsSync(reportPath)) {
  console.error('❌ Rapport Lighthouse non trouvé');
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
const consoleErrorsAudit = report.audits['errors-in-console'];

console.log('🔍 ANALYSE DES ERREURS DE CONSOLE\n');
console.log('================================================================================\n');

if (consoleErrorsAudit && consoleErrorsAudit.details && consoleErrorsAudit.details.items) {
  const errors = consoleErrorsAudit.details.items;

  console.log(`Nombre d'erreurs trouvées: ${errors.length}\n`);

  if (errors.length > 0) {
    console.log('📋 DÉTAIL DES ERREURS:\n');

    errors.forEach((error, index) => {
      console.log(`${index + 1}. [${error.source}]`);
      console.log(`   ${error.description}`);
      if (error.url) {
        console.log(`   URL: ${error.url}`);
      }
      console.log();
    });

    // Grouper par type
    const bySource = errors.reduce((acc, err) => {
      acc[err.source] = (acc[err.source] || 0) + 1;
      return acc;
    }, {});

    console.log('================================================================================');
    console.log('📊 RÉSUMÉ PAR TYPE:\n');
    Object.entries(bySource).forEach(([source, count]) => {
      console.log(`   ${source}: ${count} erreur(s)`);
    });
  } else {
    console.log('✅ Aucune erreur de console détectée!');
  }
} else {
  console.log('⚠️  Audit des erreurs de console non disponible dans le rapport');
}

console.log('\n================================================================================\n');
