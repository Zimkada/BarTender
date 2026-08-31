/**
 * kitchen-guides
 * Visites guidées du module Restauration — §19.8.
 *
 * ⭐⭐ TROIS VISITES, UNE PAR MÉTIER. Le module touche trois personnes dont
 * les questions n'ont rien à voir :
 *   · le promoteur/gérant MONTE la carte et lit les coûts ;
 *   · le cuisinier PRODUIT et répond du stock ;
 *   · le serveur COMMANDE et sert.
 * Une visite unique obligerait chacun à traverser ce qui ne le concerne pas.
 *
 * ⛔ `requiresRestaurant: true` SUR LES TROIS. Sans ce drapeau, un bar qui ne
 * vend que des boissons verrait « Monter votre carte » dans sa liste d'aide -
 * le §3 violé à l'endroit le plus visible, celui où l'utilisateur vient
 * justement comprendre son application.
 *
 * ⭐ LE GÉRANT ET LE PROMOTEUR VOIENT AUSSI LA VISITE DU CUISINIER : ils ont
 * toutes ses fonctions et ouvrent les mêmes écrans. La leur cacher les
 * priverait de ce qu'ils doivent pouvoir expliquer à leur équipe.
 *
 * ⚠️ `visibleFor` filtre ÉTAPE PAR ÉTAPE : les montants n'apparaissent que
 * pour les rôles qui y ont droit (§8 - le cuisinier voit les quantités,
 * jamais les montants).
 *
 * ⚠️ AUCUN `data-guide` n'est requis : ces visites sont des explications
 * séquentielles, pas un surlignage d'éléments à l'écran.
 */

import type { GuideTour } from '@/types/guide';

/* ═══════════════════════════════════════════════════════════════════════
   1. MONTER SA CARTE — promoteur et gérant
   ═══════════════════════════════════════════════════════════════════════ */

