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
        'Le widget en haut à gauche affiche votre chiffre d\'affaires net pour la journée commerciale actuelle.',
      elementSelector: '[data-guide="revenue-widget"]',
      position: 'bottom',
      action: 'Consultez votre CA net',
      tips: [
        'CA Net = Ventes - Retours remboursés - Réductions promotions',
        'Autres métriques du tableau de bord: Nombre de Ventes, Alertes, Retours, Consignations',
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
        'Vous pouvez rejeter pour diverses raisons (erreur produit, prix, quantité, etc.)',
        'Les ventes rejetées peuvent être modifiées par le serveur',
        'Expiration automatique à la fin de la journée commerciale',
      ],
    },

    {
      id: 'step-4',
      emoji: '👥',
      title: 'Performance de l\'Équipe',
      description:
        'Voyez la performance de chaque membre de votre équipe pour la journée actuelle. Suivez les ventes validées et le chiffre d\'affaires généré par chacun.',
      elementSelector: '[data-guide="team-performance"]',
      position: 'top',
      action: 'Consultez les performances de l\'équipe',
      tips: [
        'Les statistiques se mettent à jour en temps réel',
        'Seules les ventes validées sont comptabilisées',
        'Utilisez ces données pour motiver et récompenser vos meilleurs éléments',
      ],
    },

    {
      id: 'step-5',
      emoji: '🗺️',
      title: 'Navigation Principale',
      description:
        'Utilisez le menu en haut pour accéder à différentes sections. Chaque section a son propre guide.',
      elementSelector: '[data-guide="main-nav"]',
      position: 'bottom',
      action: 'Explorez chaque section',
      tips: [
        '📦 Inventaire: Gérez les produits et le stock',
        '📊 Historique: Rapports détaillés et analytique',
        '💳 Comptabilité: Finances et dépenses',
        '👥 Équipe: Gérez les rôles et l\'accès',
        '⚙️ Paramètres: Configuration du bar',
      ],
    },

    {
      id: 'step-6',
      emoji: '✅',
      title: 'Vous Êtes Prêt !',
      description:
        'Vous maîtrisez maintenant les bases du tableau de bord. N\'hésitez pas à revenir à ce guide à tout moment. Cliquez sur le bouton ? (en bas à droite) pour accéder à tous les guides disponibles.',
      position: 'center',
      action: 'Cliquez sur Fermer pour commencer à explorer',
      tips: [
        'Plus de guides disponibles pour chaque section',
        'Votre avis nous aide à nous améliorer !',
        'Consultez les paramètres pour personnaliser l\'expérience',
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
        'Les filtres se combinent avec la recherche',
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
        'Utilisez le bouton "Ajouter produit" pour créer un nouveau produit. Vous devez indiquer le nom, le prix, la catégorie et le stock initial.',
      elementSelector: '[data-guide="inventory-add-btn"]',
      position: 'bottom',
      action: 'Cliquez pour ouvrir le formulaire d\'ajout',
      tips: [
        'Donnez un nom clair et court à votre produit',
        'Définissez le seuil d\'alerte basé sur votre cycle de commande',
        'Organisez les produits par catégorie pour une meilleure gestion',
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
        'Enregistrez toujours le fournisseur et le coût',
        'Le coût moyen se calcule automatiquement',
        'Les données d\'approvisionnement aident à analyser la marge',
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
        'Une marge rouge (< 30%) signifie que le produit n\'est pas rentable',
        'Augmentez le prix de vente ou réduisez le coût d\'achat',
        'Révisez régulièrement vos prix pour rester compétitif',
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
        'Les modifications sont appliquées immédiatement',
        'Vous pouvez changer le prix et la catégorie à tout moment',
        'Les données passées ne sont pas affectées',
      ],
    },

    {
      id: 'step-9',
      emoji: '📥',
      title: 'Importer des Produits en Masse',
      description:
        'Si vous avez beaucoup de produits à ajouter, utilisez le bouton "Importer" pour charger un fichier CSV avec tous vos produits.',
      elementSelector: '[data-guide="inventory-import-btn"]',
      position: 'bottom',
      action: 'Cliquez pour importer des produits',
      tips: [
        'Préparez un fichier CSV avec les colonnes : nom, prix, catégorie, stock',
        'Vous économisez du temps si vous avez 50+ produits',
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
        'Les retours ne peuvent être créés que pour les ventes du jour',
        'Chaque type de retour a des règles automatiques (remboursement, remise en stock)',
        'Les serveurs ne peuvent que consulter les retours',
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
        'Utilisez la barre de recherche et les filtres pour trouver rapidement la vente que vous souhaitez retourner. Les ventes du jour uniquement sont retournables.',
      elementSelector: '[data-guide="returns-search"]',
      position: 'bottom',
      action: 'Recherchez une vente par numéro, client ou serveur',
      tips: [
        'Les ventes clôturées ne peuvent pas être retournées',
        'Filtrez par période pour affiner votre recherche',
        'Vous pouvez voir l\'historique complet des retours',
      ],
    },

    {
      id: 'step-4',
      emoji: '📋',
      title: 'Créer un Retour',
      description:
        'Sélectionnez une vente, choisissez le type de retour, puis indiquez la quantité de chaque produit à retourner. Vous pouvez ajouter une note explicative.',
      elementSelector: '[data-guide="returns-create-btn"]',
      position: 'bottom',
      action: 'Cliquez pour créer un nouveau retour',
      tips: [
        'Vous pouvez retourner partiellement une vente (1-2 articles)',
        'La quantité retournée doit être ≤ quantité vendue',
        'Ajoutez une note pour expliquer le motif du retour',
      ],
    },

    {
      id: 'step-5',
      emoji: '✔️',
      title: 'Approuver ou Rejeter',
      description:
        'Les retours en attente peuvent être approuvés ou rejetés. L\'approbation déclenche automatiquement le remboursement et/ou le restockage selon le type.',
      elementSelector: '[data-guide="returns-status"]',
      position: 'bottom',
      action: 'Cliquez sur Approuver ou Rejeter',
      tips: [
        'Approuver: le remboursement est débité immédiatement',
        'Rejeter: le retour est annulé, pas de modification',
        'L\'historique conserve tous les retours (approuvés et rejetés)',
      ],
    },

    {
      id: 'step-6',
      emoji: '✅',
      title: 'Vous Êtes Prêt à Gérer les Retours !',
      description:
        'Vous pouvez maintenant traiter efficacement les retours de produits. Vérifiez régulièrement les retours en attente pour les approuver ou les rejeter.',
      position: 'center',
      action: 'Cliquez sur Terminer pour commencer',
      tips: [
        'Les retours affectent le stock et les finances',
        'Consultez les statistiques de retours pour analyser les tendances',
        'Les clients apprécient les retours rapides et traités correctement',
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
