import { GuideTour } from '@/types/guide';

/**
 * Guide 1: First Sale for Bartenders
 * Step-by-step guide to the quick sale flow
 */
export const BARTENDER_FIRST_SALE_GUIDE: GuideTour = {
    id: 'create-first-sale',
    title: 'Créer Votre Première Vente',
    subtitle: 'Vitesse et précision pour votre service',
    description: 'Apprenez à utiliser le terminal de vente pour servir vos clients en quelques secondes.',

    targetRoles: ['serveur'],

    estimatedDuration: 3,
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
                'Chaque boisson servie doit être enregistrée ici pour garantir la justesse de votre caisse et de votre stock.',
            position: 'center',
            action: 'Suivant',
        },
        {
            id: 'step-2',
            emoji: '➕',
            title: 'Ouvrir une Vente',
            description: 'Cliquez sur ce bouton pour lancer le terminal de vente.',
            elementSelector: '[data-guide="quick-sale-btn"]',
            position: 'bottom',
            action: 'Cliquez pour ouvrir',
        },
        {
            id: 'step-3',
            emoji: '🥃',
            title: 'Choisir les Produits',
            description: 'Sélectionnez les articles demandés par le client.',
            elementSelector: '[data-guide="product-selector"]',
            position: 'bottom',
            tips: ['Vous pouvez ajuster les quantités directement'],
        },
        {
            id: 'step-4',
            emoji: '💳',
            title: 'Mode de Paiement',
            description: 'Indiquez comment le client règle : Cash ou Carte.',
            elementSelector: '[data-guide="payment-method"]',
            position: 'bottom',
            tips: ['Le cash est intégré à votre décompte personnel'],
        },
        {
            id: 'step-5',
            emoji: '🚀',
            title: 'Envoyer pour Validation',
            description: 'Cliquez sur Confirmer. Votre gérant recevra la notification pour valider votre vente.',
            elementSelector: '[data-guide="submit-sale-btn"]',
            position: 'bottom',
            tips: ['Tant que ce n\'est pas validé, vous pouvez modifier la vente'],
        },
        {
            id: 'step-6',
            emoji: '🎉',
            title: 'Vente Enregistrée !',
            description: 'Félicitations, vous avez maîtrisé l\'outil de vente. À vous de jouer !',
            position: 'center',
            action: 'Terminer',
        },
    ],
};

/**
 * Guide 2: Bartender Performance
 */
export const BARTENDER_STATS_GUIDE: GuideTour = {
    id: 'bartender-stats',
    title: 'Suivre Votre Performance',
    description: 'Voyez vos ventes du jour et votre classement.',
    targetRoles: ['serveur'],
    estimatedDuration: 2,
    difficulty: 'beginner',
    emoji: '📈',
    version: 1,
    triggers: [{ type: 'onMount', condition: 'isStatsPage', delay: 1500 }],
    steps: [
        {
            id: 'step-1',
            emoji: '📊',
            title: 'Votre Tableau de Bord',
            description: 'Consultez ici vos revenus générés aujourd\'hui et votre efficacité.',
            position: 'center',
        }
    ]
};

export const BARTENDER_GUIDES: GuideTour[] = [
    BARTENDER_FIRST_SALE_GUIDE,
    BARTENDER_STATS_GUIDE
];