export const KITCHEN_SETUP_GUIDE: GuideTour = {
  id: 'kitchen-setup',
  title: 'Monter votre carte',
  subtitle: 'Des ingrédients aux plats, dans le bon ordre',
  description:
    'Ce qu\'il faut créer, et dans quel ordre, pour que votre cuisine compte juste : ingrédients, recettes, plats. Une seule fois au départ.',

  targetRoles: ['promoteur', 'gerant'],
  requiresRestaurant: true,

  estimatedDuration: 8,
  difficulty: 'beginner',
  emoji: '📋',
  version: 1,
  triggers: [],

  steps: [
    {
      id: 'setup-1',
      emoji: '🎯',
      title: 'Pourquoi votre cuisine ne compte pas encore',
      description:
        'Un bar sait ce qu\'il vend : une bouteille entre, elle sort. Un restaurant ne le sait pas, parce qu\'entre le sac de riz et l\'assiette il y a un travail que rien n\'enregistre. **Sans configuration, vos plats semblent ne rien coûter** - et votre marge paraît meilleure qu\'elle ne l\'est.',
      tips: [
        '🥘 **Ingrédient** = ce que vous achetez (poisson, riz, huile)',
        '🍽️ **Plat** = ce que le client commande',
        '📖 **Recette** = ce qui relie les deux',
      ],
    },
    {
      id: 'setup-2',
      emoji: '1️⃣',
      title: 'Créez vos ingrédients en premier',
      description:
        'Menu **Cuisine → Ingrédients**, onglet Stock. Un ingrédient a un **nom** et une **unité** - kilo, litre, pièce.',
      action: 'Commencez par ceux de vos plats les plus vendus.',
      tips: [
        '⚠️ L\'unité se fige dès qu\'un stock existe : « kg » ne pourra plus devenir « g »',
        '💡 Créez d\'abord 5 ou 6 ingrédients, pas tout votre magasin',
      ],
    },
    {
      id: 'setup-3',
      emoji: '2️⃣',
      title: 'Approvisionnez',
      description:
        'Onglet **Appro**. Saisissez ce que vous avez acheté et **combien vous l\'avez payé**. C\'est ce prix qui donnera le coût de vos plats.',
      tips: [
        '💰 Chaque appro crée une dépense « Appro cuisine » dans votre comptabilité',
        '📦 Vous pouvez saisir un montant total : le coût unitaire se calcule tout seul',
      ],
      visibleFor: ['promoteur', 'gerant'],
    },
    {
      id: 'setup-4',
      emoji: '3️⃣',
      title: 'Créez vos plats',
      description:
        'Menu **Cuisine → Plats**. Un nom, un prix, et une question : le plat est-il **préparé d\'avance** ou **à la commande** ?',
      tips: [
        '🔥 **À la commande** : poulet braisé, préparé quand le client commande',
        '🍲 **Préparé d\'avance** : riz gras, cuisiné le matin en grande quantité',
        '💡 Le système déduit le reste tout seul à partir de la recette',
      ],
    },
    {
      id: 'setup-5',
      emoji: '4️⃣',
      title: 'La recette : l\'étape qui fait tout marcher',
      description:
        'Sur chaque plat, bouton **Recette**. Indiquez quels ingrédients il consomme, et **combien**. C\'est ce qui permet au système de décompter votre stock et de calculer votre marge.',
      action: 'Sans recette, un plat semble ne rien coûter.',
      tips: [
        '📏 Soyez approximatif au début : 0,3 kg de riz vaut mieux que rien',
        '💡 La marge s\'affiche dès que la recette est saisie - vous verrez tout de suite si un plat est rentable',
      ],
      visibleFor: ['promoteur', 'gerant'],
    },
    {
      id: 'setup-6',
      emoji: '💰',
      title: 'Si vos poissons n\'ont pas tous la même taille',
      description:
        'Vous achetez un carton, et les poissons dedans sont grands ou petits. Cochez **Plusieurs prix selon la taille** sur le plat, et saisissez vos formats : Grand 2 000 F, Moyen 1 500 F, Petit 1 000 F.',
      action: 'Le serveur choisira la taille à la commande.',
      tips: [
        '⭐ Il **choisit** dans votre liste, il ne tape jamais un prix',
        '📋 Les noms sont libres : « Entier / Demi » pour un poulet, « 33cl / 50cl » pour une boisson',
        '💡 Un plat à prix fixe ? Laissez la case décochée, rien ne change',
      ],
      visibleFor: ['promoteur', 'gerant'],
    },
    {
      id: 'setup-7',
      emoji: '✅',
      title: 'Vous êtes prêt',
      description:
        'Vos plats apparaissent maintenant sur l\'écran de vente, à côté de vos boissons. Chaque plat servi décomptera ses ingrédients et comptera sa marge.',
      tips: [
        '📊 **Comptabilité → Vue globale** : une carte « Dont cuisine » vous dit ce que la cuisine rapporte',
        '📈 **Historique**, portée Restau : votre marge matière, vos pertes, vos temps de préparation',
      ],
      visibleFor: ['promoteur', 'gerant'],
    },
  ],
};

/* ═══════════════════════════════════════════════════════════════════════
   2. LE SERVICE EN CUISINE — cuisinier, gérant, promoteur
   ═══════════════════════════════════════════════════════════════════════ */

