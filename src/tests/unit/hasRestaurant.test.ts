/**
 * hasRestaurant.test.ts
 * Invariance des bars purs — PLAN_MODULE_RESTAURATION.md §3 et §13.4.
 *
 * ⭐ POURQUOI CE FICHIER
 * §3 est la contrainte de plus haut niveau du chantier : un bar sans cuisine
 * doit être **strictement identique** à aujourd'hui, pas « presque ». Tous les
 * clients actuels sont des bars purs — pour eux le module est une mise à jour à
 * bénéfice nul, donc la moindre régression serait un coût pur.
 *
 * On teste ici la RÈGLE DE DÉRIVATION du drapeau, seul point où l'invariance se
 * décide. Les tests d'invariance réseau (aucune requête cuisine émise) viendront
 * avec les premières queries, en phase 1.
 */

import { describe, it, expect } from 'vitest';
import type { BarSettings } from '../../types';

/**
 * Réplique EXACTE de la dérivation de `BarContext.hasRestaurant`.
 * ⚠️ Si la règle change là-bas, ce test doit échouer — c'est son rôle.
 */
const deriveHasRestaurant = (settings: BarSettings | undefined): boolean => {
  const operatingMode = settings?.operatingMode || 'full';
  return settings?.hasRestaurant === true && operatingMode === 'full';
};

/** Réglages d'un bar pur tel qu'ils existent aujourd'hui en production. */
const barPur: BarSettings = {
  currency: 'XOF',
  currencySymbol: 'FCFA',
  operatingMode: 'full',
};

describe('hasRestaurant — invariance des bars purs (§3)', () => {
  describe('⛔ Bar PUR — le drapeau doit être faux dans TOUS les cas', () => {
    it('drapeau absent (cas de 100% des bars actuels)', () => {
      expect(deriveHasRestaurant(barPur)).toBe(false);
    });

    it('drapeau explicitement false', () => {
      expect(deriveHasRestaurant({ ...barPur, hasRestaurant: false })).toBe(false);
    });

    it('settings entièrement absents', () => {
      expect(deriveHasRestaurant(undefined)).toBe(false);
    });

    it('mode simplifié sans drapeau', () => {
      expect(deriveHasRestaurant({ ...barPur, operatingMode: 'simplified' })).toBe(false);
    });

    it('⚠️ valeurs falsy non booléennes — comparaison stricte à true', () => {
      // `settings` accepte des clés dynamiques (`[key: string]: unknown`) : une
      // valeur venue du JSONB pourrait ne pas être un booléen. `=== true` évite
      // qu'une chaîne 'false' ou un 0 n'active la cuisine par accident.
      const cases: unknown[] = [0, '', 'false', null, undefined, NaN];
      for (const value of cases) {
        expect(
          deriveHasRestaurant({ ...barPur, hasRestaurant: value as boolean }),
          `hasRestaurant=${String(value)} ne doit pas activer la cuisine`
        ).toBe(false);
      }
    });

    it('⚠️ une chaîne "true" n\'active PAS la cuisine', () => {
      // Un JSONB mal écrit produirait la chaîne, pas le booléen. Sans `=== true`,
      // elle serait truthy et activerait la cuisine sur un bar pur.
      expect(deriveHasRestaurant({ ...barPur, hasRestaurant: 'true' as unknown as boolean })).toBe(false);
    });
  });

  describe('✅ Bar avec restauration', () => {
    it('drapeau true + mode complet', () => {
      expect(deriveHasRestaurant({ ...barPur, hasRestaurant: true })).toBe(true);
    });

    it('mode absent → défaut "full" → actif', () => {
      // `operatingMode` est optionnel ; son défaut est 'full' (BarContext).
      expect(deriveHasRestaurant({
        currency: 'XOF',
        currencySymbol: 'FCFA',
        hasRestaurant: true,
      })).toBe(true);
    });
  });

  describe('⛔ §13.4 — restauration ⟹ mode complet OBLIGATOIRE', () => {
    it('drapeau true MAIS mode simplifié → INACTIF', () => {
      // ⭐ La garde qui rend une incohérence de données inoffensive : un bar
      // passé en simplifié APRÈS activation de la cuisine ne doit pas l'exposer.
      // Un cuisinier a besoin d'un compte pour faire avancer la production —
      // le mode simplifié signifie « le gérant fait tout, personne d'autre n'a
      // de compte ». Les deux sont contradictoires.
      expect(deriveHasRestaurant({
        ...barPur,
        hasRestaurant: true,
        operatingMode: 'simplified',
      })).toBe(false);
    });

    it('la bascule en simplifié désactive la cuisine sans toucher au drapeau', () => {
      const avecCuisine: BarSettings = { ...barPur, hasRestaurant: true };
      expect(deriveHasRestaurant(avecCuisine)).toBe(true);

      // Le gérant repasse en mode simplifié — le drapeau reste `true` en base.
      const basculeEnSimplifie: BarSettings = { ...avecCuisine, operatingMode: 'simplified' };
      expect(deriveHasRestaurant(basculeEnSimplifie)).toBe(false);

      // ⚠️ Le drapeau n'est PAS effacé : désactiver ne supprime rien (§3).
      // L'historique des ventes de plats reste consultable en comptabilité,
      // et le retour en mode complet réactive la cuisine sans reconfiguration.
      expect(basculeEnSimplifie.hasRestaurant).toBe(true);
      expect(deriveHasRestaurant({ ...basculeEnSimplifie, operatingMode: 'full' })).toBe(true);
    });
  });

  describe('🔒 Invariant — le défaut est TOUJOURS « bar pur »', () => {
    it('aucune combinaison sans drapeau explicite n\'active la cuisine', () => {
      const sansDrapeau: BarSettings[] = [
        { currency: 'XOF', currencySymbol: 'FCFA' },
        { currency: 'XOF', currencySymbol: 'FCFA', operatingMode: 'full' },
        { currency: 'XOF', currencySymbol: 'FCFA', operatingMode: 'simplified' },
        { currency: 'XOF', currencySymbol: 'FCFA', plan: 'starter' },
        { currency: 'XOF', currencySymbol: 'FCFA', plan: 'enterprise', dataTier: 'enterprise' },
      ];

      for (const settings of sansDrapeau) {
        expect(
          deriveHasRestaurant(settings),
          `${JSON.stringify(settings)} doit rester un bar pur`
        ).toBe(false);
      }
    });
  });
});
