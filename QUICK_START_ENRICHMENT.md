# 🚀 Guide Rapide : Système d'Enrichissement du Catalogue

## Pour les Super Admins

### 1. Accéder à l'onglet d'enrichissement

```
URL: http://localhost:3000/admin/global-catalog
Cliquez sur l'onglet "Enrichissement Local" (icône download)
```

### 2. Consulter les produits locaux

```
✅ Vois tous les produits custom de tous les bars
✅ Filtre par bar dans le dropdown
✅ Recherche par nom produit
✅ Affiche : Image, nom, bar, prix, volume, stock, catégorie
```

### 3. Promouvoir un produit

```
Clic sur bouton "Enrichir le catalogue" sur la carte produit
```

### 4. Modal d'enrichissement s'ouvre

```
Section "Produit Source" (en haut, lecture seule)
├─ Affiche infos du produit local
└─ Référence pour comparaison

Détection Doublons (si trouvés)
├─ ⚠️ Alerte "produits similaires détectés"
└─ Liste les 10 meilleurs matches

Formulaire d'enrichissement
├─ 4 champs OBLIGATOIRES (*)
│  ├─ Nom du produit
│  ├─ Catégorie globale
│  ├─ Volume standardisé
│  └─ Image officielle
├─ 6 champs OPTIONNELS
│  ├─ Marque
│  ├─ Fabricant
│  ├─ Sous-catégorie
│  ├─ Code-barres
│  ├─ Description
│  └─ Fourchette prix suggéré (auto-calculée)
└─ Options
   └─ ☑️ Lier automatiquement (coché par défaut)

Boutons
├─ "Annuler" → Ferme modal
└─ "✅ Enrichir le catalogue" → Crée le produit global
```

### 5. Validation et création

```
Si erreur de validation
├─ ❌ Message d'erreur clair
└─ Modal reste ouverte pour correction

Si succès
├─ ✅ Toast "Produit enrichi au catalogue global !"
├─ Modal ferme automatiquement
└─ Liste se rafraîchit
```

---

## 📝 Remplir le formulaire

### Champs Obligatoires

#### **Nom du produit***

```
Pré-rempli : local_name du produit source

Exemples:
✅ "Heineken Premium 33cl" (spécifique)
✅ "Vodka Artisanale" (générique)
❌ "Bière" (trop vague)
```

#### **Catégorie globale***

```
Liste prédéfinie :
- Alcools
- Bière
- Spiritueux
- Vin
- Cocktails
- Softs
- Jus
- Eau
- Café
- Thé
- Petit-déjeuner
- Snacks
- Autres

Choisir la catégorie la plus adaptée
```

#### **Volume standardisé***

```
Options :
- 25cl, 33cl, 50cl, 60cl, 70cl, 1L, 1.5L
- Autre (libre)

Le système normalise automatiquement :
330ml → 33cl
0.33L → 33cl
```

#### **Image officielle***

```
Option 1 : Utiliser image du produit source
├─ Coché par défaut
├─ Affiche l'image en prévisualisation
└─ Bouton "Changer l'image" si modification

Option 2 : Télécharger nouvelle image
├─ Clic bouton "Changer l'image"
├─ Sélectionner fichier (JPG, PNG)
└─ Aperçu mis à jour
```

### Champs Optionnels

#### **Marque**

```
Exemple: "Heineken", "Absolut", "Coca-Cola"
Facilite recherche et filtrage
```

#### **Fabricant**

```
Exemple: "Brasserie Heineken", "Pernod Ricard"
```

#### **Fourchette de prix**

```
Calculée automatiquement : ±20% du prix local
Exemple : Prix local 1000 FCFA → 800-1200 FCFA

Modifiable manuellement si contexte régional différent
```

#### **Details panel "Infos supplémentaires"**

```
Clic sur "Infos supplémentaires" pour afficher :
├─ Sous-catégorie (ex: "Vodka Premium")
├─ Code-barres (ex: "5901234123457")
└─ Description détaillée
```

### Option Liaison

```
☑️ "Lier automatiquement"

Coché par défaut = Recommandé

Effet :
✅ bar_product source lié au nouveau global_product
✅ Flag is_source_of_global = true
✅ Badge "🏆 Produit Global" apparaît dans inventaire du bar

Si décoché :
⚠️ Produit global créé mais PAS lié
⚠️ Bar verra le global en import
```

---

## 🔍 Détection Doublons

### Quand elle est déclenchée

```
1. Au ouverture du modal (nom source)
2. À chaque changement du nom (avec 500ms délai)
3. Détection automatique en arrière-plan
```

### Exemple détection

```
Vous nommez le produit "Coca"
→ Système détecte :
  1. "Coca-Cola" (high similarity)
  2. "Coca Cola Zero" (high similarity)
  3. "Coca Light" (medium similarity)

⚠️ Alerte affichée avec liste des 10 meilleurs matches
```

### Que faire si doublon détecté

