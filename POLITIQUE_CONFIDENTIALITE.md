# Politique de confidentialité - BarTender

**Dernière mise à jour : 11 juillet 2026**

## 1. Qui est responsable de vos données ?

BarTender ("l'Application") est édité et exploité à titre individuel par **Chabi Zimé GOUNOU N'GOBI**, ci-après désigné "le Responsable de traitement", en attendant l'immatriculation d'une société dédiée. Dès l'immatriculation d'une entité juridique, la présente politique sera mise à jour pour refléter la raison sociale de l'entreprise en lieu et place de la personne physique.

**Contact pour toute question relative à vos données personnelles :**
- Email : zimkada@gmail.com
- Aïcha, assistante WhatsApp (renseignements & support) : +229 01 29 88 21 21
- Contact direct de l'Éditeur (téléphone / WhatsApp) : +229 01 55 28 25 25

## 2. Quelles données collectons-nous ?

BarTender est une application de gestion de point de vente (POS) destinée aux bars. Selon votre rôle, les données suivantes sont collectées :

### 2.1 Comptes utilisateurs (promoteurs, gérants, serveurs)

Lors de la création de votre compte, nous collectons :
- Nom complet
- Adresse email (identifiant de connexion)
- Numéro de téléphone
- Photo de profil (facultatif)
- Rôle dans l'application (promoteur, gérant, serveur)
- Nom d'affichage utilisé en caisse ("nom de serveur virtuel")

Nous conservons également des métadonnées techniques liées à votre compte : date de première connexion, date de dernière connexion, statut du compte (actif/inactif), progression dans le parcours de prise en main de l'application.

### 2.2 Données de paie (gérants et promoteurs uniquement)

Pour les bars utilisant le module de comptabilité, le montant du salaire versé à chaque employé par période mensuelle est enregistré, associé au compte de l'employé concerné. Cette information sert exclusivement à la comptabilité interne du bar et n'est jamais utilisée à d'autres fins.

### 2.3 Journal d'activité (audit)

Pour la sécurité et la traçabilité des opérations sensibles (ventes, modifications de stock, actions administratives), nous conservons un journal contenant : votre identifiant, votre nom, votre rôle, la nature de l'action effectuée, ainsi que **votre adresse IP** et les informations techniques de votre navigateur/appareil au moment de l'action. Ce journal est utilisé uniquement à des fins de sécurité, de résolution d'incidents et de conformité, et n'est pas accessible aux autres utilisateurs du bar.

### 2.4 Données des clients des bars

**Bons de commande (tickets de table)** : lors de l'ouverture d'un bon de commande, le personnel du bar peut associer un nom libre au ticket (par exemple un prénom ou un numéro de table) pour faciliter le service. Ce nom est **facultatif**, sert uniquement à distinguer les bons en cours de service, et n'est pas destiné à identifier réellement le client.

**Consignations** (retrait différé de produit) : lors de la création d'une consignation, le personnel du bar saisit le **nom du client (obligatoire)** et peut, **de façon facultative**, ajouter son **numéro de téléphone**, afin de permettre de le contacter et de retrouver sa consignation lors du retrait. Ces informations sont rattachées à la consignation concernée.

Dans les deux cas, BarTender ne constitue pas de profil client centralisé ni d'historique d'achats nominatif à travers plusieurs opérations : ces informations restent rattachées à l'opération individuelle (bon ou consignation) pour laquelle elles ont été saisies.

### 2.5 Identifiant d'appareil

Chaque appareil (tablette, téléphone, ordinateur) utilisé pour se connecter à BarTender se voit attribuer un identifiant technique unique, stocké localement sur l'appareil. Cet identifiant permet de distinguer les différents terminaux utilisés au sein d'un même bar (par exemple pour le support technique ou le suivi de l'activité des postes de caisse) et n'est pas utilisé à des fins de suivi publicitaire.

### 2.6 Données stockées sur votre appareil

BarTender fonctionne en mode "hors-ligne d'abord" : certaines données sont temporairement stockées localement sur votre appareil (navigateur) pour permettre l'utilisation de l'application sans connexion internet, notamment :
- Une copie de votre session (nom, email, rôle)
- Les ventes, tickets, retours et autres opérations en attente de synchronisation
- Vos préférences d'affichage (thème, mode d'affichage)

