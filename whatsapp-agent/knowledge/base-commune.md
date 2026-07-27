# BarTender Pro - Base de connaissances commune

## Identité du produit

BarTender Pro est une application web (PWA, fonctionne sur téléphone, tablette et ordinateur, sans installation depuis un store) de gestion complète pour les bars : ventes, stocks, comptabilité (norme SYSCOHADA) et équipe. Conçue pour l'Afrique de l'Ouest, en franc CFA (XOF), et pensée pour rester utilisable même quand la connexion internet est instable.

Cible : bars et maquis à activité soutenue (grosso modo l'équivalent de 80 à 300 ventes par jour), avec une équipe de 2 à 20 personnes. Ce repère de volume est un ordre de grandeur interne : ne jamais le formuler en "tickets par jour" au promoteur, qui ne compte pas son activité ainsi.

## Éditeur et contact

- Éditeur : Chabi Zimé GOUNOU N'GOBI (entreprise en cours d'immatriculation)
- Email : zimkada@gmail.com
- Contact direct de l'éditeur (téléphone / WhatsApp humain) : +229 01 55 28 25 25
- Site / Application : https://www.bartenderpro-africa.com

Note interne (jamais réciter tel quel) : le numéro +229 01 29 88 21 21 est celui de CET assistant WhatsApp (toi). Ne le donne jamais comme "contact" : l'utilisateur t'écrit déjà dessus. Quand quelqu'un veut parler à un humain, être rappelé, ou pour tout sujet paiement/facturation, oriente vers le contact direct de l'éditeur : +229 01 55 28 25 25 (ou dis "je transmets à notre équipe qui vous rappellera"). Ne donne JAMAIS de numéro Mobile Money : les coordonnées de paiement sont communiquées en privé par l'éditeur au moment de payer.

## Plans et tarifs (non négociables)

Trois plans, différenciés UNIQUEMENT par la taille d'équipe autorisée (promoteur inclus dans le décompte). Toutes les fonctionnalités sont incluses dans tous les plans.

| Plan | Équipe max | Prix |
|---|---|---|
| Starter | 4 personnes | 9 000 XOF / mois |
| Pro | 8 personnes | 15 000 XOF / mois |
| Max | 20 personnes | 30 000 XOF / mois |

- Essai gratuit : 30 jours, sans engagement, aucun paiement requis pendant l'essai.
- Sans engagement de durée : résiliation possible à tout moment, sans pénalité ni frais de sortie.
- Paiement par Mobile Money (modalités convenues directement avec l'éditeur). La facturation n'est pas automatisée.
- Changement de plan possible à tout moment (upgrade ou downgrade selon la taille de l'équipe).

## Création de compte

Les comptes ne sont PAS en libre-service. Le premier compte d'un bar (le promoteur) est créé par l'éditeur, qui configure le bar et l'abonnement. C'est un gage de qualité et de sécurité : chaque bar est configuré correctement dès le départ, avec un accompagnement personnalisé. Le promoteur crée ensuite lui-même les comptes de son équipe (gérants, serveurs) directement dans l'application.

## Les 3 rôles

- Promoteur : le propriétaire du bar (mot local : "promoteur"). Accès total : ventes, stocks, comptabilité, analytiques, équipe, paramètres. Peut gérer plusieurs bars avec un seul compte.
- Gérant : gère le quotidien : ventes, validation des ventes des serveurs, stocks, approvisionnements, analytiques, dépenses.
- Serveur : enregistre ses ventes et retours. Ses ventes sont validées par le gérant ou le promoteur.

## Fonctionnalités principales

- Ventes rapides : enregistrer une vente prend environ 30 secondes. Raccourcis, recherche produit, panier multi-produits.
- Deux modes de fonctionnement, au choix du bar et modifiables à tout moment :
  - Mode complet : chaque serveur a son compte et enregistre ses propres ventes et demandes de retour, qui passent en attente et sont validées (ou rejetées) par le gérant ou le promoteur. Le stock n'est décompté qu'à la validation. Fini les ventes fantômes. Le circuit de validation n'existe qu'en mode complet.
  - Mode simplifié : le gérant centralise toutes les opérations sur un seul appareil et attribue les ventes aux serveurs par leur nom. Pas de circuit de validation : les ventes du gérant sont directement enregistrées. Les serveurs n'utilisent pas l'application dans ce mode.
- Stocks : catalogue produits, approvisionnements, suivi des niveaux en temps réel, alertes stock bas, valorisation au coût moyen pondéré (CUMP), historique complet des mouvements.
- Comptabilité SYSCOHADA : suivi des dépenses, salaires, rapport de clôture de caisse (Z de caisse), conforme à la norme comptable d'Afrique de l'Ouest.
- Journée commerciale intelligente : les ventes de 2h du matin comptent dans la journée de la veille, selon l'heure de fermeture du bar. Les chiffres du jour sont donc justes, même pour les bars qui ferment tard.
- Analytiques : revenus par jour/semaine/mois, top produits, performance individuelle de chaque serveur, comparaisons de périodes, exports Excel et PDF.
- Promotions : remises, prix spéciaux, offres groupées, appliquées automatiquement à la vente.
- Retours et consignations : gestion des retours de bouteilles, échanges de produits, consignations, avec traçabilité complète. En mode complet, un serveur peut faire une demande de retour uniquement sur ses propres ventes, validée ensuite par le gérant.
- Tickets / tables : ouvrir un ticket par table ou par client, y ajouter des ventes, encaisser à la fin.
- Multi-bar : un promoteur gère plusieurs bars avec un seul compte et bascule de l'un à l'autre.
- Équipe : création des comptes gérants et serveurs par le promoteur, permissions par rôle.

## Mode hors-ligne (formulation exacte, à ne jamais survendre)

L'application continue de fonctionner en cas de coupure internet, avec synchronisation automatique au retour du réseau. Précisément :

- La recommandation officielle en cas de coupure ou de réseau instable : basculer le bar en mode simplifié et centraliser les opérations sur un seul appareil (celui du gérant ou du promoteur) jusqu'au retour d'une bonne connexion. Dans cette configuration, les ventes et tickets s'enregistrent sans connexion et tout se synchronise automatiquement au retour du réseau.
- Les comptes serveurs ont besoin d'une connexion active : en mode complet, leurs ventes doivent être validées par le gérant, ce qui exige le réseau. C'est un choix volontaire pour garantir l'intégrité des ventes.

Ne JAMAIS dire "tout fonctionne à 100% hors-ligne pour tout le monde". La bonne formulation : "en cas de coupure, le bar passe en mode simplifié et continue à vendre sur l'appareil du gérant, tout se synchronise au retour du réseau".

## Propriété des données et sécurité

- Les données du bar (ventes, stocks, comptabilité) restent la propriété exclusive du client. L'éditeur est un simple hébergeur technique.
- Chaque bar est strictement isolé : aucun bar ne peut voir les données d'un autre.
- Les accès sont contrôlés par rôle : un serveur ne voit pas la comptabilité, par exemple.
- En cas de résiliation, les données restent conservées un temps raisonnable avant suppression, et le client peut demander un export.

## Support

Support direct par WhatsApp et téléphone auprès de l'éditeur (+229 01 55 28 25 25), en plus de cet assistant. Accompagnement à la mise en place inclus (création du compte, configuration du bar, formation de l'équipe).
