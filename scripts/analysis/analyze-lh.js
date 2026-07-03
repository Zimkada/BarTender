const fs = require('fs');
const report = JSON.parse(fs.readFileSync('./lighthouse-report-latest.json', 'utf8'));

console.log('\n⏱️  CORE WEB VITALS & METRICS');
console.log('═══════════════════════════════════════');

const metrics = report.audits;

const metricsToShow = [
  'first-contentful-paint',
  'largest-contentful-paint',
  'cumulative-layout-shift',
  'total-blocking-time',
  'speed-index'
];

metricsToShow.forEach(metricName => {
  const metric = metrics[metricName];
  if (metric && metric.displayValue) {
    console.log(`${metric.title.padEnd(30)} ${metric.displayValue}`);
  }
});

console.log('\n🔴 OPPORTUNITIES (Top 10)');
console.log('═══════════════════════════════════════');

const opportunities = Object.values(metrics)
  .filter(m => m.opportunityType && m.savings)
  .sort((a, b) => (b.savings?.timings || 0) - (a.savings?.timings || 0))
  .slice(0, 10);

opportunities.forEach((opp, i) => {
  const savings = opp.savings?.timings ? Math.round(opp.savings.timings) : '?';
  console.log(`${i + 1}. ${opp.title.padEnd(40)} -${savings}ms`);
});

console.log('\n🔴 DIAGNOSTICS (Top 10)');
console.log('═══════════════════════════════════════');

const diagnostics = Object.values(metrics)
  .filter(m => m.details && m.details.type === 'diagnostic')
  .slice(0, 10);

diagnostics.forEach((diag, i) => {
  if (diag.title) {
    console.log(`${i + 1}. ${diag.title}`);
    if (diag.displayValue) console.log(`   ${diag.displayValue}`);
  }
});
