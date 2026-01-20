/**
 * Unified Guides (Promoteur + Gérant)
 * Complete guides for bar owners and managers to master the system
 * Role-based step filtering: some steps visible only to specific roles
 * Test case: dashboard-overview (Phase 1)
 */

import { GuideTour } from '@/types/guide';

/**
 * Guide 1: Dashboard Overview
 * First guide shown after onboarding (test case for Phase 1)
 */
export const DASHBOARD_OVERVIEW_GUIDE: GuideTour = {
  id: 'dashboard-overview',
  title: 'Vue d\'ensemble du Tableau de Bord',
  subtitle: 'Maîtrisez votre centre de gestion de bar',
  description: 'Visite rapide des éléments essentiels de votre tableau de bord',

  targetRoles: ['promoteur', 'gerant'],

  estimatedDuration: 2,
  difficulty: 'beginner',
  emoji: '🏠',
  version: 1,

  triggers: [
    {
      type: 'onMount',
      condition: 'isDashboardPage && isFirstVisitAfterOnboarding',
      delay: 2000,
      showOnce: true,
    },
  ],

  steps: [
    {
      id: 'step-1',
      emoji: '👋',
      title: 'Bienvenue sur votre Tableau de Bord !',
      description:
        'Vous êtes maintenant prêt à gérer votre bar. Cette visite rapide vous montre les informations les plus importantes en un coup d\'œil.',
      position: 'center',
      action: 'Cliquez sur Suivant pour continuer',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        'Toutes les informations se mettent à jour en temps réel',
        'Utilisez le bouton Actualiser (en haut à droite) pour forcer une mise à jour',
        'Mettez cette page en favori pour y accéder rapidement',
      ],
    },

    {
      id: 'step-2',
      emoji: '💰',
      title: 'Votre Chiffre d\'Affaires du Jour',
      description:
        'Le widget en haut à gauche affiche votre chiffre d\'affaires net pour la journée commerciale actuelle. Autres informations du tableau de bord : Nombre de Ventes, Alertes, Retours, Consignations.',
      elementSelector: '[data-guide="revenue-widget"]',
      position: 'bottom',
      action: 'Consultez votre CA net',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '**CA Net** = Ventes - Retours remboursés - Réductions promotions',
        'Les métriques Ventes, Articles, Alertes et Retours concernent uniquement la journée commerciale en cours.',
        'La métrique **Consignations** inclut toutes les consignations actives',
        'Les données se mettent à jour en temps réel',
      ],
    },

    {
      id: 'step-3',
      emoji: '⏳',
      title: 'Ventes en Attente de Validation',
      description:
        'En mode complet uniquement : cette section affiche les ventes initiées par vos serveurs en attente de votre approbation. Les serveurs initient les commandes, vous consultez les détails, préparez les produits, puis validez après remise au serveur.',
      elementSelector: '[data-guide="pending-sales"]',
      position: 'bottom',
      action: 'Cliquez sur ✓ pour valider ou ✗ pour rejeter',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        'Validation en masse: cochez plusieurs ventes et cliquez sur Valider',
        'Vous pouvez rejeter pour diverses raisons (erreur produit, quantité, etc.)',
        'Les ventes rejetées peuvent être modifiées par le serveur',
        'Expiration automatique à la fin de la journée commerciale',
      ],
    },

    {
      id: 'step-4',
      emoji: '👥',
      title: 'Performance de l\'Équipe',
      description:
        'Voyez la performance de chaque membre de votre équipe pour la journée commerciale actuelle. Suivez les ventes validées et le chiffre d\'affaires généré par chacun.',
      elementSelector: '[data-guide="team-performance"]',
      position: 'top',
      action: 'Consultez les performances de l\'équipe',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        'Les statistiques se mettent à jour en temps réel',
        'Seules les ventes validées sont comptabilisées',
        'Utilisez ces données pour faire le point journalier par serveur et pour motiver/récompenser vos meilleurs éléments',
      ],
    },

    {
      id: 'step-5',
      emoji: '👁️',
      title: 'Détails Avancés',
      description:
        'Cliquez sur "Voir les détails" pour afficher des informations supplémentaires : vos top produits du jour et les produits en alerte stock. Ces données vous aident à optimiser vos commandes et à anticiper les ruptures.',
      position: 'bottom',
      action: 'Cliquez sur le bouton pour voir les détails',
      visibleFor: ['promoteur'],
      tips: [
        '🏆 Top produits: Les 3 produits les plus vendus avec leurs quantités',
        '⚠️ Alertes stock: Les produits proches de la rupture (max 5 affichés)',
        'Message ✅ Stocks OK si aucune alerte',
        'Utilisez ces données pour anticiper votre prochain réapprovisionnement',
      ],
    },

    {
      id: 'step-6',
      emoji: '📱',
      title: 'Exporter & Fermer la Caisse',
      description:
        'En bas du tableau de bord, deux actions importantes : exporter votre rapport journalier sur WhatsApp et fermer votre caisse. Le rapport inclut votre CA, vos ventes, vos retours et vos top produits.',
      position: 'top',
      action: 'Découvrez ces actions essentielles',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📱 Bouton **WhatsApp** : Envoie un rapport journalier formaté (CA, ventes, articles, retours, top produits)',
        '🔒 Bouton **Fermer caisse** : Marque la fin de votre journée commerciale (managers/promoteurs uniquement)',
        'La caisse fermée déclenche automatiquement l\'export WhatsApp',
        'Vous pouvez exporter plusieurs fois sans fermer la caisse',
      ],
    },

    {
      id: 'step-7',
      emoji: '✅',
      title: 'Vous Êtes Prêt !',
      description:
        'Félicitations ! Vous maîtrisez maintenant tous les éléments du tableau de bord. Pour explorer d\'autres fonctionnalités, ouvrez le menu hamburger (☰) en haut à droite : Inventaire, Historique, Équipe, Paramètres, etc. Chaque section a son propre guide.',
      position: 'center',
      action: 'Cliquez sur Fermer pour commencer',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '☰ Menu hamburger en haut à droite pour naviguer vers autres sections',
        'Guides spécifiques disponibles pour chaque section',
        'Vos retours nous aident à améliorer l\'application',
        'Bonne gestion de votre bar ! 🎉',
      ],
    },
  ],
};

