# Suivi des mesures — Optimisations infra (Egress + Compute)

> **But de ce document** : vérifier que les gains RÉELS correspondent (ou non) aux projections.
> Les chiffres ci-dessous étaient des **estimations** — seules les mesures du dashboard Supabase font foi.
> À remplir au fil des jours après déploiement.

---

## Contexte

- **Date de déploiement** : 7 juin 2026
- **Périmètre au moment du déploiement** : 2 bars actifs, 17 MAU, plan Supabase Pro
- **Commits déployés** :
  - `23e6d43` — Egress : Retours + Consignations → fetch today
  - `06c18eb` — Egress : dataTier `balanced` 6 mois → 60 jours
  - `02b324e` — Egress : AnalyticsView → période analysée + précédente
  - `3a39fca` — Compute : refresh vues (doublon supprimé + */30 + vue morte retirée)
- **Migration SQL exécutée** : `20260607160000_optimize_materialized_view_refresh.sql`
  - Vérifié post-exécution : 1 seul job cron `refresh-materialized-views-hc` à `*/30`, actif (jobid 6)

---

## 1. EGRESS — Suivi

### Référence AVANT optimisation (mesuré sur ~30 jours, 2 bars)
- Egress mensuel : **~16 GB** (15,949 GB) — soit **6,4 %** du quota Pro (250 GB)
- Egress journalier : tendance **haussière de ~0,3 GB/jour (début mai) à ~0,8-1,1 GB/jour (fin mai)**
- Signal clé observé : **croissance dans le temps** à nombre de bars constant (cause = fenêtre 6 mois)

### Projection (à confirmer / infirmer)
- Egress/bar attendu : ~8 GB → **~2-3 GB/mois**
- Réduction globale estimée : **-60 à -70 %**
- Croissance temporelle : **devrait disparaître** (fenêtres désormais fixes)

### Mesures réelles — À REMPLIR

| Date relevé | Egress journalier moyen (GB/jour) | Tendance vs avant | Notes |
|---|---|---|---|
| J+0 (7 juin, référence) | ~0,8-1,1 | — | avant prise d'effet |
| J+3 | _à remplir_ | | |
| J+7 | _à remplir_ | | comparer la moyenne 7j avant/après |
| J+14 | _à remplir_ | | vérifier que la croissance a cessé |

**Méthode de calcul du gain réel** :
`gain % = 1 − (egress journalier moyen APRÈS / egress journalier moyen AVANT)`
Comparer sur 7 jours pleins, même nombre de bars, même niveau d'activité.

### Verdict egress (à conclure après J+7)
- [ ] Baisse confirmée ? Pourcentage réel : _____ %
- [ ] Croissance temporelle stoppée ?
- [ ] Zéro signalement utilisateur sur Retours / Consignations / Analytics ?

---

## 2. COMPUTE — Suivi

### Référence AVANT optimisation (mesuré sur 24h, 2 bars)
Refresh des vues matérialisées = **~874 s/jour de CPU** réparti ainsi :

| Vue | Refreshs/24h | Total sec/24h |
|---|---|---|
| product_sales_stats | 367 | 377 |
| top_products_by_period (VUE MORTE) | 367 | 214 |
| daily_sales_summary | 518 | 206 |
| bar_ancillary_stats | 367 | 30 |
| expenses_summary | 367 | 30 |
| bar_stats_multi_period | 367 | 17 |

Cause aggravante découverte : **doublon de jobs cron** (`-hourly` horaire + `-hc` 5 min) tournant en parallèle depuis le 17 mai.

### Projection (à confirmer / infirmer)
- CPU refresh attendu : ~874 s/jour → **~100-130 s/jour**
- Réduction estimée : **~-85 %**
- `top_products_by_period` doit **disparaître** complètement du log
- Fréquence : de 367+/jour → **~48 refreshs/jour** (1 job × 48 cycles à */30)

### Mesures réelles — À REMPLIR

Requête de relevé (Supabase Studio) :
```sql
SELECT
  view_name,
  COUNT(*) AS refreshs_24h,
  ROUND(AVG(duration_ms)) AS avg_ms,
  ROUND(SUM(duration_ms) / 1000.0) AS total_seconds_24h
FROM materialized_view_refresh_log
WHERE refresh_completed_at > now() - interval '24 hours'
  AND status = 'success'
GROUP BY view_name
ORDER BY total_seconds_24h DESC;
```

| Date relevé | Total sec refresh/24h | Refreshs/24h (toutes vues) | top_products présent ? | Notes |
|---|---|---|---|---|
| J+0 (référence) | ~874 | ~2353 | OUI | avant |
| J+1 | _à remplir_ | | doit être NON | |
| J+3 | _à remplir_ | | | |
| J+7 | _à remplir_ | | | |

### Compute Hours global (dashboard Supabase → Usage → Compute Hours)
| Date | Compute Hours (période) | Notes |
|---|---|---|
| Référence (7 juin) | 745 h | instance Micro 24/7 |
| J+7 | _à remplir_ | observer la tendance |

### Verdict compute (à conclure après J+3)
- [ ] `top_products_by_period` a disparu du log ?
- [ ] Refreshs/jour tombés à ~48 ?
- [ ] CPU refresh réduit ? Pourcentage réel : _____ %
- [ ] Stats/Compta/Forecasting/BarStats fonctionnent (fraîcheur 30 min OK) ?

---

## 3. Vérifications fonctionnelles post-déploiement (à cocher)

### Egress
- [ ] **Retours** (`/returns`) : la liste des ventes du jour s'affiche pour créer un retour
- [ ] **Retours** : l'historique des retours s'affiche (toutes périodes du filtre)
- [ ] **Consignations** (`/consignments`) : ventes du jour visibles pour créer une consignation
- [ ] **Analytics** (`/sales` → Analytics) : graphiques + top produits + % de tendance OK sur toutes les périodes (today, 7j, 30j, mois, custom)

### Compute
- [ ] **Forecasting** (`/forecasting`) : prévisions s'affichent
- [ ] **Comptabilité** (AccountingOverview) : soldes et résumés corrects
- [ ] **BarStatsModal** : stats multi-période s'affichent

---

## 4. Filet de sécurité (revert)

Chaque correction est revertable indépendamment :
```bash
git revert 3a39fca   # annule l'optim refresh (frontend) — PUIS re-migrer SQL avec */5 + 6 vues
git revert 02b324e   # annule AnalyticsView
git revert 06c18eb   # annule dataTier 60j
git revert 23e6d43   # annule Retours/Consignations today
```
Pour la partie SQL du refresh : re-exécuter une migration avec `*/5` et la liste 6 vues (incluant `top_products_by_period`) si besoin de rollback complet.

---

## 5. Pistes NON traitées (volontairement écartées)

- **`useUnifiedReturns` (fenêtre 6 mois)** : écarté car risque comptable réel (AccountingOverview calcule un solde cumulé de remboursements pré-période). Gain marginal (les retours = ~2-5 % du volume des ventes). À ne PAS optimiser sans refactoring dédié passant des dates explicites à AccountingOverview + ReturnsPage.

---

## 6. Conclusion finale (à rédiger après J+14)

_À compléter quand les données réelles seront collectées :_
- Gain egress réel : _____ % (vs -60/-70 % projeté)
- Gain compute réel : _____ % (vs -85 % projeté)
- Régressions signalées : _____
- Décision sur les pistes restantes : _____

---

*Document de suivi créé le 7 juin 2026. Les projections sont des ordres de grandeur ; ce document existe précisément pour les confronter au réel.*
