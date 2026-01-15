import { GuideTour } from '@/types/guide';

/**
 * Guide 1: Manager Dashboard Overview
 * Focus on sales creation and team validation
 */
export const MANAGER_DASHBOARD_GUIDE: GuideTour = {
    id: 'manager-dashboard',
    title: 'Votre Espace Gérant',
    subtitle: 'Gérez les ventes et validez les actions de l\'équipe',
    description: 'Apprenez à superviser les ventes en attente et à créer vos propres transactions.',

    targetRoles: ['gerant'],

    estimatedDuration: 2,
    difficulty: 'beginner',
    emoji: '👔',
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
            emoji: '👋',
            title: 'Bienvenue, Gérant !',
            description:
                'C\'est ici que vous supervisez l\'activité quotidienne. Vous avez une vue d\'ensemble sur les ventes de vos serveurs.',
            position: 'center',
            action: 'Cliquez sur Suivant',
        },
        {
            id: 'step-2',
            emoji: '➕',
            title: 'Créer une Vente',
            description:
                'Besoin de servir un client ? Utilisez ce bouton. Contrairement aux serveurs, vos ventes peuvent être validées immédiatement.',
            elementSelector: '[data-guide="quick-sale-btn"]',
            position: 'bottom',
            action: 'Ouvrez le formulaire de vente',
            tips: ['Les ventes gérants sont prioritaires dans les rapports'],
        },
        {
            id: 'step-3',
            emoji: '✅',
            title: 'Valider les Ventes Serveurs',
            description:
                'Toutes les ventes créées par vos serveurs apparaissent ici. Examinez-les et validez-les pour qu\'elles soient comptabilisées.',
            elementSelector: '[data-guide="pending-sales"]',
            position: 'bottom',
            action: 'Cliquez sur ✓ pour valider',
            tips: ['Un rejet renvoie la vente au serveur pour correction'],
        },
        {
            id: 'step-4',
            emoji: '🏆',
            title: 'Prêt à Opérer !',
            description:
                'Vous maîtrisez les bases de la gestion quotidienne. Bonne chance pour votre service !',
            position: 'center',
            action: 'Terminer',
        },
    ],
};

/**
 * Guide 2: Manager Inventory (Simplified)
 * Stock tracking without full product management
 */
export const MANAGER_INVENTORY_GUIDE: GuideTour = {
    id: 'manager-inventory',
    title: 'Suivi du Stock',
    description: 'Contrôlez les niveaux de stock et enregistrez les arrivages.',
    targetRoles: ['gerant'],
    estimatedDuration: 2,
    difficulty: 'intermediate',
    emoji: '📦',
    version: 1,
    triggers: [{ type: 'onMount', condition: 'isInventoryPage', delay: 1500 }],
    steps: [
        {
            id: 'step-1',
            emoji: '🔍',
            title: 'État des Stocks',
            description: 'Surveillez ici ce qu\'il reste en rayon et en réserve.',
            elementSelector: '[data-guide="stock-table"]',
            position: 'top',
        },
        {
            id: 'step-2',
            emoji: '🚛',
            title: 'Nouveaux Arrivages',
            description: 'Enregistrez ici les livraisons quotidiennes pour maintenir vos niveaux.',
            elementSelector: '[data-guide="supply-form"]',
            position: 'bottom',
        }
    ]
};

export const MANAGER_GUIDES: GuideTour[] = [
    MANAGER_DASHBOARD_GUIDE,
    MANAGER_INVENTORY_GUIDE
];
