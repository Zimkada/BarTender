# Contenu des Guides Utilisateur

## Structure des Données

Tous les guides sont définis comme données structurées (JSON/TypeScript) au lieu de composants React.
Cela rend facile d'ajouter/éditer sans toucher au code React.

```typescript
// src/data/guides/index.ts
export const ALL_GUIDES: Record<UserRole, GuideTour[]> = {
  promoteur: OWNER_GUIDES,
  gérant: MANAGER_GUIDES,
  serveur: BARTENDER_GUIDES,
};

// Exporter aussi les guides "auto-trigger" avec leurs conditions
export const GUIDE_TRIGGERS = {
  onboarding_complete: { roles: ['promoteur', 'gérant', 'serveur'] },
  first_inventory_access: { roles: ['promoteur', 'gérant'] },
  first_analytics_access: { roles: ['promoteur', 'gérant'] },
  // ... etc
};
```

---

## 🏢 GUIDES PROPRIÉTAIRE (Promoteur)

### Guide 1: "Premier Coup d'Oeil Dashboard" ⭐

**ID:** `dashboard-overview`
**Durée:** 2 minutes
**Rôles:** Promoteur
**Difficulté:** Débutant
**Trigger:** onMount après onboarding, showOnce: true, delay: 2000ms

**Contenu:**

```json
{
  "id": "dashboard-overview",
  "title": "Premier Coup d'Oeil Dashboard",
  "subtitle": "Découvrez les principaux éléments de votre dashboard",
  "description": "Un tour rapide des stats, ventes, et navigation",
  "targetRoles": ["promoteur"],
  "estimatedDuration": 2,
  "difficulty": "beginner",
  "emoji": "🏠",
  "triggers": [
    {
      "type": "onMount",
      "condition": "isDashboardPage && isFirstVisitAfterOnboarding",
      "delay": 2000,
      "showOnce": true
    }
  ],
  "steps": [
    {
      "id": "step-1",
      "emoji": "👋",
      "title": "Bienvenue sur votre dashboard!",
      "description": "Vous êtes maintenant prêt à gérer votre bar. Voici un aperçu rapide des informations les plus importantes.",
      "elementSelector": null,
      "position": "center",
      "action": "Cliquez sur Suivant pour continuer",
      "tips": [
        "Toutes les informations se mettent à jour en temps réel",
        "Utilisez le bouton de synchronisation en haut à droite pour forcer la mise à jour"
      ],
      "media": {
        "type": "image",
        "url": "/guides/dashboard-welcome.png",
        "alt": "Vue d'ensemble du dashboard"
      }
    },
    {
      "id": "step-2",
      "emoji": "💰",
      "title": "Vos Revenus en Temps Réel",
      "description": "Le widget en haut à gauche affiche vos revenus d'aujourd'hui, les tendances, et la comparaison avec hier.",
      "elementSelector": "[data-guide='revenue-widget']",
      "position": "bottom",
      "action": "Cliquez sur le widget pour voir l'historique complet",
      "tips": [
        "Les revenus incluent TVA et frais",
        "Les données se mettent à jour chaque minute"
      ],
      "media": null
    },
    {
      "id": "step-3",
      "emoji": "⏳",
      "title": "Ventes en Attente de Validation",
      "description": "Cette section montre les ventes créées par vos serveurs qui attendent votre approbation. Vous pouvez les valider rapidement.",
      "elementSelector": "[data-guide='pending-sales']",
      "position": "bottom",
      "action": "Validez une vente en cliquant sur ✓ ou rejetez-la avec ✗",
      "tips": [
        "Validez en masse: cochez plusieurs ventes et cliquez 'Valider'",
        "Une vente rejetée est définitive : le serveur doit en créer une nouvelle si besoin"
      ],
      "media": null
    },
    {
      "id": "step-4",
      "emoji": "👥",
      "title": "Performance de Votre Équipe",
      "description": "Voyez qui performent le mieux aujourd'hui. Triez par ventes, revenu moyen, ou nombre de clients.",
      "elementSelector": "[data-guide='team-performance']",
      "position": "top",
      "action": "Cliquez sur l'en-tête d'une colonne pour trier",
      "tips": [
        "Vous pouvez exporter ce tableau en Excel",
        "Cliquez sur un serveur pour voir ses détails"
      ],
      "media": null
    },
    {
      "id": "step-5",
      "emoji": "🗺️",
      "title": "Navigation Principale",
      "description": "Utilisez le menu en haut pour accéder aux différentes sections du système.",
      "elementSelector": "[data-guide='main-nav']",
      "position": "bottom",
      "action": "Explorez les différentes sections",
      "tips": [
        "Inventaire: Gérer vos produits et stocks",
        "Analytics: Voir les rapports détaillés",
        "Comptabilité: Finances et dépenses",
        "Équipe: Gérer les rôles et accès",
        "Paramètres: Configurer votre bar"
      ],
      "media": null
    },
    {
      "id": "step-6",
      "emoji": "✅",
      "title": "C'est tout!",
      "description": "Vous êtes prêt! N'hésitez pas à revenir au guide si vous avez besoin d'aide. Cliquez sur le ? en bas à droite à tout moment.",
      "elementSelector": null,
      "position": "center",
      "action": "Cliquez 'Terminé' pour commencer",
      "tips": [
        "Il y a d'autres guides disponibles pour chaque section",
        "Votre feedback nous aide à améliorer!"
      ],
      "media": null
    }
  ]
}
```

