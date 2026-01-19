import { GuideTour } from '@/types/guide';

/**
 * Guide 1: First Sale for Servers
 * Step-by-step guide to the quick sale flow (2 access methods)
 */
export const SERVEUR_FIRST_SALE_GUIDE: GuideTour = {
    id: 'create-first-sale',
    title: 'Créer Votre Première Vente',
    subtitle: 'Vitesse et précision pour votre service',
    description: 'Apprenez à créer une vente depuis le menu ou le tableau de bord.',

    targetRoles: ['serveur'],

    estimatedDuration: 4,
    difficulty: 'beginner',
    emoji: '🍺',
    version: 1,

    triggers: [
        {
            type: 'onMount',
            condition: 'isDashboard',
            delay: 2000,
            showOnce: true,
        },
    ],

    steps: [
        {
            id: 'step-1',
            emoji: '✨',
            title: 'C\'est l\'heure du service !',
            description:
                'Chaque boisson servie doit être enregistrée pour garantir la justesse de votre caisse et de votre stock. Vous avez **2 accès** à la création de vente.',
            position: 'center',
            action: 'Suivant',
            tips: [
                '📱 **Menu en bas (mobile/petit écran)** : Menu "Vente rapide" en bas de l\'écran pour accès rapide en service',
                '🏠 **Depuis le tableau de bord** : Bouton "Vente rapide" en haut du tableau de bord de l\'Accueil',
                'Les deux méthodes donnent accès à **la même interface** avec les mêmes étapes',
            ],
        },
        {
            id: 'step-2',
            emoji: '➕',
            title: 'Ouvrir une Vente',
            description: 'Cliquez sur "Vente rapide" pour lancer le terminal de vente. Choisissez l\'accès qui vous convient selon votre contexte.',
            elementSelector: '[data-guide="quick-sale-btn"]',
            position: 'bottom',
            action: 'Cliquez pour ouvrir',
            tips: [
                '📱 **Sur petit écran** : Bouton dans le menu en bas de l\'écran (plus accessible en service)',
                '🏠 **Depuis l\'Accueil** : Bouton en haut du tableau de bord',
                '⚡ Utilisez l\'accès le plus proche de vous pour gagner du temps en service',
            ],
        },
        {
            id: 'step-3',
            emoji: '🥃',
            title: 'Choisir les Produits',
            description: 'Sélectionnez les articles demandés par le client. Vous pouvez ajuster les quantités directement.',
            elementSelector: '[data-guide="product-selector"]',
            position: 'bottom',
            action: 'Sélectionnez vos produits',
            tips: [
                'Cliquez sur un produit pour l\'ajouter au panier',
                'Ajustez la quantité avec les boutons +/-',
                'Utilisez la recherche pour trouver rapidement un produit',
            ],
        },
        {
            id: 'step-4',
            emoji: '🛒',
            title: 'Vérifier le Panier',
            description: 'Votre panier s\'affiche à droite. Vérifiez les articles, quantités et le total. Si une promotion est active, vous la verrez en vert dans le panier.',
            elementSelector: '[data-guide="cart-summary"]',
            position: 'left',
            action: 'Consultez votre panier',
            tips: [
                '✅ Vérifiez que tous les articles et quantités sont corrects',
                '🟢 **Prix en vert** = promotion active appliquée (prix réduit)',
                '⚪ **Prix normal** = pas de promotion sur cet article',
                'Vous pouvez modifier ou supprimer des articles avant confirmation',
            ],
        },
        {
            id: 'step-5',
            emoji: '💳',
            title: 'Mode de Paiement',
            description: 'Sélectionnez le mode de paiement du client. **Cash est le mode par défaut** (pré-sélectionné). Changez-le seulement si le client paie différemment.',
            elementSelector: '[data-guide="payment-method"]',
            position: 'bottom',
            action: 'Choisissez le mode de paiement',
            tips: [
                '💵 **Cash (défaut)** : Mode pré-sélectionné. Montant remis à votre décompte personnel en fin de journée',
                '📱 **Mobile** : Paiement sans contact via téléphone (moins fréquent que cash)',
                '💳 **Carte** : Paiement par carte bancaire (très rare, remise directe au gérant)',
                '✏️ Vous pouvez modifier le mode si vous vous êtes trompé',
            ],
        },
        {
            id: 'step-6',
            emoji: '🚀',
            title: 'Envoyer pour Validation',
            description: 'Cliquez sur Confirmer pour finaliser la vente. Votre gérant recevra la notification pour valider votre vente.',
            elementSelector: '[data-guide="submit-sale-btn"]',
            position: 'bottom',
            action: 'Cliquez sur Confirmer',
            tips: [
                '⏳ Votre vente passe en "Attente de validation"',
                '👁️ Vous pouvez consulter la vente en attente, mais ne pouvez pas la modifier',
                '⏱️ Les ventes en attente expirent à la clôture caisse (défaut: 6h du matin)',
            ],
        },
        {
            id: 'step-7',
            emoji: '🎉',
            title: 'Vente Enregistrée !',
            description: 'Félicitations, vous avez maîtrisé la création de vente. Vous pouvez consulter vos ventes en attente dans le tableau de bord.',
            position: 'center',
            action: 'Terminer',
            tips: [
                '📊 Consultez vos ventes en attente en haut du tableau de bord',
                '📋 Accédez à l\'historique complet dans le menu "Historique"',
                'Votre gérant sera notifié pour validation',
            ],
        },
    ],
};

