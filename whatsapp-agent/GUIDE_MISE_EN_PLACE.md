# Guide de mise en place d'un agent commercial WhatsApp avec Claude

Retour d'expérience complet sur la création d'Aïcha, l'assistante WhatsApp de BarTender Pro. Ce document décrit chaque étape réellement suivie, les difficultés rencontrées, comment elles ont été résolues, et les conseils à retenir pour reproduire la démarche sur une autre application.

Contexte du projet source : application POS multi-tenant pour bars au Bénin, agent WhatsApp faisant commercial (qualification prospects) et support niveau 1 (clients existants), bâti sur WhatsApp Business Cloud API (Meta) + Supabase Edge Function + API Claude (Anthropic).

---

## Prérequis et effort à prévoir

**Prérequis à réunir avant de commencer :**
- Un compte sur la plateforme d'IA choisie, **approvisionné** (le paiement peut être un obstacle réel, voir Phase 6).
- Un compte de messagerie professionnelle chez le fournisseur (compte développeur + portefeuille business).
- **Un numéro de téléphone dédié**, avec une carte SIM active dans un téléphone accessible, et **jamais utilisé sur l'application de messagerie grand public** (sinon il faut le dissocier au préalable).
- Une plateforme d'hébergement de fonctions serveur (ici Supabase Edge Functions ; n'importe quel équivalent convient).
- Un moyen de paiement international, au cas où le fournisseur de messagerie l'exige.

**Répartition d'effort constatée :**

| Phase | Part de l'effort | Nature |
|---|---|---|
| Contenu (prompt + base de connaissances) | ~40% | Rédaction, allers-retours de discours |
| Code (fonction serveur, tables, supervision) | ~25% | Développement classique |
| Configuration du fournisseur de messagerie | ~30% | Clics, attentes, déblocages |
| Déploiement proprement dit | ~5% | Quelques commandes |

Le code est la partie la plus rapide. Ce sont le **contenu** et la **configuration externe** qui consomment le temps. Prévoir le planning en conséquence.

---

## Vue d'ensemble de l'architecture retenue

```
Client WhatsApp
      │
WhatsApp Business Cloud API (Meta, officiel)
      │  webhook (signature HMAC)
Supabase Edge Function (Deno)
      │  prompt système caché (cache_control)
API Claude (Anthropic)
      │  tools : enregistrer_lead, escalader_humain, definir_profil
Réponse → WhatsApp
      │
Tables Supabase (wa_conversations, wa_leads)
      │
Page admin de supervision (lecture seule + reprise de main)
```

