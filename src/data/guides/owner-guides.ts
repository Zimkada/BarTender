/**
 * Unified Guides (Promoteur + Gérant)
 * Complete guides for bar owners and managers to master the system
 * Role-based step filtering: some steps visible only to specific roles
 * Test case: dashboard-overview (Phase 1)
 */

import { GuideTour } from '@/types/guide';
import { ACCOUNTING_MODULE_GUIDE } from './accounting-guides';

/**
 * Guide 0: Sales Process (PREMIER GUIDE)
 * Comprehensive guide covering all sales scenarios:
 * - Mode complet (serveur pending → gérant validation)
 * - Mode simplifié (gérant direct avec mappings)
 * - Offline & synchronisation
 * - Bons & paiement différé
 * - Cas avancés (retours, annulations)
 * Accessible à tous les rôles avec étapes role-spécifiques
 */
export const SALES_PROCESS_GUIDE: GuideTour = {
  id: 'sales-process',
  title: 'Processus de Vente BarTender',
  subtitle: 'Du panier à la validation : tous les scénarios',
  description: 'Guide complet du processus de vente : création, validation, bons, offline et cas avancés. Adapté à votre rôle et mode de fonctionnement.',

  targetRoles: ['promoteur', 'gerant', 'serveur'],

  estimatedDuration: 12,
  difficulty: 'intermediate',
  emoji: '🛍️',
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
      title: 'Bienvenue au Processus de Vente BarTender !',
      description:
        'BarTender gère les ventes selon **2 modes de fonctionnement** et **votre rôle**. Ce guide couvre tous les scénarios : mode complet (serveurs créent, gérant valide), mode simplifié (gérant crée tout), bons/paiement différé, offline & synchronisation. Découvrez comment fonctionne votre bar !',
      position: 'center',
      visibleFor: ['promoteur', 'gerant', 'serveur'],
      tips: [
        '📋 **Mode Complet** : Serveurs créent ventes (pending) → Gérant valide → Stock déduit',
        '⚡ **Mode Simplifié** : Gérant crée ventes directement (validated) avec noms serveurs',
        '📱 **Bons** : Paiement différé, traçabilité commandes',
        '🌐 **Offline** : Ventes en cache, sync automatique quand réseau revient',
      ],
    },

    // ==================== MODE COMPLET - SERVEUR ====================
    {
      id: 'step-2',
      emoji: '🍺',
      title: 'Mode Complet : Vous êtes SERVEUR',
      description:
        '**En Mode Complet**, vous avez un **compte avec authentification**. Vous créez les ventes au comptoir, puis un **Gérant les valide**. Votre rôle : capter les commandes clients avec précision. Le Gérant assure la validité et la comptabilité.',
      position: 'bottom',
      visibleFor: ['serveur'],
      tips: [
        '✅ Vous créez ventes (Panier → Paiement → Envoyer)',
        '⏳ Ventes en attente de validation par Gérant',
        '👀 Vous voyez votre historique personnel dans "Historique" page',
        '❌ En Mode Simplifié, vous n\'avez pas accès (Gérant crée pour vous)',
      ],
    },

    {
      id: 'step-3',
      emoji: '📋',
      title: 'Mode Complet - Serveur : Flux Étape par Étape',
      description:
        '**Flux de créati vente** : 1️⃣ Cliquez "Vente Rapide" (menu bas ou Dashboard) → 2️⃣ Sélectionnez produits demandés par client → 3️⃣ Vérifiez panier (quantités, prix) → 4️⃣ Choisissez paiement (cash, mobile, carte) → 5️⃣ Cliquez "Valider" → ✅ Vente envoyée (status=pending) → Attente gérant.',
      elementSelector: '[data-guide="quick-sale-btn"]',
      position: 'bottom',
      visibleFor: ['serveur'],
      tips: [
        '💰 Paiement = Spécifiez à la création (cash par défaut)',
        '⏳ Vente reste "en attente" jusqu\'à validation gérant',
        '📱 Pouvez voir ventes en attente dans Dashboard → Synthèse',
        '🔄 Rejet possible : Si gérant rejette, modifiez et renvoyez',
      ],
    },

    {
      id: 'step-4',
      emoji: '📊',
      title: 'Mode Complet - Serveur : Vos Performances',
      description:
        'Votre **historique personnel** (page "Historique") affiche toutes vos ventes : **validées** (finales, comptabilisées), **rejetées** (retournées pour correction), **annulées** (supprimées par promoteur). Analysez vos **CA net** et nombre de ventes pour progresser. Gérant utilise ces données pour vous motiver !',
      elementSelector: '[data-guide="sales-history"]',
      position: 'bottom',
      visibleFor: ['serveur'],
      tips: [
        '✅ Ventes Validées = Finales, stock déduit, comptabilisées',
        '❌ Ventes Rejetées = À modifier et renvoyer (ou ignorer)',
        '🚫 Ventes Annulées = Supprimées par promoteur (rare)',
        '📈 Consultez pour savoir quels produits/heures vous performez bien',
      ],
    },

    // ==================== MODE COMPLET - GÉRANT ====================
    {
      id: 'step-5',
      emoji: '⚙️',
      title: 'Mode Complet : Vous êtes GÉRANT',
      description:
        '**En Mode Complet**, votre rôle double : **créer ventes directes** (vous validées auto) + **valider ventes serveurs**. Vous pilotez les stocks, la comptabilité et contrôlez la qualité. Dashboard central pour superviser tous.',
      position: 'bottom',
      visibleFor: ['gerant', 'promoteur'],
      tips: [
        '🎯 **Ventes propres** : Validées instantanément (pas d\'attente)',
        '📋 **Ventes serveurs** : En attente dans Dashboard → "Gestion Commandes"',
        '✅ **Validation** : ✅ Valider | ❌ Rejeter | ✓✓ Batch (plusieurs à la fois)',
        '📊 **Supervision** : Dashboard affiche équipe + stocks + CA',
      ],
    },

    {
      id: 'step-6',
      emoji: '✅',
      title: 'Mode Complet - Gérant : Valider les Ventes',
      description:
        '**Dashboard → Onglet "Gestion Commandes"** affiche toutes les ventes serveurs en **attente de validation**. Pour chaque vente : voir heure, montant, articles. **Actions** : ✅ Valider (stock déduit, comptabilisé) ou ❌ Rejeter (retour serveur, stock remis). Vous pouvez **valider en masse** : cochez plusieurs + cliquez "Valider tous".',
      elementSelector: '[data-guide="pending-sales"]',
      position: 'bottom',
      visibleFor: ['gerant', 'promoteur'],
      tips: [
        '📌 Validation = Déduction stock + Comptabilisation finale',
        '🔍 Vérifiez articles avant validation si doute',
        '❌ Rejet = Vente retourne à serveur (stock remis, payant re-traité)',
        '⏱️ Ventes expirées (après fermeture caisse) = Auto-invalidées',
      ],
    },

    // ==================== MODE SIMPLIFIÉ ====================
    {
      id: 'step-7',
      emoji: '⚡',
      title: 'Mode Simplifié : Architecture & Accès',
      description:
        '**En Mode Simplifié**, **serveurs n\'ont pas de comptes** (juste noms : "Ahmed", "Fifi", "Moustapha"). **Gérant crée TOUTES les ventes** au comptoir, attribuant chacune à un serveur via son nom. **Validation immédiate** (pas d\'attente). Bons & tickets pour traçabilité. Idéal pour gérant solo ou peu staffing.',
      position: 'center',
      visibleFor: ['gerant', 'promoteur', 'serveur'],
      tips: [
        '👤 Serveurs = Noms texte, pas comptes auth',
        '⚡ Ventes créées + validées immédiatement (par gérant)',
        '🔗 **Mappings** : Nom serveur (ex: "Ahmed") ↔ Compte gérant interne',
        '📱 Gérant peut aussi créer vente sous son nom ("Moi (Ahmed)")',
      ],
    },

    {
      id: 'step-8',
      emoji: '🎯',
      title: 'Mode Simplifié - Gérant : Flux Vente',
      description:
        '**Flux** : 1️⃣ Cliquez "Vente Rapide" → 2️⃣ **Sélectionnez serveur** dans dropdown (ex: "Ahmed", "Fifi", ou "Moi (Gérant)") → 3️⃣ Ajouter produits → 4️⃣ Optionnel : **Créer/mettre sur Bon** (paiement différé) OU → 5️⃣ Paiement cash immédiat → 6️⃣ Cliquez "Valider" → ✅ Vente créée + validée immédiatement.',
      elementSelector: '[data-guide="quick-sale-btn"]',
      position: 'bottom',
      visibleFor: ['gerant', 'promoteur'],
      tips: [
        '📝 **Sélection serveur** = Dropdown de noms + "Moi (Gérant)"',
        '🔗 Derrière les coulisses : Système résout "Ahmed" → UUID interne',
        '🎫 **Bons** : Si client paye plus tard, "Mettre sur Bon" au lieu de cash',
        '✅ Validation immédiate = Stock déduit tout de suite',
      ],
    },

    // ==================== BONS & PAIEMENT DIFFÉRÉ ====================
    {
      id: 'step-9',
      emoji: '🎫',
      title: 'Bons & Tickets : Paiement Différé & Traçabilité',
      description:
        '**Bon/Ticket** = Enregistrement de commande avec paiement reporté. Utilisé pour : **paiement différé** (client paie plus tard) ou **traçabilité** (numéro table, nom client). **Workflow** : 1️⃣ Créer bon → 2️⃣ Ajouter ventes au bon (plusieurs ventes) → 3️⃣ Client revient payer → 4️⃣ Cliquez "Fermer bon" (= Payer) → ✅ Paiement final collecté.',
      elementSelector: '[data-guide="bon-strip"]',
      position: 'bottom',
      visibleFor: ['gerant', 'promoteur'],
      tips: [
        '🎫 Bon # = Numéro séquentiel (1, 2, 3...) visible partout',
        '📝 Données : Table number, customer name, notes (optionnel)',
        '💰 Montant = Cumulé de toutes ventes sur ce bon',
        '✅ Fermer bon = Paiement final + Stock déduit',
      ],
    },

    // ==================== OFFLINE & SYNCHRONISATION ====================
    {
      id: 'step-10',
      emoji: '📡',
      title: 'Offline : Créer Ventes Sans Réseau',
      description:
        '**Pas d\'internet ?** BarTender fonctionne quand même ! Les ventes créées **offline** sont **en cache** (stockées localement). Quand réseau revient, **synchronisation automatique** : ventes envoyées vers serveur. **Aucune donnée perdue**. Bannière orange = Indication offline.',
      position: 'center',
      visibleFor: ['gerant', 'promoteur'],
      tips: [
        '📱 Créez ventes normalement même offline',
        '💾 Ventes stockées en cache local (IndexedDB)',
        '🔄 Sync automatique quand réseau revient',
        '🚨 Si problème sync → Toast vous informe (retry auto)',
      ],
    },

    {
      id: 'step-11',
      emoji: '🔄',
      title: 'Offline : Synchronisation Automatique',
      description:
        '**Quand réseau revient** : 1️⃣ BarTender détecte connexion automatiquement → 2️⃣ Boucle sur opérations en cache (ventes, bons) → 3️⃣ Envoie vers serveur → 4️⃣ Si succès : ventes finalisées (stock déduit, comptabilité mise à jour) → ✅ Toast "Synchronisé" → Dashboard se met à jour. **Anti-doublon** : Chaque vente = clé unique (évite créer 2x si problème).',
      position: 'bottom',
      visibleFor: ['gerant', 'promoteur'],
      tips: [
        '⚙️ Sync = Automatique, vous ne faites rien',
        '📊 Dashboard → Affiche "X opérations en attente de sync" si offline',
        '✅ Une fois synced → Opérations disparaissent de queue',
        '🔐 Idempotency key = Protection contre doublons',
      ],
    },

    // ==================== CAS AVANCÉS ====================
    {
      id: 'step-12',
      emoji: '↩️',
      title: 'Cas Avancé : Retours & Remboursements',
      description:
        '**Client retour produit** ? Historique → Sélectionnez vente → Cliquez "Créer Retour" → Modal → Choisissez produit + raison (Défectueux, Expiré, Erreur, etc.) → Submit. Retour en **attente** de validation gérant. Une fois approuvé : **Stock remis** + **Remboursement traité**. Vente reste comptabilisée (avec retour soustrait).',
      elementSelector: '[data-guide="create-return"]',
      position: 'bottom',
      visibleFor: ['gerant', 'promoteur'],
      tips: [
        '✅ Approuvé retour = Stock remis + Remboursement dans stats',
        '❌ Rejeté retour = Stock non remis (si raison invalide)',
        '📊 **Revenu Net** = Ventes - Retours approuvés automatiquement',
        '🚫 Annulation bloquée si retours présents (pas combinable)',
      ],
    },

    {
      id: 'step-13',
      emoji: '🚫',
      title: 'Cas Avancé : Annulation de Vente (Promoteur)',
      description:
        '**Promoteur uniquement** : Historique → Détails vente → Bouton "Annuler" (si vente validée). Annulation = **Stock restitué** + **Vente supprimée des stats**. ⚠️ Action irréversible ! Confirmez avant (tapez nom bar pour confirmer). Utile si erreur grave ou problème client insolvable.',
      elementSelector: '[data-guide="sales-details"]',
      position: 'bottom',
      visibleFor: ['promoteur'],
      tips: [
        '⚠️ UNIQUEMENT Promoteur (autorité suprême)',
        '🚫 Conditions : Pas de retours/consignations dessus',
        '💾 Vente conservée en historique (état "Annulée")',
        '🔐 Confirmation requise (tapez confirmation)',
      ],
    },

    // ==================== CONCLUSION ====================
    {
      id: 'step-14',
      emoji: '✅',
      title: 'Vous Maîtrisez le Processus de Vente !',
      description:
        'Félicitations ! Vous connaissez maintenant : **Mode Complet** (serveur pending → gérant valide), **Mode Simplifié** (gérant direct), **Bons & paiement différé**, **Offline & sync**, **Retours & annulations**. Vous êtes prêt à créer des ventes efficacement selon votre rôle et contexte !',
      position: 'center',
      visibleFor: ['promoteur', 'gerant', 'serveur'],
      tips: [
        '🎯 Débutez avec ventes simples, progressez vers bons/offline',
        '📱 Utilisez "Vente Rapide" (menu bas) pour rapidité en service',
        '📊 Dashboard = Votre centre de commande pour supervision',
        '💡 Questions ? Consultez les guides détaillés : Inventaire, Équipe, Paramètres',
      ],
      action: '→ Commencez votre première vente !',
    },
  ],
};