---

### Guide 2: "Gérer Votre Inventaire" 📦

**ID:** `manage-inventory`
**Durée:** 3 minutes
**Rôles:** Promoteur, Gérant
**Difficulté:** Intermédiaire
**Trigger:** First access to Inventory page

```json
{
  "id": "manage-inventory",
  "title": "Gérer Votre Inventaire",
  "description": "Ajouter des produits, enregistrer les approvisionnements, suivre le stock",
  "targetRoles": ["promoteur", "gérant"],
  "estimatedDuration": 3,
  "difficulty": "intermediate",
  "emoji": "📦",
  "triggers": [
    {
      "type": "onAction",
      "condition": "firstClickOnInventoryNav && !completedGuide('manage-inventory')",
      "showOnce": true
    }
  ],
  "steps": [
    {
      "id": "step-1",
      "emoji": "📋",
      "title": "Bienvenue en Inventaire",
      "description": "Ici vous gérez tous vos produits, stocks, et approvisionnements. C'est le cœur de votre opération.",
      "elementSelector": null,
      "position": "center",
      "action": "Continuez pour voir comment",
      "tips": [
        "Tous les stocks sont en unités (pièces, bouteilles, etc)",
        "Les prix sont sauvegardés automatiquement"
      ],
      "media": null
    },
    {
      "id": "step-2",
      "emoji": "➕",
      "title": "Ajouter des Produits",
      "description": "Cliquez sur 'Ajouter Produit' pour ajouter de nouveaux produits à votre catalogue.",
      "elementSelector": "[data-guide='add-product-btn']",
      "position": "bottom",
      "action": "Cliquez sur le bouton pour ouvrir le formulaire",
      "tips": [
        "Vous pouvez ajouter plusieurs produits à la fois",
        "Les catégories vous aident à organiser"
      ],
      "media": null
    },
    {
      "id": "step-3",
      "emoji": "🚚",
      "title": "Enregistrer un Approvisionnement",
      "description": "Quand vous recevez des produits, enregistrez-les ici. Le stock se met à jour automatiquement.",
      "elementSelector": "[data-guide='supply-form']",
      "position": "top",
      "action": "Cliquez 'Nouveau Reçu' pour enregistrer",
      "tips": [
        "Gardez les reçus fournisseurs pour référence",
        "Vous pouvez entrer le coût d'acquisition"
      ],
      "media": null
    },
    {
      "id": "step-4",
      "emoji": "📊",
      "title": "Suivre Votre Stock",
      "description": "Le tableau montre vos niveaux de stock actuels. Regardez les colonnes 'Niveau Actuel' et 'Minimum'.",
      "elementSelector": "[data-guide='stock-table']",
      "position": "top",
      "action": "Triez par colonne pour voir les bas stocks",
      "tips": [
        "Les produits en rouge ont un stock faible",
        "Recevez des alertes quand le stock tombe sous le minimum"
      ],
      "media": null
    },
    {
      "id": "step-5",
      "emoji": "📈",
      "title": "Historique & Analytics",
      "description": "Consultez l'historique des mouvements de stock pour analyser votre consommation.",
      "elementSelector": "[data-guide='stock-history']",
      "position": "bottom",
      "action": "Cliquez sur une date pour voir les détails",
      "tips": [
        "Vous pouvez exporter l'historique en Excel",
        "Utilisez les dates pour identifier les tendances"
      ],
      "media": null
    },
    {
      "id": "step-6",
      "emoji": "💡",
      "title": "Pro Tips Inventaire",
      "description": "Quelques conseils pour optimiser votre gestion d'inventaire.",
      "elementSelector": null,
      "position": "center",
      "action": "Continuez pour terminer",
      "tips": [
        "Faites un inventaire physique une fois par semaine",
        "Vérifiez les discrepancies entre système et physique",
        "Utilisez les rapports pour prédire quand commander",
        "Gardez les anciens approvisionnements comme référence"
      ],
      "media": null
    }
  ]
}
```