/**
 * Guide 2: Inventory Management
 * Complete guide for managing products and stock
 */
export const MANAGE_INVENTORY_GUIDE: GuideTour = {
  id: 'manage-inventory',
  title: 'Gestion de l\'Inventaire',
  subtitle: 'Maîtrisez votre stock et vos produits',
  description: 'Guide complet pour gérer vos produits, stocks et approvisionnements',

  targetRoles: ['promoteur', 'gerant'],

  estimatedDuration: 3,
  difficulty: 'beginner',
  emoji: '📦',
  version: 1,

  triggers: [
    {
      type: 'onMount',
      condition: 'isInventoryPage',
      delay: 1500,
      showOnce: false, // Utilisateur peut relancer le guide
    },
  ],

  steps: [
    {
      id: 'step-1',
      emoji: '👋',
      title: 'Bienvenue à la Gestion des Produits !',
      description:
        'Cette page vous permet de gérer tous les produits de votre bar. Maîtrisez la différence entre votre **Stock Physique** (quantité réelle au bar) et votre **Stock Vendable** (disponible à la vente, hors consignations).',
      position: 'center',
      action: 'Cliquez sur Suivant',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        'Organisez vos produits par catégorie',
        'Surveillez vos **Marges Commerciales** en temps réel',
        'Les alertes stock vous avertissent du réapprovisionnement nécessaire',
      ],
    },

    {
      id: 'step-2',
      emoji: '🔍',
      title: 'Rechercher et Trier',
      description:
        'Utilisez la barre de recherche pour trouver rapidement un produit. Vous pouvez aussi trier par catégorie, ordre alphabétique ou niveau de stock.',
      elementSelector: '[data-guide="inventory-search"]',
      position: 'bottom',
      action: 'Tapez le nom d\'un produit pour le trouver',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        'La recherche est instantanée et en temps réel',
        'Triez par stock pour voir les produits en alerte en premier',
        'Les tris se combinent avec la recherche',
      ],
    },

    {
      id: 'step-3',
      emoji: '⚠️',
      title: 'Surveiller les Alertes Stock',
      description:
        'La section "Alertes Stock" affiche tous les produits dont le stock est en dessous du seuil d\'alerte. Vous devez les approvisionner rapidement.',
      elementSelector: '[data-guide="inventory-alerts"]',
      position: 'bottom',
      action: 'Cliquez sur la section pour voir les détails',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        'Chaque produit a un seuil d\'alerte configurable',
        'Une alerte verte signifie que tous les stocks vont bien',
        'Approvisionner rapidement pour éviter les ruptures',
      ],
    },

    {
      id: 'step-4',
      emoji: '📊',
      title: 'Tableau des Catégories',
      description:
        'Consultez le nombre total de produits par catégorie. Cela vous aide à équilibrer votre offre et à identifier les catégories en manque de produits.',
      elementSelector: '[data-guide="inventory-categories"]',
      position: 'bottom',
      action: 'Cliquez pour développer le tableau détaillé',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        'Chaque catégorie a son nombre de produits et d\'alertes',
        'Assurez-vous d\'avoir une bonne diversité par catégorie',
        'Équilibrez l\'offre selon la demande',
      ],
    },

    {
      id: 'step-5',
      emoji: '➕',
      title: 'Ajouter un Nouveau Produit',
      description:
        'Bouton Ajouter → Choix (Manuel ou Catalogue) → Saisie des prix/stocks → Validation.',
      elementSelector: '[data-guide="inventory-add-btn"]',
      position: 'bottom',
      action: 'Cliquez pour ouvrir le formulaire d\'ajout',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🎨 Produit personnalisé : Créez un produit unique avec nom, prix, catégorie et stock initial',
        '📚 Catalogue global : Sélectionnez parmi les produits pré-enregistrés dans l\'application',
        'Définissez le seuil d\'alerte basé sur votre cycle de commande',
      ],
    },

    {
      id: 'step-6',
      emoji: '🚚',
      title: 'Approvisionner Rapidement',
      description:
        'Bouton Approvisionnement → Sélection produit → Qté par lot (ex: carton) → Validation.',
      elementSelector: '[data-guide="inventory-supply-btn"]',
      position: 'bottom',
      action: 'Cliquez pour ouvrir le formulaire d\'approvisionnement',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📦 Quantité par lot : Nombre d\'unités dans un lot (ex: 1 carton = 24 bouteilles)',
        '🔢 Quantité totale : Nombre de lots × quantité par lot (ex: 5 cartons × 24 = 120 bouteilles ajoutées)',
        'Enregistrez toujours le fournisseur et le coût pour suivre vos dépenses',
      ],
    },

    {
      id: 'step-7',
      emoji: '💰',
      title: 'Analyser les Marges',
      description:
        'Chaque produit affiche son prix de vente, son **Coût moyen** et sa **Marge commerciale**. Une marge saine est généralement **> 30%**.',
      elementSelector: '[data-guide="inventory-table"]',
      position: 'top',
      action: 'Consultez les colonnes Coût moyen et Marge',
      visibleFor: ['promoteur'],
      tips: [
        '📊 **Coût moyen** = moyenne pondérée des approvisionnements (somme des coûts / quantité totale achetée)',
        '📈 **Stock Physique** = quantité réelle en magasin | **Stock Vendable** = Physique - Consignations actives',
        'Une marge rouge (< 30%) signifie que le produit n\'est pas rentable. Augmentez le prix ou réduisez le coût',
      ],
    },

    {
      id: 'step-8',
      emoji: '✏️',
      title: 'Modifier un Produit',
      description:
        'Cliquez sur l\'icône de modification pour éditer les informations d\'un produit : prix, catégorie, seuil d\'alerte, etc.',
      elementSelector: '[data-guide="inventory-edit-btn"]',
      position: 'top',
      action: 'Cliquez sur l\'icône stylo pour modifier',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '✏️ Les managers peuvent modifier prix, catégorie, seuil d\'alerte (mais pas le stock initial)',
        'Les managers peuvent également supprimer un produit si nécessaire',
        'Les modifications de prix ne sont pas rétroactives (ventes passées inchangées)',
      ],
    },

    {
      id: 'step-9',
      emoji: '📥',
      title: 'Importer des Produits en Masse',
      description:
        'Si vous avez beaucoup de produits à ajouter, utilisez le bouton "Importer" pour charger un fichier Excel avec tous vos produits. (Disponible si activé dans paramètres)',
      elementSelector: '[data-guide="inventory-import-btn"]',
      position: 'bottom',
      action: 'Cliquez pour importer des produits',
      visibleFor: ['promoteur'],
      tips: [
        '📊 Préparez un fichier Excel (.xlsx) avec les colonnes : nom, prix, catégorie, stock',
        'Vous économisez du temps si vous avez 50+ produits à ajouter',
        'Les données en doublon sont détectées automatiquement',
      ],
    },

    {
      id: 'step-10',
      emoji: '✅',
      title: 'Vous Êtes Prêt à Gérer votre Inventaire !',
      description:
        'Vous avez maintenant tous les outils pour gérer efficacement votre inventaire. Commencez à ajouter des produits et à surveiller vos stocks.',
      position: 'center',
      action: 'Cliquez sur Terminer pour commencer',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        'Vérifiez régulièrement les alertes stock',
        'Analysez les marges pour optimiser vos prix',
        'Utilisez les données pour prendre des décisions d\'achat éclairées',
      ],
    },
  ],
};

