# BarTender - Système de Gestion de Bar

## 📋 Vue d'ensemble

**BarTender** est une application web complète de gestion de bar développée avec React, TypeScript et Supabase. Elle offre une solution tout-en-un pour gérer les ventes, les stocks, la comptabilité et les prévisions.

## ✨ Fonctionnalités Principales

### 🎯 Gestion des Ventes
- Interface de vente rapide et intuitive
- Support multi-catégories et multi-produits
- Gestion des retours et remboursements
- Historique complet des transactions
- Validation multi-niveaux (serveur → gérant)

### 📦 Gestion des Stocks
- Suivi en temps réel des stocks
- Alertes automatiques de rupture
- Système de prévisions intelligent (SQL-powered)
- Suggestions de commande basées sur l'historique
- Gestion des approvisionnements et consignations

### 💰 Comptabilité
- Tableau de bord comptable complet
- Suivi du CA par période (jour/semaine/mois)
- Gestion des dépenses et catégories personnalisées
- Salaires et apports de capital
- Export Excel pour analyse

### 📊 Analytics & Prévisions
- **Vues matérialisées PostgreSQL** pour performances optimales
- Statistiques de ventes en temps réel
- Top produits par période
- Prévisions de rupture de stock
- Dashboard multi-périodes (aujourd'hui, hier, 7j, 30j)

### 👥 Gestion Multi-Utilisateurs
- Système de rôles (Promoteur, Gérant, Serveur)
- Permissions granulaires
- Gestion multi-bars
- Audit trail complet

## 🚀 Optimisations Récentes (Nov 2025)

### ✅ Migration vers SQL Materialized Views
**Performance : 60-85% plus rapide** 🎉

#### Migrations Déployées
- **042** : `product_sales_stats` - Statistiques produits pour prévisions
- **043** : `daily_sales_summary` - Résumés quotidiens/hebdomadaires/mensuels
- **044** : `top_products_by_period` - Top produits par période
- **045** : `bar_stats_multi_period` - Stats multi-périodes
- **046** : Monitoring & optimisations (logging, métriques, refresh)

#### Services TypeScript
- `ForecastingService` - Prévisions et suggestions de commande
- `AnalyticsService` - Analytics avec monitoring intégré

#### Composants Refactorés
- ✅ `ForecastingSystem` - Utilise `product_sales_stats`
- ✅ `AccountingOverview` - Utilise `daily_sales_summary`
- ✅ `DailyDashboard` - Utilise `daily_sales_summary`
- ✅ `SalesHistory` - Utilise `top_products_by_period`
- ✅ `BarStatsModal` - Utilise `bar_stats_multi_period`

#### Fonctionnalités de Monitoring
- **Cache Warming** : Refresh automatique au démarrage
- **Indicateurs UI** : Affichage de la fraîcheur des données
- **Métriques** : Suivi des performances des vues
- **Logging** : Historique complet des refresh

## 🛠️ Stack Technique

### Frontend
- **React 18** avec TypeScript
- **Vite** pour le build
- **TailwindCSS** pour le styling
- **Framer Motion** pour les animations
- **React Query** pour la gestion d'état
- **Recharts** pour les graphiques

### Backend
- **Supabase** (PostgreSQL + Auth + Storage)
- **Row Level Security (RLS)** pour la sécurité
- **Materialized Views** pour les performances
- **Triggers** pour le refresh automatique

### Outils
- **XLSX** pour l'export Excel
- **Lucide React** pour les icônes
- **ESLint** + **TypeScript** pour la qualité du code

## 📦 Installation

```bash
# Cloner le repository
git clone <your-repo-url>
cd BarTender

# Installer les dépendances
npm install

# Configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec vos credentials Supabase

# Lancer en développement
npm run dev
```

## 🗄️ Configuration Base de Données

### Migrations Supabase

```bash
# Appliquer toutes les migrations
npx supabase db push

# Ou migration par migration
npx supabase migration up
```

### Ordre des Migrations Importantes
1. **001-041** : Schema de base, tables, RLS
2. **042-045** : Vues matérialisées pour analytics
3. **046** : Système de monitoring

## 📊 Monitoring & Performance

### Vérifier les Métriques

```sql
-- Voir les métriques des vues matérialisées
SELECT * FROM materialized_view_metrics;

-- Historique des refresh
SELECT * FROM materialized_view_refresh_log 
ORDER BY refresh_started_at DESC 
LIMIT 10;

-- Vérifier la fraîcheur d'une vue
SELECT * FROM get_view_freshness('daily_sales_summary');
```

### Refresh Manuel

```sql
-- Rafraîchir toutes les vues
SELECT * FROM refresh_all_materialized_views('manual');

-- Rafraîchir une vue spécifique
SELECT refresh_materialized_view_with_logging('product_sales_stats', 'manual');
```

## 🔐 Sécurité

- **Row Level Security (RLS)** sur toutes les tables
- **Authentification Supabase** avec JWT
- **Permissions granulaires** par rôle
- **Audit trail** sur toutes les opérations critiques
- **Validation côté serveur** via Supabase Functions

## 📱 Responsive Design

- Interface optimisée mobile-first
- Support tablette et desktop
- Composants adaptatifs
- Touch-friendly pour les serveurs

## 📖 Documentation

- [OPTIMISATION_SQL_COMPLETE.md](./OPTIMISATION_SQL_COMPLETE.md) - Plan complet d'optimisation SQL
- [MATERIALIZED_VIEWS_MONITORING.md](./MATERIALIZED_VIEWS_MONITORING.md) - Guide de monitoring
- [CACHE_WARMING_IMPLEMENTATION.md](./CACHE_WARMING_IMPLEMENTATION.md) - Implémentation du cache warming
- [DEVELOPMENT_ROADMAP.md](./DEVELOPMENT_ROADMAP.md) - Roadmap de développement
- [API_ENDPOINTS.md](./API_ENDPOINTS.md) - Documentation des endpoints
- [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) - Configuration Supabase

## 🚀 Déploiement

### Vercel (Recommandé)

```bash
# Installer Vercel CLI
npm i -g vercel

# Déployer
vercel
```

### Variables d'Environnement Requises

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 🧪 Tests

```bash
# Lancer les tests
npm test

# Tests avec coverage
npm run test:coverage
```

## 📈 Performances

### Avant Optimisation SQL
- Chargement dashboard : ~2-3s
- Calculs analytics : ~1-2s
- Top produits : ~800ms

### Après Optimisation SQL
- Chargement dashboard : ~300-500ms ⚡ **85% plus rapide**
- Calculs analytics : ~150-300ms ⚡ **85% plus rapide**
- Top produits : ~100-200ms ⚡ **75% plus rapide**

## 🤝 Contribution

Les contributions sont les bienvenues ! Veuillez :
1. Fork le projet
2. Créer une branche (`git checkout -b feature/AmazingFeature`)
3. Commit vos changements (`git commit -m 'Add AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

## 📝 Licence

Ce projet est sous licence privée.

## 👨‍💻 Auteur

Développé avec ❤️ pour la gestion moderne de bars

## 🙏 Remerciements

- Supabase pour l'infrastructure backend
- React team pour le framework
- Toute la communauté open-source

---

**Version actuelle : 2.0** (avec optimisations SQL)  
**Dernière mise à jour : Novembre 2025**
