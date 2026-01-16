# 📚 Système d'Enrichissement du Catalogue Global

## Vue d'ensemble

Le système d'enrichissement du catalogue global permet aux **Super Admins** de consulter tous les produits locaux (custom) des bars et de les promouvoir au catalogue global avec validation et audit complets.

**Objectif** : Enrichir progressivement le catalogue global avec les meilleurs produits testés et validés par les bars.

---

## 🏗️ Architecture

### Deux niveaux de produits

```
Catalogue Global (global_products)
    ↑
    └─── Produits Locaux (bar_products avec is_custom_product = true)
         └─── Créés par Promoteurs/Gérants des bars
         └─── Testés en condition réelle
         └─── Peuvent être promus au global
```

### Flux de promotion

```
1. Admin consulte produits locaux
       ↓
2. Sélectionne un produit
       ↓
3. Système détecte doublons potentiels
       ↓
4. Admin édite les infos du produit global
       ↓
5. Validation et création du global
       ↓
6. Liaison automatique du produit source
       ↓
7. Log audit complet
```

---

## 📁 Structure des fichiers

### Backend

#### Migrations SQL
- **`20260116000003_add_product_promotion_fields.sql`**
  - Ajoute `source_bar_id`, `source_bar_product_id`, `contributed_at` à `global_products`
  - Ajoute `is_source_of_global` à `bar_products`
  - Crée indexes pour performance

#### Services
- **`src/services/supabase/catalogEnrichment.service.ts`**
  - `getAllCustomLocalProducts()` - Récupère tous les produits custom
  - `findSimilarGlobalProducts()` - Détecte les doublons
  - `enrichGlobalCatalogWithLocal()` - Crée et lie les produits

#### Types
- **`src/types/catalogEnrichment.ts`**
  - `LocalProductForEnrichment`
  - `EnrichGlobalCatalogData`
  - `EnrichmentResult`
  - `SimilarGlobalProduct`
  - `CatalogEnrichmentAuditLog`

#### Utilitaires
- **`src/utils/productNormalization.ts`**
  - `normalizeVolume()` - Standardise formats (ml, cl, L)
  - `normalizeName()` - Normalise noms (accents, ponctuation)
  - `areSimilar()` - Détecte similarité
  - `calculateSuggestedPriceRange()` - Calcule fourchette prix

### Frontend

#### Pages
- **`src/pages/GlobalCatalogPage.tsx`** (modifiée)
  - Nouveau 3ème onglet : "Enrichissement Local"

#### Composants
- **`src/components/admin/LocalProductsCatalogViewer.tsx`**
  - Vue liste des produits locaux
  - Filtres par bar et recherche
  - Bouttons d'enrichissement

- **`src/components/admin/EnrichCatalogModal.tsx`**
  - Modal de promotion
  - Détection live de doublons
  - Formulaire éditable
  - Validation et audit

- **`src/components/products/CatalogContributionBadge.tsx`**
  - Badge "Produit Global" sur le produit source
  - Affichage du bar d'origine
  - Lien vers produit global

---

## 🔐 Sécurité : Defense in Depth

### Layer 1 : Validation Applicative
- ✅ Vérification rôle Super Admin
- ✅ Vérification produit non déjà lié
- ✅ Vérification image présente
- ✅ Messages d'erreur clairs
- ✅ Audit logs des tentatives

### Layer 2 : Transaction Atomique
- ✅ Création global_product + mise à jour bar_product
- ✅ Rollback automatique en cas d'erreur
- ✅ Localisation et liaison garanties

### Layer 3 : RLS Policies PostgreSQL
- ✅ Policies sur `global_products` (INSERT/UPDATE/DELETE)
- ✅ Vérification `is_super_admin()` au niveau DB
- ✅ Sécurité ultime si Layer 1/2 bypassés

---

## 🚀 Workflow Complet

### 1. Super Admin consulte les produits locaux

```
URL: /admin/global-catalog
Onglet: "Enrichissement Local"
Affiche: Tous les produits custom de tous les bars
```

### 2. Filtres et recherche

```typescript
// Filtrer par bar
<select value={filterBar} onChange={...}>
  <option value="all">Tous les bars</option>
  <option value="bar-1">Bar Phénix</option>
  ...
</select>

// Rechercher par nom
<Input placeholder="Rechercher..." onChange={...} />
```

### 3. Sélectionner un produit et ouvrir modal

```typescript
<Button onClick={() => handleEnrichClick(product)}>
  Enrichir le catalogue
</Button>
```

### 4. Détection de doublons automatique

```typescript
// Au chargement et chaque fois que le nom change
const similarProducts = await CatalogEnrichmentService
  .findSimilarGlobalProducts(name, volume);

// Affiche les résultats avec option "Lier" ou "Ignorer"
```

### 5. Éditer les infos du produit global

```typescript
// Champs éditables :
- Nom du produit (requis)
- Catégorie globale (requis)
- Volume standardisé (requis)
- Marque, Fabricant, Code-barres
- Prix suggéré (min/max)
- Description, Sous-catégorie
- Image officielle (requis si pas d'image source)
```

### 6. Validation et création

```typescript
// Au clic "Enrichir le catalogue"
- Validation des champs obligatoires
- Vérification rôle Super Admin
- Création global_product
- Liaison bar_product source
- Log audit
- Notification succès
```

---