/**
 * Guide 3: Returns Management
 * Complete guide for managing product returns
 */
export const MANAGE_RETURNS_GUIDE: GuideTour = {
  id: 'manage-returns',
  title: 'Gestion des Retours',
  subtitle: 'Gérez les retours et remboursements',
  description: 'Guide complet pour traiter les retours de produits et gérer les remboursements',

  targetRoles: ['promoteur', 'gerant'],

  estimatedDuration: 3,
  difficulty: 'intermediate',
  emoji: '↩️',
  version: 1,

  triggers: [
    {
      type: 'onMount',
      condition: 'isReturnsPage',
      delay: 1500,
      showOnce: false,
    },
  ],

  steps: [
    {
      id: 'step-1',
      emoji: '👋',
      title: 'Bienvenue à la Gestion des Retours !',
      description:
        'Cette page vous permet de traiter les retours de produits : défectueux, erreur de commande, produits non consommés, etc.',
      position: 'center',
      action: 'Cliquez sur Suivant pour continuer',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '⏰ Retours autorisés UNIQUEMENT avant fermeture caisse (défaut: 6h du matin)',
        '📅 Seules les ventes de la journée commerciale actuelle peuvent être retournées',
        'Chaque type de retour a des règles automatiques (remboursement, remise en stock)',
      ],
    },

    {
      id: 'step-2',
      emoji: '⚙️',
      title: 'Types de Retours',
      description:
        '5 types de retours disponibles : Défectueux (remboursé seulement), Erreur article (remboursé + remis en stock), Non consommé (remis en stock seulement), Périmé (remboursé seulement), Autre (manuel).',
      elementSelector: '[data-guide="returns-reasons"]',
      position: 'bottom',
      action: 'Consultez les différents types',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        'Défectueux: le produit est détruit, pas remis en stock',
        'Erreur article: compensé au client et restocké',
        'Non consommé: pas de remboursement, mais remis en stock',
        'Périmé: remboursement sans restockage',
        'Autre: vous décidez manuellement',
      ],
    },

    {
      id: 'step-3',
      emoji: '🔍',
      title: 'Chercher une Vente à Retourner',
      description:
        'Utilisez le filtre par serveur et la recherche produit pour trouver rapidement la vente à retourner. Les ventes du jour uniquement sont retournables.',
      elementSelector: '[data-guide="returns-search"]',
      position: 'bottom',
      action: 'Sélectionnez un serveur, puis cherchez le produit',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '👤 Filtre Serveur: Choisissez le serveur qui a vendu (si plusieurs serveurs)',
        '🔍 Recherche Produit: Tapez le nom du produit à retourner (ex: Guinness)',
        'Les ventes sont triées par heure (plus récentes d\'abord)',
      ],
    },

    {
      id: 'step-4',
      emoji: '📋',
      title: 'Créer un Retour',
      description:
        'Sélection de la vente → Choix du produit → Saisie quantité → Motif → Confirmation.',
      elementSelector: '[data-guide="returns-create-btn"]',
      position: 'bottom',
      action: 'Cliquez pour créer un nouveau retour',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '1️⃣ Vente: Sélectionnez la vente du jour (affiche serveur, heure, total)',
        '2️⃣ Produit: Choisissez LE produit à retourner dans la vente',
        '3️⃣ Quantité: Indiquez combien (max = quantité vendue - retours/consignations)',
        '4️⃣ Motif: Choisissez le type (Défectueux, Erreur, Non consommé, Périmé, Autre)',
      ],
    },

    {
      id: 'step-5',
      emoji: '📝',
      title: 'Vérifier et Créer le Retour',
      description:
        'Avant de confirmer, vérifiez le montant remboursé et si le stock sera remis en stock selon le motif. ⚠️ Le retour créé n\'est qu\'un retour EN ATTENTE - vous devez l\'approuver ensuite pour que le remboursement soit effectif.',
      elementSelector: '[data-guide="returns-create-btn"]',
      position: 'bottom',
      action: 'Vérifiez les détails et créez le retour',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '💰 Montant remboursé: Calculé automatiquement selon le motif (quantité × prix unitaire)',
        '📦 Remise en stock: Certains motifs remettent en stock (Erreur, Non consommé), d\'autres non (Défectueux, Périmé)',
        '⏳ Statut EN ATTENTE: Le retour est créé mais pas encore approuvé (remboursement pas débité)',
      ],
    },

    {
      id: 'step-6',
      emoji: '⏳',
      title: 'Consulter et Filtrer les Retours',
      description:
        'Après création, le retour est **EN ATTENTE**. Utilisez les filtres de **Période** et de **Statut** (En attente, Approuvé, Rejeté) pour retrouver vos retours.',
      elementSelector: '[data-guide="returns-search"]',
      position: 'bottom',
      action: 'Consultez vos retours par période et statut',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📅 Filtres: Périodes prédéfinies (Aujourd\'hui, 7 jours, 30 jours)',
        '🔍 Statuts: Filtrez pour voir uniquement ce qu\'il reste à approuver',
        '⏳ Statut **EN ATTENTE**: Le retour est créé mais pas encore finalisé',
      ],
    },

    {
      id: 'step-7',
      emoji: '✅',
      title: '⚠️ ÉTAPE CRUCIALE : Approuver le Retour',
      description:
        'C\'EST ICI QUE LE RETOUR EST FINALISÉ. Cliquez sur **APPROUVER** pour que le remboursement soit effectif et le stock mis à jour selon le motif.',
      elementSelector: '[data-guide="returns-status"]',
      position: 'bottom',
      action: 'Cliquez sur APPROUVER pour finaliser',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '✅ **APPROUVER**: Le remboursement est débité, le stock **Restauré** (si Erreur/Non consommé) ou **Perdu** (si Défectueux/Périmé)',
        '❌ **REJETER**: Le retour est annulé, aucune modification financière ou de stock',
      ],
    },

    {
      id: 'step-8',
      emoji: '✅',
      title: 'Vous Êtes Prêt a Gérer les Retours !',
      description:
        'Vous pouvez maintenant traiter efficacement les retours de produits. Créez des retours avant fermeture caisse, consultez-les par période.',
      position: 'center',
      action: 'Cliquez sur Terminer pour commencer',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '⏰ Les retours ne peuvent être créés que AVANT la fermeture caisse',
        '📅 Consultez les retours par période pour audit et analyse',
        '💰 Les retours affectent le stock et les finances du bar',
      ],
    },
  ],
};