export const KITCHEN_SERVICE_GUIDE: GuideTour = {
  id: 'kitchen-service',
  title: 'Votre service en cuisine',
  subtitle: 'La file, la production, les pertes',
  description:
    'Comment suivre vos commandes, produire vos plats à l\'avance, et déclarer ce qui est perdu. Le geste quotidien.',

  /**
   * ⭐ LE GÉRANT ET LE PROMOTEUR Y ONT ACCÈS, décision du 13/08 : ils ont
   * toutes les fonctions du cuisinier et ouvrent les mêmes écrans. Leur
   * cacher cette visite les priverait de ce qu'ils doivent expliquer à leur
   * équipe.
   */
  targetRoles: ['cuisinier', 'gerant', 'promoteur'],
  requiresRestaurant: true,

  estimatedDuration: 6,
  difficulty: 'beginner',
  emoji: '👨‍🍳',
  version: 1,
  triggers: [],

  steps: [
    {
      id: 'service-1',
      emoji: '📋',
      title: 'Votre file de commandes',
      /**
       * ⛔ TEXTE VALABLE DANS LES DEUX MODES — défaut trouvé à l'audit du
       * 18/08/2026.
       *
       * Cette étape enseignait « trois gestes : Commencer, puis Prêt ». En
       * MODE SIMPLIFIÉ (§20) ces boutons N'EXISTENT PAS : la file est une
       * liste unique avec un seul bouton « Plat servi ». Le gérant qui suivait
       * la visite cherchait des boutons absents.
       *
       * ⚠️ `visibleFor` ne filtre que par RÔLE, pas par mode — et le gérant est
       * le même rôle dans les deux. Un filtrage par mode demanderait d'étendre
       * le type `GuideStep` pour un seul cas : le texte porte donc les deux
       * régimes, ce qui reste vrai quoi qu'il arrive.
       */
      description:
        'Menu **Service**. Chaque plat commandé apparaît ici, du plus ancien au plus récent. Vous le faites avancer jusqu\'à ce qu\'il parte en salle.',
      tips: [
        '⏱️ L\'ordre d\'arrivée est respecté : les premières tables ne sont pas oubliées',
        '👥 Si votre équipe a des comptes : **Commencer**, puis **Prêt**, et le serveur retire le plat',
        '👤 Si vous gérez seul : un seul bouton **Plat servi** fait tout d\'un coup',
      ],
    },
    /**
     * ⛔ DEUX VARIANTES D'UNE MÊME RÈGLE — audit du 18/08/2026.
     *
     * Le FAIT est identique dans les deux modes : le stock sort au passage en
     * « prêt », jamais à la vente. Seul le GESTE qui le déclenche change de
     * nom. Une étape unique intitulée « Quand vous marquez Prêt » nommait donc
     * un bouton absent de l'écran du gérant en mode simplifié (§20).
     *
     * ⚠️ Le découpage est préféré à un texte « valable partout » parce que ce
     * point est le plus coûteux à mal comprendre : c'est le moment où la
     * matière quitte le stock. Un énoncé vague ici rendrait le décompte
     * incompréhensible — exactement la question qui remonte du terrain.
     */
    {
      id: 'service-2',
      emoji: '🔥',
      title: 'Quand vous marquez « Prêt »',
      description:
        'C\'est à ce moment que le stock est décompté. Pas avant, pas après : quand le plat est réellement fait.',
      action: 'Vous n\'avez rien d\'autre à saisir.',
      tips: [
        '📦 Les ingrédients les plus anciens partent en premier',
        '⚠️ S\'il manque du stock, le plat passe quand même - le manque est enregistré, pas bloqué',
      ],
      // ⭐ §20 — en cuisine simplifiée, le bouton « Prêt » n'existe pas.
      hiddenInSimplifiedKitchen: true,
    },
    {
      id: 'service-2-simplifie',
      emoji: '🔥',
      title: 'Quand le stock est décompté',
      description:
        'En appuyant sur **Plat servi**, vous enregistrez d\'un coup la préparation ET le service. C\'est à cet instant que les ingrédients sortent du stock.',
      action: 'Vous n\'avez rien d\'autre à saisir.',
      tips: [
        '📦 Les ingrédients les plus anciens partent en premier',
        '⚠️ S\'il manque du stock, le plat passe quand même - le manque est enregistré, pas bloqué',
        '💡 Appuyer deux fois ne décompte JAMAIS le stock deux fois',
      ],
      // ⭐ §20 — décrit le geste unique : sans objet en mode complet.
      onlyInSimplifiedKitchen: true,
    },
    {
      id: 'service-3',
      emoji: '🍲',
      title: 'Produire à l\'avance',
      description:
        'Pour un plat préparé d\'avance - riz gras, poisson braisé - menu **Plats → Production**. Vous indiquez combien de portions vous avez faites.',
      action: 'Les commandes se serviront ensuite dans ce lot, sans retoucher au stock.',
      tips: [
        '⭐ C\'est là toute la différence : la matière sort UNE fois, à la production',
        '📊 L\'écran affiche ce qu\'il reste de chaque lot',
      ],
    },
    {
      id: 'service-4',
      emoji: '🗑️',
      title: 'Déclarer une perte',
      description:
        'Un reste part à la poubelle ? Bouton **Déclarer une perte** sur le lot. Vous indiquez **combien** et **pourquoi**.',
      tips: [
        '🔸 **Plus consommable** : gâté, ou date dépassée',
        '🔸 **Invendu** : encore bon, mais il ne se garde pas',
        '💡 Les deux n\'appellent pas la même correction - le premier dit « produit trop tôt », le second « produit trop »',
      ],
    },
    {
      id: 'service-5',
      emoji: '♻️',
      title: 'Un plat prêt que le client refuse',
      description:
        'Le client est parti. Le plat est fait, sa matière est sortie. **Il est souvent encore servable** : menu **Plats → Production**, bloc « Plats annulés encore en cuisine », bouton **Remettre en vente**.',
      action: 'Il rejoint vos portions disponibles au lieu d\'être compté perdu.',
      tips: [
        '⏱️ Aucune limite de temps : vous voyez son âge et vous jugez',
        '🟠 Un plat d\'une journée précédente est signalé - vérifiez son état',
        '💡 Si personne n\'en veut, ne faites rien : il reste compté en perte, ce qui est la vérité',
      ],
    },
    {
      id: 'service-6',
      emoji: '📊',
      title: 'Ce que vous pouvez consulter',
      description:
        'Écran **Service**, panneau **Mon activité** : ce que vous avez préparé, et les pertes déclarées avec leur motif et leur auteur.',
      tips: [
        '👁️ Vous voyez les déclarations de tout le monde : vous répondez du stock',
        '📏 Vous lisez des **quantités**, pas des montants - c\'est voulu',
      ],
      visibleFor: ['cuisinier'],
    },
  ],
};

