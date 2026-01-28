import { GuideTour } from '@/types/guide';
import { PROFILE_GUIDE } from './owner-guides';

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
    title: 'Maîtrisez Votre Tableau de Bord',
    subtitle: 'Vos ventes et performances en 3 onglets',
    description: 'Découvrez les 3 onglets pour suivre vos ventes, vos performances et vos consignations.',

    targetRoles: ['serveur'],

    estimatedDuration: 4,
    difficulty: 'beginner',
    emoji: '📊',
    version: 2,

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
            title: 'Bienvenue sur Votre Tableau de Bord !',
            description:
                'Votre tableau de bord se divise en **3 onglets** : **Synthèse du jour** pour vos chiffres clés, **Gestion Commandes** pour voir vos ventes en attente, et **Ma Performance** pour suivre vos résultats. Toutes les données sont **filtrées à vos seules ventes**.',
            position: 'center',
            action: 'Cliquez sur Suivant pour explorer',
            tips: [
                '🔄 Les 3 onglets sont accessibles en haut du tableau de bord',
                '⏱️ Données mises à jour en temps réel',
                '🔒 Vous ne voyez que vos propres données (pas celles des autres serveurs)',
            ],
        },

        // ONGLET 1 : SYNTHÈSE DU JOUR
        {
            id: 'step-2',
            emoji: '💰',
            title: 'Onglet 1 : Synthèse du Jour - Vos 6 Métriques',
            description:
                'Cet onglet affiche **6 métriques clés** de votre journée : **Revenus** (CA Net), **Ventes** (compteur), **Articles** vendus, **Alertes** stock, **Retours**, et **Consignations** actives. Ces chiffres se mettent à jour en temps réel.',
            elementSelector: '[data-guide="revenue-stats"]',
            position: 'bottom',
            action: 'Examinez les 6 métriques',
            tips: [
                '💚 **CA Net** = Montant total de vos ventes VALIDÉES',
                '📊 **Ventes** = nombre de ventes validées + ventes en attente',
                '📦 **Articles** = nombre total d\'articles que vous avez vendus',
                '⚠️ **Alertes** = produits proches de la rupture',
                '↩️ **Retours** = retours traités pendant votre service',
                '🥃 **Consignations** = produits que vous avez mis en consignation',
            ],
        },

        {
            id: 'step-3',
            emoji: '📈',
            title: 'Vos Top Produits & Alertes Stock',
            description:
                'Sous les 6 métriques, vous trouvez **vos 5 meilleurs produits du jour** (les plus vendus) et **les produits en alerte stock** (proches de la rupture). Ces informations vous aident à préparer votre service et anticiper les réapprovisionnements.',
            position: 'bottom',
            action: 'Consultez vos top produits et alertes',
            tips: [
                '🏆 Top 5 : Basé sur vos ventes validées du jour',
                '⚠️ Alertes : Produits proches de rupture (signaler au gérant)',
                '🔴 Rupture = plus disponible au bar',
                '🟡 Faible stock = moins de 5 unités restantes',
            ],
        },

        {
            id: 'step-4',
            emoji: '📱',
            title: 'Action : Exporter WhatsApp',
            description:
                'En bas de cet onglet, un bouton **WhatsApp** pour exporter un rapport complet de vos ventes du jour. Utile pour communiquer avec votre gérant ou votre patron.',
            elementSelector: '[data-guide="whatsapp-export"]',
            position: 'top',
            action: 'Cliquez pour exporter',
            tips: [
                '📱 **WhatsApp** : Envoie CA, ventes, articles, retours, top 5 produits',
                '✅ Basé sur vos ventes VALIDÉES',
                '⚡ Vous pouvez exporter plusieurs fois par jour',
                '💬 Parfait pour communiquer rapidement vos résultats',
            ],
        },

        // ONGLET 2 : GESTION COMMANDES
        {
            id: 'step-5',
            emoji: '⏳',
            title: 'Onglet 2 : Gestion Commandes - Vos Ventes en Attente',
            description:
                'Cet onglet affiche toutes vos ventes qui attendent validation de votre gérant. Pour chaque vente : heure de création, montant total, nombre d\'articles. Vous pouvez développer pour voir le détail des produits.',
            elementSelector: '[data-guide="pending-sales"]',
            position: 'bottom',
            action: 'Explorez une vente en attente',
            tips: [
                '📋 Chaque vente = créée par vous, en attente de validation du gérant',
                '⏱️ Heure = moment où vous avez finalisé la vente',
                '📊 Montant = total TTC des articles',
                '⬇️ Cliquez pour développer et voir les articles détaillés',
                '⏰ Les ventes expirent à la clôture caisse (défaut: 6h du matin)',
            ],
        },

        {
            id: 'step-6',
            emoji: '❌',
            title: 'Voir & Annuler Vos Ventes',
            description:
                'Pour chaque vente en attente, vous avez **1 action** : **✗ Annuler** la vente si vous vous êtes trompé. Vous pouvez aussi **consulter les détails** pour vérifier que tout est correct avant validation par le gérant.',
            position: 'bottom',
            action: 'Cliquez sur ✗ pour annuler si besoin',
            tips: [
                '👁️ Vous pouvez **consulter le détail** de chaque vente',
                '❌ **Annuler** = supprime la vente (si erreur)',
                '⚠️ Vous NE POUVEZ PAS modifier une vente en attente',
                '✅ Seul le gérant peut **valider** votre vente',
                '⏱️ Une fois validée, impossible de revenir en arrière',
            ],
        },

        // ONGLET 3 : PERFORMANCE
        {
            id: 'step-7',
            emoji: '👁️',
            title: 'Onglet 3 : Ma Performance',
            description:
                'Cet onglet affiche **votre performance personnelle** pour la journée : nombre de ventes validées et **chiffre d\'affaires net** généré. Suivez votre progression en temps réel.',
            elementSelector: '[data-guide="team-performance"]',
            position: 'bottom',
            action: 'Consultez votre performance',
            tips: [
                '📈 **CA Net** = Ventes validées - Retours remboursés',
                '📊 **Ventes** = nombre de ventes QUE VOUS AVEZ VALIDÉES',
                '🏆 Seules les ventes validées par le gérant sont comptées',
                '🔄 Données mises à jour en temps réel',
                '💪 Utilisez ces chiffres pour suivre votre progression',
            ],
        },

        // CONCLUSION
        {
            id: 'step-8',
            emoji: '✅',
            title: 'Vous Maîtrisez Votre Tableau de Bord !',
            description:
                'Félicitations ! Vous connaissez les 3 onglets de votre tableau de bord personnel : **Synthèse du jour** (vos chiffres clés), **Gestion Commandes** (vos ventes en attente), **Ma Performance** (vos résultats). Pour explorer d\'autres fonctionnalités, ouvrez le menu hamburger (☰).',
            position: 'center',
            action: 'Cliquez sur Fermer pour commencer',
            tips: [
                '☰ Menu hamburger → Historique, Retours, Consignations',
                '📝 Guide Historique : revoyez toutes vos ventes validées',
                '↩️ Guide Retours : gérez les retours de clients',
                '🥃 Guide Consignations : suivez les produits mis de côté',
                '💪 Bonne vente et bonne journée ! 🎉',
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
    title: 'Votre Historique & Analytics',
    subtitle: 'Analysez vos ventes en 3 vues',
    description: 'Consultez vos ventes en 3 formats (Liste, Cartes, Analytics) avec filtres, recherche et exports.',

    targetRoles: ['serveur'],

    estimatedDuration: 5,
    difficulty: 'intermediate',
    emoji: '📝',
    version: 2,

    triggers: [
        {
            type: 'onMount',
            condition: 'isHistoryPage',
            delay: 1500,
            showOnce: false,
        },
    ],

    steps: [
        // ==================== INTRODUCTION ====================
        {
            id: 'step-1',
            emoji: '👋',
            title: 'Bienvenue dans Votre Historique',
            description:
                'Votre **Historique** se divise en **3 vues** pour analyser toutes vos ventes en détail. Vous voyez uniquement vos ventes validées. Vous pouvez filtrer par période, chercher des ventes spécifiques, et exporter vos données.',
            position: 'center',
            visibleFor: ['serveur'],
            tips: [
                '🔄 Basculez entre les 3 vues avec les onglets en haut',
                '✅ Vous voyez uniquement vos ventes validées (pas les autres serveurs)',
                '📋 Les filtres s\'appliquent à toutes les vues instantanément',
            ],
        },

        // ==================== VUE 1: LISTE ====================
        {
            id: 'step-2',
            emoji: '📋',
            title: 'Vue 1: Tableau Complet de Vos Ventes',
            description:
                'La **Vue Liste** affiche chaque vente en **tableau détaillé** avec tous les paramètres : ID, date/heure, nombre d\'articles, total original, retours et **revenu net final**. Vous ne voyez que vos propres ventes.',
            elementSelector: '[data-guide="sales-list"]',
            position: 'bottom',
            visibleFor: ['serveur'],
            tips: [
                '📌 La colonne Revenu Net déduit automatiquement les retours approuvés',
                '🔴 Les ventes avec retours sont mises en évidence en rouge',
                '👁️ Cliquez sur une vente pour voir le détail complet du ticket',
            ],
        },

        // ==================== VUE 2: CARTES ====================
        {
            id: 'step-3',
            emoji: '📇',
            title: 'Vue 2: Cartes Visuelles (Mini-tickets)',
            description:
                'La **Vue Cartes** affiche vos ventes sous format **mini-ticket**. Parfait pour un aperçu rapide : ID, date, premiers produits, total avec retours et revenu net.',
            elementSelector: '[data-guide="sales-cards"]',
            position: 'bottom',
            visibleFor: ['serveur'],
            tips: [
                '✨ Format visuel idéal pour scanner rapidement vos ventes',
                '🎴 Chaque carte affiche un résumé avec les 2 premiers produits + "+X autres"',
                '⌚ Parfait pour les analyses sur mobile',
            ],
        },

        // ==================== VUE 3: ANALYTICS - KPIs ====================
        {
            id: 'step-4',
            emoji: '📊',
            title: 'Vue 3: Vos Analytics Personnelles',
            description:
                'La **Vue Analytics** synthétise **vos performances** avec **3 KPIs clés** (Revenu, Ventes, Articles vendus) et des **graphiques pour analyser vos résultats**.',
            elementSelector: '[data-guide="analytics-kpis"]',
            position: 'bottom',
            visibleFor: ['serveur'],
            tips: [
                '📈 Les KPIs incluent la comparaison avec la période précédente (%)',
                '🔢 "Articles" = nombre total d\'articles que vous avez vendus',
                '⚡ Tous les calculs incluent les ajustements de retours',
            ],
        },

        // ==================== VUE 3: ÉVOLUTION DU CA ====================
        {
            id: 'step-5',
            emoji: '📈',
            title: 'Analyse: Évolution de Votre Revenu',
            description:
                'Le **graphique Revenu** suit vos **revenus nets** et s\'adapte selon la période : **Par heure** (≤2j) → **Par jour** (≤14j) → **Par jour/semaine** (>14j). Identifiez vos pics d\'activité personnels.',
            elementSelector: '[data-guide="analytics-revenue-chart"]',
            position: 'top',
            visibleFor: ['serveur'],
            tips: [
                '⏰ Granularité automatique basée sur votre sélection de période',
                '🌙 Respecte vos horaires de travail',
                '💡 Identifiez vos meilleures heures et maximisez vos efforts',
            ],
        },

        // ==================== VUE 3: CATÉGORIES ====================
        {
            id: 'step-6',
            emoji: '🍰',
            title: 'Analyse: Vos Catégories de Produits',
            description:
                'Le **graphique Catégories** (Donut) montre le **revenu net que VOUS avez généré par catégorie de produits**. Identifiez vos spécialités et vos points forts.',
            elementSelector: '[data-guide="analytics-category-chart"]',
            position: 'top',
            visibleFor: ['serveur'],
            tips: [
                '🎯 Identifiez les catégories où vous êtes le plus efficace',
                '🏆 Utilisez ces insights pour progresser en tant que vendeur',
                '💰 Revenu Net = ce que vous avez réellement généré après retours',
            ],
        },

        // ==================== VUE 3: TOP PRODUITS ====================
        {
            id: 'step-7',
            emoji: '🏆',
            title: 'Analyse: Vos Top Produits',
            description:
                'Découvrez vos **champions de vente** avec 3 filtres : **Unités vendues** (volume) → **Revenus générés** (CA) → ou **Profit** (marge nette). Concentrez-vous sur ce qui fonctionne le mieux pour vous.',
            elementSelector: '[data-guide="analytics-top-products"]',
            position: 'top',
            visibleFor: ['serveur'],
            tips: [
                '⭐ Comparez volume vs revenu pour identifier vos meilleures ventes',
                '💹 Top en Profit = articles les plus rentables que vous vendez',
                '📊 Chaque vue inclut le volume et l\'analyse financière',
            ],
        },

        // ==================== FILTRES & EXPORTS ====================
        {
            id: 'step-8',
            emoji: '🔍',
            title: 'Filtres, Recherche & Export',
            description:
                'Affinez vos analyses avec **Période** (Aujourd\'hui, Hier, 7j, 30j, Personnalisé) et **Recherche** (ID ou nom produit). Exportez en **Excel** ou **CSV** pour analyse personnelle.',
            elementSelector: '[data-guide="sales-filters"]',
            position: 'bottom',
            visibleFor: ['serveur'],
            tips: [
                '⚡ Les filtres se mettent à jour instantanément',
                '🔎 Recherche par ID de vente = 6 derniers chiffres du numéro',
                '📊 Excel = avec mise en forme parfait pour vos rapports personnels',
            ],
        },

        // ==================== CONCLUSION ====================
        {
            id: 'step-9',
            emoji: '✅',
            title: 'Vous Maîtrisez Votre Historique !',
            description:
                'Vous connaissez maintenant les **3 vues**, les **filtres**, vos **analytics personnelles** et l\'**export**. Utilisez ces outils pour suivre votre progression et optimiser votre service !',
            position: 'center',
            visibleFor: ['serveur'],
            tips: [
                '📊 Consultez régulièrement vos analytics pour suivre votre progression',
                '📈 Analysez vos trends et identifiez ce qui fonctionne pour vous',
                '💡 Les données = meilleur outil pour vous améliorer en tant que vendeur',
            ],
            action: '→ Vous pouvez explorer votre historique en détail !',
        },
    ],
};

/**
 * Guide 4: Returns Management for Servers
 * View and understand returns on personal sales
 */
export const SERVEUR_RETURNS_GUIDE: GuideTour = {
    id: 'serveur-returns',
    title: 'Consulter Vos Retours',
    subtitle: 'Suivez les retours et remboursements de vos ventes',
    description: 'Consultez les retours effectués sur vos ventes et comprenez leur impact sur votre CA.',

    targetRoles: ['serveur'],

    estimatedDuration: 3,
    difficulty: 'beginner',
    emoji: '↩️',
    version: 2,

    triggers: [
        {
            type: 'onMount',
            condition: 'isReturnsPage',
            delay: 1500,
            showOnce: false,
        },
    ],

    steps: [
        // ==================== INTRODUCTION ====================
        {
            id: 'step-1',
            emoji: '👋',
            title: 'Bienvenue aux Retours !',
            description:
                'Vous consultez ici les retours effectués sur **vos propres ventes**. **Important** : Vous NE pouvez pas créer de retours (seul le gérant peut). Vous voyez **2 onglets** : **Liste** (tous vos retours) et **Statistiques** (KPIs impact).',
            position: 'center',
            visibleFor: ['serveur'],
            tips: [
                '🔍 Vous voyez UNIQUEMENT les retours de vos propres ventes',
                '💰 Chaque retour réduit votre CA du jour (remboursement débité)',
                '🔒 Seul le gérant crée et approuve les retours',
                '⏰ Retours créés avant fermeture caisse (6h matin défaut)',
            ],
        },

        // ==================== ONGLET 1: LISTE ====================
        {
            id: 'step-2',
            emoji: '📋',
            title: 'Onglet 1: Liste de Vos Retours',
            description:
                'L\'**Onglet Liste** affiche tous les retours de vos ventes. Pour chacun, vous voyez : le **produit retourné**, la **raison** (Défectueux, Erreur, Non consommé, Périmé, Autre), le **statut** (EN ATTENTE, APPROUVÉ, REJETÉ), et le **montant remboursé**.',
            elementSelector: '[data-guide="returns-list"]',
            position: 'bottom',
            visibleFor: ['serveur'],
            tips: [
                '⏳ EN ATTENTE = Retour créé par gérant, pas encore finalisé',
                '✅ APPROUVÉ = Retour finalisé, remboursement débité de votre CA',
                '❌ REJETÉ = Retour annulé par gérant, aucun impact',
                '🔴 Retours fréquents? Analyser pour améliorer qualité/service',
            ],
        },

        {
            id: 'step-3',
            emoji: '⚙️',
            title: 'Comprendre les Motifs de Retour',
            description:
                'Il existe **5 types de retours** avec impacts différents : **Défectueux** (produit cassé/défaut) | **Erreur article** (mauvais produit servi) | **Non consommé** (client changé d\'avis) | **Périmé** (produit expiré) | **Autre** (cas spéciaux - gérant décide).',
            elementSelector: '[data-guide="returns-reasons"]',
            position: 'bottom',
            visibleFor: ['serveur'],
            tips: [
                '🔴 Défectueux = Produit destroyed, remboursement OUI',
                '🟡 Erreur article = Mauvais produit, remboursement OUI',
                '🔵 Non consommé = Client change avis, remboursement NON',
                '🟣 Périmé = Produit expiré, remboursement OUI',
                '⚪ Autre = Cas spéciaux, gérant décide',
            ],
        },

        {
            id: 'step-4',
            emoji: '🔍',
            title: 'Filtrer & Rechercher Vos Retours',
            description:
                'Utilisez les **filtres de période** (Aujourd\'hui, 7j, 30j, personnalisé) et **filtres de statut** (EN ATTENTE, APPROUVÉ, REJETÉ) pour retrouver rapidement un retour. La **recherche texte** fonctionne par ID vente ou nom produit.',
            elementSelector: '[data-guide="returns-filters"]',
            position: 'bottom',
            visibleFor: ['serveur'],
            tips: [
                '📅 Période : Aujourd\'hui, 7 derniers jours, 30 derniers jours, custom',
                '🔍 Statut : Filtrez pour voir EN ATTENTE (non finalisés) ou APPROUVÉS (finalisés)',
                '🔎 Recherche : Tapez ID de vente ou nom du produit',
            ],
        },

        // ==================== ONGLET 2: STATISTIQUES ====================
        {
            id: 'step-5',
            emoji: '📊',
            title: 'Onglet 2: Statistiques Personnelles',
            description:
                'L\'**Onglet Statistiques** synthétise **l\'impact des retours sur VOTRE CA** : À traiter (count), Remboursements (total €), Retours validés (count), Remis en stock (units), Pertes (units), Taux rejet (%). Visualisez aussi la **distribution par motif** pour identifier patterns.',
            elementSelector: '[data-guide="returns-stats"]',
            position: 'bottom',
            visibleFor: ['serveur'],
            tips: [
                '🔴 À traiter = Nombre de retours EN ATTENTE',
                '💰 Remboursements = Total € remboursé (affecte votre CA)',
                '✅ Retours validés = Nombre approuvés',
                '📦 Remis en stock = Units restaurées (Erreur, Non consommé)',
                '💥 Pertes = Units perdues (Défectueux, Périmé)',
                '📈 Utilisez ces données pour améliorer votre service',
            ],
        },

        // ==================== CONCLUSION ====================
        {
            id: 'step-6',
            emoji: '✅',
            title: 'Vous Comprenez Vos Retours !',
            description:
                'Vous connaissez maintenant les **2 onglets** (Liste et Statistiques), les **5 motifs de retour**, et comment ils impactent votre CA. Utilisez ces insights pour améliorer votre service et minimiser les retours futures !',
            position: 'center',
            visibleFor: ['serveur'],
            tips: [
                '💡 Retours = Feedback de qualité (analysez les patterns)',
                '⚠️ Erreur article fréquente? Vérifiez précision des commandes',
                '💰 Non consommé élevé? Clients changent d\'avis = améliorer recommandations',
                '🤝 Travaillez avec gérant pour minimiser retours inutiles',
            ],
            action: '→ Consultez vos retours et apprenez à vous améliorer !',
        },
    ],
};

/**
 * Guide 5: Consignments for Servers
 * View and understand consignments on personal sales
 */
export const SERVEUR_CONSIGNMENTS_GUIDE: GuideTour = {
    id: 'serveur-consignments',
    title: 'Consulter Vos Consignations',
    subtitle: 'Suivez les produits en mise de côté de vos ventes',
    description: 'Consultez vos consignations actives et l\'historique des consignations complétées ou expirées.',

    targetRoles: ['serveur'],

    estimatedDuration: 3,
    difficulty: 'beginner',
    emoji: '📦',
    version: 2,

    triggers: [
        {
            type: 'onMount',
            condition: 'isConsignmentsPage',
            delay: 1500,
            showOnce: false,
        },
    ],

    steps: [
        // ==================== INTRODUCTION ====================
        {
            id: 'step-1',
            emoji: '👋',
            title: 'Bienvenue aux Consignations !',
            description:
                'Vous consultez ici les consignations effectuées sur vos ventes. Une consignation est un produit **déjà payé** par le client mais qu\'il ne peut pas consommer immédiatement. Le client laisse le produit au bar et reviendra le chercher plus tard **sans remboursement** (mise de côté). **Important** : Vous ne pouvez que CONSULTER. Seul votre gérant peut valider les récupérations ou confisquer.',
            position: 'center',
            visibleFor: ['serveur'],
            tips: [
                '✅ Consignation = Mise de côté (PAS de remboursement)',
                '📦 Client paie → laisse produits au bar → reviendra chercher',
                '🔍 Vous voyez UNIQUEMENT les consignations de vos propres ventes',
                '🔒 Vous pouvez CONSULTER mais pas modifier/valider',
            ],
        },

        // ==================== ONGLET 1: CONSIGNATIONS ACTIVES ====================
        {
            id: 'step-2',
            emoji: '📋',
            title: 'Onglet 1: Consignations Actives',
            description:
                'L\'**Onglet Consignations Actives** affiche les produits en attente de récupération : ceux que vos clients ont laissés au bar et qui n\'ont pas encore expiré. Chaque consignation affiche le **délai d\'expiration** restant.',
            elementSelector: '[data-guide="consignments-table"]',
            position: 'bottom',
            visibleFor: ['serveur'],
            tips: [
                '📦 Produit déjà payé que le client a laissé au bar',
                '🥃 Exemple : Client paie 5 bières → consomme 2 → laisse 3 en consignation',
                '⏰ Chaque consignation a un délai d\'expiration (7 jours par défaut)',
                '🚨 Passé la date limite, votre gérant peut confisquer le produit',
            ],
        },

        {
            id: 'step-3',
            emoji: '⏱️',
            title: 'Suivre l\'Urgence & l\'Expiration',
            description:
                'Chaque consignation affiche un badge d\'urgence indiquant combien de temps il reste avant expiration. Informez vos clients de récupérer leurs produits avant le délai limite, sinon ils seront confisqués et réintégrés au stock.',
            elementSelector: '[data-guide="consignments-urgency"]',
            position: 'top',
            visibleFor: ['serveur'],
            tips: [
                '🟢 Vert = Beaucoup de temps restant',
                '🟡 Jaune = Délai court, client devrait récupérer bientôt',
                '🔴 Rouge = Très court délai, dernier avertissement',
                '💡 Avertissez vos clients en fonction de l\'urgence',
            ],
        },

        // ==================== ONGLET 2: HISTORIQUE ====================
        {
            id: 'step-4',
            emoji: '📚',
            title: 'Onglet 2: Historique des Consignations',
            description:
                'L\'**Onglet Historique** affiche toutes les consignations complétées ou expirées. Vous voyez le **statut final** : Récupérée (client a pris son produit) ou Confisquée (délai expiré, produit réintégré au stock).',
            elementSelector: '[data-guide="consignments-history"]',
            position: 'bottom',
            visibleFor: ['serveur'],
            tips: [
                '✅ Récupérée = Client est revenu chercher ses produits',
                '🚫 Confisquée = Délai expiré, produit réintégré au stock vendable',
                '📅 Vous pouvez filtrer par statut pour voir juste les récupérées ou confisquées',
                '🔍 Recherchez par ID client, produit, ou date',
            ],
        },

        {
            id: 'step-5',
            emoji: '🔍',
            title: 'Rechercher & Filtrer vos Consignations',
            description:
                'Utilisez les filtres pour trouver rapidement une consignation : **Par statut** (Récupérée/Confisquée/Historique), **Par date**, ou **Recherche texte** (client, produit, ID).',
            elementSelector: '[data-guide="consignments-filters"]',
            position: 'bottom',
            visibleFor: ['serveur'],
            tips: [
                '🔄 Filtres par statut : Récupérée, Confisquée, ou Toutes',
                '📅 Filtrez par période pour analyser vos consignations',
                '🔎 Recherche texte rapide par nom client/produit',
            ],
        },

        // ==================== CONCLUSION ====================
        {
            id: 'step-6',
            emoji: '✅',
            title: 'Vous Maîtrisez vos Consignations !',
            description:
                'Vous connaissez maintenant les **2 onglets** (Actives et Historique), comment suivre l\'expiration, et comment utiliser la recherche. Votre rôle principal est d\'**informer les clients** de récupérer leurs produits avant expiration.',
            position: 'center',
            visibleFor: ['serveur'],
            tips: [
                '📦 Consultez régulièrement les consignations actives',
                '⏰ Avertissez clients quand délai approche (surtout badges rouges)',
                '📝 Historique = Suivi de vos consignations complétées/expirées',
                '🔐 Seul votre gérant peut valider récupérations ou confisquer',
            ],
            action: '→ Consultez vos consignations et aidez vos clients !',
        },
    ],
};

export const SERVEUR_GUIDES: GuideTour[] = [
    SERVEUR_FIRST_SALE_GUIDE,
    SERVEUR_DASHBOARD_GUIDE,
    SERVEUR_HISTORY_GUIDE,
    SERVEUR_RETURNS_GUIDE,
    SERVEUR_CONSIGNMENTS_GUIDE,
    PROFILE_GUIDE,
];
