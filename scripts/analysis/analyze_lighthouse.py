import json
from pathlib import Path

# Define all page pairs
pairs = [
    {
        'name': 'Homepage',
        'old': r'c:\Users\HP ELITEBOOK\DEV\BarTender\score_pwa\bar-tender-ten.vercel.app-20251231T085839.json-homepage-mobile.json',
        'new': r'c:\Users\HP ELITEBOOK\DEV\BarTender\score_pwa2\bar-tender-ten.vercel.app-20260101T180352.json-homepage2.json'
    },
    {
        'name': 'Vente Rapide',
        'old': r'c:\Users\HP ELITEBOOK\DEV\BarTender\score_pwa\bar-tender-ten.vercel.app-20251231T090251.json-vente rapide-mobile.json',
        'new': r'c:\Users\HP ELITEBOOK\DEV\BarTender\score_pwa2\bar-tender-ten.vercel.app-20260101T180647.json-venterapide2.json'
    },
    {
        'name': 'Dashboard',
        'old': r'c:\Users\HP ELITEBOOK\DEV\BarTender\score_pwa\bar-tender-ten.vercel.app-20251231T090645.json-tableaudebord-mobile.json',
        'new': r'c:\Users\HP ELITEBOOK\DEV\BarTender\score_pwa2\bar-tender-ten.vercel.app-20260101T180944.json-dashboard2.json'
    },
    {
        'name': 'Historique',
        'old': r'c:\Users\HP ELITEBOOK\DEV\BarTender\score_pwa\bar-tender-ten.vercel.app-20251231T091034.json-historique-mobile.json',
        'new': r'c:\Users\HP ELITEBOOK\DEV\BarTender\score_pwa2\bar-tender-ten.vercel.app-20260101T181210.json-historique2.json'
    },
    {
        'name': 'Inventaire',
        'old': r'c:\Users\HP ELITEBOOK\DEV\BarTender\score_pwa\bar-tender-ten.vercel.app-20251231T091521.json-inventaire-mobile.json',
        'new': r'c:\Users\HP ELITEBOOK\DEV\BarTender\score_pwa2\bar-tender-ten.vercel.app-20260101T181423.json-inventaire2.json'
    },
    {
        'name': 'Previsions',
        'old': r'c:\Users\HP ELITEBOOK\DEV\BarTender\score_pwa\bar-tender-ten.vercel.app-20251231T092619.json-prevision-mobile.json',
        'new': r'c:\Users\HP ELITEBOOK\DEV\BarTender\score_pwa2\bar-tender-ten.vercel.app-20260101T181904.json-previsions2.json'
    },
    {
        'name': 'Retours',
        'old': r'c:\Users\HP ELITEBOOK\DEV\BarTender\score_pwa\bar-tender-ten.vercel.app-20251231T093006.json-retours-mobile.json',
        'new': r'c:\Users\HP ELITEBOOK\DEV\BarTender\score_pwa2\bar-tender-ten.vercel.app-20260101T182215.json-retours.json'
    },
    {
        'name': 'Consignations',
        'old': r'c:\Users\HP ELITEBOOK\DEV\BarTender\score_pwa\bar-tender-ten.vercel.app-20251231T093321.json-consignation-mobile.json',
        'new': r'c:\Users\HP ELITEBOOK\DEV\BarTender\score_pwa2\bar-tender-ten.vercel.app-20260101T182543.json-consignations.json'
    },
    {
        'name': 'Equipe',
        'old': r'c:\Users\HP ELITEBOOK\DEV\BarTender\score_pwa\bar-tender-ten.vercel.app-20251231T094013.json-equipe-mobile.json',
        'new': r'c:\Users\HP ELITEBOOK\DEV\BarTender\score_pwa2\bar-tender-ten.vercel.app-20260101T182913.json-equipe2.json'
    },
    {
        'name': 'Promotions',
        'old': r'c:\Users\HP ELITEBOOK\DEV\BarTender\score_pwa\bar-tender-ten.vercel.app-20251231T094826.json-promotions-mobile.json',
        'new': r'c:\Users\HP ELITEBOOK\DEV\BarTender\score_pwa2\bar-tender-ten.vercel.app-20260101T183106.json-promotions2.json'
    },
    {
        'name': 'Parametres',
        'old': r'c:\Users\HP ELITEBOOK\DEV\BarTender\score_pwa\bar-tender-ten.vercel.app-20251231T095310.json-paramètres-mobile.json',
        'new': r'c:\Users\HP ELITEBOOK\DEV\BarTender\score_pwa2\bar-tender-ten.vercel.app-20260101T183506.json-paramètres2.json'
    },
    {
        'name': 'Accounting',
        'old': r'c:\Users\HP ELITEBOOK\DEV\BarTender\score_pwa\bar-tender-ten.vercel.app-20251231T095708.json-comptabilité-mobile.json',
        'new': r'c:\Users\HP ELITEBOOK\DEV\BarTender\score_pwa2\bar-tender-ten.vercel.app-20260101T184636.json-accounting2.json'
    },
]

