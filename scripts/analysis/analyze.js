const fs = require('fs');

const pairs = [
    {
        name: 'Homepage',
        old: 'c:\\Users\\HP ELITEBOOK\\DEV\\BarTender\\score_pwa\\bar-tender-ten.vercel.app-20251231T085839.json-homepage-mobile.json',
        new: 'c:\\Users\\HP ELITEBOOK\\DEV\\BarTender\\score_pwa2\\bar-tender-ten.vercel.app-20260101T180352.json-homepage2.json'
    },
    {
        name: 'Vente Rapide',
        old: 'c:\\Users\\HP ELITEBOOK\\DEV\\BarTender\\score_pwa\\bar-tender-ten.vercel.app-20251231T090251.json-vente rapide-mobile.json',
        new: 'c:\\Users\\HP ELITEBOOK\\DEV\\BarTender\\score_pwa2\\bar-tender-ten.vercel.app-20260101T180647.json-venterapide2.json'
    },
    {
        name: 'Dashboard',
        old: 'c:\\Users\\HP ELITEBOOK\\DEV\\BarTender\\score_pwa\\bar-tender-ten.vercel.app-20251231T090645.json-tableaudebord-mobile.json',
        new: 'c:\\Users\\HP ELITEBOOK\\DEV\\BarTender\\score_pwa2\\bar-tender-ten.vercel.app-20260101T180944.json-dashboard2.json'
    },
    {
        name: 'Historique',
        old: 'c:\\Users\\HP ELITEBOOK\\DEV\\BarTender\\score_pwa\\bar-tender-ten.vercel.app-20251231T091034.json-historique-mobile.json',
        new: 'c:\\Users\\HP ELITEBOOK\\DEV\\BarTender\\score_pwa2\\bar-tender-ten.vercel.app-20260101T181210.json-historique2.json'
    },
    {
        name: 'Inventaire',
        old: 'c:\\Users\\HP ELITEBOOK\\DEV\\BarTender\\score_pwa\\bar-tender-ten.vercel.app-20251231T091521.json-inventaire-mobile.json',
        new: 'c:\\Users\\HP ELITEBOOK\\DEV\\BarTender\\score_pwa2\\bar-tender-ten.vercel.app-20260101T181423.json-inventaire2.json'
    },
    {
        name: 'Previsions',
        old: 'c:\\Users\\HP ELITEBOOK\\DEV\\BarTender\\score_pwa\\bar-tender-ten.vercel.app-20251231T092619.json-prevision-mobile.json',
        new: 'c:\\Users\\HP ELITEBOOK\\DEV\\BarTender\\score_pwa2\\bar-tender-ten.vercel.app-20260101T181904.json-previsions2.json'
    },
    {
        name: 'Retours',
        old: 'c:\\Users\\HP ELITEBOOK\\DEV\\BarTender\\score_pwa\\bar-tender-ten.vercel.app-20251231T093006.json-retours-mobile.json',
        new: 'c:\\Users\\HP ELITEBOOK\\DEV\\BarTender\\score_pwa2\\bar-tender-ten.vercel.app-20260101T182215.json-retours.json'
    },
    {
        name: 'Consignations',
        old: 'c:\\Users\\HP ELITEBOOK\\DEV\\BarTender\\score_pwa\\bar-tender-ten.vercel.app-20251231T093321.json-consignation-mobile.json',
        new: 'c:\\Users\\HP ELITEBOOK\\DEV\\BarTender\\score_pwa2\\bar-tender-ten.vercel.app-20260101T182543.json-consignations.json'
    },
    {
        name: 'Equipe',
        old: 'c:\\Users\\HP ELITEBOOK\\DEV\\BarTender\\score_pwa\\bar-tender-ten.vercel.app-20251231T094013.json-equipe-mobile.json',
        new: 'c:\\Users\\HP ELITEBOOK\\DEV\\BarTender\\score_pwa2\\bar-tender-ten.vercel.app-20260101T182913.json-equipe2.json'
    },
    {
        name: 'Promotions',
        old: 'c:\\Users\\HP ELITEBOOK\\DEV\\BarTender\\score_pwa\\bar-tender-ten.vercel.app-20251231T094826.json-promotions-mobile.json',
        new: 'c:\\Users\\HP ELITEBOOK\\DEV\\BarTender\\score_pwa2\\bar-tender-ten.vercel.app-20260101T183106.json-promotions2.json'
    },
    {
        name: 'Parametres',
        old: 'c:\\Users\\HP ELITEBOOK\\DEV\\BarTender\\score_pwa\\bar-tender-ten.vercel.app-20251231T095310.json-paramètres-mobile.json',
        new: 'c:\\Users\\HP ELITEBOOK\\DEV\\BarTender\\score_pwa2\\bar-tender-ten.vercel.app-20260101T183506.json-paramètres2.json'
    },
    {
        name: 'Accounting',
        old: 'c:\\Users\\HP ELITEBOOK\\DEV\\BarTender\\score_pwa\\bar-tender-ten.vercel.app-20251231T095708.json-comptabilité-mobile.json',
        new: 'c:\\Users\\HP ELITEBOOK\\DEV\\BarTender\\score_pwa2\\bar-tender-ten.vercel.app-20260101T184636.json-accounting2.json'
    },
];

