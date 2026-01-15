/**
 * Owner (Promoteur) Guides
 * 5 complete guides for bar owners to master the system
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

  targetRoles: ['promoteur'],

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
      tips: [
        'CA Net = Ventes - Retours remboursés - Réductions promotions',
        'Les métriques Ventes, Articles, Alertes et Retours concernent uniquement la journée commerciale en cours.',
        'La métrique Consignations inclut toutes les consignations actives',
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
      tips: [
        '📱 Bouton WhatsApp: Envoie un rapport journalier formaté (CA, ventes, articles, retours, top produits)',
        '🔒 Bouton Fermer caisse: Marque la fin de votre journée commerciale (managers/promoteurs uniquement)',
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

  targetRoles: ['promoteur'],

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
        'Cette page vous permet de gérer tous les produits de votre bar : les ajouter, les modifier, gérer les stocks et les approvisionnements.',
      position: 'center',
      action: 'Cliquez sur Suivant pour continuer',
      tips: [
        'Organisez vos produits par catégorie',
        'Suivez les marges commerciales en temps réel',
        'Les alertes stock vous avertissent automatiquement',
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
        'Utilisez le bouton "Ajouter produit" pour créer un nouveau produit. Vous avez deux options : créer un produit personnalisé ou le choisir depuis le catalogue global.',
      elementSelector: '[data-guide="inventory-add-btn"]',
      position: 'bottom',
      action: 'Cliquez pour ouvrir le formulaire d\'ajout',
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
        'Le bouton "Approvisionnement" vous permet d\'ajouter du stock à un produit, d\'enregistrer le fournisseur et le coût d\'achat.',
      elementSelector: '[data-guide="inventory-supply-btn"]',
      position: 'bottom',
      action: 'Cliquez pour ouvrir le formulaire d\'approvisionnement',
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
        'Chaque produit affiche son prix de vente, son coût moyen et sa marge commerciale. Une marge saine est généralement > 35-40%.',
      elementSelector: '[data-guide="inventory-table"]',
      position: 'top',
      action: 'Consultez les colonnes Coût moyen et Marge',
      tips: [
        '📊 Coût moyen = moyenne pondérée des approvisionnements (somme des coûts / quantité totale achetée)',
        '📈 Stock Physique = quantité réelle en magasin | Stock Vendable = Physique - Consignations actives',
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

  targetRoles: ['promoteur'],

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
      tips: [
        'Défectueux: le produit est détruit, pas remis en stock',
        'Erreur article: compensé au client ET restocké',
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
        'Utilisez le filtre par serveur ET la recherche produit pour trouver rapidement la vente à retourner. Les ventes du jour uniquement sont retournables.',
      elementSelector: '[data-guide="returns-search"]',
      position: 'bottom',
      action: 'Sélectionnez un serveur, puis cherchez le produit',
      tips: [
        '👤 Filtre Serveur: Choisissez le serveur qui a vendu (si plusieurs serveurs)',
        '🔍 Recherche Produit: Tapez le nom du produit à retourner (ex: Guinness)',
        'Les ventes sont triées par heure (plus récentes d\'abord)',
      ],
    },

    {
      id: 'step-4',
      emoji: '📋',
      title: 'Créer un Retour - Flux Détaillé',
      description:
        'Suivez ces étapes: 1) Sélectionnez la vente (click sur la card) 2) Choisissez le produit 3) Indiquez la quantité 4) Choisissez le motif 5) Confirmez.',
      elementSelector: '[data-guide="returns-create-btn"]',
      position: 'bottom',
      action: 'Cliquez pour créer un nouveau retour',
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
      tips: [
        '💰 Montant remboursé: Calculé automatiquement selon le motif (quantité × prix unitaire)',
        '📦 Remise en stock: Certains motifs remettent en stock (Erreur, Non consommé), d\'autres non (Défectueux, Périmé)',
        '⏳ Statut EN ATTENTE: Le retour est créé mais pas encore approuvé (remboursement pas débité)',
      ],
    },

    {
      id: 'step-6',
      emoji: '⏳',
      title: 'Consulter les Retours EN ATTENTE - Par Période',
      description:
        'Après création, le retour est EN ATTENTE. Utilisez les filtres de période pour trouver les retours créés et les approuver (ou les rejeter si erreur).',
      elementSelector: '[data-guide="returns-search"]',
      position: 'bottom',
      action: 'Consultez vos retours EN ATTENTE par période',
      tips: [
        '📅 Filtres: Utilisez les périodes prédéfinies (Aujourd\'hui, 7 jours, 30 jours)',
        '🔍 Recherche: Cherchez par nom produit',
        '⏳ Statut EN ATTENTE: Le retour a été créé mais pas encore finalisé',
      ],
    },

    {
      id: 'step-7',
      emoji: '✅',
      title: '⚠️ ÉTAPE CRUCIALE : Approuver le Retour',
      description:
        'C\'EST ICI QUE LE RETOUR EST FINALISÉ. Approuvez le retour EN ATTENTE pour que le remboursement soit débité et le stock remis selon le motif. Cette étape est indispensable !',
      elementSelector: '[data-guide="returns-status"]',
      position: 'bottom',
      action: 'Cliquez sur APPROUVER pour finaliser le retour',
      tips: [
        '✅ APPROUVER: Le remboursement est débité MAINTENANT, stock remis selon le motif (ÉTAPE FINALE)',
        '❌ REJETER: Le retour est annulé si c\'était une erreur, aucune modification',
        '⚠️ SANS APPROBATION: Le retour reste EN ATTENTE, pas de remboursement, stock pas remis',
      ],
    },

    {
      id: 'step-8',
      emoji: '✅',
      title: 'Vous Êtes Prêt à Gérer les Retours !',
      description:
        'Vous pouvez maintenant traiter efficacement les retours de produits. Créez des retours avant fermeture caisse, consultez-les par période.',
      position: 'center',
      action: 'Cliquez sur Terminer pour commencer',
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
  subtitle: 'Gérez les produits en consignation',
  description: 'Guide complet pour gérer les produits consignés avec les fournisseurs',

  targetRoles: ['promoteur'],

  estimatedDuration: 3,
  difficulty: 'intermediate',
  emoji: '📦',
  version: 1,

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
        'Les consignations vous permettent de mettre de côté des produits vendus pour les récupérer plus tard auprès du client ou du fournisseur.',
      position: 'center',
      action: 'Cliquez sur Suivant pour continuer',
      tips: [
        'Les consignations bloquent le stock temporairement',
        'Suivi du client et du fournisseur en cas de besoin',
        'Plusieurs onglets pour gérer les consignations',
      ],
    },

    {
      id: 'step-2',
      emoji: '➕',
      title: 'Créer une Nouvelle Consignation',
      description:
        'Sélectionnez une vente du jour, choisissez les produits à mettre en consignation et indiquez les informations du client (nom, téléphone) et la date de récupération.',
      elementSelector: '[data-guide="consignments-create-tab"]',
      position: 'bottom',
      action: 'Cliquez sur l\'onglet "Créer Consignation"',
      tips: [
        'Seules les ventes du jour peuvent être consignées',
        'Vous pouvez consigner partiellement une vente',
        'Une date de récupération est importante pour le suivi',
      ],
    },

    {
      id: 'step-3',
      emoji: '⏳',
      title: 'Consignations Actives',
      description:
        'Consultez la liste de toutes les consignations en cours. Vous pouvez voir le client, la date de récupération et les produits mis de côté.',
      elementSelector: '[data-guide="consignments-active-tab"]',
      position: 'bottom',
      action: 'Cliquez sur l\'onglet "Consignations Actives"',
      tips: [
        'Les alertes s\'affichent si la date de récupération est passée',
        'Vous pouvez mettre à jour la date de récupération',
        'Marquez comme récupérée quand le client vient chercher',
      ],
    },

    {
      id: 'step-4',
      emoji: '🏆',
      title: 'Récupération',
      description:
        'Quand le client ou le fournisseur vient chercher sa consignation, cliquez sur "Récupérée". Cela remet les produits en stock et met à jour votre finances.',
      elementSelector: '[data-guide="consignments-recover-btn"]',
      position: 'bottom',
      action: 'Cliquez pour marquer comme récupérée',
      tips: [
        'Vérifiez la date de récupération avec le client',
        'Prenez un reçu pour la traçabilité',
        'Les consignations récupérées vont dans l\'historique',
      ],
    },

    {
      id: 'step-5',
      emoji: '📊',
      title: 'Historique des Consignations',
      description:
        'Consultez l\'historique complet des consignations : dates de création, récupération, clients, montants. Utile pour l\'analyse et le contrôle.',
      elementSelector: '[data-guide="consignments-history-tab"]',
      position: 'bottom',
      action: 'Cliquez sur l\'onglet "Historique"',
      tips: [
        'Filtrez par période pour analyser les tendances',
        'Exportez les données pour vos rapports',
        'Vérifiez régulièrement les consignations non récupérées',
      ],
    },

    {
      id: 'step-6',
      emoji: '✅',
      title: 'Vous Êtes Prêt à Gérer les Consignations !',
      description:
        'Vous pouvez maintenant gérer efficacement les consignations. Suivez les dates de récupération et assurez-vous que tout est traçable.',
      position: 'center',
      action: 'Cliquez sur Terminer pour commencer',
      tips: [
        'Les consignations aident à maintenir des relations avec les clients',
        'Gardez un suivi précis des dates et montants',
        'Utile pour calculer le taux de perte d\'emballages',
        'Permet de vérifier les actions passées de votre équipe',
      ],
    },
  ],
};

/**
 * Guide 5: Analytics & Performance
 * Understanding reports and trends
 */