#### **Option 1 : Ignorer et continuer**

```
Cas : Produit légitimement différent
├─ Continuez remplissage du formulaire
├─ Le doublon ne vous empêche pas de créer
└─ Clic "Enrichir" crée quand même le global
```

#### **Option 2 : Consulter le doublon existant**

```
Cas : Vraiment un doublon
├─ Notez l'ID du doublon en BDD
├─ Annulez ce modal
├─ Consultez le doublon dans l'onglet "Produits"
├─ Décidez : modifier existant ou créer nouveau
└─ Relancez enrichissement autre produit
```

---

## 🏆 Badge Produit Global (Pour le Bar Source)

### Où apparaît

```
Dans l'inventaire du bar source (InventoryPage)
Sur chaque produit qui a été promu
```

### Affichage

```
🏆 Produit Global | Voir [→]

Tooltip au survol :
"Ce produit a été promu au catalogue global"
```

### Signification

```
✅ Ce produit local est maintenant dans le catalogue global
✅ Autres bars peuvent l'importer
✅ Admin peut le modifier depuis onglet "Produits"
✅ Reconnaissance du bar source
```

---

## 📊 Audit & Traçabilité

### Logs créés

```
Tentative non autorisée :
└─ event: 'UNAUTHORIZED_CATALOG_ENRICHMENT'
   severity: 'warning'
   user_name: email de l'utilisateur
   → Traçabilité tentatives d'accès

Succès :
└─ event: 'CATALOG_ENRICHED_FROM_LOCAL'
   severity: 'info'
   user_name: email du super admin
   metadata: {global_product_id, bar_product_id, volume, ...}
   → Traçabilité enrichissements
```

### Consulter logs

```
En BDD (PostgreSQL) :
SELECT event, severity, user_name, description, metadata
FROM audit_logs
WHERE event IN ('UNAUTHORIZED_CATALOG_ENRICHMENT', 'CATALOG_ENRICHED_FROM_LOCAL')
ORDER BY timestamp DESC;
```

---

## ⚠️ Cas d'Erreur Communs

### Erreur 1 : "Une image est requise"

```
Cause : Ni image source ni upload
Solution : Uploader une image dans le modal
```

### Erreur 2 : "Le nom est requis"

```
Cause : Champ nom vide
Solution : Remplir le nom du produit
```

### Erreur 3 : "Ce produit est déjà lié"

```
Cause : bar_product.global_product_id ≠ null
Solution : Sélectionner un autre produit custom
```

### Erreur 4 : "Action réservée aux Super Admins"

```
Cause : Utilisateur pas super_admin
Solution : Vérifier rôle dans bar_members
```

---

## ✨ Tips & Tricks

### Recherche efficace

```
Lieu d'utiliser exact match, utiliser substring :
❌ "Coca-Cola" (si pas exact)
✅ "Coca" (trouve Coca-Cola, Coca Light, etc)
```

### Filtrer par bar productif

```
Bars avec plus de produits custom = Plus d'enrichissements
Dropdown "Tous les bars" → Sélectionner bar spécifique
```

### Vérifier doublons avant créer

```
Attendre 1 sec après changer nom
Observer l'alerte "produits similaires détectés"
Comparer avant de valider
```

### Normaliser le volume

```
Système normalise automatiquement :
330ml → 33cl ✅
0.33L → 33cl ✅
33 cl → 33cl ✅
Vous : Juste sélectionner dans dropdown
```

### Calculer prix suggéré

```
Local : 1000 FCFA
→ Suggéré : 800 - 1200 FCFA (±20%)

Si contexte régional différent, modifier manuellement
```

---

## 🔄 Après Enrichissement

### Que se passe-t-il

```
1. Produit global créé dans global_products
2. bar_product source lié via global_product_id
3. Flag is_source_of_global = true sur bar_product
4. Audit log enregistré
5. Notification succès affichée
6. Modal ferme, liste se rafraîchit
```

### Pour le bar source

```
✅ Badge "🏆 Produit Global" apparaît sur produit
✅ Peut voir le global dans inventaire
✅ Reconnaissance du bar contributor
```

### Pour les autres bars

```
✅ Produit global disponible dans import catalogue
✅ Peuvent l'importer et l'utiliser avec prix adapté
✅ Augmente diversité catalogue global
```

### Pour les admins

```
✅ Catalogue global enrichi avec produits testés
✅ Audit trail complet de qui a promu quoi
✅ Source tracée (bar_id, product_id)
```

---

## 📞 Support

### Problèmes courants

```
Voir section "⚠️ Cas d'Erreur Communs" ci-dessus
```

### Pour les développeurs

```
Voir : CATALOG_ENRICHMENT_SYSTEM.md
Code source :
- src/services/supabase/catalogEnrichment.service.ts
- src/components/admin/EnrichCatalogModal.tsx
- src/utils/productNormalization.ts
```

---

**Dernière mise à jour** : 2026-01-16
**Version** : 1.0
