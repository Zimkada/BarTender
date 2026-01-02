#!/usr/bin/env python3
import json
from pathlib import Path

def get_scores(filepath):
    with open(filepath, encoding='utf-8') as f:
        data = json.load(f)
    cats = data['categories']
    return {
        'perf': cats.get('performance', {}).get('score', 0) * 100,
        'access': cats.get('accessibility', {}).get('score', 0) * 100,
        'best': cats.get('best-practices', {}).get('score', 0) * 100,
        'seo': cats.get('seo', {}).get('score', 0) * 100,
        'pwa': cats.get('pwa', {}).get('score', 0) * 100
    }

# Pairs: (ancien nom partial, nouveau nom partial, affichage)
pairs = [
    ('homepage-mobile', 'homepage2', 'Homepage'),
    ('vente rapide-mobile', 'venterapide2', 'Vente Rapide'),
    ('tableaudebord-mobile', 'dashboard2', 'Dashboard'),
    ('historique-mobile', 'historique2', 'Historique'),
    ('inventaire-mobile', 'inventaire2', 'Inventaire'),
    ('prevision-mobile', 'previsions2', 'Prévisions'),
    ('retours-mobile', 'retours', 'Retours'),
    ('consignation-mobile', 'consignations', 'Consignations'),
    ('equipe-mobile', 'equipe2', 'Équipe'),
    ('promotions-mobile', 'promotions2', 'Promotions'),
    ('paramètres-mobile', 'paramètres2', 'Paramètres'),
    ('comptabilité-mobile', 'accounting2', 'Comptabilité'),
]

old_dir = Path(r"c:\Users\HP ELITEBOOK\DEV\BarTender\score_pwa")
new_dir = Path(r"c:\Users\HP ELITEBOOK\DEV\BarTender\score_pwa2")

print("\n" + "="*110)
print("COMPARAISON LIGHTHOUSE - AVANT/APRÈS FIXES (Mobile)")
print("="*110 + "\n")

print(f"{'Page':<20} | {'Perf':<10} | {'Access':<10} | {'Best':<10} | {'SEO':<10} | {'PWA':<10} | {'Moyenne':<10}")
print("-"*110)

all_diffs = []

for old_partial, new_partial, page_display in pairs:
    # Trouver les fichiers
    old_files = list(old_dir.glob(f"*{old_partial}.json"))
    new_files = list(new_dir.glob(f"*{new_partial}.json"))

    if not old_files or not new_files:
        continue

    old_file = old_files[0]
    new_file = new_files[0]

    old_scores = get_scores(old_file)
    new_scores = get_scores(new_file)

    # Skip if we don't have complete data (best and seo should be present for valid audits)
    if (old_scores['best'] == 0 or new_scores['best'] == 0 or
        old_scores['seo'] == 0 or new_scores['seo'] == 0):
        continue

    diffs = {k: new_scores[k] - old_scores[k] for k in old_scores}
    avg_diff = sum(diffs.values()) / len(diffs)
    all_diffs.extend(diffs.values())

    print(f"{page_display:<20} | {diffs['perf']:>+8.0f}% | {diffs['access']:>+8.0f}% | {diffs['best']:>+8.0f}% | {diffs['seo']:>+8.0f}% | {diffs['pwa']:>+8.0f}% | {avg_diff:>+8.1f}%")

# Résumé
print("\n" + "="*110)
avg_all = sum(all_diffs) / len(all_diffs) if all_diffs else 0
improvements = len([d for d in all_diffs if d > 2])
regressions = len([d for d in all_diffs if d < -2])

print(f"\n[STATISTIQUES GLOBALES]")
print(f"   Moyenne générale: {avg_all:>+.1f}%")
print(f"   Améliorations (>2%): {improvements}")
print(f"   Régressions (<-2%): {regressions}")
print(f"   Stable (±2%): {len(all_diffs) - improvements - regressions}\n")

if avg_all > 5:
    print(f"[OK] VERDICT: Amélioration SIGNIFICATIVE de {abs(avg_all):.1f}%")
elif avg_all > 0:
    print(f"[OK] VERDICT: Amélioration LÉGÈRE de {abs(avg_all):.1f}%")
elif avg_all < -5:
    print(f"[WARN] VERDICT: Régression SIGNIFICATIVE de {abs(avg_all):.1f}%")
elif avg_all < 0:
    print(f"[WARN] VERDICT: Régression LÉGÈRE de {abs(avg_all):.1f}%")
else:
    print(f"[INFO] VERDICT: Pas de changement")