const results = [];

for (const pair of pairs) {
    try {
        const oldData = JSON.parse(fs.readFileSync(pair.old, 'utf8'));
        const newData = JSON.parse(fs.readFileSync(pair.new, 'utf8'));

        const oldCats = oldData.categories;
        const newCats = newData.categories;

        const getScore = (cats, key) => {
            if (cats[key] && cats[key].score !== null) {
                return cats[key].score * 100;
            }
            return 0;
        };

        const oldMetrics = {
            performance: getScore(oldCats, 'performance'),
            accessibility: getScore(oldCats, 'accessibility'),
            'best-practices': getScore(oldCats, 'best-practices'),
            seo: getScore(oldCats, 'seo'),
            pwa: getScore(oldCats, 'pwa')
        };

        const newMetrics = {
            performance: getScore(newCats, 'performance'),
            accessibility: getScore(newCats, 'accessibility'),
            'best-practices': getScore(newCats, 'best-practices'),
            seo: getScore(newCats, 'seo'),
            pwa: getScore(newCats, 'pwa')
        };

        const differences = {};
        for (const key in oldMetrics) {
            differences[key] = newMetrics[key] - oldMetrics[key];
        }

        const avgDiff = Object.values(differences).reduce((a, b) => a + b, 0) / Object.keys(differences).length;

        results.push({
            page: pair.name,
            old: oldMetrics,
            new: newMetrics,
            diff: differences,
            avg_diff: avgDiff
        });

    } catch (e) {
        console.log(`Error processing ${pair.name}: ${e.message}`);
    }
}

// Print results
console.log('='.repeat(120));
console.log('LIGHTHOUSE AUDIT COMPARISON - MOBILE');
console.log('='.repeat(120));
console.log('');

for (const result of results) {
    console.log(`PAGE: ${result.page}`);
    console.log('-'.repeat(120));

    const metrics = ['performance', 'accessibility', 'best-practices', 'seo', 'pwa'];

    console.log(`${'Metric':<20} ${'Old':<12} ${'New':<12} ${'Diff':<12} ${'% Change':<12}`);
    console.log('-'.repeat(120));

    for (const metric of metrics) {
        const old = result.old[metric];
        const newVal = result.new[metric];
        const diff = result.diff[metric];
        const pctChange = (old !== 0) ? (diff / old * 100) : 0;

        const metricStr = metric.padEnd(20);
        const oldStr = old.toFixed(1).padEnd(12);
        const newStr = newVal.toFixed(1).padEnd(12);
        const diffStr = diff.toFixed(1).padEnd(12);
        const pctStr = (pctChange.toFixed(1) + '%').padEnd(12);

        console.log(`${metricStr} ${oldStr} ${newStr} ${diffStr} ${pctStr}`);
    }

    console.log(`${'AVERAGE DIFF':<20} ${'':<12} ${'':<12} ${result.avg_diff.toFixed(1):<12}`);
    console.log('');
}

// Calculate overall statistics
console.log('='.repeat(120));
console.log('OVERALL STATISTICS');
console.log('='.repeat(120));

let improvements = 0;
let regressions = 0;
let stable = 0;

for (const result of results) {
    if (result.avg_diff > 2) {
        improvements++;
    } else if (result.avg_diff < -2) {
        regressions++;
    } else {
        stable++;
    }
}

const avgAll = results.reduce((sum, r) => sum + r.avg_diff, 0) / results.length;

console.log(`Total pages analyzed: ${results.length}`);
console.log(`Average improvement across all pages: ${avgAll.toFixed(2)} points`);
console.log(`Pages with improvements (>2%): ${improvements}`);
console.log(`Pages with regressions (<-2%): ${regressions}`);
console.log(`Pages with stable scores (±2%): ${stable}`);
console.log('');

// Performance analysis
console.log('PERFORMANCE ANALYSIS (Most critical metric)');
console.log('-'.repeat(120));
const perfImprovements = results.filter(r => r.diff.performance > 2).length;
const perfRegressions = results.filter(r => r.diff.performance < -2).length;
const perfAvg = results.reduce((sum, r) => sum + r.diff.performance, 0) / results.length;

console.log(`Average performance change: ${perfAvg.toFixed(2)} points`);
console.log(`Pages with performance improvement (>2): ${perfImprovements}`);
console.log(`Pages with performance regression (<-2): ${perfRegressions}`);
console.log('');

if (perfAvg > 5) {
    console.log('CONCLUSION: Significant performance improvement detected');
} else if (perfAvg > 0) {
    console.log('CONCLUSION: Modest performance improvement detected');
} else if (perfAvg > -5) {
    console.log('CONCLUSION: Modest performance regression detected');
} else {
    console.log('CONCLUSION: Significant performance regression detected');
}