/**
 * Guide 1: Dashboard Overview
 * First guide shown after onboarding (test case for Phase 1)
 */
export const DASHBOARD_OVERVIEW_GUIDE: GuideTour = {
  id: 'dashboard-overview',
  title: 'Maîtrisez votre Tableau de Bord',
  subtitle: 'Gestion complète en 3 onglets',
  description: 'Découvrez les 3 onglets principaux pour piloter votre bar au quotidien',

  targetRoles: ['promoteur', 'gerant'],

  estimatedDuration: 3,
  difficulty: 'beginner',
  emoji: '🏠',
  version: 2,

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
        'Votre tableau de bord se divise en **3 onglets** : **Synthèse du jour** pour vos chiffres clés, **Gestion Commandes** pour valider les ventes, et **Performance équipe** pour suivre vos collaborateurs. Toutes les données se mettent à jour en temps réel.',
      position: 'center',
      action: 'Cliquez sur Suivant pour explorer',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🔄 Les 3 onglets sont accessibles en haut du tableau de bord',
        '⏱️ Données mises à jour en temps réel (cliquez sur Actualiser si besoin)',
        '📱 Interface optimisée pour mobile et desktop',
      ],
    },

    // ONGLET 1 : SYNTHÈSE DU JOUR
    {
      id: 'step-2',
      emoji: '💰',
      title: 'Onglet 1 : Synthèse du Jour - Les 6 Métriques Clés',
      description:
        'Cet onglet affiche 6 métriques importantes pour la journée commerciale : **Revenus** (CA Net), **Ventes** (compteur), **Articles** vendus, **Alertes** stock, **Retours**, et **Consignations** actives. Ces chiffres se mettent à jour en temps réel.',
      elementSelector: '[data-guide="revenue-stats"]',
      position: 'bottom',
      action: 'Examinez les 6 métriques',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '💚 **CA Net** = Ventes validées - Retours remboursés - Réductions appliquées',
        '📊 **Ventes** = nombre de ventes validées + ventes en attente',
        '📦 **Articles** = nombre total d\'articles vendus',
        '⚠️ **Alertes** = produits proches de la rupture stock',
        '↩️ **Retours** = retours traités aujourd\'hui',
        '🥃 **Consignations** = produits mis de côté en attente de récupération',
      ],
    },

    {
      id: 'step-3',
      emoji: '📈',
      title: 'Top Produits & Alertes Stock',
      description:
        'Sous les 6 métriques, vous trouvez **vos 5 meilleurs produits du jour** (les plus vendus) et **les produits en alerte stock** (proches de la rupture). Ces informations vous aident à optimiser vos commandes et à anticiper les réapprovisionnements.',
      position: 'bottom',
      action: 'Consultez vos top produits et alertes',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🏆 Top 5 : Produits les plus vendus avec quantités',
        '⚠️ Alertes : Produits proches de rupture (< seuil défini)',
        '✅ Stocks OK : Message si aucune alerte',
        '🔍 Utilisez ces données pour anticiper votre réapprovisionnement',
      ],
    },

    {
      id: 'step-4',
      emoji: '📱',
      title: 'Actions : Exporter WhatsApp & Fermer Caisse',
      description:
        'En bas de cet onglet, deux actions importantes : **Bouton WhatsApp** pour exporter un rapport journalier complet, et **Bouton Fermer caisse** pour marquer la fin de votre journée commerciale (managers uniquement).',
      position: 'top',
      action: 'Découvrez ces actions',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📱 **WhatsApp** : Envoie CA, ventes, articles, retours, top 5 produits',
        '🔒 **Fermer caisse** : Marque fin de journée (managers/promoteurs uniquement)',
        '⚡ Vous pouvez exporter plusieurs fois sans fermer la caisse',
        '✅ Caisse fermée = journée commerciale terminée',
      ],
    },

    // ONGLET 2 : GESTION COMMANDES
    {
      id: 'step-5',
      emoji: '⏳',
      title: 'Onglet 2 : Gestion Commandes - Les Ventes en Attente',
      description:
        '**Mode Complet uniquement** : Cet onglet affiche toutes les ventes initiées par vos serveurs en attente de votre validation. Pour chaque vente : heure de création, montant total, nombre d\'articles. Vous pouvez développer pour voir le détail des produits commandés.',
      elementSelector: '[data-guide="pending-sales"]',
      position: 'bottom',
      action: 'Explorez une vente en attente',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📋 Chaque vente = initiée par un serveur, en attente de validation',
        '⏱️ Heure = moment où la vente a été créée',
        '📊 Montant = total TTC des articles',
        '🔢 Nombre d\'articles = total des produits commandés',
        '⬇️ Cliquez pour développer et voir les articles détaillés',
      ],
    },

    {
      id: 'step-6',
      emoji: '✅',
      title: 'Valider ou Rejeter les Ventes',
      description:
        'Pour chaque vente en attente, vous avez **2 actions** : **✓ Valider** (la vente devient définitive, stock sorti) ou **✗ Rejeter** (le serveur peut la modifier et renvoyer). Vous pouvez aussi **valider en masse** en cochant plusieurs ventes.',
      position: 'bottom',
      action: 'Cliquez sur ✓ ou ✗ pour agir',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '✅ **Valider** = vente définitive, stock déduit, plus modifiable',
        '❌ **Rejeter** = retour au serveur (erreur produit, quantité, etc.)',
        '📋 **Validation en masse** : Cochez plusieurs + cliquez Valider',
        '⏱️ Ventes expirées = fin de journée commerciale automatiquement',
        '⚡ Mode Simplifié = vous créez les ventes (pas cet onglet)',
      ],
    },

    // ONGLET 3 : PERFORMANCE ÉQUIPE
    {
      id: 'step-7',
      emoji: '👥',
      title: 'Onglet 3 : Performance Équipe',
      description:
        'Cet onglet affiche la performance de chaque serveur pour la journée : nombre de ventes validées et chiffre d\'affaires net généré. Suivez en temps réel qui sont vos meilleurs éléments et utilisez ces données pour faire votre bilan journalier.',
      elementSelector: '[data-guide="team-performance"]',
      position: 'bottom',
      action: 'Consultez les performances individuelles',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📈 **CA Net** = Ventes validées - Retours remboursés',
        '📊 **Ventes** = nombre de ventes validées par serveur',
        '🏆 Seules les ventes validées sont comptabilisées',
        '🎯 Utilisez pour motiver/récompenser vos meilleurs éléments',
        '🔄 Données mises à jour en temps réel',
      ],
    },

    // GESTION BONS ET TICKETS
    {
      id: 'step-8',
      emoji: '🎫',
      title: 'Gestion des Bons et Tickets',
      description:
        '**Bons de Commande** et **Tickets** facilitent la gestion de votre bar selon votre rôle. Les **Bons** (pour précommandes/commandes) et **Tickets** (mini-reçus de transactions) offrent une traçabilité complète. Tous les rôles ont accès à cette fonctionnalité de manière adaptée à leurs besoins.',
      elementSelector: '[data-guide="dashboard-tickets"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant', 'serveur'],
      tips: [
        '📋 **Bons** = Précommandes ou commandes en attente de traitement',
        '🎫 **Tickets** = Mini-reçus/confirmations de ventes',
        '🔍 Consultez historique bons et tickets pour audit et traçabilité',
        '✅ Chaque bon/ticket = Tracé et archived automatiquement',
      ],
    },

    // CONCLUSION
    {
      id: 'step-9',
      emoji: '✅',
      title: 'Vous Maîtrisez Maintenant votre Tableau de Bord !',
      description:
        'Félicitations ! Vous connaissez les 3 onglets du tableau de bord : **Synthèse du jour** (chiffres clés), **Gestion Commandes** (validation), **Performance équipe** (statistiques), et **Gestion Bons/Tickets** (traçabilité). Pour explorer d\'autres fonctionnalités (Inventaire, Historique, Équipe, Paramètres), ouvrez le menu hamburger (☰) en haut à droite.',
      position: 'center',
      action: 'Cliquez sur Fermer pour commencer',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '☰ Menu hamburger → Inventaire, Historique, Équipe, Paramètres',
        '📦 Guide Inventaire : gérer stocks et produits',
        '📊 Guide Historique : analyser vos ventes passées',
        '👥 Guide Équipe : gérer collaborateurs et permissions',
        '⚙️ Guide Paramètres : configurer votre bar (mode, horaires, etc.)',
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

  estimatedDuration: 6,
  difficulty: 'beginner',
  emoji: '📦',
  version: 2,

  triggers: [
    {
      type: 'onMount',
      condition: 'isInventoryPage',
      delay: 1500,
      showOnce: false, // Utilisateur peut relancer le guide
    },
  ],

  steps: [
    // ==================== INTRODUCTION ====================
    {
      id: 'step-1',
      emoji: '👋',
      title: 'Bienvenue à la Gestion de votre Inventaire !',
      description:
        'Votre **Inventaire** se divise en **3 onglets** pour gérer tous les aspects : **Produits** (catalogue), **Opérations** (alertes, approvisionnement, import), **Statistiques** (vue d\'ensemble). Comprenez la différence entre **Stock Physique** (réel au bar) et **Stock Vendable** (disponible à la vente, moins les consignations actives).',
      position: 'center',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🔄 Basculez entre les 3 onglets en haut pour différentes tâches',
        '💼 Stock Physique = Quantité réelle au bar',
        '📊 Stock Vendable = Physique - Consignations en attente',
        '💰 Analysez vos marges pour optimiser vos prix',
      ],
    },

    // ==================== ONGLET 1: PRODUITS ====================
    {
      id: 'step-2',
      emoji: '📋',
      title: 'Onglet 1: Produits - Votre Catalogue',
      description:
        'L\'**Onglet Produits** affiche tous vos produits en liste détaillée. Vous pouvez **rechercher** rapidement, **trier** par catégorie/stock, **ajouter** de nouveaux produits, ou **modifier** les existants.',
      elementSelector: '[data-guide="inventory-products"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🔍 Recherche instantanée par nom de produit',
        '📂 Trier par : Catégorie, Alphabétique, ou Niveau de stock',
        '🚨 **Filtre Suspects** : Isole instantanément les anomalies (stocks négatifs)',
        '✅ Les filtres se combinent pour des résultats précis',
      ],
    },

    {
      id: 'step-suspicious',
      emoji: '🚨',
      title: 'Détecter les Anomalies (Filtre Suspects)',
      description:
        'Le bouton **Suspects** est votre outil de contrôle critique. Il filtre tous les produits présentant des incohérences : stock physique négatif, vente à découvert ou **stock dormant**. Un inventaire sain ne devrait afficher aucun résultat ici.',
      elementSelector: '[data-guide="inventory-filter-suspicious"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🔴 Stock négatif = Erreur de saisie d\'approvisionnement',
        '💤 **Stock Dormant** = Basé sur votre fréquence d\'approv habituelle',
        '💡 **Détail Anomale** : Cliquez sur l\'icône (⚠️, 🛑) pour voir le diagnostic précis',
        '🔧 Cliquez "Modifier" pour corriger les erreurs de saisie',
      ],
    },

    {
      id: 'step-export',
      emoji: 'Excel',
      title: 'Exporter votre Inventaire (Valorisation)',
      description:
        'Besoin d\'un rapport externe ou d\'un pointage papier ? Le bouton **Export Inventaire** génère un fichier Excel complet. Il inclut : stock physique, stock consigné, et surtout la **valorisation au CUMP** (Prix d\'achat moyen). Option : export actuel ou historique (Time Travel).',
      elementSelector: '[data-guide="inventory-export-btn"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📊 Valeur Stock = Stock Physique × Prix d\'Achat Moyen (CUMP)',
        '📅 **Time Travel** : Reconstituez l\'état du stock à n\'importe quelle date passée',
        '📝 Colonnes vides incluses pour le comptage manuel sur papier',
      ],
    },
    {
      id: 'step-history',
      emoji: '🕰️',
      title: 'Historique Détaillé : La Timeline du Produit',
      description:
        'Pour chaque produit, accédez à une **Timeline complète** de tous les mouvements : ventes, approvisionnements, ajustements et **retours**. C\'est votre outil de traçabilité ultime pour comprendre chaque variation de stock.',
      elementSelector: '[data-guide="inventory-history-btn"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📅 **Par défaut** : Affiche les 7 derniers jours (réglable)',
        '🔄 Tracabilité Totale : Voyez qui a fait quoi et quand',
        '↩️ **Retours & Échanges** : Inclus nativement pour un audit fidèle',
        '📊 Visualisez les tendances de stock au fil du temps',
      ],
    },

    {
      id: 'step-3',
      emoji: '💰',
      title: 'Analyser les Marges de vos Produits',
      description:
        'Chaque produit affiche **Prix de vente**, **Coût moyen**, et **Marge commerciale**. Une marge saine est généralement **> 30%**. Identifiez les produits non rentables et optimisez vos prix.',
      elementSelector: '[data-guide="inventory-table"]',
      position: 'top',
      visibleFor: ['promoteur'],
      tips: [
        '📊 Coût moyen = moyenne pondérée de tous vos approvisionnements',
        '🔴 Marge rouge (< 30%) = produit non rentable → Augmentez le prix ou réduisez le coût',
        '📈 Stock Vendable = Stock Physique - Consignations actives (les réservations temporaires)',
      ],
    },

    {
      id: 'step-4',
      emoji: '➕',
      title: 'Ajouter de Nouveaux Produits',
      description:
        'Créez rapidement de nouveaux produits : **Manuel** (saisie manuelle) ou **Catalogue** (sélection parmi produits pré-enregistrés). Définissez prix, catégorie, stock initial et seuil d\'alerte.',
      elementSelector: '[data-guide="inventory-add-btn"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🎨 Mode Produit Personnalisé : Création libre avec tous les paramètres',
        '📚 Mode Catalogue : Sélectionnez parmi produits pré-enregistrés (plus rapide)',
        '⚠️ Seuil d\'alerte = quantité minimum avant réapprovisionnement nécessaire',
      ],
    },

    {
      id: 'step-5',
      emoji: '✏️',
      title: 'Modifier & Supprimer des Produits',
      description:
        'Éditez les détails d\'un produit : prix, catégorie, seuil d\'alerte (mais pas le stock initial). Vous pouvez aussi supprimer un produit si nécessaire. Les modifications ne sont pas rétroactives.',
      elementSelector: '[data-guide="inventory-edit-btn"]',
      position: 'top',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '✏️ Modifiable : Prix, Catégorie, Seuil d\'alerte, Description',
        '🚫 Non modifiable : Stock initial (à la création)',
        '📅 Les modifications de prix n\'affectent pas les ventes passées',
      ],
    },

    // ==================== ONGLET 2: OPÉRATIONS ====================
    {
      id: 'step-6',
      emoji: '⚠️',
      title: 'Onglet 2: Opérations - Alertes Stock',
      description:
        'L\'**Onglet Opérations** centralise vos actions opérationnelles. La section **Alertes Stock** affiche tous les produits sous seuil. Approvisionner rapidement pour éviter les ruptures.',
      elementSelector: '[data-guide="inventory-alerts"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🔴 Alerte rouge = stock critique (sous seuil)',
        '🟢 Alerte verte = tous les stocks vont bien',
        '⚡ Les alertes se mettent à jour en temps réel après chaque vente',
      ],
    },

    {
      id: 'step-7',
      emoji: '🚚',
      title: 'Approvisionner Rapidement votre Stock',
      description:
        'Ajoutez rapidement du stock : Sélectionnez produit → Saisissez quantité par lot (ex: 1 carton = 24 unités) → Nombre de lots → Fournisseur & Coût → Validation. Le coût alimente le calcul de **Coût moyen**.',
      elementSelector: '[data-guide="inventory-supply-btn"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📦 Quantité par lot = Unités dans 1 lot (ex: 1 carton = 24 bouteilles)',
        '🔢 Quantité totale = Nombre de lots × Quantité par lot',
        '💰 Enregistrez fournisseur & coût pour suivi d\'inventaire précis',
      ],
    },

    {
      id: 'step-8',
      emoji: '📥',
      title: 'Importer des Produits en Masse',
      description:
        'Pour l\'initialisation rapide : préparez un fichier **Excel** (.xlsx) avec colonnes (nom, prix, catégorie, stock) et importez 50+ produits en une opération. Les doublons sont détectés automatiquement.',
      elementSelector: '[data-guide="inventory-import-btn"]',
      position: 'bottom',
      visibleFor: ['promoteur'],
      tips: [
        '📊 Format Excel : 4 colonnes minimum (nom, prix, catégorie, stock)',
        '⚡ Gain temps énorme pour initialisation de 50+ produits',
        '✅ Détection automatique des doublons et erreurs',
      ],
    },

    {
      id: 'step-order-prep',
      emoji: '🤖',
      title: 'Refondation : Préparation de Commande Assistée',
      description:
        'Ne commandez plus au hasard ! Ce module analyse le rythme de vos **30 derniers jours de vente** pour suggérer les quantités idéales couvrant votre **fréquence de réapprovisionnement** (réglable dans vos Paramètres). Il détecte ainsi les ruptures imminentes.',
      elementSelector: '[data-guide="inventory-order-prep-btn"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '✨ **Suggestions IA** : Basées sur votre rythme réel de consommation',
        '📦 Filtrez par "Suggestions" pour voir uniquement ce qu\'il manque',
        '🛒 Créez un brouillon fluide avant de finaliser la commande',
      ],
    },

    {
      id: 'step-order-finalize',
      emoji: '🛒',
      title: 'Finalisation et Conditionnement',
      description:
        'Dans la phase de finalisation, ajustez vos conditionnements (lots de 12, 24, etc.). Le système stabilise les prix unitaires pour garantir une comptabilité exacte, même si vos fournisseurs changent de format de lot.',
      position: 'center',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '⚖️ Prix unitaire constant = Protection de vos marges',
        '🔄 Synchronisation multi-onglets : ne perdez jamais votre brouillon',
        '✅ Validation finale = Mise à jour instantanée du stock attendu',
      ],
    },

    // ==================== ONGLET 3: STATISTIQUES ====================
    {
      id: 'step-9',
      emoji: '📊',
      title: 'Onglet 3: Statistiques - Vue d\'Ensemble',
      description:
        'L\'**Onglet Statistiques** synthétise votre inventaire : **Tableau des catégories** (nombre produits/alertes par catégorie), **Santé du stock** (visual overview), et **Analytics inventaire** (insights détaillés).',
      elementSelector: '[data-guide="inventory-stats"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📂 Chaque catégorie affiche : Nombre produits | Nombre d\'alertes',
        '🎯 Utilisez pour équilibrer votre offre par catégorie',
        '📈 Identifiez catégories en manque de diversité',
      ],
    },

    // ==================== CONCLUSION ====================
    {
      id: 'step-10',
      emoji: '✅',
      title: 'Vous Maîtrisez votre Inventaire !',
      description:
        'Vous connaissez maintenant les **3 onglets** (Produits, Opérations, Statistiques), la gestion des produits, le suivi des alertes, les marges commerciales, et l\'approvisionnement. Vous êtes prêt à gérer efficacement votre stock!',
      position: 'center',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📅 Vérifiez régulièrement les alertes stock pour éviter les ruptures',
        '💰 Analysez les marges mensuellement pour optimiser rentabilité',
        '📊 Utilisez les statistiques pour décisions d\'achat stratégiques',
      ],
      action: '→ Commencez par ajouter vos premiers produits !',
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

  estimatedDuration: 5,
  difficulty: 'intermediate',
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
      title: 'Bienvenue à la Gestion des Retours !',
      description:
        'Votre système de **Retours** se divise en **3 onglets** pour gérer complètement les remboursements et stock. Les retours sont **créés AVANT fermeture caisse** (défaut: 6h matin) et doivent être **approuvés pour être finalisés**.',
      position: 'center',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🔄 Basculez entre les 3 onglets pour différentes étapes',
        '⏰ Retours autorisés UNIQUEMENT avant fermeture caisse',
        '📅 Seules les ventes de la journée commerciale actuelle peuvent être retournées',
        '✅ Chaque retour doit être **approuvé** pour être finalisé',
      ],
    },

    // ==================== ONGLET 1: NOUVEAU RETOUR ====================
    {
      id: 'step-2',
      emoji: '➕',
      title: 'Onglet 1: Créer un Nouveau Retour',
      description:
        'L\'**Onglet Nouveau Retour** vous permet de créer rapidement un retour : sélectionnez une vente du jour → choisissez le produit → indiquez la quantité → sélectionnez le motif → vérifiez les impacts (remboursement, remise en stock).',
      elementSelector: '[data-guide="returns-create-btn"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '⏰ Les ventes affichées sont UNIQUEMENT celles d\'aujourd\'hui (journée commerciale)',
        '🔍 Filtrez par serveur pour retrouver rapidement la vente concernée',
        '3️⃣ Processus : Sélect vente → Sélect produit → Saisie quantité → Choix motif → Vérif → Créer',
      ],
    },

    {
      id: 'step-3',
      emoji: '⚙️',
      title: 'Comprendre les Types de Retours',
      description:
        '**6 types de retours** disponibles, chacun avec des règles automatiques : **Défectueux** (remboursé, pas restocké) | **Erreur article** (remboursé + restocké) | **Non consommé** (pas remboursé, restocké) | **Périmé** (remboursé, pas restocké) | **Échange** (restocké + remplacement) | **Autre** (manuel).',
      elementSelector: '[data-guide="returns-reasons"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🔴 **Défectueux**: Produit détruit → Remboursement OUI | Restock NON',
        '🟡 **Erreur article**: Mauvais produit servi → Remboursement OUI | Restock OUI',
        '🔵 **Non consommé**: Client a changé d\'avis → Remboursement NON | Restock OUI',
        '🟣 **Échange**: Remplace par un autre article → Pas de cash | Restock OUI',
        '⚪ **Autre**: Cas spéciaux → Vous décidez remboursement ET restock',
      ],
    },

    {
      id: 'step-exchange',
      emoji: '🔄',
      title: 'Échange de Produit (Ancien Magic Swap)',
      description:
        'L\'**Échange** est la méthode royale pour corriger une erreur sans rembourser de cash. Sélectionnez le motif **Échange**, puis choisissez l\'**article de remplacement**. Le système calcule automatiquement l\'**écart de prix** et remet l\'ancien produit en stock.',
      elementSelector: '[data-guide="returns-exchange-summary"]',
      position: 'top',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '✨ **Flux Continu** : Retourne l\'ancien ET commande le nouveau en 1 clic',
        '⚖️ **Régularisation** : Affiche clairement si le client doit payer un surplus ou être remboursé',
        '📦 **Stock Auto** : L\'ancien produit est automatiquement réintégré à l\'inventaire',
        '🔒 **Sécurisé** : Enregistré comme une opération liée à la vente originale',
      ],
    },

    {
      id: 'step-4',
      emoji: '📝',
      title: 'Vérifier avant de Créer le Retour',
      description:
        'Avant de créer le retour, vérifiez : le **montant remboursé** (calculé auto selon motif), la **remise en stock** (certains motifs seulement), et le **statut EN ATTENTE** (créé mais pas encore approuvé = remboursement pas débité).',
      elementSelector: '[data-guide="returns-summary"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '💰 Montant = Quantité retour × Prix unitaire (calculé automatiquement)',
        '📦 Remise en stock = Dépend du motif (voir Types de Retours)',
        '⏳ Statut EN ATTENTE = Retour créé mais PAS finalisé encore',
        '✅ Après création, allez à l\'Onglet Liste pour APPROUVER',
      ],
    },

    // ==================== ONGLET 2: LISTE DES RETOURS ====================
    {
      id: 'step-5',
      emoji: '📋',
      title: 'Onglet 2: Liste des Retours & Approbations',
      description:
        'L\'**Onglet Liste** affiche tous les retours créés. Vous voyez le **statut de chaque retour** (EN ATTENTE, APPROUVÉ, REJETÉ), le **produit**, la **raison**, et le **montant remboursé**. Ici vous **approuvez ou rejetez** les retours.',
      elementSelector: '[data-guide="returns-list"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '⏳ EN ATTENTE = Retour créé mais pas finalisé (remboursement pas débité)',
        '✅ APPROUVÉ = Retour finalisé (remboursement débité, stock MAJ si nécessaire)',
        '❌ REJETÉ = Retour annulé (aucun impact financier/stock)',
        '🔍 Filtrez par période et statut pour retrouver rapidement',
      ],
    },

    {
      id: 'step-6',
      emoji: '✅',
      title: '⚠️ APPROBATION: L\'Étape Cruciale !',
      description:
        'C\'est là que le retour devient **EFFECTIF**. Cliquez sur **APPROUVER** pour finaliser : le remboursement est débité du CA, et le stock est mis à jour selon le motif (restauré ou perdu). ❌ **REJETER** annule le retour sans impact.',
      elementSelector: '[data-guide="returns-actions"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '✅ APPROUVER = Remboursement débité MAINTENANT + Stock MAJ (restauré ou perdu)',
        '❌ REJETER = Retour annulé, zéro impact financier/stock',
        '⏳ Vous pouvez approver/rejeter à tout moment avant fermeture caisse',
        '📊 Après approbation, statut = APPROUVÉ ou REJETÉ (terminal)',
      ],
    },

    {
      id: 'step-7',
      emoji: '🔍',
      title: 'Filtrer & Rechercher les Retours',
      description:
        'Utilisez les **filtres de période** (Aujourd\'hui, 7j, 30j, personnalisé) et **filtres de statut** (EN ATTENTE, APPROUVÉ, REJETÉ) pour retrouver rapidement un retour. La **recherche texte** retrouve par ID vente ou nom produit.',
      elementSelector: '[data-guide="returns-filters"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📅 Filtres période : Aujourd\'hui, 7 derniers jours, 30 derniers jours, personnalisé',
        '🔍 Statut : Voir uniquement EN ATTENTE (à approuver) ou APPROUVÉS (terminés)',
        '🔎 Recherche texte : Tapez ID de vente ou nom du produit retourné',
      ],
    },

    // ==================== ONGLET 3: STATISTIQUES ====================
    {
      id: 'step-8',
      emoji: '📊',
      title: 'Onglet 3: Statistiques & Analytics',
      description:
        'L\'**Onglet Statistiques** synthétise vos retours en **KPIs clés** : À traiter (count), Remboursements (total €), Retours validés (count), Remis en stock (units), Pertes produits (units), Taux de rejet (%). Visualisez aussi la **distribution par motif** (pie chart).',
      elementSelector: '[data-guide="returns-stats"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🔴 À traiter = Nombre de retours EN ATTENTE (non approuvés)',
        '💰 Remboursements = Montant total remboursé (approuvés seulement)',
        '✅ Retours validés = Nombre de retours APPROUVÉS',
        '📦 Remis en stock = Total units restaurées (Erreur, Non consommé)',
        '💥 Pertes = Total units perdues (Défectueux, Périmé)',
        '📉 Taux rejet = % de retours rejetés vs créés',
      ],
    },

    // ==================== CONCLUSION ====================
    {
      id: 'step-9',
      emoji: '✅',
      title: 'Vous Maîtrisez la Gestion des Retours !',
      description:
        'Vous connaissez maintenant les **3 onglets** (Créer, Liste, Statistiques), les **5 types de retours** avec leurs règles automatiques, et surtout l\'**approbation** qui finalise les retours. Vous êtes prêt à gérer efficacement remboursements et stock !',
      position: 'center',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '⏰ Créez retours AVANT fermeture caisse, approuvez tant que possible avant clôture',
        '⚙️ Comprenez les motifs pour choisir le bon (impacte remboursement + stock)',
        '📊 Consultez Statistiques pour analyser patterns de retours',
        '💡 Taux rejet élevé? Analysez motifs pour améliorer service/qualité',
      ],
      action: '→ Vous pouvez créer et approuver vos retours !',
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

  estimatedDuration: 5,
  difficulty: 'intermediate',
  emoji: '📦',
  version: 3,

  triggers: [
    {
      type: 'onMount',
      condition: 'isConsignmentPage',
      delay: 1500,
      showOnce: false,
    },
  ],

  steps: [
    // ==================== INTRODUCTION ====================
    {
      id: 'step-1',
      emoji: '👋',
      title: 'Bienvenue à la Gestion des Consignations !',
      description:
        'Votre système de **Gestion des Consignations** se divise en **3 onglets** pour gérer complètement les produits payés mais non consommés : **Nouvelle Consignation** (création), **Consignations Actives** (gestion), **Historique** (traçabilité). **Important** : Consignation = Client paie → laisse produits au bar → **SANS REMBOURSEMENT** → reviendra plus tard.',
      position: 'center',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '✅ Consignation = Mise de côté (PAS remboursement)',
        '📦 Client paie 5 bières → consomme 2 → consigne les 3',
        '📊 À CRÉATION : Stock Physique ↑ (produits reviennent) | Stock Vendable invariant (déjà vendus)',
        '⏳ Délai paramétrable (7j défaut). Après: décision manuelle confisquer ou récupérer',
      ],
    },

    // ==================== ONGLET 1: NOUVELLE CONSIGNATION ====================
    {
      id: 'step-2',
      emoji: '➕',
      title: 'Onglet 1: Nouvelle Consignation - Créer',
      description:
        'L\'**Onglet Nouvelle Consignation** vous permet de créer une consignation rapidement : **Sélectionnez la vente du jour** → **Choisissez le produit** → **Indiquez la quantité** → **Remplissez infos client**. À la création, Stock Physique augmente (produits reviennent au bar).',
      elementSelector: '[data-guide="consignments-create-tab"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '⚠️ Seules ventes **payées du jour** peuvent être consignées',
        '👤 Nom client **obligatoire** pour suivi et récupération',
        '📊 Impact à la création : Stock Physique ↑ (produits reviennent) | Stock Vendable invariant',
        '🔢 Quantité: Nombre d\'unités que client laisse (peut être partiel)',
      ],
    },

    {
      id: 'step-3',
      emoji: '📝',
      title: 'Processus de Création - Étapes',
      description:
        '**Étape 1** : Sélectionnez la **vente du jour** (affiche serveur, heure, total). **Étape 2** : Choisissez le **produit à consigner** de cette vente. **Étape 3** : Indiquez la **quantité exacte** laissée au bar. **Étape 4** : Remplissez **infos client** (nom, téléphone) pour contact ultérieur récupération.',
      elementSelector: '[data-guide="consignments-create-form"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '1️⃣ Vente = Historique de la vente aujourd\'hui',
        '2️⃣ Produit = Quel article client a laissé',
        '3️⃣ Quantité = Combien d\'unités (ex: 3 bières sur 5)',
        '4️⃣ Client = Nom/téléphone essentiels pour rappel retrait',
      ],
    },

    // ==================== ONGLET 2: CONSIGNATIONS ACTIVES ====================
    {
      id: 'step-4',
      emoji: '⏳',
      title: 'Onglet 2: Consignations Actives - Vue & Actions',
      description:
        'L\'**Onglet Consignations Actives** affiche tous les produits actuellement mis de côté. Pour chaque consignation, vous voyez : **client**, **produit**, **quantité**, **date expiration**, et **urgence badge** (vert/jaune/rouge). Vous pouvez effectuer 2 actions cruciales : **Récupérer** ou **Confisquer**.',
      elementSelector: '[data-guide="consignments-active-tab"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🟢 Vert = Beaucoup de temps avant expiration',
        '🟡 Jaune = Expiration proche (avertir client)',
        '🔴 Rouge = Délai très court ou expiré',
        '📋 Chaque ligne a boutons **Récupérer** et **Confisquer**',
      ],
    },

    {
      id: 'step-5',
      emoji: '📤',
      title: 'Action: Récupérer (Client vient chercher)',
      description:
        'Quand le **client vient récupérer** ses produits consignés, cliquez sur le bouton **RÉCUPÉRER**. Cela marque la consignation comme complétée. Le **Stock Physique diminue** (produits quittent le bar). Le **Stock Vendable reste invariant** (il n\'a jamais changé car produits déjà vendus).',
      elementSelector: '[data-guide="consignments-active-tab"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📤 Produit sort **physiquement** du bar (client l\'emporte)',
        '📊 Impact stocks à récupération : Stock Physique ↓ | Stock Vendable invariant (jamais changé)',
        '✅ Action enregistrée dans historique pour traçabilité',
        '💡 Client repart avec ses produits déjà payés, zéro remboursement',
      ],
    },

    {
      id: 'step-6',
      emoji: '🔒',
      title: 'Action: Confisquer (Délai expiré ou renoncement)',
      description:
        'Si le **délai d\'expiration est dépassé** ou le **client renonce**, cliquez sur **CONFISQUER**. Le produit est **réintégré à votre Stock Vendable** (redevient disponible à la vente). Le **Stock Physique reste stable** car produit est toujours au bar. Vous récupérez le droit de vente.',
      elementSelector: '[data-guide="consignments-active-tab"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '⏰ **Pas automatique** : L\'expiration du délai n\'auto-confisque PAS, action manuelle requise',
        '📊 Impact stocks à confiscation : Stock Physique invariant (produit reste) | Stock Vendable ↑ (réintégré)',
        '💡 Exemple: Consignation 5 bières expirent → vous confisquez → redevient 5 bières à vendre',
        '🔄 Réintégration = Produit redevient disponible vente (comme si jamais consigné)',
      ],
    },

    {
      id: 'step-7',
      emoji: '🚨',
      title: 'Gérer Expiration & Urgence',
      description:
        'Les **consignations expirées** sont marquées en **rouge**. Vous devez manuellement décider : **Récupérer** (si client la redemande) ou **Confisquer** (si délai dépassé et client silencieux).',
      elementSelector: '[data-guide="consignments-active-tab"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '⚠️ Expiration = **Alerte seulement** (pas action automatique)',
        '📞 Avertissez client AVANT expiration pour lui rappeler récupérer',
        '⏰ Délai = Paramétrable en Paramètres (onglet Opérationnel)',
        '🔴 Consignations expirées = Marquées rouge dans l\'onglet Actives',
      ],
    },

    // ==================== ONGLET 3: HISTORIQUE ====================
    {
      id: 'step-8',
      emoji: '📚',
      title: 'Onglet 3: Historique - Audit & Traçabilité',
      description:
        'L\'**Onglet Historique** affiche **toutes les consignations complétées** (non actives). Vous voyez le **statut final** : Récupérée (client a pris) ou Confisquée (bar a réintégré). Filtrez par **statut** ou **période** pour auditer votre historique consignations.',
      elementSelector: '[data-guide="consignments-history-tab"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '✅ Récupérée = Client est venu chercher ses produits',
        '🔐 Confisquée = Délai expiré ou rejet, réintégré à vente',
        '📅 Filtrez par statut (Tout/Récupérées/Confisquées) ou période',
        '🔍 Utile pour litiges clients, bilans stocks, traçabilité',
      ],
    },

    {
      id: 'step-9',
      emoji: '🔍',
      title: 'Recherche & Filtrage Historique',
      description:
        'Utilisez les **filtres** pour analyser : **Filtre Statut** (voir uniquement Récupérées ou Confisquées) pour comprendre patterns. **Filtre Période** pour bilans mensuels/annuels. Cherchez par **client** ou **produit** pour enquêtes litiges ou stock reconciliation.',
      elementSelector: '[data-guide="consignments-history-filters"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🔄 Statuts: Tout, Récupérées, Confisquées',
        '📅 Périodes: Aujourd\'hui, 7j, 30j, custom',
        '🔎 Recherche par nom client ou produit',
        '📊 Utilisez pour: Bilan stocks, litiges clients, audit traçabilité',
      ],
    },

    // ==================== CONCLUSION ====================
    {
      id: 'step-10',
      emoji: '✅',
      title: 'Vous Maîtrisez les Consignations !',
      description:
        'Vous connaissez maintenant les **3 onglets** (Création, Actives, Historique), comment **créer consignations**, **récupérer** (client) **ou confisquer** (délai expiré), et **tracer historique** pour audit. Vous comprenez aussi les **impacts stocks** : création ↑ Physique, récupération ↓ Physique, confiscation ↑ Vendable.',
      position: 'center',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📦 Consignation = **Mise de côté** (PAS remboursement jamais)',
        '📊 Stock impact = Physique change (produits là physiquement), Vendable change à confiscation (réintégration)',
        '⏰ Urgence badges = Rappels (not automatic action)',
        '📚 Historique = Audit trail pour litiges/reconciliation',
      ],
      action: '→ Gérez vos consignations efficacement !',
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
  subtitle: 'Analysez vos performances en 3 vues',
  description: 'Découvrez les 3 vues (Liste, Cartes, Analytics) pour analyser vos ventes en détail.',

  targetRoles: ['promoteur', 'gerant'],

  estimatedDuration: 6,
  difficulty: 'intermediate',
  emoji: '📊',
  version: 3,

  triggers: [
    {
      type: 'onMount',
      condition: 'isAnalyticsPage',
      delay: 1500,
      showOnce: false,
    },
  ],

  steps: [
    // ==================== INTRODUCTION ====================
    {
      id: 'step-1',
      emoji: '👋',
      title: 'Bienvenue dans Historique et Analytics',
      description: 'Votre **Historique** se divise en **3 vues** pour analyser vos ventes sous différents angles. Vous pouvez filtrer par période, chercher des ventes spécifiques, et exporter vos données pour vos analyses externes.',
      position: 'center',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🔄 Basculez entre les 3 vues avec les onglets en haut',
        '📋 Les filtres s\'appliquent à toutes les vues instantanément',
        '💾 Vous pouvez exporter vos données en Excel ou CSV',
      ],
    },

    // ==================== VUE 1: LISTE ====================
    {
      id: 'step-2',
      emoji: '📋',
      title: 'Vue 1: Tableau Complet des Ventes',
      description: 'La **Vue Liste** affiche chaque vente en **tableau détaillé** avec tous les paramètres : ID, date/heure, vendeur, nombre d\'articles, total original, retours et **revenu net final**.',
      elementSelector: '[data-guide="sales-list"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
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
      description: 'La **Vue Cartes** affiche vos ventes sous format **mini-ticket**. Parfait pour un aperçu rapide : ID, date, vendeur, premiers produits, total avec retours et revenu net.',
      elementSelector: '[data-guide="sales-cards"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '✨ Format visuel idéal pour scanner rapidement vos ventes',
        '🎴 Chaque carte affiche un résumé avec les 2 premiers produits + "+X autres"',
        '⌚ Parfait pour les écrans mobiles et les analyses en déplacement',
      ],
    },

    // ==================== VUE 3: ANALYTICS - INTRODUCTION ====================
    {
      id: 'step-4',
      emoji: '📊',
      title: 'Vue 3: Analytics - Vos Statistiques en Détail',
      description: 'La **Vue Analytics** synthétise vos données avec **3 KPIs clés** (Revenu, Ventes, Articles) et des **graphiques avancés** pour une analyse complète de vos performances.',
      elementSelector: '[data-guide="analytics-kpis"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📈 Les 3 KPIs incluent la comparaison avec la période précédente (%)',
        '🔢 "Articles" = nombre total d\'articles vendus',
        '⚡ Tous les calculs incluent les ajustements de retours',
      ],
    },

    // ==================== VUE 3: ÉVOLUTION DU CA ====================
    {
      id: 'step-5',
      emoji: '📈',
      title: 'Analyse: Évolution de Votre CA',
      description: 'Le **graphique CA** suit votre **revenu net** et s\'adapte automatiquement selon la période : **Par heure** (≤2j) → **Par jour** (≤14j) → **Par jour/semaine** (>14j) pour une analyse granulaire de vos pics d\'activité.',
      elementSelector: '[data-guide="analytics-revenue-chart"]',
      position: 'top',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '⏰ Granularité automatique basée sur votre sélection de période',
        '🌙 Respecte vos horaires fermeture (pas de CA après fermeture)',
        '💡 Utilisez-le pour optimiser vos heures d\'ouverture et staffing',
      ],
    },

    // ==================== VUE 3: RÉPARTITION PAR CATÉGORIE ====================
    {
      id: 'step-6',
      emoji: '🍰',
      title: 'Analyse: Répartition par Catégorie',
      description: 'Le **graphique Catégories** (Donut) montre le **revenu net généré par chaque catégorie de produits** (Bières, Sucreries, etc.). Les retours sont déjà déduits automatiquement.',
      elementSelector: '[data-guide="analytics-category-chart"]',
      position: 'top',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🎯 Identifiez vos catégories les plus rentables',
        '🏆 Optimisez votre stock en fonction des %',
        '💰 Revenu Net = Total ventes - Retours approuvés',
      ],
    },


    // ==================== VUE 3: TOP PRODUITS ====================
    // ==================== VUE 3: TOP PRODUITS ====================
    {
      id: 'step-8',
      emoji: '🏆',
      title: 'Analyse: Vos Top Produits',
      description: 'Découvrez vos **champions** avec 3 filtres de vue : **Unités vendues** (volume) → **Revenus générés** (CA) → ou **Profit** (marge nette). Ajustez le nombre de produits (Top 5, 10, 20).',
      elementSelector: '[data-guide="analytics-top-products"]',
      position: 'top',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '⭐ Comparez volume vs revenu pour identifier les articles stratégiques',
        '💹 Top en Profit = articles à pousser auprès des vendeurs',
        '📊 Chaque vue inclut le volume et l\'analyse financière',
      ],
    },

    // ==================== VUE 3: PERFORMANCE ÉQUIPE ====================
    {
      id: 'step-9',
      emoji: '👥',
      title: 'Analyse: Performance de Votre Équipe',
      description: 'Comparez l\'**efficacité de vos serveurs/bartenders** : affichage du **CA généré** par personne et leur **nombre de transactions**. Parfait pour identifier vos top performers et optimiser formations/motivations.',
      elementSelector: '[data-guide="analytics-team"]',
      position: 'top',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🌟 CA généré = revenu net attribué au serveur',
        '📞 Nombre de ventes = activité/charge travail',
        '💪 Utilisez ces données pour reconnaître et motiver votre équipe',
      ],
    },

    // ==================== FILTRES & RECHERCHE ====================
    {
      id: 'step-10',
      emoji: '🔍',
      title: 'Filtres Puissants & Recherche',
      description: '**Affinez vos analyses** avec 3 filtres : **Période** (Aujourd\'hui, Hier, 7j, 30j, Personnalisé) → **Vendeur** (un ou plusieurs) → **Recherche** (ID de vente ou nom de produit). Les filtres s\'appliquent à toutes les 3 vues instantanément.',
      elementSelector: '[data-guide="sales-filters"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '⚡ Les filtres se mettent à jour instantanément',
        '🔎 Recherche par ID de vente = 6 derniers chiffres du numéro',
        '👤 Sélectionnez plusieurs vendeurs pour une analyse comparative',
      ],
    },

    // ==================== ANNULATION DE VENTE ====================
    {
      id: 'step-11',
      emoji: '🚫',
      title: 'Annuler une Vente (Promoteur Uniquement)',
      description: '**Mode Lecture Détails** : Cliquez sur une vente pour ouvrir ses détails complets. En tant que **Promoteur**, vous avez l\'option **"Annuler"** pour annuler définitivement cette vente. L\'annulation **restitue les articles au stock** et **supprime la vente des statistiques**.',
      elementSelector: '[data-guide="sales-details"]',
      position: 'bottom',
      visibleFor: ['promoteur'],
      tips: [
        '🔍 Ouvrez le détail de la vente (cliquez sur le ticket)',
        '🚫 Bouton "Annuler" visible seulement pour Promoteurs',
        '✅ Annulation = Stock restitué + Vente supprimée des stats',
        '⚠️ Action irréversible : confirmation requise avant annulation',
      ],
    },

    // ==================== FILTRES PAR TYPE VENTE ====================
    {
      id: 'step-12',
      emoji: '🔍',
      title: 'Filtrer par Type de Vente (Validées / Rejetées / Annulées)',
      description: '**Filtrer les ventes** par statut : **Validées** (approuvées et comptabilisées), **Rejetées** (non approuvées par managers), **Annulées** (supprimées par promoteur). Ces filtres s\'appliquent à toutes les 3 vues (Liste, Cartes, Analytics) instantanément pour une analyse fine par statut.',
      elementSelector: '[data-guide="sales-type-filter"]',
      position: 'bottom',
      visibleFor: ['promoteur'],
      tips: [
        '✅ **Validées** = Ventes finales, comptabilisées dans les stats',
        '❌ **Rejetées** = Retournées au serveur pour correction',
        '🚫 **Annulées** = Supprimées par le promoteur (stock restitué)',
        '📊 Combinez avec autres filtres (période, vendeur) pour analyses détaillées',
      ],
    },

    // ==================== EXPORT ====================
    {
      id: 'step-13',
      emoji: '💾',
      title: 'Exporter Vos Données',
      description: 'Exportez vos analyses complètes en **Excel** ou **CSV** pour des traitements externes (analyse poussée, rapports détaillés, intégration comptabilité). Les données exportées incluent tous les ajustements (retours, consignations).',
      elementSelector: '[data-guide="sales-export"]',
      position: 'top',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📊 Excel = avec mise en forme, parfait pour les rapports',
        '📋 CSV = format brut, idéal pour l\'import en comptabilité',
        '✅ Les données exportées correspondent toujours aux filtres actifs',
      ],
    },

    // ==================== CONCLUSION ====================
    {
      id: 'step-14',
      emoji: '✅',
      title: 'Vous Maîtrisez Votre Historique !',
      description: 'Vous connaissez maintenant les **3 vues** (Liste, Cartes, Analytics), les **filtres puissants** (période, vendeur, type), les **3 KPIs clés**, les **graphiques avancés** (CA, Catégories), l\'**annulation de vente** (promoteur), et l\'**export données**. Vous êtes prêt à analyser vos performances en profondeur !',
      position: 'center',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🎯 Consultez régulièrement vos analytics pour optimiser votre bar',
        '📈 Suivez votre équipe et identifiez vos champions',
        '🚫 Promoteurs : Utilisez l\'annulation avec parcimonie (impact inventaire)',
        '💡 Les données = meilleur outil pour prendre les bonnes décisions',
      ],
      action: '→ Vous pouvez maintenant explorer chaque vue en détail !',
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

  estimatedDuration: 5,
  difficulty: 'beginner',
  emoji: '👥',
  version: 3,

  triggers: [
    {
      type: 'onMount',
      condition: 'isTeamPage',
      delay: 1500,
      showOnce: false,
    },
  ],

  steps: [
    // ==================== INTRODUCTION ====================
    {
      id: 'step-1',
      emoji: '👋',
      title: 'Bienvenue à la Gestion de l\'Équipe !',
      description:
        'Votre système de **Gestion de l\'Équipe** se divise en **3 onglets** pour gérer complètement votre équipe : **Mon Équipe** (visualiser et retirer membres), **Recrutement** (ajouter nouveaux ou importer existants), et **Nom d\'affichage pour les ventes** (mode simplifié). Un bar bien organisé commence par une équipe bien définie !',
      position: 'center',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🔄 Basculez entre les 3 onglets pour différentes tâches',
        '⚖️ Permissions = **Promoteur** peut tout faire | **Gérant** peut gérer serveurs seulement',
        '🔐 Vous contrôlez l\'accès des membres (création, retrait)',
      ],
    },

    // ==================== ONGLET 1: MON ÉQUIPE ====================
    {
      id: 'step-2',
      emoji: '👥',
      title: 'Onglet 1: Mon Équipe - Vue d\'Ensemble',
      description:
        'L\'**Onglet Mon Équipe** affiche tous vos collaborateurs actuels avec leurs **rôles** (Gérant/Serveur), **contacts** (téléphone, email), **dernière connexion** et **statut actif/inactif**. Vous voyez aussi les **statistiques** : nombre de gérants et serveurs.',
      elementSelector: '[data-guide="team-members"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🟢 Indicateur vert = Actif récemment (< 24h)',
        '⚫ Indicateur gris = Hors ligne',
        '🔴 Indicateur rouge = Inactif',
        '📊 Statistiques en haut affichent répartition gérants vs serveurs',
      ],
    },

    {
      id: 'step-3',
      emoji: '🔍',
      title: 'Rechercher & Filtrer les Membres',
      description:
        'Cherchez rapidement un membre par **nom**, **email** ou **username** via la barre de recherche. Utilisez le bouton **"Voir inactifs"** pour afficher/masquer les membres inactifs. Les filtres s\'appliquent instantanément.',
      elementSelector: '[data-guide="team-search"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🔎 Recherche temps réel : Tapez nom, email ou identifiant',
        '👁️ Toggle inactifs = Voir complet historique (actifs + inactifs)',
        '📋 Tableau triable pour scanner rapidement',
      ],
    },

    {
      id: 'step-3b',
      emoji: '🎭',
      title: 'Changer le Rôle d\'un Membre',
      description:
        'Vous pouvez modifier le rôle d\'un collaborateur directement dans la liste. 1️⃣ Cliquez sur son **badge de rôle** (ex: "Serveur") → 2️⃣ Une demande de **confirmation** apparaîtra → 3️⃣ Validez, et son rôle sera mis à jour instantanément. C\'est rapide et sécurisé !',
      elementSelector: '[data-guide="team-role-select"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🔐 **Confirmation** : Une étape de validation vous protège des erreurs de clic',
        '✅ **Feedback** : Une notification verte confirme la mise à jour réussie',
        '⚠️ Le menu n\'apparaît que si vous avez les permissions nécessaires',
      ],
    },

    {
      id: 'step-4',
      emoji: '🚫',
      title: 'Retirer un Membre',
      description:
        'Cliquez sur l\'**icône Poubelle** (trash) à droite du membre pour le retirer. Le retrait est **immédiat** et **bloque toute nouvelle connexion**. Une confirmation vous demande avant suppression. ⚠️ Vous ne pouvez retirer que les rôles que vous pouvez créer.',
      elementSelector: '[data-guide="team-delete"]',
      position: 'top',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '✅ **Promoteur** : Peut retirer Gérants ET Serveurs',
        '⚙️ **Gérant** : Peut retirer SEULEMENT les Serveurs (pas de gérants)',
        '⚠️ Confirmation requise pour éviter accidents',
        '🔐 Retrait = Compte bloqué (pas de connexion future)',
      ],
    },

    // ==================== ONGLET 2: RECRUTEMENT ====================
    {
      id: 'step-5',
      emoji: '➕',
      title: 'Onglet 2: Recrutement - Ajouter Membres',
      description:
        'L\'**Onglet Recrutement** vous permet d\'ajouter rapidement de nouveaux collaborateurs. Vous avez **2 options** : **Nouveau Compte** (créer identifiants from scratch) ou **Membre Existant** (importer quelqu\'un qui travaille déjà dans un autre de vos bars).',
      elementSelector: '[data-guide="team-recruitment"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🆕 Nouveau Compte = Créer identifiants (username/password) + email auto-généré',
        '📥 Membre Existant = Importer quelqu\'un d\'un autre bar (évite doublons)',
        '⚙️ Choisissez le rôle : Gérant ou Serveur (selon permissions)',
      ],
    },

    {
      id: 'step-6',
      emoji: '🆕',
      title: 'Option 1: Créer un Nouveau Compte',
      description:
        'Créez rapidement un nouveau collaborateur : saisissez **Identifiant de connexion** (username, lowercase automatique) → **Mot de passe temporaire** (min 8 caractères) → **Nom complet** → **Téléphone**. L\'email est auto-généré (@bartender.app). Sélectionnez son **Rôle** (Gérant ou Serveur) et créez !',
      elementSelector: '[data-guide="team-create-form"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '👤 Identifiant = Login unique (converti lowercase, espaces enlevés)',
        '🔐 Mot de passe temporaire = Min 8 caractères, à communiquer au nouvel employé',
        '📧 Email auto-généré = {username}@bartender.app',
        '⚙️ Rôle limité par permissions (Promoteur = tout, Gérant = serveurs seulement)',
      ],
    },

    {
      id: 'step-7',
      emoji: '📥',
      title: 'Option 2: Importer un Membre Existant',
      description:
        'Importez quelqu\'un qui travaille **déjà dans un autre de vos bars** : Sélectionnez le candidat dans la **dropdown liste** (affiche nom, rôle actuel, bar source) ou recherchez par **email/username**. Sélectionnez son nouveau **Rôle** dans ce bar et importez !',
      elementSelector: '[data-guide="team-import-form"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🔄 Évite doublons = Un compte pour multiple bars',
        '📋 Dropdown affiche candidats disponibles dans vos autres bars',
        '🔎 Recherche par email ou identifiant si candidate pas visible',
        '⚙️ Rôle peut être différent dans chaque bar (ex: Serveur ici, Gérant ailleurs)',
      ],
    },

    // ==================== MAPPINGS AUTOMATIQUES ====================
    {
      id: 'step-7b',
      emoji: '🔗',
      title: 'Mappings Automatiques Serveurs (Promoteur & Serveur)',
      description:
        '**Lors de la création d\'un compte** ou de l\'**ajout d\'un membre existant**, le système crée automatiquement un **mapping** entre le nom d\'affichage (pour les ventes en mode simplifié) et le compte réel du serveur. **Exemple** : Compte "Ahmed_Ali" → Nom d\'affichage auto-généré "AA" ou "Ahmed". Ce mapping facilite les ventes rapides au comptoir en mode simplifié.',
      elementSelector: '[data-guide="team-mappings-auto"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '⚙️ **Automatique** : Pas d\'action manuelle requise lors création/ajout',
        '🎯 Nom d\'affichage = Initiales ou prénom court pour rapididité',
        '📱 Utile en **Mode Simplifié** où 1 compte gérant crée les ventes',
        '🔄 Mappings éditable après création si besoin de clarifier',
      ],
    },

    // ==================== ONGLET 3: ASSIGNATION CAISSES ====================
    {
      id: 'step-8',
      emoji: '🔗',
      title: 'Onglet 3: Nom d\'affichage pour les ventes (Mode Simplifié)',
      description:
        'L\'**Onglet Nom d\'affichage pour les ventes** configure les **identifiants d\'affichage** entre noms courts pour la vente (ex: "Afi", "Fifi") et comptes serveurs réels. **Uniquement nécessaire en Mode Simplifié** (1 compte manager au comptoir, création manuelle ventes). Cette section peut être repliée par défaut.',
      elementSelector: '[data-guide="team-mappings"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '⚙️ **Mode Simplifié** = 1 compte manager crée ventes + sélectionne serveur manuellement',
        '🔗 Identifiants = Lier noms (ex:"Afi") à vrais serveurs pour affichage correct',
        '📍 Auto-populate = Bouton pour créer noms d\'affichage auto depuis membres actifs',
        '🚫 Pas nécessaire en Mode Complet (chaque serveur a son compte)',
      ],
    },

    {
      id: 'step-9',
      emoji: '⚙️',
      title: 'Configurer les Noms d\'affichage',
      description:
        '**Ajouter un nom d\'affichage** : Saisissez le nom pour la vente (ex: "Afi") → Sélectionnez le serveur correspondant (dropdown) → Validez. **Supprimer** : Icône trash pour retirer le nom. **Auto-populate** : Bouton pour générer automatiquement les noms depuis vos membres actifs.',
      elementSelector: '[data-guide="team-mappings-add"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📝 Nom court = Identifiant simple (ex: "Afi", "Fifi", "Ali")',
        '👤 Sélectionnez le vrai compte serveur associé',
        '⚡ Auto-populate = Économise temps, crée noms d\'affichage auto',
        '🔐 Indispensable pour Mode Simplifié (sinon ventes non attribuées correctement)',
      ],
    },

    // ==================== CONCLUSION ====================
    {
      id: 'step-10',
      emoji: '✅',
      title: 'Vous Maîtrisez Votre Équipe !',
      description:
        'Vous connaissez maintenant les **3 onglets** (Mon Équipe, Recrutement, Nom d\'affichage pour les ventes), comment **ajouter/retirer membres**, **créer nouveaux comptes ou importer existants**, et configurer **identifiants pour mode simplifié**. Vous êtes prêt à gérer votre équipe complètement !',
      position: 'center',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📊 Consultez Mon Équipe régulièrement pour vérifier statuts',
        '👥 Recrutement = Continuer grandir équipe',
        '🔗 Identifiants = Essentiel en Mode Simplifié (sinon sales attribution problems)',
        '⚙️ Vérifiez permissions = Ce que vous pouvez faire vs ce que vous ne pouvez pas',
      ],
      action: '→ Commencez à gérer votre équipe !',
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

  estimatedDuration: 6,
  difficulty: 'intermediate',
  emoji: '⚙️',
  version: 4,

  triggers: [
    {
      type: 'onMount',
      condition: 'isSettingsPage',
      delay: 1500,
      showOnce: false,
    },
  ],

  steps: [
    // ==================== INTRODUCTION ====================
    {
      id: 'step-1',
      emoji: '👋',
      title: 'Bienvenue aux Paramètres !',
      description:
        'Votre système de **Paramètres** se divise en **3 onglets** pour configurer tous les aspects de votre bar : **Bar** (infos établissement), **Operational** (gestion: fermeture, consignations, devise, mode), **Security** (2FA). Tous ces réglages impactent votre comptabilité et sécurité quotidienne.',
      position: 'center',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🔄 Basculez entre les 3 onglets pour configurer différents aspects',
        '💾 Cliquez "Enregistrer" en bas pour sauvegarder vos modifications',
        '❌ Cliquez "Annuler" pour abandonner sans sauvegarder',
      ],
    },

    // ==================== ONGLET 1: BAR ====================
    {
      id: 'step-2',
      emoji: '🏢',
      title: 'Onglet 1: Infos Bar - Identification',
      description:
        'L\'**Onglet Bar** contient les informations d\'identification de votre établissement : **Nom du bar**, **Adresse**, **Téléphone**, **Email**. Ces infos apparaissent sur vos factures, rapports d\'export et communications officielles. **Promoteur uniquement**.',
      elementSelector: '[data-guide="settings-bar"]',
      position: 'bottom',
      visibleFor: ['promoteur'],
      tips: [
        '📝 **Nom du bar** : Ex: "Le Privilège", "Le Spot", etc.',
        '📍 **Adresse** : Complète pour factures (ex: Cotonou, Bénin)',
        '📞 **Téléphone** : Contact principal (ex: +229 97 00 00 00)',
        '📧 **Email** : Contact email official',
        '🔒 Accès réservé aux Promoteurs pour protéger les infos sensibles',
      ],
    },

    // ==================== CHANGEMENT DE THÈME ====================
    {
      id: 'step-2b',
      emoji: '🎨',
      title: 'Changement de Thème (Tous Rôles)',
      description:
        'Personnalisez votre **interface BarTender** avec le **changement de thème** : passez entre **Mode Clair** (blanc, lisibilité diurne) et **Mode Sombre** (noir/gris, réduction fatigue oculaire nocturne). Le thème s\'applique instantanément à tous les écrans et se mémorise dans vos préférences.',
      elementSelector: '[data-guide="settings-theme"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant', 'serveur'],
      tips: [
        '☀️ **Mode Clair** = Blanc/gris clair, idéal le jour',
        '🌙 **Mode Sombre** = Noir/gris foncé, réduit fatigue nocturne',
        '⚡ Changement instantané, pas de rechargement',
        '💾 Préférence sauvegardée automatiquement par utilisateur',
      ],
    },

    // ==================== ONGLET 2: OPERATIONAL ====================
    {
      id: 'step-3',
      emoji: '⚙️',
      title: 'Onglet 2: Opérationnel - Gestion Globale',
      description:
        'L\'**Onglet Operational** centralise tous les réglages de gestion : **Heure de clôture** (journée commerciale), **Consignation expiration**, **Fréquence approvisionnement**, **Devise**, **Mode opérationnel** (Complet/Simplifié), et optionnellement **Switching mode**.',
      elementSelector: '[data-guide="settings-operational"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🔧 Cet onglet = Cœur opérationnel de votre bar',
        '💾 Modifications ici affectent journées commerciales + comptabilité',
        '⏰ Closing hour très important = définit limite retours/ventes',
      ],
    },

    {
      id: 'step-4',
      emoji: '🌙',
      title: 'Closing Hour (Heure de Clôture)',
      description:
        '**Heure de clôture** = fin de votre **Journée Commerciale** (ex: 06h matin pour bar de nuit). Toute vente **avant** cette heure appartient à la journée d\'hier, toute vente **après** appartient à aujourd\'hui.\n\n**Exemple clé** : Avec fermeture à 06h00, une vente à **02h00 du matin mardi** est comptabilisée en **lundi** (garder comptabilité cohérente nuits).',
      elementSelector: '[data-guide="settings-closing-hour"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '⏰ Gamme: 0h (minuit) à 23h',
        '🌙 Bars de nuit = généralement 6h, 7h, ou 8h',
        '📊 Affecte: Retours (avant fermeture seulement), Analytics, Rapports',
        '⚠️ Changement = réorganise dates ventes historiques!',
      ],
    },

    {
      id: 'step-5',
      emoji: '📦',
      title: 'Consignation Expiration & Supply Frequency',
      description:
        '**Consignation Expiration** : Combien de jours avant qu\'une consignation expire? (1-30 jours, défaut 7j). Passé cette date, gérant peut confisquer.\n\n**Supply Frequency** : Intervalle moyen entre approvisionnements (1-30 jours). Utilisé pour alertes stock prédictives.',
      elementSelector: '[data-guide="settings-expiration"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📦 Consignation = Produits payés mais laissés au bar (mise de côté)',
        '⏳ Expiration = Délai avant confiscation (réintégration stock)',
        '🚚 Supply Frequency = Aider prédire quand approvisionnement nécessaire',
        '🔢 Valeurs typiques: Consignation 5-14j, Supply 3-7j',
      ],
    },

    {
      id: 'step-6',
      emoji: '💱',
      title: 'Devise (Currency)',
      description:
        '**Devise** = Monnaie de votre établissement. Choix de **4 devises ouest-africaines** : **FCFA (XOF)**, **XAF**, **NGN (Naira)**, **GHS (Cedi)**. Sélectionnez la devise qui s\'affiche partout (prix, CA, rapports).',
      elementSelector: '[data-guide="settings-currency"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '💰 FCFA (XOF) = Bénin, Sénégal, Côte d\'Ivoire',
        '💴 XAF = Cameroun, Gabon, Congo',
        '₦ NGN = Nigeria',
        '₵ GHS = Ghana',
        '🔄 Changement = Affecte TOUS les affichages prix/CA',
      ],
    },

    {
      id: 'step-7',
      emoji: '🔄',
      title: 'Mode Opérationnel: Complet vs Simplifié',
      description:
        '**Mode Complet** : Chaque serveur a son **compte personnel** (téléphone), crée ses propres ventes (validées par manager dans dashboard).\n\n**Mode Simplifié** : **1 compte manager** (comptoir), crée TOUTES les ventes et sélectionne manuellement qui (Afi, Fifi) à chaque vente. Nécessite **Mappings Serveurs**.',
      elementSelector: '[data-guide="settings-operating-mode"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '👤 **Complet** = Chaque serveur: compte + création vente',
        '🔒 **Simplifié** = Manager centralisé + attribution manuelle',
        '🔗 **Simplifié** = Nécessite configurer Mappings (noms courts → vraies serveurs)',
        '⚡ Changement de mode = Réfléchissez bien (affecte workflow)',
      ],
    },

    {
      id: 'step-8',
      emoji: '🔗',
      title: 'Configuration Nom d\'affichage (Mode Simplifié)',
      description:
        'Si vous choisissez **Mode Simplifié**, une section **Nom d\'affichage pour les ventes** apparaît pour configurer les **Identifiants d\'affichage** : lier noms courts (ex: "Afi") à vrais comptes serveurs pour attribution correcte ventes.',
      elementSelector: '[data-guide="settings-switching-mode"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🔗 Identifiants = Lier noms courts → serveurs réels',
        '📝 Exemple: "Afi" → Afiwa, "Fifi" → Félicitée',
        '⚡ Auto-populate = Bouton pour générer auto depuis membres actifs',
        '🚫 Sans identifiants = Ventes mode simplifié ne sont pas attribuées!',
      ],
    },

    // ==================== ONGLET 3: SECURITY ====================
    {
      id: 'step-9',
      emoji: '🛡️',
      title: 'Onglet 3: Sécurité - Protection 2FA',
      description:
        'L\'**Onglet Sécurité** protège votre compte avec **Double Authentification (2FA)**. Activez 2FA pour ajouter une couche de sécurité : même si quelqu\'un a votre password, il ne peut se connecter sans votre téléphone.',
      elementSelector: '[data-guide="settings-security"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🔐 2FA = Sécurité critique pour protection données/finances',
        '📱 Fonctionne avec: Google Authenticator, Authy, Microsoft Authenticator',
        '✅ Fortement recommandé pour comptes manager/promoteur',
      ],
    },

    {
      id: 'step-10',
      emoji: '🔐',
      title: 'Activer 2FA (Double Authentification)',
      description:
        '**Pour activer 2FA** : Cliquez "Activer la 2FA" → Scannez le **QR Code** avec votre app Authenticator (Google Authenticator, Authy) → Saisissez le **code 6 chiffres** généré → "Vérifier et Activer". Votre compte est maintenant **doublement protégé**.',
      elementSelector: '[data-guide="settings-2fa"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '1️⃣ Cliquez "Activer 2FA"',
        '2️⃣ Installez app si pas déjà: Google Authenticator (iOS/Android)',
        '3️⃣ Scannez QR Code affiché',
        '4️⃣ Entrez code 6 chiffres de l\'app',
        '5️⃣ 2FA activée! Chaque connexion demande le code',
      ],
    },

    {
      id: 'step-11',
      emoji: '⚠️',
      title: 'Sauvegarder & Désactiver 2FA',
      description:
        '**Sauvegarder** : N\'oubliez pas de cliquer "Enregistrer" en bas pour valider vos modifications (bar infos, paramètres operationnels). **Désactiver 2FA** : Si vous avez perdu accès à votre app Authenticator, cliquez "Désactiver 2FA" (nécessite vérification identité).',
      elementSelector: '[data-guide="settings-actions"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '💾 Cliquez "Enregistrer" APRÈS modifications',
        '❌ Cliquez "Annuler" pour abandonner',
        '⚠️ Désactiver 2FA = Vérification sécurité requise',
        '🔐 Garde une sauvegarde du code secret en lieu sûr!',
      ],
    },

    // ==================== CONCLUSION ====================
    {
      id: 'step-12',
      emoji: '✅',
      title: 'Vous Maîtrisez la Configuration !',
      description:
        'Vous connaissez maintenant les **3 onglets** (Bar, Operational, Security), comment configurer **infos bar**, **heure de clôture**, **consignations**, **devise**, **mode opérationnel**, et protéger votre compte avec **2FA**. Votre bar est maintenant correctement configuré et sécurisé!',
      position: 'center',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '⚙️ Vérifiez Closing Hour = Impacte TOUT (retours, journées, comptabilité)',
        '🔄 Mode Opérationnel = Choix important (affecte workflow serveurs)',
        '🔗 Mode Simplifié = Configurez Identifiants d\'affichage sinon attribution cassée',
        '🛡️ Activez 2FA = Protection critique pour votre sécurité',
      ],
      action: '→ Vérifiez et sauvegardez vos paramètres !',
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

  estimatedDuration: 7,
  difficulty: 'intermediate',
  emoji: '🎁',
  version: 2,

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
      emoji: '🎁',
      title: 'Bienvenue à la Gestion des Promotions !',
      description:
        'Les promotions sont votre outil principal pour augmenter les ventes et fidéliser les clients. Cet espace est organisé en **3 onglets** :\n\n• **Catalogue d\'Offres** : Gérez vos promotions existantes (liste, recherche, création, activation, suppression)\n• **Analyses** : Suivez les performances (CA, Utilisations, Profit, ROI) par promotion\n• **Nouvelle Promotion** : Créez ou modifiez une promotion avec ses 6 types possibles',
      position: 'center',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '6 types de promotions possibles : Unitaire, Pourcentage, Offre Groupée, Prix Fixe, Sur Vente, Majoration',
        '3 niveaux de ciblage : Tout le menu, Par catégorie, Par produit',
        'Le système calcule automatiquement le meilleur prix pour le client',
      ],
    },

    // ============= ONGLET 1: CATALOGUE D'OFFRES =============
    {
      id: 'step-2',
      emoji: '📋',
      title: 'Onglet 1 : Catalogue d\'Offres',
      description:
        'Cet onglet affiche la **liste de toutes vos promotions** sous forme de cartes. Chaque carte montre le statut, les détails clés et les actions disponibles.',
      elementSelector: '[data-guide="promo-catalog"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📌 Les promotions sont triées par statut : Actives, Programmées, En pause, Expirées, Brouillon',
        '🔄 Les statuts peuvent être : Actif (bande verte), Programmé (bande grise), En pause (symbole pause), Expiré (grisé)',
      ],
    },

    {
      id: 'step-3',
      emoji: '🔍',
      title: 'Rechercher et Filtrer',
      description:
        'Utilisez la **barre de recherche** pour trouver rapidement une promotion par nom, ou les **filtres** pour afficher uniquement celles qui vous intéressent.',
      elementSelector: '[data-guide="promotions-search"]',
      position: 'bottom',
      action: 'Essayez de rechercher ou filtrer',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🔎 Recherchez par nom de promotion (ex: "Happy Hour Lundi")',
        '⏱️ Filtrez par statut : Actives, Programmées, En pause, Expirées, Brouillon',
        '📊 Combinez recherche et filtres pour affiner votre sélection',
      ],
    },

    {
      id: 'step-4',
      emoji: '➕',
      title: 'Créer une Nouvelle Promotion',
      description:
        'Le **bouton "Nouvelle Promotion"** accède à l\'onglet 3 (formulaire). Chaque promotion créée apparaît dans ce catalogue. Les actions de chaque carte permettent de **modifier, prévisualiser, mettre en pause ou supprimer** une promotion existante.',
      elementSelector: '[data-guide="promo-create-button"]',
      position: 'bottom',
      action: 'Repérez le bouton Nouvelle Promotion',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '✏️ Au survol d\'une carte, les actions s\'affichent : Modifier, Aperçu, Pause/Jouer, Supprimer',
        '🗑️ La suppression d\'une promotion n\'affecte pas les ventes déjà effectuées',
        '⏸️ Mettre en pause vous permet de tester différentes offres',
      ],
    },

    // ============= ONGLET 2: ANALYSES =============
    {
      id: 'step-5',
      emoji: '📊',
      title: 'Onglet 2 : Analyses',
      description:
        'Cet onglet vous montre les **performances de vos promotions** en temps réel. Vous y trouvez les KPIs clés (CA, Utilisations, Profit, ROI) et un classement des meilleures offres.',
      elementSelector: '[data-guide="promo-analytics"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📈 Les données s\'actualisent en temps réel',
        '🎯 Identifiez rapidement vos meilleures et pires promotions',
      ],
    },

    {
      id: 'step-6',
      emoji: '📉',
      title: 'KPIs : Métriques Clés',
      description:
        'Quatre **cartes de synthèse** en haut de l\'onglet Analyses :\n\n• **Chiffre d\'Affaires (CA)** : Montant total généré par les promotions\n• **Utilisations** : Nombre de fois où vos promotions ont été appliquées\n• **Profit Net** : Gain réel après coût des produits\n• **ROI (Retour sur Investissement)** : Performance comparée à l\'investissement',
      elementSelector: '[data-guide="promo-kpis"]',
      position: 'top',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '💰 Le Profit Net dépend de vos marges produit (défini dans Inventaire)',
        '📊 Un ROI > 100% signifie votre promo est très rentable',
        '🎯 Ciblez les promotions avec ROI élevé et marge stable',
      ],
    },

    {
      id: 'step-7',
      emoji: '🏆',
      title: 'Analyses: KPIs de Performance',
      description:
        'Vous trouvez les **KPIs clés** (CA, Utilisations, Profit, ROI) qui vous permettent d\'analyser vos promotions. Les meilleures promotions sont celles qui génèrent le plus de profit et d\'utilisation avec un bon ROI.',
      elementSelector: '[data-guide="promo-ranking"]',
      position: 'top',
      action: 'Consultez les KPIs',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '⭐ ROI = combinaison de profit et d\'utilisations',
        '📅 Comparez les périodes (jour, semaine, mois) avec les filtres',
        '🔄 Les promotions avec bon ROI méritent d\'être réactivées',
      ],
    },

    // ============= ONGLET 3: NOUVELLE PROMOTION (FORMULAIRE) =============
    {
      id: 'step-8',
      emoji: '🎨',
      title: 'Onglet 3 : Nouvelle Promotion (Formulaire)',
      description:
        'Cet onglet contient le **formulaire de création/modification**. Organisé en **4 sections** :\n\n• **Identité** : Nom, Description\n• **Mécanisme** : Type d\'offre (6 choix possibles)\n• **Ciblage** : Quoi promouvoir (Tout, Catégories, Produits)\n• **Période** : Quand appliquer la promotion (Dates, Horaires)',
      elementSelector: '[data-guide="promo-form"]',
      position: 'top',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📋 Remplissez les sections dans l\'ordre proposé',
        '💾 Les brouillons se sauvegardent automatiquement',
        '👁️ Une prévisualisation apparaît en bas du formulaire',
      ],
    },

    {
      id: 'step-9',
      emoji: '🏷️',
      title: 'Section 1 - Identité',
      description:
        'Commencez par **identifier votre promotion** :\n\n• **Nom** : ex: "Happy Hour Lundi", "Offre Noël", "Bières en Promotion"\n• **Description** : Contexte interne, raison de l\'offre, cible client',
      elementSelector: '[data-guide="promo-identity"]',
      position: 'bottom',
      action: 'Donnez un nom clair à votre promotion',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📝 Un nom clair aide à retrouver votre promo rapidement',
        '💡 Exemple : au lieu de "Promo 1", écrivez "Heineken -50 FCFA Week-end"',
      ],
    },

    {
      id: 'step-10',
      emoji: '⚙️',
      title: 'Section 2 - Mécanisme (6 Types)',
      description:
        'Choisissez le **type d\'offre** parmi 6 options :\n\n1. **Unitaire** : ex: "-50 FCFA par bouteille" (prix réduit = prix fixe - montant)\n2. **Pourcentage** : ex: "-10%" (prix réduit = prix fixe × (100% - pourcentage))\n3. **Offre Groupée (Lôts)** : ex: "3 pour 1000 FCFA" (prix fixe pour un lot complet)\n4. **Prix Fixe** : ex: "Heineken à 300 FCFA" (remplace le prix d\'origine)\n5. **Sur Vente** : ex: "-5% si achat > 5000 FCFA" (reduction appliquée sur montant total)\n6. **Majoration** : ex: "+100 FCFA de nuit" (augmentation temporaire du prix)',
      elementSelector: '[data-guide="promo-mechanism"]',
      position: 'bottom',
      action: 'Sélectionnez un type d\'offre',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🎯 **Unitaire** est le plus courant (ex: réduction fixe par article)',
        '📦 **Lôts** pour écouler du stock groupé (ex: 3 bières pour une price spéciale)',
        '🌙 **Majoration** pour tarifs dynamiques (tarif de nuit, tarif événement)',
        '💰 Le système gère automatiquement les cas limites (ex: 3 lôts = 9 articles)',
      ],
    },

    {
      id: 'step-11',
      emoji: '🎯',
      title: 'Section 3 - Ciblage (3 Niveaux)',
      description:
        'Définissez **quoi promouvoir** pour protéger vos marges :\n\n• **Tout le menu** : Promo globale sur toutes les ventes\n• **Par catégorie** : Ex: Promo uniquement sur "Bières" ou "Sodas"\n• **Par produit** : Ex: Promo spécifique sur "Heineken 50cl" ou "Coca-Cola"',
      elementSelector: '[data-guide="promo-targeting"]',
      position: 'bottom',
      action: 'Choisissez un niveau de ciblage',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🔒 Cibler par catégorie = meilleur compromis marge/volume',
        '📊 Cibler par produit = écouler un stock spécifique',
        '🌍 "Tout le menu" = promo globale (Happy Hour general)',
      ],
    },

    {
      id: 'step-12',
      emoji: '📅',
      title: 'Section 4 - Période',
      description:
        'Programmez **quand appliquer** la promotion :\n\n• **Date début/fin** : Ex: "1 déc - 31 déc" (période fixe) ou "Sans limite" (permanent)\n• **Horaires** : Ex: "17:00-19:00" (Happy Hour spécifique) ou "00:00-23:59" (toute la journée)\n• **Jours de la semaine** : Lundi à dimanche (cochez les jours concernés)',
      elementSelector: '[data-guide="promo-period"]',
      position: 'bottom',
      action: 'Configurez la validité',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '⏰ Programmez à l\'avance : Happy Hours quotidiens, promos saisonnières, offres limitées',
        '📆 "Sans limite" pour une promotion permanente (mais vérifiable en Analyses)',
        '🕐 Horaires = utile pour Happy Hours (17:00-19:00 chaque jour)',
        '🔄 Vous pouvez programmer et mettre en pause à tout moment',
      ],
    },

    {
      id: 'step-13',
      emoji: '✅',
      title: 'Créer & Optimiser vos Promotions !',
      description:
        'Vous maîtrisez maintenant la création de promotions. Créez des offres attractives, programmez vos happy hours, et **consultez régulièrement l\'onglet Analyses** pour optimiser vos meilleures offres.',
      position: 'center',
      action: 'Cliquez sur Terminer pour commencer',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🚀 Commencez par des promotions simples (Unitaire ou Lôts)',
        '📊 Testez et ajustez rapidement en fonction des Analyses',
        '💡 Communiquez vos offres aux clients (réseaux, affichage, serveurs)',
        '🎯 Concentrez-vous sur les offres avec ROI > 100% et marge stable',
      ],
    },
  ],
};

