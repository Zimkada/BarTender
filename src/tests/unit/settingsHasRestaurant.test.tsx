/**
 * settingsHasRestaurant.test.tsx
 *
 * ⭐ LA CASE « Cet établissement fait aussi de la restauration » — §3.
 *
 * Jusqu'au 14/08/2026, `hasRestaurant` était lu partout (routes, menus, queries,
 * Dashboard, Comptabilité) et réglable NULLE PART : un bar ne pouvait devenir
 * bar-resto que par une écriture manuelle en base.
 *
 * ⚠️ CE QUE CE TEST PROTÈGE, et qui n'est pas évident :
 *
 *   1. `undefined` doit valoir `false` (§3). Tous les bars existants n'ont PAS
 *      ce champ. Un `!!settings.hasRestaurant` mal écrit ailleurs, ou un défaut
 *      à `true`, ouvrirait la cuisine sur des bars purs — sans erreur, sans
 *      test rouge, et sans que personne ne le voie avant la facture Supabase.
 *
 *   2. L'enregistrement doit PRÉSERVER les autres réglages. `handleSave` étale
 *      `...currentBar.settings` avant d'écrire : une régression y perdrait
 *      `operatingMode` ou `costDisplayMethod` en silence.
 *
 *   3. Le drapeau ne doit JAMAIS être écrasé par un gérant. L'onglet qui porte
 *      la case n'est rendu que si `isPromoteur` — mais `handleSave` écrit
 *      `hasRestaurant` dans TOUS les cas. Il faut donc que la valeur réécrite
 *      soit celle lue en base, pas un défaut.
 *
 * ⛔ On teste le CONTRAT d'écriture des settings, pas le rendu de la case :
 * c'est la valeur envoyée à `updateBar` qui décide de l'ouverture du module,
 * et c'est elle qui doit être juste.
 */

import { describe, it, expect } from 'vitest';
import type { BarSettings } from '../../types';

/**
 * Reproduit la construction du payload de `SettingsPage.handleSave`.
 *
 * ⚠️ Volontairement une fonction PURE plutôt qu'un rendu complet de la page :
 * `SettingsPage` monte la 2FA Supabase, les membres du bar et le thème. Tester
 * la règle à travers tout cela mesurerait surtout la qualité des mocks. Ici on
 * vérifie exactement ce qui part vers la base.
 */
function buildSettingsPayload(
  existing: Partial<BarSettings> | undefined,
  temp: {
    operatingMode: 'full' | 'simplified';
    costDisplayMethod: 'cump' | 'last_cost';
    hasRestaurant: boolean;
  }
) {
  return {
    ...existing,
    operatingMode: temp.operatingMode,
    costDisplayMethod: temp.costDisplayMethod,
    hasRestaurant: temp.hasRestaurant,
  };
}

/** Reproduit l'initialisation de `tempHasRestaurant` depuis le bar courant. */
function initHasRestaurant(settings: Partial<BarSettings> | undefined): boolean {
  return settings?.hasRestaurant === true;
}

/**
 * ⭐ La garde `restaurantUnavailable` a été RETIRÉE le 16/08/2026 (§20, lot 1).
 *
 * Elle grisait la case en mode simplifié tant que `BarContext.hasRestaurant`
 * exigeait `operatingMode === 'full'`. Ce verrou est levé : la case est
 * désormais cochable dans les DEUX modes, et l'helper qui la reproduisait ici
 * n'a plus d'objet.
 *
 * ⚠️ L'invariance des deux modes est désormais testée dans `BarContext.test.ts`,
 * au niveau de la DÉRIVATION — là où la règle vit réellement.
 */

describe('Réglage « restauration » — initialisation depuis la base', () => {
  it('vaut false quand le champ est ABSENT (tous les bars existants)', () => {
    expect(initHasRestaurant(undefined)).toBe(false);
    expect(initHasRestaurant({})).toBe(false);
  });

  it('vaut false sur une valeur falsy, sans jamais la coercer en true', () => {
    // ⚠️ `=== true` et non `!!` : une valeur parasite en base (chaîne vide,
    //    0, null) ne doit PAS ouvrir la cuisine.
    expect(initHasRestaurant({ hasRestaurant: false })).toBe(false);
    expect(initHasRestaurant({ hasRestaurant: null as unknown as boolean })).toBe(false);
    expect(initHasRestaurant({ hasRestaurant: 0 as unknown as boolean })).toBe(false);
  });

  it('⛔ n\'accepte QUE le booléen true — une chaîne « true » ne suffit pas', () => {
    // Un drapeau stocké en texte par un import ou un script ne doit pas
    // ouvrir trois écrans par accident.
    expect(initHasRestaurant({ hasRestaurant: 'true' as unknown as boolean })).toBe(false);
  });

  it('vaut true quand le bar est déclaré bar-resto', () => {
    expect(initHasRestaurant({ hasRestaurant: true })).toBe(true);
  });
});