Ces données sont automatiquement synchronisées avec nos serveurs dès le retour de la connexion internet, puis conservées selon les mêmes règles que les données équivalentes stockées en base de données.

## 3. Pourquoi collectons-nous ces données ?

Nous traitons vos données personnelles pour les finalités suivantes :
- **Fourniture du service** : création et gestion de votre compte, fonctionnement du point de vente, gestion des stocks et de la comptabilité
- **Sécurité** : prévention des accès non autorisés, traçabilité des actions sensibles, détection d'anomalies
- **Support technique** : identification des appareils en cas d'incident, assistance client
- **Amélioration du service** : correction des erreurs techniques (voir section 5 sur le sous-traitant de supervision d'erreurs)
- **Obligations comptables** : conservation des données de vente et de paie conformément aux règles comptables SYSCOHADA applicables aux bars utilisateurs

Nous ne traitons **aucune donnée à des fins publicitaires ou de profilage marketing**, et ne revendons aucune donnée à des tiers.

## 4. Base légale du traitement

Le traitement de vos données repose sur :
- **L'exécution du contrat** vous liant à BarTender ou au bar qui vous emploie (accès au service, gestion de votre compte)
- **L'intérêt légitime du bar** à assurer le service demandé par son client (identification d'un bon de commande, suivi d'une consignation et de son retrait)
- **Notre intérêt légitime** à assurer la sécurité et la traçabilité des opérations (journal d'audit)
- **Le respect d'obligations légales**, notamment comptables (SYSCOHADA) et fiscales

Les données concernant les clients finaux des bars (section 2.4) ne sont jamais fournies par le client directement à BarTender : elles sont saisies par le personnel du bar, dans le cadre de l'exécution du service demandé par ce client (ouverture d'un bon de commande, dépôt d'une consignation). Il appartient à chaque bar, en tant que responsable de la relation avec son propre client, d'informer celui-ci de cette collecte si les circonstances s'y prêtent.

## 5. Avec qui partageons-nous vos données ?

Nous faisons appel aux sous-traitants suivants, chacun agissant selon nos instructions et dans la limite strictement nécessaire à la fourniture du service :

| Sous-traitant | Rôle | Données concernées |
|---|---|---|
| **Supabase** | Hébergement de la base de données, authentification, stockage de fichiers | Ensemble des données décrites en section 2 |
| **Sentry** | Supervision et diagnostic des erreurs techniques de l'application | Identifiant de compte et adresse email (aucune donnée de vente, montant ou information client n'est transmise ; l'enregistrement de session est désactivé) |
| **Resend** | Envoi d'alertes techniques internes à l'équipe d'administration | Adresse email de l'administrateur technique uniquement - aucune donnée d'utilisateur final |
| **Vercel** | Hébergement de l'application web | Journaux techniques d'accès standards (adresse IP, requêtes HTTP) |
| **FedaPay** | Traitement des paiements d'abonnement en ligne | Données de paiement nécessaires à la transaction (identité du payeur, montant, moyen de paiement) lorsque le Bar choisit de régler son abonnement en ligne |

Vos données ne sont jamais vendues, louées ou partagées à des fins commerciales avec des tiers autres que ceux listés ci-dessus.

## 6. Transfert de données hors du Bénin

Vos données sont hébergées au sein de l'Union européenne : notre base de données principale (Supabase) est localisée en **Suède (région Stockholm, UE)**. L'Union européenne dispose d'un cadre de protection des données (RGPD) offrant un niveau de garantie élevé, reconnu comme équivalent ou supérieur aux standards internationaux en la matière.

D'autres sous-traitants ponctuels (notamment Sentry, pour la supervision technique) peuvent être hébergés dans d'autres régions selon leur propre infrastructure. Nous veillons à ce que l'ensemble de nos prestataires offrent des garanties appropriées de sécurité et de confidentialité. Pour toute précision sur le pays d'hébergement d'un sous-traitant donné, vous pouvez nous contacter aux coordonnées indiquées en section 1.

## 7. Durée de conservation

- **Données de compte** : conservées pendant toute la durée d'utilisation active du service, puis archivées ou supprimées dans un délai raisonnable après la fermeture du compte ou du bar concerné
- **Données de vente, tickets et consignations** : conservées conformément aux obligations comptables SYSCOHADA (délai de conservation légal des pièces comptables)
- **Journal d'audit** : conservé pour une durée limitée à des fins de sécurité, puis purgé ou anonymisé
- **Données stockées localement sur votre appareil** : supprimées automatiquement après synchronisation réussie, ou lors de la déconnexion de votre compte

## 8. Vos droits

Conformément à la loi béninoise n°2017-20 du 20 avril 2018 portant Code du numérique, vous disposez des droits suivants sur vos données personnelles :
- **Droit d'accès** : obtenir communication des données que nous détenons à votre sujet
- **Droit de rectification** : faire corriger des données inexactes ou incomplètes
- **Droit d'opposition** : vous opposer, pour motif légitime, à un traitement de vos données
- **Droit à la limitation** : demander la limitation du traitement dans certains cas
- **Droit à l'effacement** : demander la suppression de vos données, dans la mesure où cela ne contrevient pas à nos obligations légales de conservation (notamment comptables)

Pour exercer l'un de ces droits, contactez-nous aux coordonnées indiquées en section 1. Nous répondrons à votre demande dans un délai raisonnable et pourrons vous demander de justifier de votre identité avant d'y donner suite.

Vous disposez également du droit d'introduire une réclamation auprès de l'**Autorité de Protection des Données Personnelles (APDP)** du Bénin si vous estimez que vos droits ne sont pas respectés.

## 9. Sécurité des données

Nous mettons en œuvre des mesures techniques et organisationnelles pour protéger vos données, notamment :
- Chiffrement des communications entre l'application et nos serveurs
- Cloisonnement strict des données entre les différents bars utilisateurs (isolation multi-établissements) : chaque bar n'a accès qu'à ses propres données
- Contrôle d'accès basé sur les rôles (un serveur n'a pas accès aux données réservées aux gérants ou promoteurs)
- Journalisation des actions sensibles à des fins de traçabilité et de sécurité

## 10. Usage par des mineurs

BarTender est un outil professionnel destiné à la gestion de points de vente et réservé aux personnes majeures exerçant une activité au sein d'un bar (promoteurs, gérants, serveurs). Les comptes utilisateurs sont créés par le promoteur ou le gérant d'un établissement pour ses employés, dans un cadre professionnel, et non via une inscription publique ouverte. Si vous constatez qu'un compte a été créé pour une personne mineure, contactez-nous immédiatement aux coordonnées indiquées en section 1 afin que nous procédions à sa suppression.

## 11. Modifications de cette politique

Cette politique de confidentialité peut être mise à jour pour refléter des évolutions de l'application, de nos sous-traitants, ou de la réglementation applicable. La date de dernière mise à jour figure en haut de ce document. En cas de modification substantielle, nous vous en informerons par un moyen approprié (notification dans l'application ou par email).

## 12. Contact

Pour toute question concernant cette politique de confidentialité ou le traitement de vos données personnelles :

**Chabi Zimé GOUNOU N'GOBI**
Email : zimkada@gmail.com
Aïcha, assistante WhatsApp (renseignements & support) : +229 01 29 88 21 21
Contact direct de l'Éditeur (téléphone / WhatsApp) : +229 01 55 28 25 25