/**
 * Guide 2: Dashboard Overview for Servers
 * View personal metrics and pending sales validation
 */
export const SERVEUR_DASHBOARD_GUIDE: GuideTour = {
    id: 'serveur-dashboard',
    title: 'Votre Tableau de Bord',
    subtitle: 'Suivez vos ventes et performances',
    description: 'Consultez vos métriques, ventes en attente et performances de la journée.',

    targetRoles: ['serveur'],

    estimatedDuration: 3,
    difficulty: 'beginner',
    emoji: '📊',
    version: 1,

    triggers: [
        {
            type: 'onMount',
            condition: 'isDashboard',
            delay: 2000,
            showOnce: false,
        },
    ],

    steps: [
        {
            id: 'step-1',
            emoji: '👋',
            title: 'Bienvenue sur Votre Espace Personnel !',
            description:
                'Ce tableau de bord affiche uniquement vos données personnelles : vos ventes, votre CA, vos performances et votre caisse.',
            position: 'center',
            action: 'Cliquez sur Suivant pour continuer',
            tips: [
                'Toutes les informations se mettent à jour en temps réel',
                'Vous ne voyez que vos propres données (pas celles des autres serveurs)',
                'Vérifiez régulièrement ce tableau pour valider vos ventes',
            ],
        },

        {
            id: 'step-2',
            emoji: '💰',
            title: 'Votre Chiffre d\'Affaires du Jour',
            description:
                'En haut à gauche, voyez votre chiffre d\'affaires net pour la journée commerciale actuelle (sans ventes en attente).',
            elementSelector: '[data-guide="revenue-widget"]',
            position: 'bottom',
            action: 'Consultez votre CA net',
            tips: [
                '**CA Net** = Montant total de vos ventes validées',
                'Les ventes en attente de validation ne sont pas comptées',
                'Se remet à zéro à la clôture caisse (défaut: 6h du matin)',
            ],
        },

        {
            id: 'step-3',
            emoji: '⏳',
            title: 'Ventes en Attente de Validation',
            description:
                'Voyez toutes vos ventes qui attendent validation du gérant. Vous pouvez les consulter dans le détail pour vérifier qu\'elles sont correctes avant validation.',
            elementSelector: '[data-guide="pending-sales"]',
            position: 'bottom',
            action: 'Vérifiez vos ventes en attente',
            tips: [
                '⏱️ Les ventes expirent à la clôture caisse si non validées',
                '👁️ Vous pouvez consulter les détails de chaque vente',
                '⚠️ Vous ne pouvez pas modifier une vente en attente',
                '✅ Une fois validée par le gérant, impossible de modifier',
            ],
        },

        {
            id: 'step-4',
            emoji: '🏆',
            title: 'Vos Top Produits',
            description:
                'Découvrez les 3 articles que vous vendez le plus souvent. Cela vous aide à anticiper les besoins en stock.',
            elementSelector: '[data-guide="top-products"]',
            position: 'bottom',
            action: 'Consultez vos meilleurs articles',
            tips: [
                'Basé sur les ventes validées du jour',
                'Vous pouvez identifier les produits à avoir en priorité',
                'Utile pour préparer votre service et éviter les ruptures',
            ],
        },

        {
            id: 'step-5',
            emoji: '⚠️',
            title: 'Alertes Stock - Produits en Rupture',
            description:
                'Vérifiez les produits en alerte stock. Si vous voyez une alerte, signalez-le à votre gérant pour réapprovisionner.',
            elementSelector: '[data-guide="stock-alerts"]',
            position: 'bottom',
            action: 'Vérifiez les alertes stock',
            tips: [
                '🔴 Rupture stock : Produit plus disponible en rayon',
                '🟡 Faible stock : Moins de 5 unités restantes',
                'Signaler rapidement au gérant les ruptures',
                'Consultez aussi l\'historique pour analyser la consommation',
            ],
        },

        {
            id: 'step-6',
            emoji: '📱',
            title: 'Exporter Vos Ventes sur WhatsApp',
            description:
                'En bas du tableau de bord, un bouton pour exporter un rapport de vos ventes du jour directement sur WhatsApp.',
            elementSelector: '[data-guide="whatsapp-export"]',
            position: 'top',
            action: 'Cliquez pour exporter vos données',
            tips: [
                '📱 Bouton **WhatsApp** : Envoie un rapport de vos ventes validées du jour',
                'Le rapport inclut : CA, nombre de ventes, articles, top produits',
                'Pratique pour communiquer avec votre gérant ou patron',
                'Vous pouvez exporter plusieurs fois par jour',
            ],
        },

        {
            id: 'step-7',
            emoji: '✅',
            title: 'Vous Êtes Prêt !',
            description:
                'Vous maîtrisez maintenant votre tableau de bord personnel. Pour explorer d\'autres fonctionnalités, ouvrez le menu hamburger (☰) : Historique, Retours, Consignations, etc.',
            position: 'center',
            action: 'Cliquez sur Fermer pour commencer',
            tips: [
                '☰ Menu hamburger en haut à droite pour naviguer',
                'Guides spécifiques disponibles pour chaque section',
                'Vérifiez régulièrement vos ventes et alertes stock',
                'Bonne vente ! 🎉',
            ],
        },
    ],
};