/**
 * Guide 4: Consignments Management
 * Complete guide for managing consigned products
 */
export const MANAGE_CONSIGNMENTS_GUIDE: GuideTour = {
  id: 'manage-consignments',
  title: 'Gestion des Consignations',
  subtitle: 'Gérez le stock payé mais non consommé',
  description: 'Guide complet pour gérer les produits consignés (payés) que les clients viendront récupérer plus tard.',

  targetRoles: ['promoteur', 'gerant'],

  estimatedDuration: 3,
  difficulty: 'intermediate',
  emoji: '📦',
  version: 2,

  triggers: [
    {
      type: 'onMount',
      condition: 'isConsignmentPage',
      delay: 1500,
      showOnce: false,
    },
  ],

  steps: [
    {
      id: 'step-1',
      emoji: '👋',
      title: 'Bienvenue à la Gestion des Consignations !',
      description:
        'La consignation concerne les produits **DÉJÀ PAYÉS** (vente effectuée) mais que le client n\'a pas pu consommer immédiatement. Ces produits restent dans votre **Stock Physique**, mais sont retirés du **Stock Vendable**.',
      position: 'center',
      action: 'Suivant',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📦 Stock Physique : Quantité totale réellement présente dans le bar',
        '🔒 Stock Vendable : Stock Physique - Consignations actives',
        '⏳ Délai : Paramétrable (7j par défaut). Après ce délai, le gérant décide de confisquer ou non',
      ],
    },

    {
      id: 'step-2',
      emoji: '➕',
      title: 'Créer une Consignation',
      description:
        'Sélectionnez la vente du jour → Choisissez le produit à consigner → Indiquez la quantité → Remplissez les infos client.',
      elementSelector: '[data-guide="consignments-create-tab"]',
      position: 'bottom',
      action: 'Suivant',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '⚠️ Seules les ventes payées de la journée peuvent être consignées',
        '📋 Le nom du client est obligatoire pour le suivi',
      ],
    },

    {
      id: 'step-3',
      emoji: '⏳',
      title: 'Consignations Actives',
      description:
        'Consultez les produits mis de côté. Chaque ligne propose deux actions cruciales : **Récupérer** ou **Confisquer**. L\'expiration du délai affiche une alerte, mais l\'action (décision) reste manuelle.',
      elementSelector: '[data-guide="consignments-active-tab"]',
      position: 'bottom',
      action: 'Suivant',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '✅ RÉCUPÉRER : Le client vient chercher ses bouteilles',
        '❌ CONFISQUER : Le client a dépassé le délai, le bar réintègre le produit dans son stock à vendre',
      ],
    },

    {
      id: 'step-4',
      emoji: '🥃',
      title: 'Action : Récupérer',
      description:
        'Quand le client vient réclamer son produit, cliquez sur **RÉCUPÉRER**. Cela diminue votre **Stock Physique** (le produit quitte le bar). Le **Stock Vendable** n\'est pas impacté car il y était déjà déduit à la création.',
      elementSelector: '[data-guide="consignments-active-tab"]',
      position: 'bottom',
      action: 'Suivant',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '� Le produit sort physiquement de l\'établissement',
        '📋 L\'action est enregistrée dans l\'historique',
      ],
    },

    {
      id: 'step-5',
      emoji: '🔒',
      title: 'Action : Confisquer',
      description:
        'Si le délai est expiré ou si le client renonce, cliquez sur **CONFISQUER**. Le produit est réintégré dans votre **Stock Vendable** (il redevient disponible à la vente). Le **Stock Physique** reste inchangé car le produit est toujours là.',
      elementSelector: '[data-guide="consignments-active-tab"]',
      position: 'bottom',
      action: 'Suivant',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '� Réintégration : Le produit redevient disponible pour de nouveaux clients',
        '⚠️ Cette action n\'est pas automatique après expiration du délai de consignation, elle requiert votre validation',
      ],
    },

    {
      id: 'step-6',
      emoji: '📊',
      title: 'Historique et Traçabilité',
      description:
        'L\'onglet Historique permet d\'auditer toutes les actions passées. Vous pouvez filtrer par **nature d\'action** : récupérés, expirés ou confisqués.',
      elementSelector: '[data-guide="consignments-history-tab"]',
      position: 'bottom',
      action: 'Terminer',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📅 Filtrez pour vos bilans stocks par statut de consignation',
        '🔍 Utile pour vérifier les litiges clients',
      ],
    },
  ],
};

