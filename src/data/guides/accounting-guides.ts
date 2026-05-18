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

    estimatedDuration: 7,
    difficulty: 'intermediate',
    emoji: '💰',
    version: 2,

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
                'Cet espace est **réservé exclusivement aux promoteurs**. C\'est ici que vous pilotez la rentabilité réelle de votre établissement. Le module se divise en **3 onglets** : Vue globale, Revenus et Dépenses (qui inclut les salaires).',
            tips: [
                '🔄 Données **synchronisées** : les chiffres reflètent les opérations validées et synchronisées',
                '📅 Les calculs suivent votre **journée commerciale** (basée sur votre heure de clôture)',
                '🔐 Accès restreint : seul le promoteur a une vision complète des marges et salaires',
            ],
        },

        // ==================== FILTRE DE PÉRIODE ====================
        {
            id: 'step-2',
            emoji: '📅',
            title: 'Une période, trois onglets',
            description:
                'Le **filtre de période** est commun aux 3 onglets : si vous sélectionnez "Ce mois" dans Vue globale, vous retrouvez la même période en passant sur Revenus ou Dépenses. C\'est votre source unique de vérité pour l\'analyse.',
            tips: [
                '📈 Comparez "Ce mois" au "Mois précédent" pour mesurer votre croissance',
                '⚠️ La journée d\'aujourd\'hui inclut les ventes depuis votre dernière ouverture',
                '🔁 Le filtre est centralisé : pas besoin de le re-régler en changeant d\'onglet',
            ],
        },

        // ==================== VUE GLOBALE — TOGGLE TRÉSORERIE / ANALYTIQUE ====================
        {
            id: 'step-3',
            emoji: '🔀',
            title: 'Vue globale : 2 modes d\'analyse',
            description:
                'L\'onglet Vue globale propose **deux modes** sélectionnables via le toggle dans la barre de contrôle :\n\n• **Trésorerie** : focus sur la performance de la période (Bénéfice opérationnel, Revenus, Charges opérationnelles, Investissements)\n• **Analytique** : focus sur la position financière (Solde de début, Revenus, Coûts totaux, Solde de fin) — idéal pour le suivi long terme',
            tips: [
                '💰 **Trésorerie** = "Qu\'ai-je gagné/dépensé sur cette période ?"',
                '📊 **Analytique** = "Où en est mon solde global aujourd\'hui ?"',
                '🎯 Les deux modes partagent le même filtre de période',
            ],
        },

        // ==================== VUE GLOBALE — KPIs ====================
        {
            id: 'step-4',
            emoji: '📈',
            title: 'KPIs : la santé de votre bar',
            description:
                'En mode **Trésorerie**, les 4 cartes affichent :\n\n• **Bénéfice opérationnel** = Revenus − Charges opérationnelles (avec le pourcentage de marge)\n• **Revenus** : chiffre d\'affaires net de la période\n• **Charges opérationnelles** : dépenses courantes (hors investissements)\n• **Investissements** : dépenses durables (avec leur poids en % du CA)',
            tips: [
                '💰 Un **bénéfice opérationnel positif** = votre activité courante est rentable',
                '⚠️ Un **taux d\'investissement > 20%** déclenche un signal — vérifier que c\'est volontaire',
                '🎯 Visez une marge stable d\'un mois sur l\'autre pour assurer la pérennité',
            ],
        },

        // ==================== VUE GLOBALE — ACTIONS ====================
        {
            id: 'step-5',
            emoji: '🛠️',
            title: 'Actions de la Vue globale',
            description:
                'La barre d\'actions propose 4 boutons selon leur usage :\n\n• **Livre Journal** (vert) : export comptable conforme **SYSCOHADA** pour votre expert-comptable\n• **Export Simple** (noir) : export Excel récapitulatif (ventes, dépenses, totaux)\n• **Apport Capital** (bleu) : enregistrer un apport au capital du bar\n• **Solde Initial** (discret) : action de configuration ponctuelle — à faire une seule fois à la création du bar',
            tips: [
                '📕 **Livre Journal** = le document que votre comptable attend (norme OHADA)',
                '💼 **Apport Capital** = utile à chaque injection de fonds (les associés et vous)',
                '🔧 **Solde Initial** = trésorerie de départ, à régler une fois au lancement',
            ],
        },

        // ==================== ONGLET REVENUS ====================
        {
            id: 'step-6',
            emoji: '➕',
            title: 'Onglet Revenus : suivi journalier',
            description:
                'L\'onglet Revenus affiche **4 cartes** (Total période, Espèces, Mobile Money, Carte & Autres) puis un **tableau journalier** détaillant chaque jour de la période. Le tableau a un **en-tête collant**, met en valeur la **ligne du jour** et termine par une **ligne Total** récapitulative.',
            tips: [
                '🟠 La ligne "Aujourd\'hui" est mise en évidence en orange',
                '💳 Comparez la part du cash vs paiements mobiles pour ajuster votre stratégie',
                '🔎 Une barre de recherche au-dessus du tableau permet de filtrer par date',
                '📊 **Export** : utilisez les boutons d\'export de la Vue globale pour extraire les données',
            ],
        },

        // ==================== ONGLET DÉPENSES & SALAIRES ====================
        {
            id: 'step-7',
            emoji: '➖',
            title: 'Onglet Dépenses : coûts détaillés',
            description:
                'L\'onglet Dépenses présente **4 cartes** :\n\n• **Total période** (en grand, avec icône rouge)\n• **Opérationnel** : achats, charges, fournitures\n• **Salaires** : paies des membres de l\'équipe\n• **Investissements** : achats durables (matériel, équipement)\n\nPuis la liste des **catégories** vous permet de drilling-down : cliquez sur une catégorie pour voir les dépenses individuelles.',
            tips: [
                '💸 Les **salaires** sont filtrés par date de paiement réelle (Trésorerie)',
                '📦 Les **approvisionnements** sont importés automatiquement depuis l\'inventaire',
                '➕ Boutons en haut à droite : ajouter une dépense, un salaire ou créer une catégorie personnalisée',
                '💡 Une dépense enregistrée réduit immédiatement votre bénéfice affiché',
            ],
        },

        // ==================== CONCLUSION ====================
        {
            id: 'step-8',
            emoji: '🎯',
            title: 'Prêt pour un pilotage expert !',
            description:
                'Vous avez maintenant les clés pour une gestion financière rigoureuse. Une comptabilité à jour vous permet de prendre les bonnes décisions pour votre établissement.',
            tips: [
                '📕 Consultez régulièrement pour ne jamais être surpris par vos charges',
                '📊 Exportez le Livre Journal en fin de mois pour votre comptable',
                '💬 Le bouton Guide reste accessible en haut de page si vous avez un doute',
            ],
            action: 'Terminer le guide',
        },
    ],
};
