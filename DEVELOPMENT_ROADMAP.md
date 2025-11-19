# 🗺️ BarTender Pro - Feuille de Route Développement Supabase

**Date de création** : 19 Janvier 2025
**Contexte** : Migration de localStorage vers Supabase (PostgreSQL)
**Objectif** : Backend scalable, multi-tenant, sécurisé avec support IA

---

## 📊 Vue d'Ensemble de l'Architecture

### **Architecture Actuelle**
```
React Frontend → localStorage → Données locales (non persistantes)
```

### **Architecture Cible**
```
React Frontend → Supabase Client → PostgreSQL (Cloud)
                                 → Supabase Auth
                                 → Row Level Security (RLS)
                                 → Future: IA/Analytics
```

---

## 🎯 Principes de Conception Retenus

### **1. Catalogue Global vs Données Par Bar**
- **Catalogue Global** : Produits standards gérés par Super Admin
- **Données Par Bar** : Prix, stock, catégories propres à chaque bar
- **Flexibilité** : Bars peuvent créer des produits 100% custom

### **2. Catégories**
- **Noms au singulier** : "Bière", "Soda" (pas "Bières", "Sodas")
- **Globales** : Standards suggérées par Super Admin
- **Locales** : Chaque bar organise comme il veut

### **3. Promotions**
- **3 types de réductions** : Pourcentage, Montant fixe, Prix total fixe
- **Sélectif** : Pas tous les produits, choix précis
- **Exemple** : "3 Flag pour 1000 FCFA" (au lieu de 1050)

### **4. Code-Barres**
- **Optionnel** mais présent dans le schéma
- **Usage** : Gestion catalogue global, approvisionnement rapide
- **Pas obligatoire** pour fonctionner

### **5. Intelligence Artificielle**
- **Tables dédiées** : `ai_conversations`, `ai_insights`
- **Vues matérialisées** : Pour analytics rapides
- **Implémentation** : Phase 2-3 (après migration de base)

---

## 🏗️ Structure de Base de Données Complète

### **Tables Globales** (Super Admin uniquement)

| Table | Description | Clés |
|-------|-------------|------|
| `global_categories` | Catégories standards (Bière, Soda, etc.) | Nom au singulier |
| `global_products` | Catalogue produits (Flag, Coca, etc.) | Code-barre optionnel |
| `global_suppliers` | Fournisseurs (SOBEBRA, BGI, etc.) | Phase 2 |

### **Tables Par Bar** (Multi-tenant)

| Table | Description | Isolation |
|-------|-------------|-----------|
| `bar_categories` | Catégories personnalisées du bar | RLS par bar_id |
| `bar_products` | Instances de produits (prix, stock) | RLS par bar_id |
| `promotions` | Promotions actives du bar | RLS par bar_id |
| `sale_promotions` | Promotions appliquées aux ventes | RLS par bar_id |

### **Tables Métier** (Inchangées dans leur logique)

- `bars`, `users`, `bar_members`
- `sales` (avec colonnes promo ajoutées)
- `returns`, `consignments`
- `supplies`, `expenses`, `salaries`
- `accounting_transactions`, `initial_balances`, `capital_contributions`

### **Tables Admin & IA**

| Table | Description | Usage |
|-------|-------------|-------|
| `admin_notifications` | Notifications pour Super Admin | Alertes système |
| `audit_logs` | Logs d'activité | Traçabilité complète |
| `ai_conversations` | Historique conversations IA | Langchain/GPT |
| `ai_insights` | Insights générés par IA | Prédictions, recommandations |

### **Vues Matérialisées** (Performance)

- `bar_weekly_stats` : Stats hebdomadaires par bar
- `product_sales_summary` : Top produits vendus
- `inventory_alerts` : Produits en rupture/seuil

---

## 📅 PHASE 1 : Migration Base de Données (EN COURS)

### ✅ **Étape 1.1 : Configuration Initiale** (TERMINÉ)
- [x] Installation `@supabase/supabase-js`
- [x] Création fichier `.env` avec credentials
- [x] Configuration client Supabase (`src/lib/supabase.ts`)
- [x] Types TypeScript générés (`src/lib/database.types.ts`)

### ⏳ **Étape 1.2 : Exécution Migrations SQL** (À FAIRE)

**Action requise** : Aller sur Supabase Dashboard