results = []

for pair in pairs:
    try:
        with open(pair['old'], 'r', encoding='utf-8') as f:
            old_data = json.load(f)
        with open(pair['new'], 'r', encoding='utf-8') as f:
            new_data = json.load(f)

        old_cats = old_data['categories']
        new_cats = new_data['categories']

        def get_score(cats, key):
            if key in cats and cats[key].get('score') is not None:
                return cats[key]['score'] * 100
            return 0

        old_metrics = {
            'performance': get_score(old_cats, 'performance'),
            'accessibility': get_score(old_cats, 'accessibility'),
            'best-practices': get_score(old_cats, 'best-practices'),
            'seo': get_score(old_cats, 'seo'),
            'pwa': get_score(old_cats, 'pwa')
        }

        new_metrics = {
            'performance': get_score(new_cats, 'performance'),
            'accessibility': get_score(new_cats, 'accessibility'),
            'best-practices': get_score(new_cats, 'best-practices'),
            'seo': get_score(new_cats, 'seo'),
            'pwa': get_score(new_cats, 'pwa')
        }

        differences = {}
        for key in old_metrics:
            differences[key] = new_metrics[key] - old_metrics[key]

        avg_diff = sum(differences.values()) / len(differences)

        results.append({
            'page': pair['name'],
            'old': old_metrics,
            'new': new_metrics,
            'diff': differences,
            'avg_diff': avg_diff
        })

    except Exception as e:
        print(f"Error processing {pair['name']}: {e}")

# Print results
print("=" * 100)
print("LIGHTHOUSE AUDIT COMPARISON - MOBILE")
print("=" * 100)
print()

for result in results:
    print(f"PAGE: {result['page']}")
    print("-" * 100)

    metrics = ['performance', 'accessibility', 'best-practices', 'seo', 'pwa']

    print(f"{'Metric':<20} {'Old':<12} {'New':<12} {'Diff':<12} {'% Change':<12}")
    print("-" * 100)

    for metric in metrics:
        old = result['old'][metric]
        new = result['new'][metric]
        diff = result['diff'][metric]
        pct_change = (diff / old * 100) if old != 0 else 0

        print(f"{metric:<20} {old:<12.1f} {new:<12.1f} {diff:<12.1f} {pct_change:<12.1f}%")

    print(f"{'AVERAGE DIFF':<20} {'':<12} {'':<12} {result['avg_diff']:<12.1f}")
    print()

# Calculate overall statistics
print("=" * 100)
print("OVERALL STATISTICS")
print("=" * 100)

improvements = 0
regressions = 0
stable = 0

for result in results:
    if result['avg_diff'] > 2:
        improvements += 1
    elif result['avg_diff'] < -2:
        regressions += 1
    else:
        stable += 1

avg_all = sum(r['avg_diff'] for r in results) / len(results)

print(f"Total pages analyzed: {len(results)}")
print(f"Average improvement across all pages: {avg_all:.2f} points")
print(f"Pages with improvements (>2%): {improvements}")
print(f"Pages with regressions (<-2%): {regressions}")
print(f"Pages with stable scores (±2%): {stable}")
print()

# Performance analysis
print("PERFORMANCE ANALYSIS (Most critical metric)")
print("-" * 100)
perf_improvements = sum(1 for r in results if r['diff']['performance'] > 2)
perf_regressions = sum(1 for r in results if r['diff']['performance'] < -2)
perf_avg = sum(r['diff']['performance'] for r in results) / len(results)

print(f"Average performance change: {perf_avg:.2f} points")
print(f"Pages with performance improvement: {perf_improvements}")
print(f"Pages with performance regression: {perf_regressions}")
print()

if perf_avg > 5:
    print("CONCLUSION: Significant performance improvement detected")
elif perf_avg > 0:
    print("CONCLUSION: Modest performance improvement detected")
elif perf_avg > -5:
    print("CONCLUSION: Modest performance regression detected")
else:
    print("CONCLUSION: Significant performance regression detected")