/**
 * Guide 5: Sales History & Analytics
 * Comprehensive guide covering the 3 views: List, Cards, and Analytics
 */
export const HISTORIQUE_GUIDE: GuideTour = {
  id: 'analytics-overview', // Keeping ID same for trigger consistency
  title: 'Historique et Analytics',
  subtitle: 'Analysez vos performances en détail',
  description: 'Apprenez à naviguer entre les vues et à interpréter vos graphiques de vente.',

  targetRoles: ['promoteur', 'gerant'],

  estimatedDuration: 5,
  difficulty: 'intermediate',
  emoji: '📊',
  version: 2,

  triggers: [
    {
      type: 'onMount',
      condition: 'isAnalyticsPage',
      delay: 1500,
      showOnce: false,
    },
  ],

  steps: [
    {
      id: 'step-1',
      emoji: '📊',
      title: 'Trois Vues, Un Objectif',
      description: 'Basculez entre les modes **Liste** (détail), **Carte** (visuel rapide) et **Analytics** (analyse globale) pour une vision complète.',
      position: 'center',
      visibleFor: ['promoteur', 'gerant'],
      tips: ['Utilisez les icônes en haut à droite pour changer de vue'],
    },
    {
      id: 'step-2',
      emoji: '🔍',
      title: 'Maîtrisez les Filtres',
      description: 'Affinez vos résultats par **Période** (aujourd\'hui, hier, 7 derniers jours, 30 derniers jours, personnalisé) → **Vendeur** → ou via la **Recherche** par ID de la vente ou du produit.',
      elementSelector: '[data-guide="sales-filters"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: ['Les filtres s\'appliquent instantanément à toutes les vues'],
    },
    {
      id: 'step-3',
      emoji: '📈',
      title: 'Évolution du CA',
      description: 'Suivez vos pics d\'activité. Le graphique s\'adapte automatiquement : **Par heure** pour la journée → **Par jour** pour la semaine → **Par semaine** pour le mois.',
      elementSelector: '[data-guide="analytics-charts"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: ['Pratique pour identifier vos heures et vos joursde forte affluence'],
    },
    {
      id: 'step-4',
      emoji: '🍰',
      title: 'Répartition par Catégorie',
      description: 'Visualisez d\'un coup d\'œil quel catégorie de produit (Bières, Sucreries, etc.) génère le plus de **Revenu Net**.',
      elementSelector: '[data-guide="analytics-charts"]',
      position: 'top',
      visibleFor: ['promoteur', 'gerant'],
      tips: ['Le calcul déduit automatiquement les retours pour plus de justesse'],
    },
    {
      id: 'step-5',
      emoji: '📦',
      title: 'Suivi des Consignations',
      description: 'Surveillez votre **Taux de récupération**. Identifiez les articles consignés en attente → expirés → ou confisqués pour optimiser votre stock.',
      elementSelector: '[data-guide="analytics-consignments"]',
      position: 'top',
      visibleFor: ['promoteur', 'gerant'],
      tips: ['Un taux élevé signifie que vos clients reviennent consommer leurs consignations'],
    },
    {
      id: 'step-6',
      emoji: '🏆',
      title: 'Le Top Produits',
      description: 'Découvrez vos champions ! Filtrez par **Unités** (volume) → **Revenus** (CA) → ou **Profit** (marge nette).',
      elementSelector: '[data-guide="analytics-top-products"]',
      position: 'top',
      visibleFor: ['promoteur', 'gerant'],
      tips: ['Ajustez la limite (Top 5, 10, 20) pour une analyse plus fine'],
    },
    {
      id: 'step-7',
      emoji: '👥',
      title: 'Performance de l\'Équipe',
      description: 'Comparez l\'efficacité de vos serveurs. Analysez leur **CA généré** → et leur **Nombre de ventes**.',
      elementSelector: '[data-guide="analytics-team"]',
      position: 'top',
      visibleFor: ['promoteur', 'gerant'],
      tips: ['Utilisez ces données pour motiver ou former votre équipe'],
    },
  ],
};