1. **Ouvrir SQL Editor**
   - URL : https://yekomwjdznvtnialpdcz.supabase.co
   - Cliquer sur "SQL Editor" > "New Query"

2. **Migration 1 : Schéma Initial**
   - Ouvrir : `supabase/migrations/001_initial_schema.sql`
   - Sélectionner tout (`Ctrl+A`)
   - Copier (`Ctrl+C`)
   - Coller dans l'éditeur SQL Supabase
   - Cliquer sur "Run" (ou `Ctrl+Enter`)
   - Attendre "Success" en vert

3. **Migration 2 : Politiques RLS**
   - Nettoyer l'éditeur (`Ctrl+A` > Supprimer)
   - Ouvrir : `supabase/migrations/002_rls_policies.sql`
   - Répéter : Copier > Coller > Run
   - Attendre "Success"

4. **Vérification**
   ```sql
   -- Dans SQL Editor, vérifier les tables
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public'
   ORDER BY table_name;

   -- Doit retourner : bars, users, bar_products, sales, etc.
   ```

### 📋 **Étape 1.3 : Création Super Admin Initial** (À FAIRE APRÈS 1.2)

**Méthode temporaire** (en attendant l'interface auth) :

```sql
-- 1. Créer le super admin
INSERT INTO users (
  username,
  password_hash,  -- ⚠️ Utiliser bcrypt côté client
  name,
  phone,
  is_active
) VALUES (
  'admin',
  'TEMP_HASH',  -- À remplacer par un vrai hash bcrypt
  'Super Administrateur',
  '+22900000000',
  true
) RETURNING id;

-- 2. Noter l'ID retourné, puis créer l'entrée bar_members
INSERT INTO bar_members (user_id, bar_id, role, assigned_by)
VALUES (
  '[ID_DU_STEP_1]',
  uuid_generate_v4(),  -- Bar fictif pour super admin
  'super_admin',
  '[ID_DU_STEP_1]'
);
```

**Note** : On créera une vraie interface d'inscription plus tard.

---

## 📅 PHASE 2 : Couche de Services (2-3 jours)

### **Objectif** : Créer des services TypeScript pour interagir avec Supabase

### **Étape 2.1 : Service d'Authentification**

**Fichier** : `src/services/supabase/auth.service.ts`

**Fonctionnalités** :
```typescript
- login(username, password) → UserSession
- logout() → void
- getCurrentUser() → User | null
- updateProfile(data) → User
- changePassword(oldPassword, newPassword) → boolean
```

**Intégration** : Remplacer le `AuthContext` actuel

### **Étape 2.2 : Service Bars**

**Fichier** : `src/services/supabase/bars.service.ts`

**Fonctionnalités** :
```typescript
- createBar(data) → Bar
- getBarById(id) → Bar
- updateBar(id, data) → Bar
- getBarsForUser(userId) → Bar[]
- getBarMembers(barId) → BarMember[]
- addBarMember(barId, userId, role) → BarMember
```

### **Étape 2.3 : Service Produits**

**Fichier** : `src/services/supabase/products.service.ts`

**Fonctionnalités** :
```typescript
// Catalogue global (Super Admin)
- getGlobalProducts() → GlobalProduct[]
- createGlobalProduct(data) → GlobalProduct
- updateGlobalProduct(id, data) → GlobalProduct

// Produits par bar
- getBarProducts(barId) → BarProduct[]
- addProductFromCatalog(barId, globalProductId, price, stock) → BarProduct
- createCustomProduct(barId, data) → BarProduct
- updateStock(productId, quantity) → BarProduct
```

### **Étape 2.4 : Service Ventes**

**Fichier** : `src/services/supabase/sales.service.ts`

**Fonctionnalités** :
```typescript
- createSale(barId, items, total, promotions?) → Sale
- validateSale(saleId, managerId) → Sale
- rejectSale(saleId, managerId, reason) → Sale
- getSalesForBar(barId, filters?) → Sale[]
- getSalesForUser(userId, barId) → Sale[]
- calculatePromotions(items, barId) → PromotionResult
```

### **Étape 2.5 : Services Complémentaires**

Créer les services suivants :
- `categories.service.ts` : Gestion catégories
- `supplies.service.ts` : Approvisionnements
- `returns.service.ts` : Retours
- `consignments.service.ts` : Consignations
- `accounting.service.ts` : Comptabilité
- `promotions.service.ts` : Promotions (Phase 3)

---

## 📅 PHASE 3 : Migration Contexts React (3-4 jours)

### **Objectif** : Remplacer localStorage par Supabase

### **Étape 3.1 : Migration AuthContext**

**Fichier** : `src/context/AuthContext.tsx`

**Avant** :
```typescript
const login = (username, password) => {
  const users = JSON.parse(localStorage.getItem('users'));
  // ...
};
```

**Après** :
```typescript
const login = async (username, password) => {
  const session = await authService.login(username, password);
  setCurrentSession(session);
};
```

**Impact** : Authentification centralisée, session persistante

### **Étape 3.2 : Migration AppContext**

**Fichier** : `src/context/AppContext.tsx`

**Stratégie** : Migration progressive par fonctionnalité

**Ordre recommandé** :
1. **Catégories** (plus simple)
   ```typescript
   const [categories, setCategories] = useState([]);

   useEffect(() => {
     categoriesService.getBarCategories(barId)
       .then(setCategories);
   }, [barId]);
   ```

2. **Produits**
   ```typescript
   const addProduct = async (data) => {
     const product = await productsService.createCustomProduct(barId, data);
     setProducts(prev => [...prev, product]);
   };
   ```

3. **Ventes**
   ```typescript
   const addSale = async (data) => {
     const sale = await salesService.createSale(barId, data);
     setSales(prev => [...prev, sale]);
   };
   ```

4. **Autres** (supplies, returns, etc.)

### **Étape 3.3 : Gestion du Cache Local**

**Problème** : Éviter de requêter Supabase à chaque render

**Solution** : React Query ou SWR

**Installation** :
```bash
npm install @tanstack/react-query
```

**Usage** :
```typescript
const { data: products, isLoading } = useQuery({
  queryKey: ['products', barId],
  queryFn: () => productsService.getBarProducts(barId),
  staleTime: 5 * 60 * 1000, // 5 minutes
});
```

### **Étape 3.4 : Mode Offline (Optionnel Phase 3+)**

**Stratégie** : Queue de synchronisation

```typescript
// Si offline, stocker les actions
const offlineQueue = [];

const addSaleOffline = (data) => {
  offlineQueue.push({ type: 'CREATE_SALE', data });
  localStorage.setItem('offline_queue', JSON.stringify(offlineQueue));
};

// Quand online, synchroniser
const syncOfflineData = async () => {
  for (const action of offlineQueue) {
    await executeAction(action);
  }
  offlineQueue = [];
};
```

---

## 📅 PHASE 4 : Interfaces Avancées (2-3 semaines)

### **Étape 4.1 : Gestion Catalogue Global (Super Admin)**

**Nouvelle interface** : `src/components/admin/GlobalCatalog.tsx`

**Fonctionnalités** :
- 📋 Liste des produits globaux (recherche, filtres)
- ➕ Ajouter produit (nom, marque, volume, code-barre, image)
- ✏️ Modifier produit
- 🗑️ Désactiver produit
- 📊 Statistiques d'utilisation (combien de bars utilisent ce produit)

**UI Suggérée** :
```
┌─────────────────────────────────────────┐
│ 🌍 Catalogue Global des Produits       │
├─────────────────────────────────────────┤
│ [Rechercher...] [+ Nouveau Produit]    │
├─────────────────────────────────────────┤
│ Bière (12 produits)                     │
│ ├─ Flag 33cl          [✏️] [📊]        │
│ ├─ Flag 60cl          [✏️] [📊]        │
│ └─ Beaufort 33cl      [✏️] [📊]        │
│                                          │
│ Soda (8 produits)                       │
│ ├─ Coca-Cola 33cl     [✏️] [📊]        │
│ └─ Fanta 33cl         [✏️] [📊]        │
└─────────────────────────────────────────┘
```

### **Étape 4.2 : Sélection Produits depuis Catalogue (Bars)**

**Amélioration** : `src/components/Inventory.tsx`

**Workflow** :
```
Ajouter un produit
├─ [Tab 1] Depuis le catalogue 🔍
│   ├─ Recherche : [Flag...]
│   ├─ Résultats :
│   │   └─ Flag 33cl (Bière) [Ajouter]
│   └─ Prix : [500] Stock : [24]
│
└─ [Tab 2] Produit personnalisé ✏️
    └─ (Interface actuelle)
```

### **Étape 4.3 : Gestion des Promotions**

**Nouvelle interface** : `src/components/Promotions.tsx`

**Fonctionnalités** :
- 📋 Liste des promotions actives
- ➕ Créer promotion (assistant simple)
- ✏️ Modifier/Désactiver
- 📊 Statistiques (utilisation, économies générées)

**Assistant de création** :
```
Étape 1/3 : Type de promotion
○ Réduction simple (-%, -FCFA)
● Prix fixe pour lot (ex: 3 pour 1000)
○ Achetez X, obtenez Y

Étape 2/3 : Produits concernés
[x] Flag 33cl
[ ] Beaufort 60cl

Étape 3/3 : Configuration
Quantité minimum : [3]
Prix du lot : [1000] FCFA
Économie : 50 FCFA par client
```

### **Étape 4.4 : Scanner Code-Barres**

**Installation** :
```bash
npm install @capacitor-community/barcode-scanner
```

**Usage** :
```typescript
const scanBarcode = async () => {
  const result = await BarcodeScanner.startScan();
  if (result.hasContent) {
    const product = await findProductByBarcode(result.content);
    addProduct(product);
  }
};
```

**Intégration** :
- Approvisionnement : Scanner casier → Auto-remplissage
- Ajout produit : Scanner → Suggestion du catalogue

---

## 📅 PHASE 5 : Intelligence Artificielle (1-2 mois)

### **Étape 5.1 : Configuration Langchain**

**Installation** :
```bash
npm install langchain openai
```

**Configuration** : `.env`
```
VITE_OPENAI_API_KEY=sk-...
```

**Service IA** : `src/services/ai/assistant.service.ts`

### **Étape 5.2 : Agents IA**

**Agent 1 : Assistant de Gestion**
```typescript
"Combien j'ai gagné cette semaine ?"
→ Query Supabase → Calcul → Réponse naturelle
```

**Agent 2 : Prédictions**
```typescript
"Combien de Flag vais-je vendre ce weekend ?"
→ Historique ventes → Modèle ML → Prédiction
```

**Agent 3 : Recommandations**
```typescript
"Quels produits ajouter à mon catalogue ?"
→ Analyse ventes → Top produits manquants
```

### **Étape 5.3 : Interface Chat**

**Composant** : `src/components/AIAssistant.tsx`

**UI** :
```
┌─────────────────────────────────┐
│ 🤖 Assistant BarTender          │
├─────────────────────────────────┤
│ Vous: Résume mes ventes du mois │
│                                  │
│ IA: Ce mois-ci, tu as réalisé   │
│ 1,245,000 FCFA de CA (+8% vs    │
│ mois dernier). Top 3 :          │
│ 1. Flag 33cl : 235 vendus       │
│ 2. Coca 33cl : 189 vendus       │
│ 3. Beaufort 60cl : 156 vendus   │
│                                  │
│ [Poser une question...]          │
└─────────────────────────────────┘
```

---

## 📅 PHASE 6 : Tests & Optimisation (1-2 semaines)

### **Étape 6.1 : Tests d'Intégration**

**Scénarios critiques** :
1. ✅ Connexion utilisateur
2. ✅ Création bar
3. ✅ Ajout produit (catalogue + custom)
4. ✅ Vente avec promotion
5. ✅ Validation vente (gérant)
6. ✅ Approvisionnement
7. ✅ Retour produit
8. ✅ Consignation

### **Étape 6.2 : Tests RLS (Sécurité)**

**Vérifier isolation multi-tenant** :
```sql
-- En tant que user du Bar A
SET LOCAL "request.jwt.claims" = '{"sub": "user-bar-a"}';

-- Doit retourner UNIQUEMENT les produits du Bar A
SELECT * FROM bar_products WHERE bar_id = 'bar-a-id';

-- Doit retourner 0 lignes (Bar B)
SELECT * FROM bar_products WHERE bar_id = 'bar-b-id';
```

### **Étape 6.3 : Performance**

**Requêtes à optimiser** :
```sql
-- Index manquants ?
EXPLAIN ANALYZE SELECT * FROM sales WHERE bar_id = '...';

-- Vues matérialisées à rafraîchir ?
REFRESH MATERIALIZED VIEW bar_weekly_stats;
```

### **Étape 6.4 : Migration Données**

**Script de migration localStorage → Supabase** :

```typescript
const migrateLocalData = async () => {
  const localBars = JSON.parse(localStorage.getItem('bars'));
  const localProducts = JSON.parse(localStorage.getItem('products'));
  const localSales = JSON.parse(localStorage.getItem('sales'));

  // Upload vers Supabase
  for (const bar of localBars) {
    await barsService.createBar(bar);
  }

  for (const product of localProducts) {
    await productsService.createCustomProduct(product.barId, product);
  }

  // etc.
};
```

---

## 📅 PHASE 7 : Déploiement Production (1 semaine)

### **Étape 7.1 : Configuration Environnements**

**.env.production**
```
VITE_SUPABASE_URL=https://yekomwjdznvtnialpdcz.supabase.co
VITE_SUPABASE_ANON_KEY=[PRODUCTION_KEY]
VITE_OPENAI_API_KEY=[PRODUCTION_KEY]
```

### **Étape 7.2 : Build & Deploy**

```bash
npm run build
# Upload dist/ vers hébergement (Vercel, Netlify, etc.)
```

### **Étape 7.3 : Monitoring**

**Supabase Dashboard** :
- Logs SQL
- Utilisation stockage
- Requêtes lentes

**Sentry** (optionnel) :
```bash
npm install @sentry/react
```

---

## 🎯 Priorités & Ordre d'Exécution

### **SEMAINE 1-2** (Fondations)
1. ✅ Exécuter migrations SQL
2. ✅ Créer super admin
3. ✅ Services de base (auth, bars, products)
4. ✅ Migrer AuthContext

### **SEMAINE 3-4** (Migration Données)
5. ✅ Migrer AppContext (catégories, produits)
6. ✅ Migrer ventes
7. ✅ Tests d'intégration

### **SEMAINE 5-6** (Interfaces Avancées)
8. ✅ Gestion catalogue global (Super Admin)
9. ✅ Sélection depuis catalogue (Bars)
10. ✅ Interface promotions

### **SEMAINE 7-8** (IA - Optionnel)
11. ✅ Setup Langchain
12. ✅ Assistant chat
13. ✅ Insights automatiques

### **SEMAINE 9-10** (Polish & Deploy)
14. ✅ Tests finaux
15. ✅ Migration données existantes
16. ✅ Déploiement production

---

## ⚠️ Risques & Mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| **Perte données localStorage** | 🔴 Critique | Backup manuel avant migration |
| **Latence réseau** | 🟡 Moyen | Cache local (React Query), mode offline |
| **Coûts Supabase** | 🟡 Moyen | Surveiller usage, optimiser requêtes |
| **Bugs RLS** | 🔴 Critique | Tests approfondis isolation multi-tenant |
| **Migration partielle** | 🟡 Moyen | Feature flags, rollback possible |

---

## 📊 Métriques de Succès

### **Technique**
- ✅ 100% des données migrées sans perte
- ✅ Latence < 200ms (90% des requêtes)
- ✅ 0 faille de sécurité RLS
- ✅ Uptime > 99.9%

### **Métier**
- ✅ Utilisateurs peuvent se connecter depuis plusieurs appareils
- ✅ Données synchronisées en temps réel
- ✅ Catalogue global utilisé par > 50% des bars
- ✅ IA répond correctement à > 80% des questions

---

## 🔗 Ressources & Documentation

### **Supabase**
- Docs : https://supabase.com/docs
- Dashboard : https://yekomwjdznvtnialpdcz.supabase.co
- RLS Guide : https://supabase.com/docs/guides/auth/row-level-security

### **Langchain**
- Docs : https://js.langchain.com/docs/
- Templates : https://github.com/langchain-ai/langchainjs

### **React Query**
- Docs : https://tanstack.com/query/latest/docs/react/overview

---

## 📝 Notes & Décisions

### **Décisions Architecturales**
1. ✅ Catégories au singulier
2. ✅ Code-barres optionnel
3. ✅ Prix total fixe pour promotions (pas que %)
4. ✅ Tables IA dès Phase 1
5. ✅ Migration progressive (pas big bang)

### **À Discuter Plus Tard**
- 📅 Consignes emballages (bouteilles)
- 📅 Fournisseurs recommandés
- 📅 Fidélité client
- 📅 Réservations

---

**Document vivant** : À mettre à jour au fur et à mesure de l'avancement.

**Dernière mise à jour** : 19 Janvier 2025