/**
 * Guide 3: History/Analytics for Servers
 * Review sales with filters and export options
 */
export const SERVEUR_HISTORY_GUIDE: GuideTour = {
    id: 'serveur-history',
    title: 'Consulter Votre Historique',
    subtitle: 'Revoyez et analysez vos ventes',
    description: 'Accédez à l\'historique complet de vos ventes avec filtres et exports.',

    targetRoles: ['serveur'],

    estimatedDuration: 3,
    difficulty: 'intermediate',
    emoji: '📝',
    version: 1,

    triggers: [
        {
            type: 'onMount',
            condition: 'isHistoryPage',
            delay: 1500,
            showOnce: false,
        },
    ],

    steps: [
        {
            id: 'step-1',
            emoji: '👋',
            title: 'Bienvenue à l\'Historique des Ventes !',
            description:
                'Vous voyez ici toutes vos ventes passées et validées. Vous avez accès à des filtres pour analyser vos ventes par période.',
            position: 'center',
            action: 'Cliquez sur Suivant pour continuer',
            tips: [
                '✅ Vous voyez uniquement vos ventes validées (pas les autres serveurs)',
                '⏳ Les ventes en attente de validation n\'apparaissent pas ici',
                '📊 Vous pouvez filtrer par date et rechercher des ventes spécifiques',
                'Les données se mettent à jour en temps réel',
            ],
        },

        {
            id: 'step-2',
            emoji: '🔍',
            title: 'Rechercher et Filtrer par Date',
            description:
                'Utilisez les boutons de filtre en haut pour sélectionner une période : Aujourd\'hui, Hier, 7 jours, 30 jours, ou une plage personnalisée. Vous pouvez aussi rechercher par ID de vente ou nom de produit.',
            elementSelector: '[data-guide="history-filters"]',
            position: 'bottom',
            action: 'Cliquez sur les filtres pour personnaliser',
            tips: [
                '📅 **Filtres rapides** : Aujourd\'hui, Hier, 7 jours, 30 jours (boutons en haut)',
                '📅 **Filtre personnalisé** : Sélectionnez deux dates précises (début et fin)',
                '🔍 **Recherche texte** : Tapez l\'ID de la vente ou le nom du produit',
                '⚡ Les filtres s\'appliquent instantanément',
            ],
        },

        {
            id: 'step-3',
            emoji: '📋',
            title: 'Tableau des Ventes',
            description:
                'Consultez le détail de chaque vente : date, produits, montant, mode de paiement, statut.',
            elementSelector: '[data-guide="history-table"]',
            position: 'top',
            action: 'Explorez vos ventes',
            tips: [
                'Chaque ligne représente une vente',
                'Cliquez sur une vente pour voir ses détails complets',
                'Les ventes rejetées affichent le motif du rejet',
                'Analysez vos patterns de vente pour optimiser votre service',
            ],
        },

        {
            id: 'step-4',
            emoji: '💾',
            title: 'Exporter vos Données',
            description:
                'Téléchargez l\'historique complet en Excel ou envoyez-le sur WhatsApp. Utile pour analyse personnelle ou rapports.',
            elementSelector: '[data-guide="history-export"]',
            position: 'bottom',
            action: 'Cliquez pour exporter',
            tips: [
                '📊 **Excel** : Fichier complet de toutes vos ventes avec tous les détails',
                '📱 **WhatsApp** : Rapport formaté facile à lire et partager',
                'L\'export respecte les filtres appliqués',
                'Conservez vos rapports pour suivre votre progression',
            ],
        },

        {
            id: 'step-5',
            emoji: '✅',
            title: 'Vous Maîtrisez Votre Historique !',
            description:
                'Vous avez maintenant tous les outils pour analyser vos ventes passées et suivre votre progression.',
            position: 'center',
            action: 'Cliquez sur Fermer pour commencer',
            tips: [
                'Consultez régulièrement votre historique',
                'Analysez vos trends (heures de pointe, produits populaires)',
                'Utilisez les données pour optimiser votre service',
            ],
        },
    ],
};

