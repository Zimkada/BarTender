// Configuration légale centralisée (CGU/CGV + Politique de confidentialité).
//
// CURRENT_CONSENT_VERSION est la source unique de la version de consentement.
// L'incrémenter lors d'une révision SUBSTANTIELLE des documents légaux (ex: changement
// de responsable de traitement après immatriculation, ajout d'un sous-traitant majeur,
// modification des finalités). Toute valeur supérieure au consent_version stocké pour
// un utilisateur redéclenche le modal de consentement (LegalConsentGate).
//
// ⚠️ Doit rester cohérent avec la migration SQL (colonne users.consent_version).
export const CURRENT_CONSENT_VERSION = 1;

// Slugs des documents légaux, alignés sur les routes /legal/:slug (LegalDocPage).
export const LEGAL_ROUTES = {
  terms: '/legal/cgu',
  privacy: '/legal/confidentialite',
} as const;