## 📊 Audit & Traçabilité

### Events loggés

| Event | Quand | Severity |
|-------|-------|----------|
| `UNAUTHORIZED_CATALOG_ENRICHMENT` | Tentative sans rôle super_admin | warning |
| `CATALOG_ENRICHED_FROM_LOCAL` | Enrichissement réussi | info |

### Données loggées

```typescript
{
  event: 'CATALOG_ENRICHED_FROM_LOCAL',
  severity: 'info',
  user_id: 'user-123',
  user_name: 'admin@example.com',
  user_role: 'super_admin',
  bar_id: 'bar-456',
  bar_name: 'Bar Phénix',
  description: 'Produit "Vodka Maison" enrichi...',
  metadata: {
    global_product_id: 'gp-789',
    bar_product_id: 'bp-012',
    bar_id: 'bar-456',
    volume: '70cl'
  }
}
```

---

## 🧪 Tests Unitaires

### ProductNormalization.test.ts

```bash
npm test -- productNormalization.test.ts
```

Tests couverts :
- ✅ Normalisation volume (ml → cl, L → cl)
- ✅ Normalisation nom (accents, ponctuation, espaces)
- ✅ Détection similarité (exact, inclusion, word-start)
- ✅ Calcul fourchette prix

---

## 🔗 Champs de liaison

### global_products

```typescript
source_bar_id: string | null           // Bar d'origine
source_bar_product_id: string | null    // Produit source
contributed_at: timestamp | null        // Date contribution
```

**Pas de FK** : Métadonnées historiques uniquement. Permet que le global_product persiste même si le bar est supprimé.

### bar_products

```typescript
is_source_of_global: boolean = false    // Flag promotion
```

Utilisé pour afficher le badge "Produit Global" dans l'inventaire du bar source.

---

## 📱 Interface Utilisateur

### Onglet "Enrichissement Local"

#### Vue liste
- Grille de cartes produits
- Chaque carte affiche : Image, Nom, Bar, Prix, Volume, Stock, Catégorie
- Bouton "Enrichir le catalogue" par produit

#### Filtres
- Dropdown "Tous les bars"
- Input recherche par nom
- Compte dynamique de produits

#### Modal d'enrichissement
- Section "Produit source" (lecture seule)
- Section "Alerte doublons" (si détectés)
- Formulaire éditable (4 champs obligatoires, 6 optionnels)
- Details panel "Infos supplémentaires"
- Checkbox "Lier automatiquement"
- Boutons "Annuler" / "Enrichir le catalogue"

---

## 🎯 Cas d'usage

### Cas 1 : Produit simple, pas de doublons

```
1. Admin sélectionne "Vodka Maison" de Bar Phénix
2. Aucun doublon détecté
3. Admin édite juste le nom et la catégorie
4. Clic "Enrichir" → Création rapide
```

### Cas 2 : Doublon détecté

```
1. Admin sélectionne "Coca Cola" de Bar X
2. ⚠️ "Coca-Cola" existe déjà au global
3. Admin compare les 2 produits
4. Décide : "Ignorer ce doublon" et ferme
5. Relance enrichissement pour produit différent
```

### Cas 3 : Produit sans image

```
1. Admin sélectionne produit sans image
2. ❌ Erreur : "Une image est requise"
3. Admin peut télécharger une image en modal
4. Valide et crée le global_product
```

---

## 🔄 Synchronisation

### Aucune sync automatique (v1)

- Modification du global_product → **Pas d'impact** sur bar_product source
- Modification du bar_product source → **Pas d'impact** sur global_product
- Suppression du global_product → **Pas d'impact** sur bar_product source

**Avantage** : Flexibilité, pas d'effets de bord inattendus

**V2 optionnel** : Synchronisation optionnelle + notifications

---

## 📈 Performances

### Indexes créés

```sql
-- Recherche produits par bar
CREATE INDEX idx_global_products_source_bar
ON global_products(source_bar_id)
WHERE source_bar_id IS NOT NULL;

-- Affichage badges
CREATE INDEX idx_bar_products_source_global
ON bar_products(is_source_of_global)
WHERE is_source_of_global = true;
```

### Optimisations

- ✅ RPC pour requêtes complexes
- ✅ Pagination (limit 100 par défaut)
- ✅ Détection doublons côté client (50 produits max)
- ✅ Lazy loading de la liste

---

## 🚨 Limitations Connues

### V1

1. Détection doublons simple (pas pg_trgm) - OK pour <10k produits
2. Aucune sync bidirectionnelle
3. Image obligatoire (peut être amélioré)
4. Pas d'agrégation multi-bars pour prix suggéré

### V2 Potentielles

- [ ] pg_trgm fuzzy matching
- [ ] Sync optionnelle Global ↔ Bar
- [ ] Prix suggéré basé sur moyennes multi-bars
- [ ] Notifications aux bars quand produit est promu
- [ ] Dashboard statistiques (combien de fois enrichi par bar, etc)

---

## 📞 Support

Pour questions sur le système :
- Vérifier `catalogEnrichment.service.ts` pour logique métier
- Vérifier `productNormalization.ts` pour normalisation
- Vérifier audit_logs dans BDD pour traçabilité
- Vérifier RLS policies dans migrations pour sécurité

---

**Dernière mise à jour** : 2026-01-16
**Version** : 1.0 (Initial Release)