export const ANALYTICS_OVERVIEW_GUIDE: GuideTour = {
  id: 'analytics-overview',
  title: 'Analyse de Performance',
  subtitle: 'Prenez des décisions basées sur les données',
  description: 'Découvrez vos ventes, vos revenus et vos tendances de consommation.',

  targetRoles: ['promoteur'],

  estimatedDuration: 3,
  difficulty: 'intermediate',
  emoji: '📊',
  version: 1,

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
      emoji: '📈',
      title: 'Maîtrisez vos Chiffres',
      description: 'L\'onglet Analytics regroupe toutes les données critiques pour la croissance de votre bar.',
      position: 'center',
    },
    {
      id: 'step-2',
      emoji: '💰',
      title: 'Évolution du Revenu',
      description: 'Ce graphique montre la santé de votre bar sur les 12 derniers mois. Comparez vos revenus à vos coûts opérationnels.',
      elementSelector: '[data-guide="analytics-charts"]',
      position: 'bottom',
    },
    {
      id: 'step-3',
      emoji: '📅',
      title: 'Tendances Mensuelles',
      description: 'Survolez les colonnes pour voir le détail exact de chaque mois.',
      elementSelector: '[data-guide="analytics-charts"]',
      position: 'top',
    }
  ],
};

/**
 * Guide 6: Team Management
 * Roles, permissions and server mappings
 */