/**
 * Guide 6: Team Management
 * Roles, permissions and server mappings
 */
export const MANAGE_TEAM_GUIDE: GuideTour = {
  id: 'manage-team',
  title: 'Gestion de l\'Équipe',
  subtitle: 'Organisez vos collaborateurs',
  description: 'Apprenez à ajouter des membres, gérer les rôles et configurer le mode simplifié.',

  targetRoles: ['promoteur', 'gerant'],

  estimatedDuration: 3,
  difficulty: 'beginner',
  emoji: '👥',
  version: 2,

  triggers: [
    {
      type: 'onMount',
      condition: 'isTeamPage',
      delay: 1500,
      showOnce: false,
    },
  ],

  steps: [
    {
      id: 'step-1',
      emoji: '👷',
      title: 'Votre Équipe au Complet',
      description: 'Gérez ici les accès de vos collaborateurs. Un bar bien organisé commence par une équipe bien définie.',
      position: 'center',
      visibleFor: ['promoteur', 'gerant'],
    },
    {
      id: 'step-2',
      emoji: '📊',
      title: 'Statistiques de l\'Équipe',
      description: 'Gardez un œil sur la répartition de votre effectif entre **Gérants** (managers) et **Serveurs** (vente).',
      elementSelector: '[data-guide="team-stats"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
    },
    {
      id: 'step-3',
      emoji: '📋',
      title: 'Liste des Membres',
      description: 'Consultez ici les noms, rôles et **dernières connexions**. Vous pouvez voir qui est actif ou inactif d\'un coup d\'œil.',
      elementSelector: '[data-guide="team-list"]',
      position: 'top',
      visibleFor: ['promoteur', 'gerant'],
      tips: ['Utilisez le bouton "Voir inactifs" en haut pour l\'historique complète'],
    },
    {
      id: 'step-4',
      emoji: '👤',
      title: 'Ajout de Collaborateurs',
      description: 'Créez un **Nouveau Compte** ou utilisez **Membre Existant** pour importer un employé travaillant déjà dans un autre de vos bars.\n\n**Note de rôles** :\n- **Promoteur** : Peut créer de nouveaux **Gérants** et **Serveurs**\n- **Gérant** : Peut créer uniquement des **Serveurs** (mais pas de gérants supplémentaires)',
      elementSelector: '[data-guide="team-add-btn"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: ['L\'import évite les doublons de comptes pour les employés multi-bars ou précédemment membre d\'un autre bar'],
    },
    {
      id: 'step-5',
      emoji: '🔗',
      title: 'Configuration des Mappings',
      description: 'En **Mode Simplifié**, vous devez lier des noms courts (ex: "Afi") à des comptes serveurs réels pour attribuer les ventes. Cette section est **repliée par défaut** : cliquez sur le bandeau **Mappings Serveurs** pour la déplier et configurer vos raccourcis.',
      elementSelector: '[data-guide="team-mappings"]',
      position: 'top',
      visibleFor: ['promoteur', 'gerant'],
      tips: ['Indispensable pour que les noms s\'affichent correctement lors de la création d\'une vente en mode simplifié'],
    },
    {
      id: 'step-6',
      emoji: '🚫',
      title: 'Retrait de Membre',
      description: 'Besoin de retirer quelqu\'un ? Utilisez l\'icône "Poubelle" sur la ligne du membre pour révoquer son accès instantanément.\n\n**Note de rôles** :\n- **Promoteur** : Peut retirer n\'importe quel **Gérant** ou **Serveur**\n- **Gérant** : Peut retirer uniquement les **Serveurs** (mais pas de retrait de gérants)',
      elementSelector: '[data-guide="team-list"]',
      position: 'top',
      visibleFor: ['promoteur', 'gerant'],
      tips: ['Le retrait est immédiat et bloque toute nouvelle connexion'],
    },
  ],
};