/**
 * Guide 9: My Profile (All Roles)
 * Universal guide for all account types
 */
export const PROFILE_GUIDE: GuideTour = {
  id: 'my-profile',
  title: 'Mon Profil Utilisateur',
  subtitle: 'Gérez vos informations et votre sécurité',
  description: 'Accédez à vos informations personnelles, changez votre mot de passe et consultez votre statut de certification.',

  targetRoles: ['serveur', 'gerant', 'promoteur'],

  estimatedDuration: 5,
  difficulty: 'beginner',
  emoji: '👤',
  version: 1,

  triggers: [
    {
      type: 'onMount',
      condition: 'isProfilePage',
      delay: 1500,
      showOnce: false,
    },
  ],

  steps: [
    {
      id: 'step-1',
      emoji: '👤',
      title: 'Bienvenue sur Mon Profil !',
      description:
        'Cet espace est accessible à **tous les comptes** (serveurs, gérants, promoteurs). Vous y gérez vos **informations personnelles**, votre **sécurité** (mot de passe) et consultez votre **statut de formation**. Le profil est organisé en **3 onglets** plus une **carte d\'identification** à droite.',
      position: 'center',
      visibleFor: ['serveur', 'gerant', 'promoteur'],
      tips: [
        '👤 **3 onglets** : Informations, Sécurité, Formation',
        '🎫 **Carte d\'ID** : Affiche vos données clés (username, rôle, dates, certification)',
        '🔒 Vos données sont sécurisées et privées',
      ],
    },

    // ============= ONGLET 1: INFORMATIONS =============
    {
      id: 'step-2',
      emoji: '👤',
      title: 'Onglet 1 : Informations Personnelles',
      description:
        'Cet onglet permet de **mettre à jour vos informations** : **Nom Complet** (requis), **Email** (optionnel) et **Téléphone** (optionnel). Tous les champs se sauvegardent en cliquant sur "Sauvegarder les modifications".',
      elementSelector: '[data-guide="profile-info"]',
      position: 'bottom',
      visibleFor: ['serveur', 'gerant', 'promoteur'],
      tips: [
        '✏️ **Nom Complet** : Champ obligatoire (utilisé sur la carte d\'ID)',
        '📧 **Email** : Optionnel (laissez vide si vous n\'en avez pas)',
        '📞 **Téléphone** : Optionnel (format : ex "01 02 03 04 05")',
      ],
    },

    {
      id: 'step-3',
      emoji: '💾',
      title: 'Sauvegarder vos Modifications',
      description:
        'Une fois vos informations mises à jour (au minimum le Nom), cliquez sur le **bouton "Sauvegarder les modifications"**. Un message de succès s\'affichera et vos données seront mises à jour partout dans l\'application.',
      elementSelector: '[data-guide="save-info-btn"]',
      position: 'top',
      action: 'Modifiez et sauvegardez',
      visibleFor: ['serveur', 'gerant', 'promoteur'],
      tips: [
        '✅ Message vert = sauvegarde réussie',
        '❌ Erreur en rouge = une modification n\'a pas pu être sauvegardée',
        '⏱️ Données mises à jour en temps réel partout dans l\'app',
      ],
    },

    // ============= ONGLET 2: SÉCURITÉ =============
    {
      id: 'step-4',
      emoji: '🔒',
      title: 'Onglet 2 : Sécurité - Changer votre Mot de Passe',
      description:
        'Cet onglet est dédié à la **sécurité de votre compte**. Vous devez entrer votre **mot de passe actuel** (vérification), puis définir un **nouveau mot de passe** et le **confirmer**. Les deux nouveaux mots de passe doivent correspondre.',
      elementSelector: '[data-guide="profile-security"]',
      position: 'bottom',
      visibleFor: ['serveur', 'gerant', 'promoteur'],
      tips: [
        '🔐 Le mot de passe actuel est demandé pour la sécurité',
        '👁️ Utilisez les **yeux** pour afficher/masquer les mots de passe',
        '✅ Bouton activé uniquement si les deux nouveaux mots de passe correspondent',
      ],
    },

    {
      id: 'step-5',
      emoji: '🛡️',
      title: 'Conseils de Sécurité pour votre Mot de Passe',
      description:
        'Un encadré bleu affiche les **4 critères minimums** pour un mot de passe sûr :\n\n• **Minimum 8 caractères**\n• **Majuscules & Minuscules** (ex: AaBbCc)\n• **Chiffres & Signes** (ex: 123 !@#)\n• **Différent du précédent** (sécurité renforcée)',
      elementSelector: '[data-guide="password-tips"]',
      position: 'top',
      visibleFor: ['serveur', 'gerant', 'promoteur'],
      tips: [
        '💪 Suivez ces 4 critères pour un mot de passe vraiment sûr',
        '🚫 Ne réutilisez PAS d\'anciens mots de passe',
        '🔄 Changez votre mot de passe régulièrement (tous les 3 mois)',
        '⚠️ Ne partagez jamais votre mot de passe avec quiconque',
      ],
    },

    {
      id: 'step-6',
      emoji: '✅',
      title: 'Valider le Changement de Mot de Passe',
      description:
        'Une fois les 3 champs remplis et les critères respectés, cliquez sur **"Mettre à jour le mot de passe"**. Un message de succès confirme que votre mot de passe a été changé. Vous pouvez vous reconnecter avec le nouveau mot de passe.',
      elementSelector: '[data-guide="update-password-btn"]',
      position: 'top',
      action: 'Changez votre mot de passe',
      visibleFor: ['serveur', 'gerant', 'promoteur'],
      tips: [
        '✅ Succès = mot de passe accepté et changé',
        '❌ Erreur = vérifiez que les 2 nouveaux mots de passe correspondent',
        '🔄 Après changement, gardez le nouveau mot de passe en sécurité',
      ],
    },

    // ============= ONGLET 3: FORMATION =============
    {
      id: 'step-7',
      emoji: '🎓',
      title: 'Onglet 3 : Formation',
      description:
        'Cet onglet affiche votre **statut de certification et de formation**. Vous y trouvez les modules d\'apprentissage disponibles pour maîtriser l\'application. La certification est requise pour accéder à certaines fonctionnalités avancées.',
      elementSelector: '[data-guide="profile-training"]',
      position: 'bottom',
      visibleFor: ['serveur', 'gerant', 'promoteur'],
      tips: [
        '📚 Consultez et complétez les modules de formation',
        '✅ Statut "Certifié" = vous avez terminé la formation requise',
        '⏳ Statut "En attente" = complétez la formation pour avancer',
      ],
    },

    // ============= CARTE D'ID =============
    {
      id: 'step-8',
      emoji: '🎫',
      title: 'Votre Carte d\'Identification BarTender',
      description:
        'À **droite du formulaire**, votre **carte d\'ID personnalisée** affiche :\n\n• **Avatar** avec vos initiales\n• **Rôle** (Serveur, Gérant, Promoteur)\n• **Identifiant Système** (@username unique)\n• **Membre depuis** : Date de création de votre compte\n• **Dernier accès** : Quand vous vous êtes connecté la dernière fois\n• **Certification Formation** : ✓ Certifié ou ⏳ En attente',
      elementSelector: '[data-guide="profile-id-card"]',
      position: 'left',
      visibleFor: ['serveur', 'gerant', 'promoteur'],
      tips: [
        '👤 Initiales = extraites de votre nom (ex: Jean Dupont = JD)',
        '🔐 @username = identifiant unique immuable',
        '📅 Dates = utiles pour archivage ou sécurité',
        '🎓 Certification = validation que vous maîtrisez l\'app',
      ],
    },

    {
      id: 'step-9',
      emoji: '✅',
      title: 'Votre Profil est Maintenant Sécurisé !',
      description:
        'Vous connaissez maintenant votre espace Mon Profil. Vous pouvez : **mettre à jour vos infos personnelles**, **sécuriser votre compte** avec un nouveau mot de passe, **consulter votre formation** et **vérifier votre carte d\'ID**. Votre compte est entre vos mains !',
      position: 'center',
      action: 'Cliquez sur Terminer',
      visibleFor: ['serveur', 'gerant', 'promoteur'],
      tips: [
        '🔒 Gardez votre mot de passe en sécurité',
        '✏️ Mettez à jour votre profil si vos infos changent',
        '📚 Complétez la formation pour rester à jour',
        '💡 Mon Profil est accessible en cliquant sur votre avatar en haut',
      ],
    },
  ],
};