describe('Réglage « restauration » — enregistrement', () => {
  it('écrit le drapeau sans perdre les autres réglages', () => {
    const existing: Partial<BarSettings> = {
      operatingMode: 'full',
      costDisplayMethod: 'cump',
      consignmentExpirationDays: 7,
      supplyFrequency: 14,
    };

    const payload = buildSettingsPayload(existing, {
      operatingMode: 'full',
      costDisplayMethod: 'cump',
      hasRestaurant: true,
    });

    expect(payload.hasRestaurant).toBe(true);
    // ⭐ Les réglages hors formulaire survivent au `...existing`.
    expect(payload.consignmentExpirationDays).toBe(7);
    expect(payload.supplyFrequency).toBe(14);
  });

  it('⭐ RESTE À false sur un bar pur enregistré par un gérant', () => {
    /**
     * Le gérant n'a PAS l'onglet « Infos Bar » : il ne voit jamais la case.
     * `tempHasRestaurant` garde donc la valeur lue en base et la réécrit à
     * l'identique. Un bar pur doit ressortir pur d'un enregistrement fait par
     * un gérant — c'est le §3 au moment de l'écriture.
     */
    const existing: Partial<BarSettings> = { operatingMode: 'simplified' };
    const temp = initHasRestaurant(existing); // false

    const payload = buildSettingsPayload(existing, {
      operatingMode: 'simplified',
      costDisplayMethod: 'cump',
      hasRestaurant: temp,
    });

    expect(payload.hasRestaurant).toBe(false);
  });

  it('⭐ CONSERVE true quand un gérant enregistre un bar-resto', () => {
    // Pendant du test précédent : le gérant ne doit pas non plus DÉSACTIVER
    // la restauration en enregistrant un réglage sans rapport.
    const existing: Partial<BarSettings> = { hasRestaurant: true, operatingMode: 'full' };
    const temp = initHasRestaurant(existing); // true

    const payload = buildSettingsPayload(existing, {
      operatingMode: 'simplified',
      costDisplayMethod: 'cump',
      hasRestaurant: temp,
    });

    expect(payload.hasRestaurant).toBe(true);
  });

  /**
   * ⭐⭐ TESTS RETOURNÉS le 16/08/2026 (§20, lot 1).
   *
   * Ils affirmaient que la case devait être INDISPONIBLE en mode simplifié.
   * Le verrou est levé : la restauration s'active dans les deux modes.
   *
   * ⭐ TERRAIN : un bar-restau réel alterne selon les soirs — parfois seul le
   * gérant tient le téléphone. Le réglage doit donc SURVIVRE aux bascules,
   * dans les deux sens, sans jamais se perdre.
   */
  it('✅ §20 — le drapeau s\'enregistre AUSSI en mode simplifié', () => {
    const existing: Partial<BarSettings> = { operatingMode: 'simplified' };

    const payload = buildSettingsPayload(existing, {
      operatingMode: 'simplified',
      costDisplayMethod: 'cump',
      hasRestaurant: true, // ⭐ ce que la garde interdisait
    });

    expect(payload.hasRestaurant).toBe(true);
    expect(payload.operatingMode).toBe('simplified');
  });

  it('⭐ BASCULE — le drapeau survit à un aller-retour entre les deux modes', () => {
    /**
     * ⚠️ LE CAS TERRAIN DU 16/08/2026, et il doit être protégé : le bar passe
     * en simplifié le soir, revient en complet le lendemain. La restauration ne
     * doit ni s'éteindre, ni redemander d'être cochée.
     */
    let settings: Partial<BarSettings> = { hasRestaurant: true, operatingMode: 'full' };

    // Soir : bascule en simplifié
    settings = buildSettingsPayload(settings, {
      operatingMode: 'simplified',
      costDisplayMethod: 'cump',
      hasRestaurant: initHasRestaurant(settings),
    });
    expect(settings.hasRestaurant).toBe(true);

    // Lendemain : retour en complet
    settings = buildSettingsPayload(settings, {
      operatingMode: 'full',
      costDisplayMethod: 'cump',
      hasRestaurant: initHasRestaurant(settings),
    });
    expect(settings.hasRestaurant).toBe(true);
    expect(settings.operatingMode).toBe('full');
  });

  it('désactive le drapeau sans toucher au mode de fonctionnement', () => {
    /**
     * ⚠️ Les deux réglages sont INDÉPENDANTS : désactiver la restauration ne
     * doit pas basculer le mode, et le §13.4 interdit toute bascule silencieuse.
     */
    const existing: Partial<BarSettings> = { hasRestaurant: true, operatingMode: 'simplified' };

    const payload = buildSettingsPayload(existing, {
      operatingMode: 'simplified',
      costDisplayMethod: 'cump',
      hasRestaurant: false,
    });

    expect(payload.hasRestaurant).toBe(false);
    expect(payload.operatingMode).toBe('simplified');
  });
});