Décisions structurantes prises dès le départ, à trancher tôt dans tout projet similaire :
- **API officielle Meta, jamais de solution non officielle** (type whatsapp-web.js) : risque de bannissement du numéro, contraire aux CGU Meta.
- **Pas de RAG / base vectorielle** : une base de connaissances de quelques milliers de tokens tient très bien dans le system prompt, avec prompt caching pour réduire le coût. Un RAG est de la sur-ingénierie tant que le volume de connaissances reste raisonnable.
- **Réponse manuelle hors de l'application** : décision de ne PAS centraliser la messagerie dans l'app (pas de fonction d'envoi côté admin). L'éditeur reprend la main via l'app/Business Suite WhatsApp officielle de Meta. Ça simplifie énormément le périmètre technique (pas de "wa-send", pas de zone de réponse à sécuriser).

---

## Phase 0 — Base de connaissances et system prompt

**Objectif** : écrire le contenu avant d'écrire une ligne de code. Le prompt est le vrai produit ; l'infra n'est qu'un tuyau.

### Ce qui a été fait
- Un dossier dédié (`whatsapp-agent/`) avec :
  - `SYSTEM_PROMPT.md` : les règles de comportement (style, garde-fous, règles d'escalade), avec des placeholders `{{BASE_COMMUNE}}`, `{{PROSPECTS}}`, `{{CLIENTS}}`.
  - `knowledge/base-commune.md`, `knowledge/prospects.md`, `knowledge/clients.md` : le contenu factuel, organisé par audience.
  - `build-prompt.mjs` : script qui assemble tout en un seul prompt final (`PROMPT_ASSEMBLE.txt` pour les tests, `prompt.ts` pour la production).
- Compilation à partir des documents existants du projet (CGU, guides utilisateur, rapports internes) plutôt que d'inventer le contenu.

### Conseil clé
**Vérifier chaque affirmation contre le code réel plutôt que contre la documentation.** Plusieurs erreurs ont été trouvées en confrontant les guides utilisateur existants au comportement réel de l'application (une vente rejetée ne peut PAS être corrigée contrairement à ce que disait un guide ; un serveur PEUT créer une demande de retour contrairement à ce qu'affirmait un autre guide). Les docs de conception décrivent parfois une intention jamais implémentée. Un sous-agent d'exploration dédié au recensement des fonctionnalités réelles a permis de corriger un vrai "faux négatif" observé en production : le bot répondait qu'une fonctionnalité n'existait pas alors qu'elle était bel et bien implémentée, faute de l'avoir dans sa base.

### Test avant tout code
Avant d'écrire la moindre ligne d'infrastructure, le prompt a été testé directement dans une conversation Claude (claude.ai / console), avec une grille de 11 scénarios couvrant : pitch, objection prix, tentative de négociation, objection connexion, question sur une fausse fonctionnalité IA, support, refus d'accès aux données, bug, frustration, injection de prompt, lead chaud. Résultat : ~95% de conformité avant même de toucher à l'infrastructure.

**Conseil** : ce test coûte une conversation gratuite et évite de déployer un prompt bancal. Le modèle le moins cher de la gamme (ici Haiku) suffit largement pour ce test — s'il tient la route dessus, il tiendra en production.

---

## Phase 1 — Localisation et discours (le vrai travail, itératif)

C'est la phase qui a pris le plus d'itérations, et celle où la valeur ajoutée humaine est irremplaçable : un modèle ne connaît pas les usages locaux tacites d'un métier et d'un pays.

### Difficultés rencontrées et corrections apportées

| Problème observé | Cause | Correction |
|---|---|---|
| Le bot demandait "combien de tickets/jour" | Réflexe générique de qualification commerciale | Interdiction explicite + proxies concrets du métier (casiers/semaine, nombre de serveurs, affluence) |
| Le bot disait "patron" et "soft drinks" | Vocabulaire par défaut du modèle (anglicismes, registre européen) | Glossaire imposé : "promoteur", "sucreries", "alcools mix"... Une liste positive fonctionne mieux qu'une simple interdiction : donner le bon mot, pas seulement interdire le mauvais |
| Le bot recopiait "son bar" au lieu de "votre bar" | Consignes rédigées à la 3e personne dans le prompt, recopiées telles quelles par le modèle | Réécrire les consignes à la 2e personne (celle que le bot doit employer), ou ajouter une règle explicite de transposition |
| Le bot disait "j'escalade" à l'utilisateur | Le nom technique du tool a fui dans le langage utilisateur | Interdiction explicite du jargon interne (escalade, tool, lead, prompt...) avec les formulations de remplacement à utiliser |
| Réponses avec des astérisques mal rendus sur WhatsApp réel | Le modèle utilise un Markdown implicite (gras) qui n'est pas fiable ; le test en console (claude.ai) ne le révèle pas car la console RENDT le Markdown | Interdiction ABSOLUE et sans exception de l'astérisque, y compris pour le gras — pas de compromis "un peu de gras autorisé", trop instable |
| Réponse organisée en liste de catégories façon catalogue | Réflexe "document" du modèle plutôt que réflexe "conversation" | Interdire explicitement le format liste/catalogue, imposer des phrases fluides avec 2-3 points maximum |
| Le bot était trop long / trop protocolaire | Absence de contrainte de longueur | Limite stricte : 2 à 4 phrases par message, une seule question à la fois |

### Conseil le plus important de cette phase
**Tester en conditions réelles, pas seulement en console.** Le Markdown est le piège type : invisible en test (la console de développement rend le Markdown proprement), catastrophique en production (WhatsApp l'affiche de façon inconsistante selon le client). Toujours faire au moins un aller-retour de test sur un vrai téléphone avant de considérer le style validé.

### Adapter la réponse au profil de l'interlocuteur
Découverte importante en cours de test : **la même question appelle deux réponses différentes** selon qui la pose.

- Un **prospect** qui demande "est-ce que l'application sait faire X ?" veut savoir si ça existe et si ça résout son problème. Lui dérouler la procédure complète (quel menu, quels boutons) le noie et casse l'élan commercial. Réponse attendue : la capacité et le bénéfice, en une ou deux phrases, éventuellement suivies d'une proposition de démonstration.
- Un **client existant** qui pose exactement la même question veut *faire* la chose. Lui répondre "oui ça existe" sans plus est frustrant. Réponse attendue : les étapes concrètes.

Sans règle explicite dans le prompt, le modèle sert la même réponse aux deux profils — inadaptée dans un cas sur deux. La base de connaissances peut contenir tout le détail procédural ; c'est le prompt qui doit dire **quel niveau de détail servir selon le profil détecté**.

Corollaire : prévoir un mécanisme pour identifier le profil dès les premiers échanges (ici, une question d'ouverture "vous utilisez déjà l'application ou vous la découvrez ?" et un outil qui enregistre la réponse).

### Garde-fou contre le faux négatif
Un bot à qui l'on interdit d'inventer aura tendance, par excès de prudence, à **affirmer qu'une fonctionnalité n'existe pas** simplement parce qu'elle est absente de sa base. C'est un dégât commercial silencieux : le client repart convaincu que le produit ne sait pas faire quelque chose qu'il sait très bien faire.

Règle à inscrire explicitement : le bot ne peut affirmer qu'une fonction **existe** que si sa base le dit ; il ne peut **jamais** affirmer qu'elle n'existe pas. En cas de doute, il annonce qu'il vérifie et transmet la question. Ce cas s'est réellement produit avant correction.

### Sujet sensible : l'identité et la confiance
Question posée en cours de route : donner un prénom humain à l'assistante (ici "Aïcha") ne risque-t-il pas de faire croire à une arnaque ou à une usurpation d'identité humaine ?

Conclusion retenue, contre-intuitive mais robuste : **la transparence rassure plus qu'elle n'inquiète**, à condition de la doser :
- Ne jamais prétendre activement être une personne physique.
- Ne pas non plus le clamer à tout bout de champ ("assistante virtuelle" dans chaque phrase) : ça sonne froid et évasif.
- Distinguer deux niveaux de question : une question d'identité générale ("qui es-tu ?") reçoit une présentation chaleureuse normale ; seule une question DIRECTE sur la nature ("es-tu un robot/une IA ?") déclenche la confirmation honnête.
- Ce qui protège vraiment de la suspicion d'arnaque : un nom d'entreprise réel et vérifiable, ne jamais demander d'argent ni de code/mot de passe, offrir un contact humain (mais pas par réflexe sur chaque échange).

---

## Phase 2 — Schéma de base de données

### Ce qui a été fait
Deux tables hors du périmètre multi-tenant existant : `wa_conversations` (une ligne par numéro, historique JSONB, statut `mode` bot / humain / escalade_pending) et `wa_leads` (CRM léger, upsert par numéro de téléphone).

### Choix de sécurité
RLS activé, une seule policy par table réservée à un rôle admin existant. Aucun accès anonyme. L'écriture applicative passe par la clé de service (bypass RLS), réservée à la fonction serveur — jamais exposée côté client.

### Piège rencontré et leçon
Une migration qui accorde les droits à un rôle "authentifié" (pour l'interface d'administration) peut **oublier** d'accorder les droits au rôle de service utilisé par la fonction serveur. Résultat : erreur "permission denied" malgré l'usage du bon rôle technique, parce que les tables nouvellement créées n'accordent pas de privilèges implicites. **Toujours accorder explicitement les droits aux DEUX rôles (celui de l'interface ET celui du service applicatif), et le vérifier par une requête dédiée avant de considérer la migration terminée.**

Autre leçon de sécurité générale : avant de faire confiance à une fonction d'autorisation existante dans une policy, vérifier qu'elle est bien exécutable par le rôle qui l'utilisera (pas seulement qu'elle existe) — un futur durcissement de sécurité peut retirer ce droit d'exécution sans que quiconque s'en aperçoive avant un incident.

---

## Phase 3 — La fonction serveur (webhook)

### Éléments de sécurité non négociables
- Vérification de signature cryptographique de chaque requête entrante AVANT tout traitement du contenu (rien n'est interprété tant que la signature n'est pas validée).
- Comparaison de signature à temps constant (éviter les attaques par mesure de temps).
- Le point d'entrée du webhook doit accepter les requêtes sans jeton d'authentification applicatif classique, puisque le fournisseur externe ne peut pas en fournir un : c'est la signature qui fait office d'authentification.

### Pièges techniques découverts en certification (avant tout déploiement)
Une relecture systématique du code, confrontée aux contraintes réelles de l'API du modèle et du protocole HTTP, a permis de trouver et corriger trois bugs avant la mise en production :

1. **Une boucle d'appels d'outils qui peut se terminer sans réponse finale.** Si le modèle utilise des outils jusqu'à la dernière itération autorisée, et que cette dernière itération se termine encore par une demande d'outil, l'utilisateur ne reçoit jamais la réponse en langage naturel. Correctif : sur le tout dernier tour, retirer la possibilité d'utiliser des outils pour forcer une réponse textuelle.
2. **Une réponse générée mais jamais livrée, silencieusement traitée comme un succès.** L'appel d'envoi peut échouer (jeton expiré, restriction du fournisseur) sans que le code s'en soucie. Correctif : propager et enregistrer explicitement l'état de livraison, pour qu'un superviseur humain puisse distinguer une réponse reçue par le client d'une réponse seulement générée.
3. **Perte de message en cas d'écritures concurrentes rapprochées.** Si deux messages arrivent presque simultanément, chaque traitement peut relire puis réécrire tout l'historique, écrasant le message de l'autre. Correctif : verrou optimiste (réécriture conditionnée à l'absence de modification depuis la dernière lecture), avec réessai en boucle courte en cas de conflit détecté.

