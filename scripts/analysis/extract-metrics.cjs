const fs = require('fs');
const report = JSON.parse(fs.readFileSync('./lighthouse-report-latest.json', 'utf8'));

console.log('\n=== LIGHTHOUSE REPORT ANALYSIS ===\n');
console.log('FCP:', report.audits['first-contentful-paint'].displayValue);
console.log('LCP:', report.audits['largest-contentful-paint'].displayValue);
console.log('CLS:', report.audits['cumulative-layout-shift'].displayValue);
console.log('TBT:', report.audits['total-blocking-time'].displayValue);
console.log('Speed Index:', report.audits['speed-index'].displayValue);

console.log('\n=== TOP PERFORMANCE ISSUES ===\n');
const opportunities = Object.entries(report.audits)
  .filter(([_, a]) => a.opportunityType && a.savings?.timings)
  .sort((a, b) => (b[1].savings?.timings || 0) - (a[1].savings?.timings || 0))
  .slice(0, 8);

opportunities.forEach(([id, audit], i) => {
  const savings = Math.round(audit.savings.timings || 0);
  console.log(`${i+1}. ${audit.title}`);
  console.log(`   Potential savings: -${savings}ms`);
});