/**
 * Guide 7: Bar Settings
 * Configuration and security
 */
export const MANAGE_SETTINGS_GUIDE: GuideTour = {
  id: 'manage-settings',
  title: 'Paramètres',
  subtitle: 'Personnalisez votre établissement',
  description: 'Paramétrez l\'heure de clôture, le mode de fonctionnement et blindez votre sécurité.',

  targetRoles: ['promoteur', 'gerant'],

  estimatedDuration: 4,
  difficulty: 'intermediate',
  emoji: '⚙️',
  version: 3,

  triggers: [
    {
      type: 'onMount',
      condition: 'isSettingsPage',
      delay: 1500,
      showOnce: false,
    },
  ],

  steps: [
    {
      id: 'step-1',
      emoji: '🛠️',
      title: 'Configuration Globale',
      description: 'Ajustez les réglages fondamentaux qui impactent votre comptabilité et votre sécurité au quotidien.',
      position: 'center',
      visibleFor: ['promoteur', 'gerant'],
    },
    {
      id: 'step-2',
      emoji: '📑',
      title: 'Navigation par Onglets',
      description: 'Tout est organisé en 4 sections : **Bar**, **Opérationnel**, **Général** et **Sécurité**.',
      elementSelector: '[data-guide="settings-tabs"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: ['Cliquez sur un onglet pour voir ses réglages spécifiques'],
    },
    {
      id: 'step-3',
      emoji: '🏢',
      title: 'Infos de l\'Établissement',
      description: 'Mettez à jour le **Nom**, l\'**Adresse** et les **Contacts** dans l\'onglet Bar pour vos factures et exports.',
      elementSelector: '[data-guide="settings-content"]',
      position: 'top',
      visibleFor: ['promoteur', 'gerant'],
      tips: ['Ces informations apparaissent sur vos rapports'],
    },
    {
      id: 'step-4',
      emoji: '🌙',
      title: 'Heure de Clôture & Journée Commerciale',
      description: 'Définissez l\'heure de fin de votre journée de travail (ex: 06h). C\'est ce qui définit votre **Journée Commerciale**.\n\n**Exemple** : Avec une clôture à 06h00, une vente faite à **02h00 du matin** le mardi sera comptabilisée dans la journée du **lundi**. Cela permet de garder une comptabilité cohérente pour vos soirées !',
      elementSelector: '[data-guide="settings-content"]',
      position: 'top',
      visibleFor: ['promoteur'],
      tips: ['Configurez ceci dans l\'onglet "Opérationnel"'],
    },
    {
      id: 'step-5',
      emoji: '⚙️',
      title: 'Mode Complet vs Simplifié',
      description: 'Choisissez la méthode d\'attribution des ventes :\n\n• **Mode Complet** : Chaque serveur utilise son propre compte (ex: sur son téléphone) et crée ses propres ventes (à valider par un compte manager dans le menu tableau de bord).\n• **Mode Simplifié** : Un seul compte manager (ex:gérant au comptoir). Le gérant crée la vente et sélectionne manuellement le serveur (ex: "Afi", "Fifi") à l\'origine lors de la validation.',
      elementSelector: '[data-guide="settings-content"]',
      position: 'top',
      visibleFor: ['promoteur'],
      tips: ['Le mode Simplifié nécessite de déplier et configurer les "Mappings Serveurs"'],
    },
    {
      id: 'step-6',
      emoji: '🛡️',
      title: 'Sécurité (2FA)',
      description: 'Activez la **Double Authentification (2FA)** dans l\'onglet Sécurité pour protéger vos revenus et données sensibles.',
      elementSelector: '[data-guide="settings-content"]',
      position: 'top',
      visibleFor: ['promoteur'],
      tips: ['Utilisez Google Authenticator ou Authy pour scanner le QR Code'],
    },
  ],
};

/**
 * Guide 8: Promotions Management
 * Creating and managing promotional offers
 */