**Conseil de méthode** : faire relire le code par un regard extérieur (agent ou pair) spécifiquement pour chercher des bugs de concurrence et de terminaison de boucle AVANT le premier déploiement, plutôt que de les découvrir en production. Ce sont des bugs qui ne se manifestent pas sur un test isolé mais seulement sous charge ou sur des cas limites (dernier tour de boucle, deux messages rapprochés).

### Coût
Avec un prompt caché de quelques milliers de tokens et le cache activé, et un modèle économique choisi pour les échanges courants, le coût par échange reste de l'ordre de quelques francs — négligeable face à la valeur d'un client converti. Un plafond strict sur la longueur de réponse générée est recommandé dès le départ (les réponses WhatsApp doivent être courtes de toute façon).

---

## Phase 4 — Interface de supervision

### Décision de périmètre
Volontairement **lecture seule** côté messages : la vraie prise de parole humaine se fait via l'outil officiel du fournisseur (l'application/console WhatsApp Business elle-même), pas depuis une zone de saisie custom dans l'application. Ça évite de construire et sécuriser un canal d'envoi supplémentaire, pour un bénéfice marginal.

Deux mutations seulement : redonner la main au bot sur une conversation, et faire évoluer le statut d'un lead commercial.

### Bug de certification trouvé après coup
Un tri "les conversations à traiter remontent en premier" avait été *documenté* dans le code mais pas *implémenté* (le tri réel ne portait que sur la date, pas sur le statut). Une conversation urgente ancienne pouvait donc se retrouver noyée sous des conversations récentes sans urgence. Leçon : vérifier qu'un commentaire de code décrivant un comportement correspond bien au comportement réellement codé, pas seulement le lire comme une preuve de correction.

