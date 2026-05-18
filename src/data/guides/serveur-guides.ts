import { GuideTour } from '@/types/guide';
import { PROFILE_GUIDE } from './owner-guides';

/**
 * Guide 0: Sales Process for Servers (PREMIER GUIDE)
 * Comprehensive guide for server sales workflow:
 * - Mode complet: Create pending sales, wait for manager validation
 * - Mode simplifié: Access blocked (manager creates for you)
 * - Validation workflow, rejection handling
 * - Offline & synchronisation
 * - Performance tracking
 * Server-specific perspective and terminology
 */
export const SERVEUR_SALES_PROCESS_GUIDE: GuideTour = {
  id: 'serveur-sales-process',
  title: 'Processus de Vente : Guide Serveur',
  subtitle: 'Créer des ventes, attendre validation, progresser',
  description: 'Guide complet du processus de vente du point de vue serveur : créer panier, envoyer pour validation, gérer rejets, suivre vos performances. Adapté à votre rôle et mode de fonctionnement.',

  targetRoles: ['serveur'],

  estimatedDuration: 10,
  difficulty: 'beginner',
  emoji: '🍺',
  version: 1,

  triggers: [
    {
      type: 'onMount',
      condition: 'isHomePage',
      delay: 1000,
      showOnce: true,
    },
  ],

  steps: [
    // ==================== INTRODUCTION ====================
    {
      id: 'step-1',
      emoji: '🎯',
      title: 'Bienvenue ! Votre Rôle dans BarTender',
      description:
        'Vous êtes **Serveur** 🍺. Votre mission : **capturer chaque vente avec précision**. Vous créez les ventes au comptoir, puis le **Gérant les valide**. Ce guide explique le flux complet : créer panier → sélectionner paiement → envoyer → attendre validation → voir historique. Deux modes possibles : **Mode Complet** (votre contexte normal) et **Mode Simplifié** (gérant crée à votre place).',
      tips: [
        '✅ **Mode Complet** : Vous créez ventes (pending) → Gérant valide → Stock déduit',
        '⚡ **Mode Simplifié** : Accès bloqué (Gérant crée pour vous avec votre nom)',
        '📱 Vente rapide = Accès via menu bas OU Dashboard',
        '⏳ Ventes en attente visible dans Dashboard → Synthèse',
      ],
    },

    // ==================== MODE COMPLET - VOTRE RÔLE ====================
    {
      id: 'step-2',
      emoji: '⚙️',
      title: 'Vous Êtes en Mode COMPLET',
      description:
        '**Votre bar fonctionne en Mode Complet**. Cela signifie : vous avez un **compte avec authentification**, vous **créez les ventes** que vous capturez, et le **Gérant valide** votre travail. Votre responsabilité : **précision** (bonnes quantités, bons produits), **rapidité** (service fluide), **honnêteté** (enregistrer toutes les ventes).',
      tips: [
        '👤 Vous = Compte utilisateur "Serveur"',
        '📱 Accès à "Vente Rapide" toujours disponible',
        '✅ Ventes créées en **pending** (en attente validation)',
        '⚠️ Rejet possible si erreur → vous la corrigez et renvoyez',
      ],
    },

    // ==================== CRÉER UNE VENTE ====================
    {
      id: 'step-3',
      emoji: '🛒',
      title: 'Créer une Vente : Le Flux',
      description:
        '**Flux étape par étape** : 1️⃣ Cliquez "Vente Rapide" (menu bas ou Dashboard haut) → 2️⃣ **Sélectionnez produits** demandés par client (bière, whisky, etc.) → 3️⃣ **Ajustez quantités** (+/- boutons) → 4️⃣ **Vérifiez panier** à droite (total correct ?) → 5️⃣ **Choisissez paiement** (cash par défaut) → 6️⃣ **Cliquez "Valider"** → ✅ Vente envoyée (status = pending).',
      tips: [
        '🔍 **Recherche** : Tapez nom produit pour trouver rapidement',
        '🎯 **Quantités** : Vérifiez avant d\'envoyer (pas de modification après)',
        '💰 **Paiement** : Cash = défaut, changez seulement si différent',
        '✅ **Valider** : Envoie vente au gérant (attente validation)',
      ],
    },

    // ==================== ATTENTE VALIDATION ====================
    {
      id: 'step-4',
      emoji: '⏳',
      title: 'Vente Envoyée : Attente Validation',
      description:
        '**Après "Valider"** : Votre vente passe en état **"Attente de validation"** ⏳. Le Gérant la voit dans son **Dashboard → Onglet "Gestion Commandes"**. Il peut : ✅ **Approuver** (stock déduit, vente finalisée) ou ❌ **Rejeter** (vente revient, vous recevez notification). **Temps attente** : Normalement quelques secondes/minutes, dépend du gérant.',
      tips: [
        '📊 Voir ventes en attente : Dashboard → Synthèse du jour',
        '⏱️ **Attente normale** : Gérant valide batch (plusieurs à la fois)',
        '❌ **Rejet** = Retour à vous, vous devez corriger et renvoyer',
        '✅ **Approbation** = Vente devient définitive, apparaît historique',
      ],
    },

    // ==================== CAS REJET & CORRECTION ====================
    {
      id: 'step-5',
      emoji: '❌',
      title: 'Si Vente Rejetée : Corriger & Renvoyer',
      description:
        '**Vente rejetée ?** Le Gérant a trouvé une erreur (mauvais produit, quantité incorrecte, etc.). Vous recevez **notification** dans le Dashboard. La vente revient en attente de correction. **Correction** : Créez **une nouvelle vente** (pas modifier l\'ancienne rejetée). L\'ancienne reste en historique avec statut "Rejetée". Renvoyez la nouvelle, gérant re-valide.',
      tips: [
        '📲 Notification toast quand vente rejetée',
        '🔄 Créez nouvelle vente (l\'ancienne non-modifiable)',
        '📝 Note : Regardez pourquoi rejet (dashboard peut afficher raison)',
        '✅ Renvoyez corrigée, gérant ré-approuvera',
      ],
    },

    // ==================== HISTORIQUE PERSONNEL ====================
    {
      id: 'step-6',
      emoji: '📊',
      title: 'Votre Historique : Voir Vos Ventes',
      description:
        '**Page "Historique"** affiche **TOUTES vos ventes** avec leurs statuts : ✅ **Validées** (finales, comptabilisées), ❌ **Rejetées** (à corriger), 🚫 **Annulées** (supprimées par promoteur, rare). Chaque vente affiche : heure création, produits, montant, CA Net (après retours). Utilisez pour **vérifier votre travail** et **analyser vos performances**.',
      tips: [
        '✅ Validées = Comptabilisées dans votre CA',
        '❌ Rejetées = Ignorées (pas comptabilisé)',
        '📈 **Total CA Net** = Somme validées - Retours',
        '🎯 Consultez pour savoir quand vous êtes bon (heures, produits)',
      ],
    },

    // ==================== PERFORMANCE & STATISTIQUES ====================
    {
      id: 'step-7',
      emoji: '🏆',
      title: 'Vos Performances : Suivi & Progression',
      description:
        '**Dashboard → Onglet "Performance Équipe"** affiche votre **CA Net** et **nombre de ventes** pour le jour. Vous voyez aussi les autres serveurs (comparaison saine 🎯). **Gérant utilise ces données** pour : vous motiver, reconnaître top performers, ajuster staffing. **Votre objectif** : Vendre bien (précision), vendre beaucoup (activité), garder clients heureux (pas de retours).',
      tips: [
        '💰 **CA Net** = Votre chiffre d\'affaires (plus = mieux)',
        '📊 **Nombre ventes** = Activité (plus actif = plus visible)',
        '🏆 Top performers = Reconnaissance du gérant (bonus, horaires meilleurs)',
        '💡 Apprenez des meilleurs : Notez leurs heures/produits de succès',
      ],
    },

    // ==================== OFFLINE & SYNCHRONISATION ====================
    {
      id: 'step-8',
      emoji: '📡',
      title: 'Offline : Créer Ventes Sans Réseau',
      description:
        '**Pas d\'internet ?** Vous pouvez **quand même créer des ventes** en Mode Complet ! La vente est **stockée en cache** localement. Quand réseau revient, **synchronisation automatique** : vente envoyée vers gérant. **Aucune donnée perdue**. Bannière orange = Indication offline.',
      tips: [
        '📱 Créez ventes normalement même sans réseau',
        '💾 Ventes en cache local (téléphone/ordinateur)',
        '🔄 Sync automatique quand connexion revient',
        '✅ Vente finalisée quand gérant valide après sync',
      ],
    },

    // ==================== MODE SIMPLIFIÉ (INFO) ====================
    {
      id: 'step-9',
      emoji: '⚡',
      title: 'Si Bar Passe en Mode SIMPLIFIÉ',
      description:
        '**Si votre bar bascule en Mode Simplifié** (ex: gérant solo, peu de staff) : **Vous n\'aurez plus accès** à "Vente Rapide". À la place, le Gérant crée **toutes les ventes** en utilisant votre **nom** (ex: "Ahmed", "Fifi"). Ventes attribuées directement à vous. C\'est plus simple pour gérant solo. Vous continuez à voir historique et performances.',
      tips: [
        '⚠️ Mode Simplifié = Votre bouton "Vente Rapide" disparat',
        '👤 Gérant crée ventes avec votre nom au comptoir',
        '✅ Ventes validées immédiatement (pas d\'attente)',
        '📊 Historique et stats toujours visibles',
      ],
    },

    // ==================== CONSEILS PRATIQUES ====================
    {
      id: 'step-10',
      emoji: '💡',
      title: 'Conseils Pratiques pour Performer',
      description:
        '**Précision** : Vérifiez panier avant "Valider" (pas possible modifier après). **Rapidité** : Utilisez recherche produit (tape nom) au lieu de scroller. **Honnêteté** : Enregistrez TOUTES les ventes (bar vit ou meurt par intégrité). **Attention détails** : Quantités, paiement, produits corrects = 0 rejet. **Feedback gérant** : Si rejeté, demandez pourquoi et corrigez. **Apprentissage** : Regardez quand clients achètent (heures), quoi (produits) pour proposer mieux.',
      tips: [
        '✅ Double-check panier = Zéro rejet',
        '🔍 Recherche rapide = Plus de ventes par heure',
        '💯 Précision > Vitesse (rejet = perte temps)',
        '🎯 Notez heures/produits de succès pour progresser',
      ],
    },

    // ==================== CONCLUSION ====================
    {
      id: 'step-11',
      emoji: '✅',
      title: 'Vous Maîtrisez le Processus de Vente !',
      description:
        'Félicitations ! Vous comprenez maintenant : **Créer panier rapidement** (recherche + quantités), **Sélectionner paiement** (cash défaut), **Envoyer pour validation** (status pending), **Attendre & voir résultat** (approuvé/rejeté), **Corriger si rejet**, **Suivre votre historique & performance**. Vous êtes prêt à vendre efficacement et progresser vers top performer !',
      tips: [
        '🎯 Visez 0 rejets (précision absolue)',
        '💰 Maximisez CA Net (vendre plus + produits chers)',
        '🏆 Devenez top performer du mois',
        '💬 Questions ? Demandez au gérant (toujours disponible)',
      ],
      action: '→ Créez votre première vente maintenant !',
    },
  ],
};

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
    SERVEUR_SALES_PROCESS_GUIDE,       // 🍺 Premier guide - Processus complet de vente serveur
    SERVEUR_FIRST_SALE_GUIDE,
    SERVEUR_DASHBOARD_GUIDE,
    SERVEUR_HISTORY_GUIDE,
    SERVEUR_RETURNS_GUIDE,
    SERVEUR_CONSIGNMENTS_GUIDE,
    PROFILE_GUIDE,
];
