import { GuideTour } from '@/types/guide';

/**
 * Guide: Accounting Module for Promoters
 * Comprehensive tour of the accounting features
 */
export const ACCOUNTING_MODULE_GUIDE: GuideTour = {
    id: 'accounting-guide',
    title: 'Maîtrisez votre Comptabilité',
    subtitle: 'Gestion financière et performance',
    description: 'Apprenez à piloter la santé financière de votre bar : revenus, dépenses, salaires et résultats.',

    targetRoles: ['promoteur'],

    estimatedDuration: 6,
    difficulty: 'intermediate',
    emoji: '💰',
    version: 1,

    triggers: [
        {
            type: 'onMount',
            condition: 'isAccountingPage',
            delay: 1500,
            showOnce: false,
        },
    ],

    steps: [
        // ==================== INTRODUCTION ====================
        {
            id: 'step-1',
            emoji: '👋',
            title: 'Bienvenue dans votre Espace Comptable',
            description:
                'Cet espace est **réservé exclusivement aux promoteurs**. C’est ici que vous pilotez la rentabilité réelle de votre établissement. Le module se divise en **3 onglets** : Vue Globale, Revenus et Dépenses (incluant les salaires).',
            position: 'center',
            tips: [
                '🔄 Données **synchronisées** : Les chiffres reflètent les opérations validées et synchronisées',
                '📅 Les calculs suivent votre **journée commerciale** (basée sur votre heure de clôture)',
                '🔐 Accès restreint : Seul vous avez une vision complète des marges et salaires',
            ],
        },

        // ==================== FILTRES DE PÉRIODE ====================
        {
            id: 'step-2',
            emoji: '📅',
            title: 'Contrôlez la Période d\'Analyse',
            description:
                'Avant toute analyse, vérifiez toujours la **période sélectionnée**. Les statistiques (Revenus/Dépenses) sont regroupées par **journée commerciale** (ex: de 6h à 6h si votre bar ferme à l\'aube).',
            elementSelector: '.date-range-filter-container',
            position: 'bottom',
            tips: [
                '📈 Comparez le mois actuel au mois précédent pour mesurer votre croissance',
                '⚠️ Les chiffres d\'"Aujourd\'hui" incluent les ventes depuis la dernière ouverture de caisse',
            ],
        },

        // ==================== VUE GLOBALE - KPIs ====================
        {
            id: 'step-3',
            emoji: '📈',
            title: 'KPIs : La Santé de votre Bar',
            description:
                'L\'onglet **Vue Globale** affiche vos indicateurs de performance clés. Surveillez le **Chiffre d\'Affaires**, le **Résultat d\'Exploitation** et votre **Marge Bénéficiaire**. Ces KPIs sont mis à jour après chaque synchronisation.',
            elementSelector: '[data-guide="accounting-kpis"]',
            position: 'bottom',
            tips: [
                '💰 **Résultat d\'Exploitation** = Revenus - Dépenses Opérationnelles',
                '🎯 Visez une marge stable pour assurer la pérennité de votre bar',
            ],
        },

        // ==================== REVENUS ====================
        {
            id: 'step-4',
            emoji: '➕',
            title: 'Détail des Revenus',
            description:
                'L\'onglet **Revenus** segmente vos rentrées d\'argent. Identifiez quel type de consommation génère le plus de cash et analysez les méthodes de paiement les plus utilisées.',
            elementSelector: '[data-role="tab-revenues"]',
            position: 'bottom',
            tips: [
                '🍹 Voyez quels produits sont vos "vaches à lait"',
                '💳 Comparez le cash vs les paiements mobiles',
                '📊 **Export** : Utilisez le bouton dédié pour extraire vos données en Excel/CSV pour un expert-comptable',
            ],
        },

        // ==================== DÉPENSES & SALAIRES ====================
        {
            id: 'step-5',
            emoji: '➖',
            title: 'Gestion des Dépenses & Salaires',
            description:
                'Ici, vous gérez vos coûts. **Approvisionnements**, charges fixes et **paie du personnel**. Notez que les filtres de date ici suivent la **date réelle de paiement** pour votre trésorerie.',
            elementSelector: '[data-role="tab-expenses"]',
            position: 'bottom',
            tips: [
                '💸 **Salaires** : Filtrés par date de décaissement (Trésorerie)',
                '📦 Les approvisionnements sont automatiquement importés ici après achat',
                '💡 Une dépense enregistrée réduit immédiatement votre résultat affiché',
            ],
        },

        // ==================== CONCLUSION ====================
        {
            id: 'step-6',
            emoji: '🎯',
            title: 'Prêt pour un Pilotage Expert !',
            description:
                'Vous avez maintenant les clés pour une gestion financière rigoureuse. Une comptabilité à jour vous permet de prendre les bonnes décisions pour votre établissement.',
            position: 'center',
            tips: [
                '📕 Consultez régulièrement pour ne jamais être surpris par vos charges',
                '💬 Utilisez ce bouton Bleu à tout moment si vous avez un doute',
            ],
            action: 'Terminer le guide',
        },
    ],
};
