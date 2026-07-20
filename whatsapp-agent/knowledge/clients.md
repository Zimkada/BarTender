# BarTender Pro - Branche CLIENTS (support niveau 1)

Règle absolue : le bot n'a AUCUN accès aux données du bar (ventes, stocks, comptes). Il explique comment faire dans l'application, c'est tout. Toute demande qui nécessite de consulter ou modifier des données réelles : escalader.

## Ventes

- Créer une vente : bouton "Créer vente" sur l'accueil. Sélectionner les produits (recherche par nom possible), ajuster les quantités, choisir le mode de paiement, valider. Environ 30 secondes.
- Vente d'un serveur : elle passe en "attente de validation". Le gérant ou promoteur la valide (ou la rejette) depuis son tableau de bord. Le stock n'est décompté qu'à la validation.
- Vente rejetée : elle passe au statut "rejetée" et reste visible dans l'historique, mais elle est définitive et ne peut pas être modifiée ni resoumise. Si la vente était erronée, le serveur doit simplement en créer une nouvelle, correcte.
- Valider en masse : cocher plusieurs ventes en attente puis "Valider".
- Annuler une vente validée : possible pour le gérant/promoteur, le stock est automatiquement restauré. L'historique garde la trace.
- Promotion : si une promotion est active, elle s'applique automatiquement au bon prix pendant la vente.

## Tickets / tables

- Ouvrir un ticket : depuis l'écran de vente, créer un ticket avec numéro de table ou nom du client. Ajouter les commandes au fur et à mesure, encaisser à la fin (le ticket passe en "payé").

## Stocks et inventaire

- Ajouter un produit : page Inventaire, bouton "Ajouter produit". Choisir depuis le catalogue ou créer un produit personnalisé, définir le prix de vente.
- Enregistrer un approvisionnement : page Inventaire, "Nouveau reçu". Saisir les quantités reçues et le coût d'achat : le stock se met à jour automatiquement et le coût moyen (CUMP) est recalculé.
- Alertes stock bas : définir un seuil minimum par produit, les produits sous le seuil apparaissent en rouge.
- Écart entre stock affiché et stock réel : recommander un inventaire physique, puis un ajustement de stock dans l'application. Si l'écart semble anormal ou récurrent, transmettre à l'équipe.

## Retours et consignations

- Retour produit : page Retours, enregistrer le retour (produit, quantité, motif). Possibilité d'échanger contre un autre produit : la traçabilité est automatique.
- Retour par un serveur : possible uniquement en mode complet, et uniquement sur ses propres ventes. Sa demande passe en attente et doit être validée par le gérant ou le promoteur. En mode simplifié, les serveurs ne font ni ventes ni retours (tout passe par le gérant).
- Consignation : page Consignations pour suivre les bouteilles consignées et leur restitution.

## Analytiques et comptabilité

- Tableau de bord : revenus du jour en temps réel, comparaison avec la veille, ventes en attente, performance de l'équipe.
- Rapports : page Analytiques pour les revenus par période, top produits, performance par serveur. Export Excel et PDF disponibles.
- Z de caisse : rapport de clôture disponible dans la partie Comptabilité (norme SYSCOHADA), avec suivi des dépenses et salaires.
- Chiffres du jour : la journée commerciale suit l'heure de fermeture du bar. Les ventes de 2h du matin comptent dans la journée de la veille : c'est normal et voulu.

## Équipe

- Créer un compte serveur ou gérant : réservé au promoteur, page Équipe, "Ajouter un membre" (nom, email, téléphone, rôle). Le nombre de membres dépend du plan (Starter 3, Pro 8, Max 20, promoteur inclus).
- Limite d'équipe atteinte : proposer le passage au plan supérieur, escalader pour la mise en place.
- Retirer un membre : page Équipe. Ses ventes passées restent dans l'historique.

## Modes de fonctionnement

- Mode complet : chaque serveur a son compte et enregistre ses propres ventes et demandes de retour, validées par le gérant ou le promoteur. Le circuit de validation n'existe qu'en mode complet.
- Mode simplifié : le gérant centralise toutes les ventes sur un seul appareil et les attribue aux serveurs par leur nom. Pas de circuit de validation : les ventes sont directement enregistrées. Recommandé pour les petites équipes ou en cas de connexion instable.
- Changement de mode : dans les Paramètres du bar (promoteur). Le changement est possible à tout moment.

## Hors-ligne

- Recommandation officielle en cas de coupure ou réseau instable : basculer en mode simplifié et centraliser les opérations sur l'appareil du gérant ou du promoteur jusqu'au retour d'une bonne connexion. Tout se synchronise automatiquement ensuite.
- Serveur : a besoin d'une connexion active, car ses ventes doivent être validées par le gérant (mode complet). S'il est bloqué hors-ligne, c'est le comportement normal et voulu : le gérant prend le relais en mode simplifié.
- Après reconnexion : la synchronisation est automatique. Si des ventes semblent manquantes plus de quelques minutes après le retour du réseau, escalader.

## Connexion et compte

- Mot de passe oublié : lien "Mot de passe oublié" sur l'écran de connexion, un email de réinitialisation est envoyé.
- Email non reçu : vérifier les spams. Sinon, escalader.
- L'application ne charge pas / page blanche : fermer et rouvrir l'application, vérifier la connexion. Si le problème persiste, escalader avec la description exacte.

## Abonnement (informations générales seulement)

- Plans et tarifs : Starter 9 000, Pro 15 000, Max 30 000 XOF/mois. Toutes fonctionnalités incluses partout, seule la taille d'équipe change.
- Changement de plan, paiement, renouvellement, suspension : TOUJOURS escalader vers l'éditeur. Le bot ne traite jamais ces sujets lui-même.

## Cas d'escalade systématique (côté clients)

- Bug, erreur affichée, comportement anormal de l'application
- Chiffres qui semblent faux (ventes, stocks, revenus)
- Tout sujet paiement, facturation, suspension, résiliation
- Demande de suppression de compte ou d'export de données
- Compte bloqué ou suspicion d'accès non autorisé
- Toute question dont la réponse n'est pas dans cette base
