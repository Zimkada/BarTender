---
description: Plan d'Intégration Comptable SYSCOHADA pour BarTender (Phase 1 à 3)
---

# Analyse Chef de Projet : Intégration SYSCOHADA et Préparation Restauration

## 1. État des Lieux de l'Application Actuelle ("Le As-Is")

L'application BarTender trace déjà avec une grande précision les flux financiers et opérationnels :

**A. Les Entrées (Produits - Classe 7 & Trésorerie - Classe 5)**
*   **Ventes validées** : Parfaitement tracées avec le montant, la méthode de paiement (Espèces, Mobile Money, Carte, Crédit).
*   **Apports (Capital Contributions)** : Gérés (Propriétaires, Associés, Investisseurs, Prêts).
*   **Carences actuelles** : Les ventes annulées ou retournées nécessitent une attention particulière pour ne pas "polluer" le journal général par des contre-passations inutiles (idéalement, on n'exporte que le net validé par jour).

**B. Les Sorties (Charges - Classe 6 & Décaissements - Classe 5)**
*   **Approvisionnements (Supplies)** : Actuellement, le système trace l'entrée en stock physique. Il faut s'assurer que l'acte d'achat génère bien une écriture de charge (`6011` Achats de marchandises).
*   **Dépenses (Expenses)** : Les catégories pré-enregistrées couvrent bien la base (Loyer, Électricité). La possibilité de créer des catégories personnalisées est un très bon point.
*   **Salaires** : Tracés individuellement.

**C. L'Organisation des Données**
*   L'identifiant unique métier (`businessDate`) est en place, ce qui est crucial pour ventiler comptablement les opérations d'une "nuit" de bar (qui chevauche deux jours calendaires) sur la bonne "journée fiscale".

## 2. Le Futur de l'Application ("Le To-Be" : Restauration)

L'ajout de la restauration change la donne comptablement selon le SYSCOHADA :
*   **Un Bar vend des marchandises "en l'état"** : Il achète une bière et la revend. Compte de charge : `601` (Achat de marchandises). Compte de produit : `701` (Vente de marchandises).
*   **Un Restaurant "produit"** : Il achète des denrées (Tomates, Poulet) et les transforme pour vendre un plat. Compte de charge : `602` (Achat de matières premières). Compte de produit : `702` (Ventes de produits finis) ou `706` (Services).

## 3. Plan d'Implémentation Technique (La "Traduction SYSCOHADA")

Voici comment le code de BarTender devra structurer l'export Excel sous forme de Livre Journal à 6 colonnes classiques : `[Date] [Pièce] [Compte] [Libellé] [Débit] [Crédit]`.

### Modèle de Modélisation des Opérations (Double Écriture Automatique)

#### A. Le Z de Caisse Quotidien (Le condensé des ventes)
Pour éviter de générer des milliers de lignes par semaine, exportons **une centralisation par jour et par mode de paiement**.

*Imaginons une journée avec 100 000 FCFA de ventes (60k espèces, 40k Mobile Money).*
*   **Ligne 1 : Débit `5711` (Caisse Espèces)** | 60 000 | Pièce : `Z-260220`
*   **Ligne 2 : Débit `5212` (Mobile Money)** | 40 000 | Pièce : `Z-260220`
*   **Ligne 3 : Crédit `7011` (Ventes de Boissons)** | 100 000 | Pièce : `Z-260220`

#### B. Les Dépenses Personnalisables
Puisque le gérant peut créer ses propres postes de dépenses (Ex: Achat de Glace, Cachet DJ), il faut un pont.

*   Dépenses pré-configurées :
    *   Approvisionnements Boissons -> Débit `6011` / Crédit `5711`
    *   Eau & Electricité -> Débit `6051` / Crédit `5711`
    *   Salaires -> Débit `661` / Crédit `5711` ou `5211`
*   Dépenses Personnalisées ("Autres") :
    *   Créer une interface simple dans les **Paramètres du Bar** : "Associer une catégorie personnalisée à un code comptable". Si non défini, on utilisera un compte générique comme `628` (Frais divers) par défaut pour éviter le blocage de l'export.

#### C. Préparation pour la Restauration
*   Avoir dès maintenant un compte `7011` (Ventes Boissons).
*   Lors du lancement de la restauration, on ajoutera `7021` (Ventes Repas).
*   L'export Z de Caisse (A) pourra alors séparer automatiquement : 60k Ventes de Boissons (`7011`) et 40k Ventes de Repas (`7021`).

## 4. Recommandations Fonctionnelles

Pour que ce module soit un succès (sans devenir une "usine à gaz" pour vos clients) :

1.  **L'En-tête Formel de l'Export** : L'Excel généré doit absolument comporter un en-tête professionnel pour être valide "légalement" et présentable. Il inclura :
    *   **Logo du Bar** (si configuré dans les paramètres)
    *   **Nom Commercial / Raison Sociale**
    *   **Numéro RCCM et NINEA / IFU** (Identifiant Fiscal)
    *   **Période d'export** (ex: Du 01/02/2026 au 28/02/2026)

1.  **Le Mapping Invisible** : L'interface utilisateur ne doit pas parler le "SYSCOHADA". Le gérant continue de cliquer sur "Payer un Salaire" ou "Ajouter une Vente". C'est **le système de génération de l'export** qui se charge de traduire ces clics en codes à 4 ou 6 chiffres.
2.  **Configuration par Défaut Standardisée** : Offrir un plan de comptes SYSCOHADA complet dès la création du bar. Seuls 5% des gérants modifieront les codes.
3.  **Gestion de la TVA au choix** : Dans les paramètres, prévoir un toggle "Bar assujetti à la TVA". Si "Oui", l'export coupera le CA en deux lignes (HT sur la classe 7, TVA sur la classe `443`). Si "Non", 100% va en classe 7.

## 5. Conclusion
Le système actuel (avec sa table `accounting_transactions` et ses identifiants `businessDate`) est déjà **extrêmement sain et mature** pour supporter cet export. L'architecture ne nécessite pas de refonte de la base, mais "simplement" la création d'une nouvelle "Vue" ou d'une "Mappage au Runtime" qui lit vos données et recrache la norme SYSCOHADA (Débit=Crédit).

---

## 6. Stratégie d'Implémentation Technique (Clean Architecture & DRY)

Afin de garantir une intégration parfaite dans l'écosystème **BarTender** actuel (sans dette technique et sans réinventer la roue), le développement respectera strictement les paradigmes suivants :

### A. Librairies et Écosystème
*   **Génération Excel** : Utilisation de la librairie existante `xlsx` (SheetJS) ou `exceljs` si déjà présente dans le package.json de BarTender, pour générer le `.xlsx` directement côté client, sans surcharger le serveur Supabase.
*   **Icônes** : Utilisation exclusive de `lucide-react` (ex: `Download`, `FileSpreadsheet`) pour rester cohérent avec l'UI actuelle.

### B. Typage Strict (TypeScript) et Zéro `any`
*   Création d'interfaces strictes dans `src/types/index.ts` :
    *   `SyscohadaAccount` (id, code, nom, type)
    *   `AccountingExportConfig` (tva_active, tax_rate, map_custom_expenses)
*   Aucun cast frauduleux en `as any`. Toutes les conversions de données (`transactions` -> `entries`) seront couvertes par des utilitaires typés.

### C. Design System et Thème Dynamique
*   Tous les nouveaux boutons (ex: "Exporter vers Excel" ou "Plan de Comptes") utiliseront les classes du Design System existant (ex: `.glass-action-button-2026`, `.btn-brand-primary`).
*   L'intégration de l'interface de configuration comptable se fera via un **composant modulaire**, testable et visible dans le **Storybook** du projet, utilisant le `useTheme()` pour respecter le Branding du Bar (couleurs primaires/accentuées).

### D. Architecture Logicielle (MVC / Services)
*   **Séparation des préoccupations** : La logique de "traduction" (Transformer *1 Vente* en *2 Lignes Comptables*) ne sera **PAS** dans les composants React.
*   Création d'un service dédié `src/services/syscohada.service.ts` (ou un hook `useSyscohadaExport`) qui prendra en entrée les `accounting_transactions` brutes et recrachera un tableau prêt à être injecté dans Excel. Cela garantit une logique testable en isolation.
*   **Mémoire & Documentation** : Les décisions d'architecture (ex: le choix de la méthode de génération Excel) seront documentées dans le fichier `Memoire.md` pour tracer l'évolution du projet.
