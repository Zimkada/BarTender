const fs = require('fs');

const files = [
    'score/Dashbord_page_score1.json',
    'score/Historique_page_score1.json',
    'score/Inventaire_page_score1.json',
    'score/Retours_page_score1.json'
];

console.log('POST-OPTIMIZATION LIGHTHOUSE SCORES');
console.log('===================================');

files.forEach(function (filePath) {
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const fileName = filePath.split('/')[1].replace('_page_score1.json', '');
        console.log('');
        console.log(fileName + ':');
        const cats = data.categories;
        console.log('  Performance: ' + Math.round(cats.performance.score * 100) + '%');
        console.log('  Accessibility: ' + Math.round(cats.accessibility.score * 100) + '%');
        console.log('  Best Practices: ' + Math.round(cats['best-practices'].score * 100) + '%');
        console.log('  SEO: ' + Math.round(cats.seo.score * 100) + '%');
    } catch (error) {
        console.log('Error: ' + error.message);
    }
});