---

### Guide 3: "Analyser Votre Performance" 📊

**ID:** `analytics-overview`
**Durée:** 3 minutes
**Trigger:** First access to Analytics page

```json
{
  "id": "analytics-overview",
  "title": "Analyser Votre Performance",
  "description": "Rapports, graphiques, et insights sur vos ventes",
  "targetRoles": ["promoteur"],
  "estimatedDuration": 3,
  "difficulty": "intermediate",
  "emoji": "📊",
  "triggers": [
    {
      "type": "onAction",
      "condition": "firstClickOnAnalyticsNav",
      "showOnce": true
    }
  ],
  "steps": [
    {
      "id": "step-1",
      "emoji": "📈",
      "title": "Bienvenue en Analytics",
      "description": "Ici vous voyez l'analyse complète de votre activité: ventes, tendances, et performance.",
      "elementSelector": null,
      "position": "center",
      "action": "Continuez",
      "tips": ["Les données se mettent à jour toutes les heures"],
      "media": null
    },
    {
      "id": "step-2",
      "emoji": "💰",
      "title": "Revenu par Période",
      "description": "Le graphique en haut montre votre revenu quotidien, hebdomadaire, ou mensuel selon ce que vous sélectionnez.",
      "elementSelector": "[data-guide='revenue-chart']",
      "position": "bottom",
      "action": "Cliquez sur la période pour changer la vue",
      "tips": [
        "Vous pouvez comparer avec la période précédente",
        "Hovertez pour voir les détails d'un jour"
      ],
      "media": null
    },
    {
      "id": "step-3",
      "emoji": "🏆",
      "title": "Produits Top",
      "description": "Voyez vos produits les plus vendus et les plus rentables.",
      "elementSelector": "[data-guide='top-products']",
      "position": "bottom",
      "action": "Triez par 'Revenu' ou 'Quantité'",
      "tips": [
        "Utilisez ces données pour vos promotions",
        "Mettez en avant vos produits rentables"
      ],
      "media": null
    },
    {
      "id": "step-4",
      "emoji": "👥",
      "title": "Performance par Serveur",
      "description": "Qui sont vos meilleurs vendeurs? Voyez la performance individuelle.",
      "elementSelector": "[data-guide='server-perf']",
      "position": "top",
      "action": "Cliquez sur un serveur pour voir ses détails",
      "tips": [
        "Félicitez vos top performers",
        "Identifiez qui a besoin de support"
      ],
      "media": null
    },
    {
      "id": "step-5",
      "emoji": "📥",
      "title": "Exporter & Rapports",
      "description": "Téléchargez tous ces rapports en Excel, PDF, ou autres formats.",
      "elementSelector": "[data-guide='export-btn']",
      "position": "bottom",
      "action": "Cliquez sur 'Exporter' pour télécharger",
      "tips": [
        "Idéal pour les réunions avec votre comptable",
        "Créez des rapports hebdomadaires automatiquement"
      ],
      "media": null
    }
  ]
}
```

---

### Guides 4 & 5: Shorter Format

**Guide 4: "Gérer Votre Équipe"** - 2 min
- ID: `manage-team`
- Trigger: First access to Team section
- Steps: Add Manager, Create Server Accounts, Assign Roles, View Permissions

**Guide 5: "Paramètres & Configuration"** - 2 min
- ID: `manage-settings`
- Trigger: First access to Settings section
- Steps: Bar Info, Operating Modes, Horaires, Integrations

---

## 👔 GUIDES GÉRANT (Manager)

### Guide 1: "Votre Espace Gérant" 👔

**ID:** `manager-dashboard`
**Durée:** 2 minutes
**Rôles:** Gérant
**Difficulté:** Débutant
**Trigger:** onMount après onboarding, showOnce: true