export const MANAGE_TEAM_GUIDE: GuideTour = {
  id: 'manage-team',
  title: 'Gestion d\'Équipe',
  subtitle: 'Organisez vos collaborateurs',
  description: 'Apprenez à ajouter des membres et à configurer le mode simplifié.',

  targetRoles: ['promoteur'],

  estimatedDuration: 2,
  difficulty: 'beginner',
  emoji: '👥',
  version: 1,

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
      description: 'Gérez ici les accès de vos gérants et serveurs.',
      position: 'center',
    },
    {
      id: 'step-2',
      emoji: '📊',
      title: 'Statistiques Rapides',
      description: 'Voyez d\'un coup d\'œil la répartition de vos effectifs.',
      elementSelector: '[data-guide="team-stats"]',
      position: 'bottom',
    },
    {
      id: 'step-3',
      emoji: '➕',
      title: 'Recrutement',
      description: 'Ajoutez un nouveau membre ou importez-en un d\'un autre bar.',
      elementSelector: '[data-guide="team-add-btn"]',
      position: 'bottom',
    },
    {
      id: 'step-4',
      emoji: '🔗',
      title: 'Mappings Serveurs',
      description: 'En mode simplifié, associez des noms courts (ex: "Afi") à des comptes réels.',
      elementSelector: '[data-guide="team-mappings"]',
      position: 'top',
    }
  ],
};

/**
 * Guide 7: Bar Settings
 * Configuration and security
 */