/**
 * Guide 4: Returns Management for Servers
 * View and understand returns on personal sales
 */
export const SERVEUR_RETURNS_GUIDE: GuideTour = {
    id: 'serveur-returns',
    title: 'Gérer Les Retours',
    subtitle: 'Consultez les retours sur vos ventes',
    description: 'Comprendre et consulter les retours effectués sur vos ventes.',

    targetRoles: ['serveur'],

    estimatedDuration: 2,
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
                'Vous consultez ici les retours effectués sur vos ventes. Vous pouvez les voir mais vous ne pouvez pas en créer (seul le gérant peut).',
            position: 'center',
            action: 'Cliquez sur Suivant pour continuer',
            tips: [
                '🔍 Vous voyez uniquement les retours de vos propres ventes',
                '📋 Chaque retour affiche le produit, la raison et le montant remboursé',
                'Les retours affectent votre CA du jour',
            ],
        },

        {
            id: 'step-2',
            emoji: '📋',
            title: 'Liste des Retours',
            description:
                'Consultez tous les retours effectués sur vos ventes : produit retourné, raison (défaut, erreur, non consommé, etc.), montant remboursé.',
            elementSelector: '[data-guide="returns-table"]',
            position: 'bottom',
            action: 'Examinez les détails de chaque retour',
            tips: [
                '⏰ Retours autorisés avant clôture caisse (défaut: 6h du matin)',
                '💰 Le montant remboursé réduit votre CA du jour',
                '📝 Chaque retour a une raison enregistrée',
                'Analysez les retours fréquents pour améliorer votre service',
            ],
        },

        {
            id: 'step-3',
            emoji: '🔍',
            title: 'Filtrer vos Retours',
            description:
                'Utilisez les filtres pour trouver les retours par date, raison ou statut.',
            elementSelector: '[data-guide="returns-filters"]',
            position: 'bottom',
            action: 'Filtrez pour affiner votre recherche',
            tips: [
                '📅 Filtrer par date : Jour, semaine, mois ou plage personnalisée',
                '🔍 Rechercher par ID de vente ou nom de produit',
                '📂 Filtrer par statut : En attente, Approuvé, Rejeté',
            ],
        },

        {
            id: 'step-4',
            emoji: '✅',
            title: 'Comprendre Vos Retours !',
            description:
                'Vous avez maintenant une vue d\'ensemble des retours. Travaillez avec votre gérant pour minimiser les retours inutiles.',
            position: 'center',
            action: 'Cliquez sur Fermer pour commencer',
            tips: [
                'Les retours sont importants pour la qualité du service',
                'Collaborez avec votre gérant pour éviter les erreurs',
                'Documentez les défauts pour améliorer la qualité',
            ],
        },
    ],
};