```json
{
  "id": "manager-dashboard",
  "title": "Votre Espace Gérant",
  "description": "Créez des ventes, validez, et suivez l'inventaire",
  "targetRoles": ["gérant"],
  "estimatedDuration": 2,
  "difficulty": "beginner",
  "emoji": "👔",
  "triggers": [
    {
      "type": "onMount",
      "condition": "isDashboard && isFirstVisitAfterOnboarding && role === 'gérant'",
      "delay": 2000,
      "showOnce": true
    }
  ],
  "steps": [
    {
      "id": "step-1",
      "emoji": "👋",
      "title": "Bienvenue, Gérant!",
      "description": "Vous voyez ici les informations importantes pour gérer votre équipe et l'inventaire.",
      "elementSelector": null,
      "position": "center",
      "action": "Continuez",
      "tips": null,
      "media": null
    },
    {
      "id": "step-2",
      "emoji": "➕",
      "title": "Créer une Vente",
      "description": "Le gros bouton bleu en haut. Cliquez pour créer une nouvelle vente.",
      "elementSelector": "[data-guide='create-sale-btn']",
      "position": "bottom",
      "action": "Cliquez pour ouvrir le formulaire de vente",
      "tips": [
        "Vous créez les ventes comme les serveurs",
        "Les vôtres se valident automatiquement"
      ],
      "media": null
    },
    {
      "id": "step-3",
      "emoji": "✅",
      "title": "Valider les Ventes",
      "description": "Les ventes de vos serveurs apparaissent ici. Validez-les en masse ou individuellement.",
      "elementSelector": "[data-guide='pending-sales']",
      "position": "bottom",
      "action": "Cliquez ✓ pour valider ou ✗ pour rejeter",
      "tips": [
        "Rejet = la vente est définitivement rejetée (le serveur doit en recréer une si besoin)",
        "Validation = la vente est finale"
      ],
      "media": null
    },
    {
      "id": "step-4",
      "emoji": "✅",
      "title": "C'est parti!",
      "description": "Vous êtes prêt! D'autres guides sont disponibles pour l'inventaire et analytics.",
      "elementSelector": null,
      "position": "center",
      "action": "Cliquez 'Terminé'",
      "tips": null,
      "media": null
    }
  ]
}
```

### Guide 2: "Gérer l'Inventaire (Gérant)" - 2 min
- Similar to owner guide but with limitations noted
- ID: `manager-inventory`
- Note: Cannot add products (read-only or limited)

### Guide 3: "Voir les Analytics (Gérant)" - 2 min
- Similar to owner analytics but focused on team performance
- ID: `manager-analytics`

---

## 🍺 GUIDES BARMAN (Serveur)

### Guide 1: "Créer Votre Première Vente" 🍺

**ID:** `create-first-sale`
**Durée:** 3 minutes
**Rôles:** Serveur
**Difficulté:** Débutant
**Trigger:** onMount après onboarding, showOnce: true

```json
{
  "id": "create-first-sale",
  "title": "Créer Votre Première Vente",
  "description": "Pas à pas pour créer une vente complète",
  "targetRoles": ["serveur"],
  "estimatedDuration": 3,
  "difficulty": "beginner",
  "emoji": "🍺",
  "triggers": [
    {
      "type": "onMount",
      "condition": "isDashboard && isFirstVisitAfterOnboarding && role === 'serveur'",
      "delay": 2000,
      "showOnce": true
    }
  ],
  "steps": [
    {
      "id": "step-1",
      "emoji": "🍺",
      "title": "Créer Votre Première Vente",
      "description": "Chaque vente que vous créez compte dans le système et dans vos stats personnelles.",
      "elementSelector": null,
      "position": "center",
      "action": "Continuez pour apprendre",
      "tips": ["C'est simple et rapide!"],
      "media": null
    },
    {
      "id": "step-2",
      "emoji": "➕",
      "title": "Cliquez '+Créer Vente'",
      "description": "Le gros bouton bleu en haut. C'est là que tout commence.",
      "elementSelector": "[data-guide='quick-sale-btn']",
      "position": "bottom",
      "action": "Cliquez pour ouvrir le formulaire",
      "tips": ["Rapide: ~30 secondes par vente"],
      "media": null
    },
    {
      "id": "step-3",
      "emoji": "🍺",
      "title": "Sélectionner les Produits",
      "description": "Choisissez les produits vendus. Vous pouvez en ajouter plusieurs à une même vente.",
      "elementSelector": "[data-guide='product-selector']",
      "position": "bottom",
      "action": "Cliquez sur les produits pour les ajouter",
      "tips": [
        "Vous pouvez ajuster les quantités",
        "Cherchez par nom si liste longue"
      ],
      "media": null
    },
    {
      "id": "step-4",
      "emoji": "🎟️",
      "title": "Appliquer une Promo (Optionnel)",
      "description": "S'il y a une promo active, vous pouvez l'appliquer. Sinon, sautez cette étape.",
      "elementSelector": "[data-guide='promo-selector']",
      "position": "bottom",
      "action": "Sélectionnez une promo ou continuez",
      "tips": ["Seules les promos actives apparaissent"],
      "media": null
    },
    {
      "id": "step-5",
      "emoji": "💳",
      "title": "Sélectionner le Paiement",
      "description": "Comment le client a-t-il payé? Cash ou Carte?",
      "elementSelector": "[data-guide='payment-method']",
      "position": "bottom",
      "action": "Cliquez sur la méthode de paiement",
      "tips": [
        "Cash = argent reçu immédiatement",
        "Carte = le gérant vérifie après"
      ],
      "media": null
    },
    {
      "id": "step-6",
      "emoji": "✅",
      "title": "Valider la Vente",
      "description": "Cliquez le gros bouton bleu pour finalisé la vente. C'est fini!",
      "elementSelector": "[data-guide='submit-sale-btn']",
      "position": "bottom",
      "action": "Cliquez 'Créer Vente' pour confirmer",
      "tips": [
        "Vous recevrez une confirmation",
        "La vente peut être validée par votre gérant si besoin"
      ],
      "media": null
    },
    {
      "id": "step-7",
      "emoji": "🎉",
      "title": "Bravo!",
      "description": "Vous avez créé votre première vente! Elle compte maintenant dans vos stats et celles du bar.",
      "elementSelector": null,
      "position": "center",
      "action": "Continuez",
      "tips": [
        "Créez autant de ventes que nécessaire",
        "Votre performance est suivie en temps réel",
        "Consultez le guide 'Voir Votre Performance' pour vos stats"
      ],
      "media": null
    }
  ]
}
```