---

## Phase 5 — Configuration du fournisseur de messagerie (séquence exacte)

Cette phase est purement de la configuration dans l'interface du fournisseur. L'ordre compte : certaines étapes échouent si les précédentes ne sont pas faites.

### Séquence dans l'ordre

1. **Créer le compte développeur** sur le portail développeur du fournisseur (distinct du compte de messagerie grand public).
2. **Créer une application** de type "Business", avec le cas d'usage orienté messagerie professionnelle.
3. **Créer/associer un portefeuille business** (demandé pendant la création de l'app). Un portefeuille non vérifié suffit pour démarrer.
4. **Récupérer les identifiants de test** : le fournisseur offre un numéro de test gratuit, avec son identifiant technique et un jeton temporaire. Utile pour valider la plomberie sans engager son vrai numéro.
5. **Déployer la fonction serveur AVANT de configurer le webhook.** Le fournisseur appelle immédiatement l'URL pour la vérifier ; si la fonction n'est pas en ligne avec le bon jeton de vérification, la validation échoue.
6. **Configurer le webhook** : URL de la fonction déployée + un jeton de vérification que l'on choisit soi-même (à placer aussi dans les secrets de la fonction).
7. **S'abonner au champ des messages entrants** dans la liste des champs webhook (souvent activé par défaut, à vérifier).
8. **⚠️ Souscrire l'application au compte de messagerie.** Étape distincte de la précédente et **facilement oubliée** : le webhook peut être validé sans que le compte lui envoie quoi que ce soit. Sans cette souscription, tout est correctement configuré en apparence mais aucun message n'arrive jamais.
9. **Créer le jeton permanent** via un compte technique dédié (voir Phase 6, obstacle 3).
10. **Enregistrer le numéro de production** et le vérifier (SMS ou appel vocal).
11. **Mettre à jour les secrets** avec le nouvel identifiant du numéro de production (il diffère de celui du numéro de test) puis redéployer.

### Le piège qui coûte le plus de temps
Les étapes 7 et 8 se ressemblent mais sont **indépendantes**. Symptôme d'un oubli de l'étape 8 : le fournisseur affiche bien les messages entrants dans son propre outil de test, la fonction serveur répond correctement quand on l'appelle directement, mais aucune trace d'appel réel n'apparaît dans les journaux de la fonction. Si vous observez « le fournisseur voit le message mais ma fonction n'est jamais appelée », c'est presque toujours cette souscription qui manque.

### Diagnostic méthodique en cas de non-réception
Vérifier dans cet ordre, du plus simple au plus profond :
1. La fonction répond-elle si on l'appelle directement (test de la vérification initiale) ? → isole "code déployé" de "fournisseur ne livre pas".
2. Les journaux de la fonction montrent-ils **un appel** ? Aucun journal = le fournisseur ne livre pas (souscription, abonnement au champ). Un journal avec erreur = le problème est dans le code ou les droits.
3. Le jeton d'accès est-il encore valide ? (un jeton temporaire expire silencieusement et fait échouer les appels sortants sans que la réception soit affectée)
4. Les écritures en base fonctionnent-elles ? (droits du rôle de service)

---

## Phase 6 — Mise en production (la partie la plus semée d'embûches, hors code)

C'est la phase la plus longue en pratique, très majoritairement à cause de la configuration du fournisseur externe et non du code applicatif.

### Obstacle 1 : paiement du fournisseur d'IA
Un paiement par carte locale peut échouer sur une plateforme de facturation internationale sans que la cause soit évidente (parfois la banque, parfois la plateforme elle-même, parfois juste une connexion instable au moment du paiement). Pistes utiles avant de conclure à un blocage définitif : saisir la carte manuellement plutôt que via un remplissage automatique, vérifier la cohérence entre le pays de facturation déclaré et celui de la carte, et en dernier recours utiliser une carte virtuelle internationale rechargée via un service de paiement mobile local.

### Obstacle 2 : particularités de numérotation nationale
Un pays ayant changé récemment son plan de numérotation (ajout d'un préfixe) peut créer des incohérences entre différents systèmes tiers qui n'ont pas tous mis à jour leur traitement du format. Constat pratique : le bug de troncature affectait uniquement certains formulaires de configuration et l'envoi de codes de vérification par SMS — **jamais la messagerie elle-même**, qui gérait le numéro correctement de bout en bout. Contournement qui a fonctionné : la vérification par appel vocal plutôt que par SMS quand le SMS échoue silencieusement.

**Conseil** : face à un tel bug, ne pas généraliser trop vite ("le fournisseur ne gère pas mon pays") avant d'avoir isolé précisément QUEL canal échoue. Un bug sur un formulaire de test n'implique pas forcément un bug sur le canal de production réel — ça s'est vérifié ici : le numéro de production a été accepté et vérifié sans problème une fois le bon canal de vérification choisi.

### Obstacle 3 : jetons d'accès temporaires
Le jeton d'accès obtenu lors de la configuration initiale expire généralement sous 24 heures — largement suffisant pour un premier test, totalement inadapté à une mise en service durable. Un jeton permanent nécessite la création d'un compte technique dédié ("utilisateur système") au niveau du portefeuille professionnel du fournisseur, avec attribution explicite des droits sur l'application ET sur le compte de messagerie (les deux, séparément — un oubli fréquent), puis génération d'un jeton sans date d'expiration et avec seulement les permissions strictement nécessaires.

**Conseil** : traiter la génération du jeton permanent comme une étape à part entière du projet, pas comme un détail. Un bot qui retombe en panne chaque jour est pire qu'un bot qui n'a jamais démarré, du point de vue de la confiance qu'il inspire.

### Obstacle 4 : numéro dédié vs numéro existant
Un numéro de téléphone ne peut pas être utilisé simultanément sur l'application de messagerie grand public ET sur l'API professionnelle : l'enregistrer sur l'un le retire de l'autre. Décision prise : dédier un numéro neuf au bot, et conserver le numéro déjà utilisé (contact humain direct, réception de paiements) intact sur l'application grand public. Numéro déjà présent dans des documents publics ? Ce n'est pas bloquant : les documents peuvent lister plusieurs canaux avec des rôles distincts ("assistant automatisé" / "contact direct") plutôt que de forcer un seul numéro à tout faire.

**Conseil de sécurité** : un numéro qui reçoit des paiements ne devrait jamais être le même que celui, largement diffusé, d'un assistant automatisé public. La confusion entre les deux rôles augmente le risque de tentative de phishing/arnaque visant les clients.

### Obstacle 5 : mode test vs mode production
Le mode d'essai d'un service de messagerie professionnelle impose généralement une liste restreinte de destinataires autorisés en sortie. Si cette liste est elle-même impossible à remplir à cause d'un bug de format (cf obstacle 2), la seule issue propre est de passer directement en registration de production — à ne faire que lorsque le cœur du bot (le modèle de langage branché, testé) est déjà validé, pour ne pas sacrifier un numéro dédié pour un bot qui ne répond pas encore correctement.

### Coûts du fournisseur de messagerie (bonne surprise)
Contrairement à une idée répandue, l'infrastructure est **gratuite** : création du compte, de l'application, des jetons, du webhook, et surtout **les conversations entrantes** (un client écrit, le bot répond dans la fenêtre de service) ne sont pas facturées. Seuls les messages **sortants initiés par l'entreprise** hors fenêtre de service (relances, campagnes via modèles pré-approuvés) sont payants.

Pour un agent qui **répond** à des sollicitations — le cas d'usage décrit ici — la facture du fournisseur de messagerie est donc nulle. Le seul coût récurrent est celui du modèle de langage.

Un moyen de paiement peut néanmoins être réclamé comme garantie au moment d'activer certaines fonctions, sans prélèvement tant qu'on reste sur des conversations gratuites.

---

## Étapes restantes / non encore réalisées

À la date de rédaction, le bot est **en production et fonctionnel**, mais plusieurs chantiers restent ouverts. Ils sont listés ici car ils font partie d'une mise en place complète et devront être anticipés dans une reproduction.

### 1. Vérification d'entreprise auprès du fournisseur (à planifier)
Le portefeuille business est actuellement **non vérifié**. Le bot fonctionne, mais cette vérification (dépôt de documents légaux prouvant l'existence de l'entreprise, examinés par le fournisseur) est nécessaire pour :
- Lever les **plafonds de volume** de messages imposés aux comptes non vérifiés.
- Ajouter davantage de numéros de téléphone au compte.
- Accéder à certaines fonctions avancées et afficher un statut de confiance.

**Conseil** : ce n'est pas bloquant pour démarrer et tester, mais c'est à engager **dès que le trafic devient réel**, car l'examen peut prendre plusieurs jours et se heurter à des demandes de compléments. Ne pas attendre de buter sur un plafond en pleine campagne commerciale. Prévoir d'avoir sous la main les documents d'immatriculation de l'entreprise.

### 2. Nom d'affichage soumis à examen
Le nom affiché du compte (celui que voient les destinataires) est soumis à une revue du fournisseur. Il doit correspondre au nom réel de la marque et respecter les règles de nommage. Un nom trop descriptif ou trop éloigné de l'identité légale peut être refusé.

### 3. Reprise de main humaine automatisée (non implémentée)
Le mécanisme permettant au bot de **se taire automatiquement** lorsque l'humain répond manuellement depuis l'outil officiel du fournisseur n'est pas encore en place. Il repose sur un champ webhook dédié aux échos de messages sortants, qui ferait basculer la conversation en mode humain. Aujourd'hui, la bascule est **manuelle** via l'interface de supervision.

**Attention** : ne pas activer ce champ webhook côté fournisseur tant que le code correspondant n'est pas écrit — cela n'aurait aucun effet et brouillerait le diagnostic.

### 4. Moyen de paiement du fournisseur de messagerie
Non renseigné à ce jour, car inutile pour les conversations entrantes gratuites. À ajouter uniquement si des campagnes sortantes (relances proactives par modèles) sont envisagées.

### 5. Tests de bout en bout des scénarios commerciaux
La grille de scénarios a été validée en conversation de développement et partiellement en conditions réelles. Il reste à la dérouler **intégralement sur le canal réel** pour valider le discours dans toutes les situations (objections, escalades, injections).

### 6. Smoke-test des garde-fous d'accès à l'interface de supervision
Vérifier concrètement, en se connectant avec un compte non administrateur, que l'interface de supervision est bien inaccessible et que les données ne remontent pas. Les politiques de sécurité sont en place mais ce test manuel n'a pas encore été effectué.

---

## Récapitulatif des conseils transversaux

1. **Écrire et tester le contenu avant l'infrastructure.** Le prompt et la base de connaissances sont le vrai produit ; ils se valident gratuitement en conversation avant tout code.
2. **Vérifier chaque affirmation métier contre le code réel**, jamais contre la documentation de conception seule — les deux divergent plus souvent qu'on ne le pense.
3. **Tester le rendu final sur le vrai canal (téléphone réel)**, pas seulement dans un environnement de développement qui peut masquer des défauts de mise en forme.
4. **Séparer strictement les rôles des numéros/canaux sensibles** (paiement, contact humain, assistant automatisé public) plutôt que de tout faire porter par un seul identifiant.
5. **Traiter l'authentification permanente comme une étape de projet à part**, pas un détail technique reporté à plus tard.
6. **Faire certifier le code serveur par un regard extérieur** avant le premier déploiement, en ciblant spécifiquement les bugs de concurrence et de terminaison de boucle.
7. **Accorder explicitement les droits à TOUS les rôles techniques impliqués** dans une migration de base de données, y compris les rôles de service utilisés uniquement par le code serveur.
8. **Isoler précisément la portée d'un bug de fournisseur externe** avant de conclure à une incompatibilité générale — un problème sur un outil de test annexe n'implique pas un problème sur le canal de production.
9. **Itérer par petits cycles observation → correction → redéploiement → nouveau test réel**, en acceptant qu'un agent conversationnel de qualité se peaufine sur plusieurs allers-retours, pas en une seule passe.
10. **Documenter et committer au fur et à mesure**, mais retenir qu'un commit de code n'a aucun effet tant que le service concerné (fonction serveur) n'a pas été explicitement redéployé — publier le code source et mettre à jour le service en production sont deux actions distinctes.
11. **Distinguer "abonner le webhook à un type d'événement" et "souscrire l'application au compte"** : ce sont deux réglages différents chez le fournisseur, et oublier le second donne l'illusion d'une configuration complète alors que rien n'arrive jamais.
12. **Anticiper la vérification d'entreprise** dès que le trafic devient sérieux : l'examen prend du temps et conditionne les plafonds de volume.
13. **Adapter la réponse au profil de l'interlocuteur** : un prospect qui demande si une fonction existe veut une réponse courte orientée bénéfice ; un client existant qui pose la même question veut la marche à suivre. Sans cette distinction explicite dans le prompt, le modèle sert la même réponse aux deux, inadaptée dans un cas sur deux.
14. **Interdire au bot d'affirmer qu'une fonction n'existe pas.** Son ignorance ne prouve pas l'absence : il doit dire qu'il vérifie et transmettre. Un faux "non" fait perdre un client à tort — cas réellement observé avant correction.

---

## Checklist de reproduction condensée

À dérouler dans l'ordre pour un nouveau projet.

**Contenu**
- [ ] Rédiger le system prompt (identité, style, garde-fous, règles d'escalade)
- [ ] Rédiger la base de connaissances, segmentée par audience (prospects / clients)
- [ ] Recenser les fonctionnalités réelles **contre le code**, pas contre la documentation
- [ ] Écrire un script d'assemblage prompt + connaissances
- [ ] Tester une grille de scénarios en conversation, avant tout code

**Infrastructure**
- [ ] Créer les tables (conversations, prospects qualifiés) avec sécurité au niveau ligne
- [ ] Accorder les droits **au rôle d'interface ET au rôle de service**, puis le vérifier
- [ ] Écrire la fonction serveur : vérification de signature, déduplication, appel du modèle, boucle d'outils, envoi de la réponse, persistance
- [ ] Faire relire le code (concurrence, terminaison de boucle, échecs d'envoi silencieux)
- [ ] Construire une interface de supervision (lecture seule suffit)

**Configuration du fournisseur**
- [ ] Compte développeur, application, portefeuille business
- [ ] Déployer la fonction **avant** de configurer le webhook
- [ ] Webhook (URL + jeton de vérification) puis abonnement au champ des messages
- [ ] **Souscrire l'application au compte de messagerie** (étape distincte, souvent oubliée)
- [ ] Créer le compte technique et le **jeton permanent** (droits sur l'application ET sur le compte)
- [ ] Enregistrer et vérifier le numéro de production (basculer sur l'appel vocal si le SMS échoue)
- [ ] Mettre à jour les secrets avec l'identifiant du numéro de production, redéployer

**Validation**
- [ ] Premier échange réel de bout en bout depuis un vrai téléphone
- [ ] Vérifier le rendu (absence de formatage parasite) sur le vrai canal
- [ ] Dérouler la grille de scénarios en conditions réelles
- [ ] Tester les garde-fous d'accès à l'interface de supervision

**Après mise en service**
- [ ] Engager la vérification d'entreprise
- [ ] Surveiller le coût réel du modèle sur les premières semaines
- [ ] Relire les conversations réelles et corriger le prompt en conséquence