export const MANAGE_PROMOTIONS_GUIDE: GuideTour = {
  id: 'manage-promotions',
  title: 'Gestion des Promotions',
  subtitle: 'Boostez vos ventes avec des offres attractives',
  description: 'Créez et gérez des promotions (réductions, happy hours, offres groupées) pour attirer et fidéliser vos clients.',

  targetRoles: ['promoteur', 'gerant'],

  estimatedDuration: 4,
  difficulty: 'intermediate',
  emoji: '🎁',
  version: 1,

  triggers: [
    {
      type: 'onMount',
      condition: 'isPromotionsPage',
      delay: 1500,
      showOnce: false,
    },
  ],

  steps: [
    {
      id: 'step-1',
      emoji: '🎯',
      title: 'Bienvenue aux Promotions !',
      description:
        'Les promotions sont un outil puissant pour augmenter vos ventes et fidéliser votre clientèle. Happy hours, offres spéciales, lots... tout est possible !',
      position: 'center',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        'Le système calcule automatiquement le meilleur prix pour le client',
        'Les majorations (ex: tarifs de nuit) sont aussi gérées ici',
        'Suivez les performances (ROI, Marge) dans l\'onglet Analytics',
      ],
    },

    {
      id: 'step-2',
      emoji: '🔍',
      title: 'Recherche et Filtres',
      description:
        'Utilisez la barre de recherche et les filtres pour trouver rapidement vos promotions : actives, programmées, expirées ou en brouillon.',
      elementSelector: '[data-guide="promotions-search"]',
      position: 'bottom',
      action: 'Recherchez ou filtrez vos promotions',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        'Filtrez par statut pour voir uniquement les promotions actives',
        'Recherchez par nom pour retrouver une promotion spécifique',
      ],
    },

    {
      id: 'step-3',
      emoji: '➕',
      title: 'Types d\'offres et Création',
      description:
        'Choisissez parmi 6 types d\'offres :\n\n• **Lôts (Offre groupée)** : ex: "3 bières pour 1000 FCFA au lieu de 1050".\n• **Réduction par unité** : ex: "-50 FCFA sur chaque bouteille".\n• **Pourcentage** : ex: "-10% le Happy Hour".\n• **Prix spécial** : ex: "Heineken à 300 FCFA".\n• **Majoration** : ex: "+100 FCFA par unité (Tarif de nuit)".',
      elementSelector: '[data-guide="promo-types"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        'Pour les lôts (3 pour 1000), le système gère automatiquement le prix des unités supplémentaires (ex: si j\'en prends 4)',
        'Les majorations permettent d\'augmenter le prix unitaire temporairement',
      ],
    },

    {
      id: 'step-4',
      emoji: '📅',
      title: 'Programmation et Validité',
      description:
        'Définissez les dates de début et de fin de votre promotion. Programmez vos happy hours ou vos offres saisonnières à l\'avance.',
      elementSelector: '[data-guide="promotions-dates"]',
      position: 'bottom',
      action: 'Configurez les dates de validité',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        'Happy hour : tous les jours de 17h à 19h',
        'Week-end promo : du vendredi 18h au dimanche 23h',
        'Offre limitée : valable uniquement le 31 décembre',
      ],
    },

    {
      id: 'step-5',
      emoji: '🎯',
      title: 'Précision du Ciblage',
      description:
        'Soyez sélectif pour protéger vos marges :\n\n• **Tout le menu** : Offre globale sur le bar.\n• **Par catégorie** : ex: promo uniquement sur les "Bières".\n• **Par produit** : ex: promo spécifique sur la "Flag 33cl".',
      elementSelector: '[data-guide="promo-targeting"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        'Ciblez par catégorie pour écouler un type de stock spécifique',
        'Combinez avec les horaires pour créer des Happy Hours ciblés',
      ],
    },

    {
      id: 'step-6',
      emoji: '▶️',
      title: 'Activer / Mettre en Pause',
      description:
        'Vous pouvez activer, mettre en pause ou arrêter une promotion à tout moment. Utile pour tester ou ajuster vos offres en temps réel.',
      elementSelector: '[data-guide="promotions-status"]',
      position: 'top',
      action: 'Gérez le statut de vos promotions',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        'Mettez en pause une promo qui ne performe pas',
        'Réactivez une promo pour un événement spécial',
        'Les promotions expirées restent visibles dans l\'historique',
      ],
    },

    {
      id: 'step-7',
      emoji: '📈',
      title: 'Profitabilité & ROI',
      description:
        'Ne naviguez pas à vue ! Suivez la rentabilité réelle :\n\n• **Profit Net** : Gain réel après déduction du coût des produits.\n• **ROI (Retour sur Investissement)** : Performance de l\'offre par rapport à son coût.\n• **Marge %** : Santé financière de votre promotion.',
      elementSelector: '[data-guide="promo-kpis"]',
      position: 'top',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        'Une promotion réussie doit avoir un ROI élevé et une marge stable',
        'Vérifiez le tableau "Top Performance" pour voir quelle offre génère le plus de profit net',
      ],
    },

    {
      id: 'step-8',
      emoji: '✅',
      title: 'Prêt à Booster Vos Ventes !',
      description:
        'Vous maîtrisez maintenant les promotions. Créez des offres attractives, programmez vos happy hours et suivez leur impact sur votre chiffre d\'affaires !',
      position: 'center',
      action: 'Cliquez sur Terminer pour commencer',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        'Testez différentes offres pour voir ce qui fonctionne',
        'Communiquez vos promotions à vos clients (réseaux sociaux, affichage)',
        'Analysez régulièrement les performances pour optimiser vos offres',
        'N\'hésitez pas à ajuster ou arrêter les promos qui ne marchent pas',
      ],
    },
  ],
};

/**
 * All owner guides (Phase 2+)
 */
export const OWNER_GUIDES: GuideTour[] = [
  DASHBOARD_OVERVIEW_GUIDE,
  MANAGE_INVENTORY_GUIDE,
  MANAGE_RETURNS_GUIDE,
  MANAGE_CONSIGNMENTS_GUIDE,
  HISTORIQUE_GUIDE,
  MANAGE_TEAM_GUIDE,
  MANAGE_SETTINGS_GUIDE,
  MANAGE_PROMOTIONS_GUIDE,
];