/**
 * Guide 5: Consignments for Servers
 * View and understand consignments on personal sales
 */
export const SERVEUR_CONSIGNMENTS_GUIDE: GuideTour = {
    id: 'serveur-consignments',
    title: 'Gérer Les Consignations',
    subtitle: 'Consultez les consignations de vos ventes',
    description: 'Comprendre et consulter les consignations effectuées sur vos ventes.',

    targetRoles: ['serveur'],

    estimatedDuration: 2,
    difficulty: 'intermediate',
    emoji: '📦',
    version: 1,

    triggers: [
        {
            type: 'onMount',
            condition: 'isConsignmentsPage',
            delay: 1500,
            showOnce: false,
        },
    ],

    steps: [
        {
            id: 'step-1',
            emoji: '👋',
            title: 'Bienvenue aux Consignations !',
            description:
                'Vous consultez ici les consignations effectuées sur vos ventes. Une consignation est un produit **déjà payé** (vente effectuée) que le client a laissé au bar et ne peut pas consommer immédiatement.',
            position: 'center',
            action: 'Cliquez sur Suivant pour continuer',
            tips: [
                '📦 Consignation : Produit payé que le client a laissé au bar en attente de récupération',
                '🔍 Vous voyez uniquement les consignations de vos propres ventes',
                '⏰ Chaque consignation a une date d\'expiration (délai paramétré par votre gérant)',
            ],
        },

        {
            id: 'step-2',
            emoji: '📋',
            title: 'Consignations Actives de Vos Ventes',
            description:
                'Consultez les produits que vous avez laissé en consignation : le client a payé mais laisse le produit au bar en attente de récupération.',
            elementSelector: '[data-guide="consignments-table"]',
            position: 'bottom',
            action: 'Examinez chaque consignation',
            tips: [
                '📦 Consignation = Produit déjà payé que le client a laissé au bar',
                '⏰ Le délai avant expiration est défini par votre gérant (7 jours par défaut)',
                '👁️ Vous pouvez consulter mais ne pouvez pas modifier les consignations',
                'Seul votre gérant peut valider la récupération ou confisquer le produit',
            ],
        },

        {
            id: 'step-3',
            emoji: '🔍',
            title: 'Rechercher dans l\'Historique',
            description:
                'Utilisez la recherche pour retrouver les consignations passées. L\'onglet Historique affiche le statut final de chaque consignation.',
            elementSelector: '[data-guide="consignments-filters"]',
            position: 'bottom',
            action: 'Recherchez pour affiner votre recherche',
            tips: [
                '🔍 Rechercher : par nom de client, produit, ou ID de consignation',
                '🔄 Statuts possibles : Récupérée (client a pris son produit) ou Confisquée (délai expiré, produit réintégré au stock)',
                '📅 Les consignations expirent automatiquement selon le délai paramétré',
            ],
        },

        {
            id: 'step-4',
            emoji: '✅',
            title: 'Vous Maîtrisez Les Consignations !',
            description:
                'Vous avez maintenant une vue d\'ensemble des consignations. Travaillez avec votre gérant pour gérer les retours de bouteilles et articles.',
            position: 'center',
            action: 'Cliquez sur Fermer pour commencer',
            tips: [
                'Les consignations sont importantes pour la gestion des emballages',
                'Vérifiez que les crédits sont bien appliqués aux clients',
                'Collaborez avec votre gérant pour clôturer les consignations complètes',
            ],
        },
    ],
};

export const SERVEUR_GUIDES: GuideTour[] = [
    SERVEUR_FIRST_SALE_GUIDE,
    SERVEUR_DASHBOARD_GUIDE,
    SERVEUR_HISTORY_GUIDE,
    SERVEUR_RETURNS_GUIDE,
    SERVEUR_CONSIGNMENTS_GUIDE,
];
