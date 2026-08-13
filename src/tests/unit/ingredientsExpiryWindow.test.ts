/**
 * ingredientsExpiryWindow.test.ts
 *
 * ⭐ La fenêtre de péremption doit être calculée en heure LOCALE, jamais en UTC.
 *
 * `toISOString().split('T')[0]` convertit en UTC. Au Bénin (UTC+1), un appel à
 * 00h30 locale produit la date de la VEILLE : la fenêtre est décalée d'un jour
 * et un lot périmant le jour même n'est pas signalé — donc perdu.
 *
 * Le bug ne se manifesterait que la nuit, sur un fuseau positif, et sans aucune
 * erreur : juste une alerte qui ne s'affiche pas. D'où ce test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dateToYYYYMMDD } from '../../utils/businessDateHelpers';

// Capture la borne envoyée à Supabase.
let capturedLimit: string | null = null;

const makeChain = () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    gt: () => chain,
    not: () => chain,
    lte: (_col: string, value: string) => { capturedLimit = value; return chain; },
    order: () => Promise.resolve({ data: [], error: null }),
  };
  return chain;
};

vi.mock('../../lib/supabase', () => ({
  supabase: { from: () => makeChain() },
  handleSupabaseError: (e: unknown) => String(e),
}));

vi.mock('../../services/NetworkManager', () => ({
  networkManager: { shouldBlockNetworkOps: () => false },
}));

import { IngredientsService } from '../../services/supabase/ingredients.service';

describe('Fenêtre de péremption — heure locale, jamais UTC', () => {
  beforeEach(() => {
    capturedLimit = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('⭐ 00h30 locale sur fuseau positif : la borne reste sur le bon jour', async () => {
    // Le cas qui casse avec toISOString() : à 00h30 UTC+1, l'instant UTC est
    // encore la veille à 23h30. Une conversion UTC produirait J-1.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 10, 0, 30, 0)); // 10 août, 00h30 LOCALE

    await IngredientsService.getExpiringLots('bar-1', 3);

    // 10 août + 3 jours = 13 août, quelle que soit l'heure.
    expect(capturedLimit).toBe('2026-08-13');
  });

  it('23h30 locale : même borne qu\'à midi le même jour', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 10, 23, 30, 0));

    await IngredientsService.getExpiringLots('bar-1', 3);
    const lateNight = capturedLimit;

    capturedLimit = null;
    vi.setSystemTime(new Date(2026, 7, 10, 12, 0, 0));
    await IngredientsService.getExpiringLots('bar-1', 3);

    expect(
      lateNight,
      "L'heure de la journée ne doit pas déplacer la fenêtre de péremption"
    ).toBe(capturedLimit);
  });

  it('la fenêtre suit le paramètre withinDays', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 10, 12, 0, 0));

    await IngredientsService.getExpiringLots('bar-1', 7);

    expect(capturedLimit).toBe('2026-08-17');
  });

  it('gère un changement de mois', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 30, 12, 0, 0)); // 30 août

    await IngredientsService.getExpiringLots('bar-1', 3);

    expect(capturedLimit).toBe('2026-09-02');
  });

  it('la borne correspond exactement à dateToYYYYMMDD', async () => {
    // Verrouille l'usage du helper : un retour à toISOString ferait diverger
    // les deux valeurs dès qu'on est sur un fuseau non-UTC.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 10, 1, 0, 0));

    await IngredientsService.getExpiringLots('bar-1', 5);

    const expected = new Date(2026, 7, 10, 1, 0, 0);
    expected.setDate(expected.getDate() + 5);

    expect(capturedLimit).toBe(dateToYYYYMMDD(expected));
  });
});