/**
 * Guide 10: Forecasting & AI (Managers/Promoters only)
 * Informational guide for placeholder features (in development)
 */
export const FORECASTING_AI_GUIDE: GuideTour = {
  id: 'forecasting-guide',
  title: 'Prévisions et IA',
  subtitle: 'Analyses prédictives et assistant intelligent',
  description: 'Découvrez les fonctionnalités de prévisions et d\'assistant IA en cours de développement pour optimiser vos opérations.',

  targetRoles: ['promoteur', 'gerant'],

  estimatedDuration: 3,
  difficulty: 'beginner',
  emoji: '📈',
  version: 1,

  triggers: [
    {
      type: 'onMount',
      condition: 'isForecastingPage',
      delay: 1500,
      showOnce: false,
    },
  ],

  steps: [
    {
      id: 'step-1',
      emoji: '📈',
      title: 'Bienvenue aux Prévisions et IA !',
      description:
        'Cet espace est dédié aux **analyses prédictives** et aux **fonctionnalités d\'IA** pour vous aider à optimiser votre bar. Actuellement, vous trouvez **2 onglets** : **Prévisions de Ventes** (en construction) et **Assistant Intelligent IA** (à venir). Ces fonctionnalités arrivent prochainement !',
      position: 'center',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📊 **Prévisions de Ventes** : Analyses prédictives basées sur vos données historiques',
        '🤖 **Assistant IA** : Coach personnel pour répondre à vos questions sur la rentabilité',
        '⏳ Fonctionnalités en cours de développement - restez connecté pour les mises à jour',
      ],
    },

    // ============= ONGLET 1: PRÉVISIONS DE VENTES =============
    {
      id: 'step-2',
      emoji: '📊',
      title: 'Onglet 1 : Prévisions de Ventes',
      description:
        'Cet onglet affichera bientôt vos **analyses prédictives basées sur vos données de ventes**. Une vision stratégique listant **4 points clés** :\n\n• **CA estimé sur le mois prochain** : Projection de chiffre d\'affaires futur\n• **Optimisation des heures de pointe** : Identifiez quand vos clients achètent le plus\n• **Tendance de consommation hebdomadaire** : Patterns et variations par jour/semaine\n• **Ajustement dynamique des marges** : Recommandations pour optimiser vos marges',
      elementSelector: '[data-guide="sales-forecast"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '💰 **CA estimé** = Chiffre d\'affaires prévu (vous aide à budgétiser)',
        '📈 **Heures de pointe** = Optimisez votre staffing et stock',
        '📅 **Tendance hebdo** = Adaptez vos promotions selon les jours',
        '💵 **Marges dynamiques** = Prix variables pour maximiser profit',
      ],
    },

    {
      id: 'step-3',
      emoji: '💡',
      title: 'Vision Stratégique Future',
      description:
        'La vision stratégique à venir inclura des **recommandations intelligentes** basées sur l\'analyse de vos tendances de ventes. Ces analyses vous permettront de :\n\n• Anticiper la demande et ajuster votre stock\n• Programmer vos promotions au moment optimal\n• Maximiser vos profits grâce à des marges variables\n• Prendre des décisions basées sur des données fiables',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🎯 Ces analyses vous aident à **décider** plutôt que de suivre l\'intuition',
        '📦 Connexion avec Inventaire : Suggestions d\'approvisionnement intelligentes',
        '💹 Impact direct sur votre rentabilité et croissance',
      ],
    },

    // ============= ONGLET 2: ASSISTANT IA =============
    {
      id: 'step-4',
      emoji: '🤖',
      title: 'Onglet 2 : Assistant Intelligent IA',
      description:
        'Cet onglet accueillera bientôt votre **coach personnel entraîné sur vos données**. Un assistant conversationnel capable de :\n\n• Répondre à vos questions sur la **rentabilité**\n• Analyser vos **performances de ventes**\n• Proposer des **stratégies d\'optimisation**\n• Fouiller vos données pour des **insights actionnables**',
      elementSelector: '[data-guide="ai-assistant"]',
      position: 'bottom',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '💬 Assistant conversationnel = Posez vos questions en langage naturel',
        '🧠 Entraîné sur **vos données** = Recommandations personnalisées',
        '🔍 Analyse en profondeur = Pourquoi vos meilleures/pires jours ?',
        '⏳ Intégration d\'un modèle d\'IA en cours (choix optimisé en développement)',
      ],
    },

    {
      id: 'step-5',
      emoji: '✨',
      title: 'Comment Fonctionne l\'Assistant IA',
      description:
        'L\'assistant IA (en développement) sera capable de :\n\n1. **Comprendre vos questions** en français naturel\n2. **Accéder vos données** (ventes, stock, retours, consignations)\n3. **Analyser les patterns** (jours forts, produits populaires, marges)\n4. **Générer des recommandations** basées sur les insights découverts\n5. **Vous aider à décider** rapidement avec des données fiables',
      position: 'top',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📊 Exemples de questions : "Quel est mon meilleur produit ?" "Quand dois-je faire une promo ?"',
        '🎯 Réponses basées sur les données réelles de votre bar',
        '⚡ Gain de temps : Plus besoin de fouiller dans les stats manuellement',
        '🔐 Vos données restent privées - analysées sur vos serveurs',
      ],
    },

    {
      id: 'step-6',
      emoji: '🚀',
      title: 'Prochaines Étapes & Calendrier',
      description:
        'Ces fonctionnalités arrivent très bientôt ! Le développement inclut :\n\n• **Phase 1 (En cours)** : Collecte et analyse de vos données historiques\n• **Phase 2** : Implémentation du graphique de projection linéaire (Prévisions)\n• **Phase 3** : Intégration du modèle de langage sélectionné (Assistant IA)\n• **Phase 4** : Tests et optimisation\n\nVous serez notifié dès que ces fonctionnalités seront disponibles !',
      position: 'top',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '📬 Restez connecté pour les mises à jour',
        '💌 Vous recevrez une notification quand c\'est live',
        '🎁 Ces fonctionnalités seront incluses dans votre forfait',
        '💬 Feedback ? Partagez vos idées pour les améliorer',
      ],
    },

    {
      id: 'step-7',
      emoji: '✅',
      title: 'Utilisez Ces Données Quand Elles Arriveront !',
      description:
        'Quand les Prévisions et l\'IA seront **disponibles**, vous pourrez :\n\n• **Décider** en confiance avec des données prédictives\n• **Automatiser** vos approvisionnements via OrderPreparation\n• **Optimiser** vos prix et promotions dynamiquement\n• **Grossir** votre business en suivant ce qui marche vraiment',
      position: 'center',
      action: 'Cliquez sur Terminer',
      visibleFor: ['promoteur', 'gerant'],
      tips: [
        '🎯 Prévisions = Anticipez la demande',
        '🤖 IA = Conseils personnalisés 24/7',
        '📈 Impact = Croissance mesurable',
        '⏰ Bientôt disponible - Merci de votre patience !',
      ],
    },
  ],
};

/**
 * All owner guides (Phase 2+)
 */
export const OWNER_GUIDES: GuideTour[] = [
  SALES_PROCESS_GUIDE,             // 🛍️ Premier guide - Processus complet de vente
  DASHBOARD_OVERVIEW_GUIDE,
  MANAGE_INVENTORY_GUIDE,
  MANAGE_RETURNS_GUIDE,
  MANAGE_CONSIGNMENTS_GUIDE,
  HISTORIQUE_GUIDE,
  MANAGE_TEAM_GUIDE,
  MANAGE_SETTINGS_GUIDE,
  MANAGE_PROMOTIONS_GUIDE,
  PROFILE_GUIDE,
  ACCOUNTING_MODULE_GUIDE,
  // FORECASTING_AI_GUIDE, // Masqué à la demande de l'utilisateur
];