/* ═══════════════════════════════════════════════════════════════════════
   3. COMMANDER UN PLAT — serveur, gérant, promoteur
   ═══════════════════════════════════════════════════════════════════════ */

export const KITCHEN_ORDER_GUIDE: GuideTour = {
  id: 'kitchen-order',
  title: 'Commander un plat',
  subtitle: 'De la prise de commande au service',
  description:
    'Comment envoyer une commande en cuisine, choisir une taille, et servir quand c\'est prêt.',

  targetRoles: ['serveur', 'gerant', 'promoteur'],
  requiresRestaurant: true,

  estimatedDuration: 4,
  difficulty: 'beginner',
  emoji: '🍽️',
  version: 1,
  triggers: [],

  steps: [
    {
      id: 'order-1',
      emoji: '🍽️',
      title: 'Les plats sont à côté des boissons',
      description:
        'Sur l\'écran de vente, un sélecteur vous laisse voir **Tout**, les **boissons** seules ou les **plats** seuls. Touchez un plat pour l\'ajouter.',
      tips: [
        '⏱️ Le temps de préparation s\'affiche sur chaque plat : vous pouvez l\'annoncer au client',
        '🔴 Un plat « Coupé » reste visible mais ne peut pas être commandé',
      ],
    },
    {
      id: 'order-2',
      emoji: '📏',
      title: 'Si le plat a plusieurs tailles',
      description:
        'Une fenêtre vous demande laquelle vous servez : Grand, Moyen, Petit. Touchez celle qui correspond à l\'assiette.',
      action: 'Le prix suit automatiquement.',
      tips: [
        '⭐ Un grand et un petit font **deux lignes distinctes** dans le panier',
        '💡 Vous ne tapez jamais un prix : vous choisissez dans la liste du gérant',
      ],
    },
    {
      id: 'order-3',
      emoji: '📤',
      title: 'Une seule addition',
      description:
        'Boissons et plats partent ensemble sur le **même ticket**. Le client reçoit une addition, pas deux.',
      tips: [
        '🔔 Les plats partent en cuisine dès la validation',
        '📝 Vous pouvez préciser « sans piment », « bien cuit » - c\'est l\'information qui coûte le plus cher quand elle est manquée',
      ],
    },
    {
      id: 'order-4',
      emoji: '✅',
      title: 'Servir',
      description:
        'Quand le cuisinier marque un plat **Prêt**, vous le voyez dans votre file. Bouton **Servir** au moment où vous le posez sur la table.',
      action: 'C\'est ce geste qui crée la vente.',
      tips: [
        '⚠️ Servez au moment réel : c\'est là que le chiffre d\'affaires est compté',
      ],
    },
  ],
};

/** Les trois visites du module, dans l'ordre d'un démarrage. */
export const KITCHEN_GUIDES: GuideTour[] = [
  KITCHEN_SETUP_GUIDE,
  KITCHEN_SERVICE_GUIDE,
  KITCHEN_ORDER_GUIDE,
];
