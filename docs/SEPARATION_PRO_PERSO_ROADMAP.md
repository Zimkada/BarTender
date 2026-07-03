# Feuille de route — Séparation pro / perso (dé-risquer le single point of failure)

> **Problème** : au 7 juin 2026, tout BarTender Pro repose sur l'identité personnelle du
> fondateur (téléphone, email Gmail perso, MoMo perso, WhatsApp perso, comptes Vercel/
> Supabase/GitHub perso). C'est un *single point of failure* qui bloque la délégation,
> mélange la comptabilité, et fragilise la continuité + la valeur transférable de l'actif.
>
> **Statut juridique** : en nom propre (pas de société). À noter : la création
> d'identifiants dédiés "BarTender Pro" NE nécessite PAS d'attendre une société.
> Les deux chantiers (identifiants pro / formalisation juridique) avancent en parallèle.

---

## Principe directeur

Rien d'urgent à 2 bars, mais **chaque mois de retard rend la migration plus douloureuse**
(migrer 30 clients d'un numéro WhatsApp à un autre = très pénible). Poser les fondations
**avant** la phase de scaling (mémoire : assistant virtuel à 15 bars actifs).

L'ordre ci-dessous va du **plus bloquant pour déléguer** au **moins urgent**.

---

## PRIORITÉ 1 — Support délégable (WhatsApp + email pro)

**Pourquoi en premier** : l'assistant virtuel prévu à 15 bars ne peut PAS recevoir les
signalements de bugs si c'est ton WhatsApp/Gmail perso. C'est le verrou n°1 de la délégation.

| Action | Détail | Effort | Coût |
|---|---|---|---|
| **WhatsApp Business dédié** | Nouveau numéro (SIM dédiée) + compte WhatsApp Business. Déjà à moitié prévu : MARKETING.md mentionne `+229 01 97 54 83 10` comme « WhatsApp commercial ». Vérifier que ce numéro est BIEN une ligne dédiée, pas ton perso. | Faible | Prix d'une SIM + petit forfait |
| **Email pro** | `contact@bartenderpro-africa.com` (déjà prévu dans MARKETING.md §2.bis, à créer). Via Google Workspace (~6 USD/mois) ou Zoho Mail (gratuit pour 1 domaine). | Faible | 0-6 USD/mois |
| **Email technique séparé** | `tech@` ou `admin@bartenderpro-africa.com` pour les comptes de service (Supabase, Vercel...) — voir Priorité 3. | Faible | inclus |

**Bénéfice** : tu peux confier le WhatsApp Business + `contact@` à l'assistant sans
jamais donner tes accès perso. Réponse auto + horaires Lun-Sam 8h-18h déjà prévus.

---

## PRIORITÉ 2 — Séparer l'argent (MoMo / compte de réception pro)

**Pourquoi crucial** : les paiements d'abonnement (15k × N bars) qui arrivent sur ton
MoMo perso se mélangent à ta vie privée → comptabilité impossible, et risque fiscal
quand le volume grandit.

| Action | Détail | Effort | Coût |
|---|---|---|---|
| **Compte MoMo dédié BarTender** | Idéalement un compte **MoMo Marchand** (Orange Money / MTN MoMo Business) séparé de ton compte perso. Permet aussi des liens de paiement, un historique propre, et plus tard l'encaissement automatisé. | Moyen | Frais marchand selon opérateur |
| **Registre des paiements** | Déjà amorcé côté app : la table `subscription_payments` + RPC `record_subscription_payment` (migration 20260607) trace les paiements manuels. Brancher ce suivi sur le compte dédié. | Fait (app) | 0 |
| **Compte bancaire pro (plus tard)** | Quand le volume le justifie et/ou à la création de la société. | À différer | — |

**Bénéfice** : comptabilité claire, séparation patrimoniale, base saine pour la fiscalité
et une éventuelle levée de fonds.

⚠️ **Note** : le compte MoMo Marchand demande souvent un justificatif d'activité.
C'est un point de convergence avec la formalisation juridique (voir Priorité 5).

---

## PRIORITÉ 3 — Sécuriser les accès techniques (continuité)

**Pourquoi important** : si tu perds l'accès à ton Gmail perso (piratage, oubli, incident),
TOUT tombe (Supabase, Vercel, GitHub, domaine, Sentry). Aucune continuité possible.

| Action | Détail | Effort | Coût |
|---|---|---|---|
| **Compte Google/email de service** | Créer `admin@bartenderpro-africa.com` et l'utiliser comme propriétaire des comptes techniques, au lieu de `zimkada@gmail.com`. | Moyen | inclus Workspace |
| **Migrer les comptes critiques** | Transférer (ou recréer) Supabase, Vercel, GitHub, Sentry, registrar du domaine sous l'email de service. ⚠️ Opérations délicates à faire une par une, hors période de forte activité. | Élevé | 0 |
| **Gestionnaire de mots de passe** | Bitwarden (gratuit) ou autre. Stocker tous les accès dans un coffre, avec un accès de secours. | Faible | 0 |
| **Sauvegarde des accès de secours** | Codes 2FA de récupération, clés API, notés dans un endroit sûr (coffre + copie physique). | Faible | 0 |

**Bénéfice** : continuité garantie. Tu peux tomber malade, partir en voyage, ou donner
un accès temporaire à un prestataire sans risquer ton identité perso.

⚠️ **Rappel CLAUDE.md** : Vercel — l'auteur git doit matcher le owner du projet ;
projets sur compte **personnel** Vercel (Hobby bloque la collaboration Team). À
reconsidérer si passage en compte pro/équipe.

---

## PRIORITÉ 4 — Image & présence pro

**Pourquoi utile** : crédibilité auprès des promoteurs (un SaaS sur Gmail perso fait
amateur) + cohérence de marque.

| Action | Détail | Effort | Coût |
|---|---|---|---|
| **Forwarding domaine → WhatsApp** | `bartenderpro-africa.com` → `https://wa.me/2290197548310` (déjà documenté dans MARKETING.md §10, URL corrigée). | Faible | 0 |
| **Signature email pro** | Logo + coordonnées officielles sur `contact@`. | Faible | 0 |
| **Numéro affiché = numéro pro** | Plaquette, cartes, FB : uniquement le numéro WhatsApp Business, jamais ton perso. | Faible | 0 |

---

## PRIORITÉ 5 — Formalisation juridique (à séquencer)

**Pourquoi pas en premier** : tu peux déjà séparer identifiants/argent sans société.
Mais la société débloque le compte bancaire pro, protège ton patrimoine, et rend
l'actif cessible/finançable.

| Action | Détail | Quand |
|---|---|---|
| **Choisir la forme** | Entreprise individuelle vs SARL (au Bénin). La SARL sépare le patrimoine perso de l'entreprise. | À étudier |
| **Enregistrement** | Via l'APIEx / guichet unique (Bénin). | Quand le CA le justifie ou avant une levée |
| **Bascule des comptes** | Une fois la société créée, transférer progressivement les identifiants pro à son nom. | Après création |

⚠️ **Convergence** : le MoMo Marchand (Priorité 2) et certains comptes pro demandent
souvent un justificatif d'activité → la formalisation peut devenir un pré-requis selon
les exigences des opérateurs. À vérifier localement.

---

## Ordre de bataille recommandé (résumé)

1. **Maintenant (faible effort, fort déblocage)** : WhatsApp Business dédié + email `contact@` → pouvoir déléguer le support.
2. **Court terme** : MoMo dédié (idéalement Marchand) + gestionnaire de mots de passe.
3. **Avant 15 bars** : email de service `admin@` + migration progressive des comptes techniques.
4. **En continu** : image pro (forwarding, signatures, numéro unique).
5. **Quand le CA le justifie** : formalisation juridique (société) → débloque banque pro + protège le patrimoine.

---

## Points de vigilance

- **Ne pas tout faire d'un coup** : chaque migration de compte est délicate. Une par une,
  hors période de forte activité commerciale.
- **Migration WhatsApp = la plus pénible à retarder** : changer de numéro après avoir 30
  clients habitués à un numéro est un cauchemar. Verrouiller LE numéro pro tôt.
- **Tester avant de couper** : pour chaque compte migré, vérifier l'accès au nouveau AVANT
  d'abandonner l'ancien.

---

## Lien avec la stratégie existante

- Assistant virtuel à 15 bars actifs (mémoire `project_scaling_strategy`) → dépend de la Priorité 1.
- Suivi des abonnements (`subscription_payments`, migration 20260607) → s'appuie sur la Priorité 2.
- Coordonnées officielles déjà définies dans `MARKETING.md` §2.bis → cohérence à maintenir.

---

*Document créé le 7 juin 2026. À réviser à mesure que les chantiers avancent.*