### Guide 2: "Voir Votre Performance" - 2 min
- ID: `bartender-stats`
- Shows: Today's sales, Top products, Comparison with team
- Trigger: First access to Stats section

---

## 📊 Matrice de Distribution

```
┌─────────────────┬──────────────────────┬──────────────┐
│ Guide ID        │ Rôles                │ Trigger      │
├─────────────────┼──────────────────────┼──────────────┤
│ dashboard-ov    │ promoteur             │ onMount      │
│ manage-inv      │ promoteur, gérant     │ firstAccess  │
│ analytics-ov    │ promoteur             │ firstAccess  │
│ manage-team     │ promoteur             │ firstAccess  │
│ manage-settings │ promoteur             │ firstAccess  │
│ manager-dash    │ gérant                │ onMount      │
│ manager-inv     │ gérant                │ firstAccess  │
│ manager-ana     │ gérant                │ firstAccess  │
│ first-sale      │ serveur               │ onMount      │
│ bartender-stats │ serveur               │ firstAccess  │
└─────────────────┴──────────────────────┴──────────────┘
```

---

## 🔄 Conditions de Trigger

```typescript
// Trigger conditions used in guides

type TriggerCondition =
  | 'onMount'                           // On component load
  | 'firstClickOnNav'                   // First time user clicks nav item
  | 'firstPageAccess'                   // First time visiting page
  | 'featureAvailable'                  // Feature becomes available
  | 'specificAction'                    // User performs specific action
  | 'after_onboarding_complete'         // Immediately after onboarding
  | 'user_profile_complete'             // After user sets up profile
  | 'has_created_first_sale'            // After first sale created

// Example in guide data:
{
  "triggers": [
    {
      "type": "onMount",
      "condition": "isDashboardPage && isFirstVisitAfterOnboarding && role === 'promoteur'",
      "delay": 2000,
      "showOnce": true
    }
  ]
}
```

---

## 🎯 Success Metrics

### Guide Completion Rate
- Target: >60% completion for first guide
- Track: % users who finish vs skip

### Guide Helpfulness
- 1-5 star rating at end
- Target: >4.0 average rating
- Action: Improve low-rated guides

### Time to Proficiency
- Metric: Time from onboarding to first successful sale/inventory action
- Hypothesis: Guides reduce this by 30%

### Support Reduction
- Track: Support tickets mentioning "how do I..."
- Hypothesis: Guides reduce common questions by 50%

---

## 🚀 Content Management

### Future Features

1. **A/B Testing Wording**
   - Test different step descriptions
   - Track which converts better

2. **Localization**
   - Guides already i18n ready
   - Add: FR, EN, ES, IT, DE easily

3. **Video Integration**
   - Replace static images with video demos
   - Record using tool like Loom

4. **Feedback Loop**
   - "Was this helpful?" at end
   - Collect comments
   - Admin dashboard to review

5. **Analytics Dashboard**
   - % completion by guide
   - Drop-off points
   - Most re-read guides
   - User segments (new vs returning)

---

**Tous les guides sont prêts pour l'implémentation! 🎯**