export const MANAGE_SETTINGS_GUIDE: GuideTour = {
  id: 'manage-settings',
  title: 'Configuration du Bar',
  subtitle: 'Personnalisez votre expérience',
  description: 'Paramétrez l\'heure de clôture, le mode de fonctionnement et la sécurité.',

  targetRoles: ['promoteur'],

  estimatedDuration: 2,
  difficulty: 'intermediate',
  emoji: '⚙️',
  version: 1,

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
      title: 'Paramètres du Bar',
      description: 'Ajustez les réglages fondamentaux de votre établissement.',
      position: 'center',
    },
    {
      id: 'step-2',
      emoji: '📑',
      title: 'Onglets de Configuration',
      description: 'Basculez entre les informations du bar, les réglages opérationnels et la sécurité.',
      elementSelector: '[data-guide="settings-tabs"]',
      position: 'bottom',
    },
    {
      id: 'step-3',
      emoji: '🛡️',
      title: 'Sécurité Maximale',
      description: 'Activez la double authentification (2FA) pour protéger vos données financières.',
      elementSelector: '[data-guide="settings-content"]',
      position: 'top',
    }
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

  targetRoles: ['promoteur'],

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
      action: 'Cliquez sur Suivant pour découvrir',
      tips: [
        'Les promotions s\'appliquent automatiquement lors de la création de ventes',
        'Vous pouvez programmer des promotions à l\'avance',
        'Suivez les performances de vos promotions dans l\'onglet Analytics',
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
      tips: [
        'Filtrez par statut pour voir uniquement les promotions actives',
        'Recherchez par nom pour retrouver une promotion spécifique',
      ],
    },

    {
      id: 'step-3',
      emoji: '➕',
      title: 'Créer une Nouvelle Promotion',
      description:
        'Cliquez sur "Nouvelle Promotion" pour créer une offre. Choisissez le type : pourcentage, réduction fixe, offre groupée, prix spécial...',
      elementSelector: '[data-guide="promotions-create-btn"]',
      position: 'bottom',
      action: 'Cliquez pour créer votre première promo',
      tips: [
        'Pourcentage : -20% sur tous les cocktails',
        'Réduction fixe : -500 FCFA sur les ventes de plus de 5000 FCFA',
        'Offre groupée : Achetez 2 bières, obtenez la 3ème gratuite',
        'Prix spécial : Heineken à 800 FCFA au lieu de 1000 FCFA',
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
      tips: [
        'Happy hour : tous les jours de 17h à 19h',
        'Week-end promo : du vendredi 18h au dimanche 23h',
        'Offre limitée : valable uniquement le 31 décembre',
      ],
    },

    {
      id: 'step-5',
      emoji: '🎯',
      title: 'Ciblage et Conditions',
      description:
        'Appliquez votre promotion à des produits spécifiques, des catégories ou l\'ensemble du bar. Définissez des conditions : montant minimum, quantité...',
      elementSelector: '[data-guide="promotions-targeting"]',
      position: 'bottom',
      action: 'Ciblez vos produits et conditions',
      tips: [
        'Appliquez -15% uniquement sur les cocktails',
        'Réduction de 1000 FCFA sur les ventes de plus de 10000 FCFA',
        'Happy hour : -25% sur toutes les boissons de 18h à 20h',
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
      tips: [
        'Mettez en pause une promo qui ne performe pas',
        'Réactivez une promo pour un événement spécial',
        'Les promotions expirées restent visibles dans l\'historique',
      ],
    },

    {
      id: 'step-7',
      emoji: '📊',
      title: 'Analytics et Performance',
      description:
        'Consultez les statistiques de vos promotions : nombre d\'utilisations, CA généré, produits les plus vendus pendant les promos...',
      elementSelector: '[data-guide="promotions-analytics"]',
      position: 'top',
      action: 'Cliquez sur l\'onglet Analytics',
      tips: [
        'Identifiez les promotions les plus rentables',
        'Analysez l\'impact de vos happy hours',
        'Ajustez vos offres selon les résultats',
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
  ANALYTICS_OVERVIEW_GUIDE,
  MANAGE_TEAM_GUIDE,
  MANAGE_SETTINGS_GUIDE,
  MANAGE_PROMOTIONS_GUIDE,
];
