/**
 * dishCategoryCreation.test.ts
 *
 * ⭐ Garde APPLICATIVE contre les catégories de plats homonymes.
 *
 * ⚠️⚠️ POURQUOI CE TEST EXISTE — un fait vérifié, pas une précaution :
 * la contrainte en base est `UNIQUE (bar_id, name)`, sur la colonne `name`.
 * Or les catégories personnalisées écrivent `custom_name` et laissent `name`
 * à NULL. En SQL, NULL n'entre PAS dans une contrainte d'unicité : deux
 * catégories custom homonymes passent donc SANS erreur côté base.
 *
 * La seule protection est celle du service. Si elle saute, un promoteur peut
 * créer deux fois « Grillades » et ne plus savoir laquelle rattacher à quel
 * plat — sans qu'aucune erreur ne soit levée nulle part.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===== Mock Supabase =====
// On observe l'INSERT : est-il émis, ou la garde l'a-t-elle bloqué ?
const mockInsert = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ data: mockExistingCategories, error: null }),
          }),
        }),
      }),
      insert: (payload: unknown) => {
        mockInsert(payload);
        return {
          select: () => ({
            single: () =>
              Promise.resolve({
                data: { id: 'new-cat-id', ...(payload as object) },
                error: null,
              }),
          }),
        };
      },
    }),
  },
  handleSupabaseError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

let mockExistingCategories: Array<{ id: string; custom_name: string | null; name: string | null }> = [];

import { CategoriesService } from '../../services/supabase/categories.service';

const BAR_ID = 'bar-123';

describe('createDishCategory — garde contre les homonymes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistingCategories = [];
  });

  it('crée la catégorie quand le nom est libre', async () => {
    const result = await CategoriesService.createDishCategory(BAR_ID, { name: 'Grillades' });

    expect(result.id).toBe('new-cat-id');
    expect(mockInsert).toHaveBeenCalledOnce();
  });

  it('⛔ REFUSE un nom déjà utilisé', async () => {
    mockExistingCategories = [{ id: 'c1', custom_name: 'Grillades', name: null }];

    await expect(
      CategoriesService.createDishCategory(BAR_ID, { name: 'Grillades' })
    ).rejects.toThrow(/existe déjà/);

    expect(
      mockInsert,
      'L\'INSERT ne doit PAS être émis : la base ne protège pas (name reste NULL)'
    ).not.toHaveBeenCalled();
  });

  it('⛔ REFUSE un homonyme de casse différente', async () => {
    // « Grillades » et « grillades » sont la même catégorie pour un humain.
    mockExistingCategories = [{ id: 'c1', custom_name: 'Grillades', name: null }];

    await expect(
      CategoriesService.createDishCategory(BAR_ID, { name: 'GRILLADES' })
    ).rejects.toThrow(/existe déjà/);

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('⛔ REFUSE un homonyme entouré d\'espaces', async () => {
    mockExistingCategories = [{ id: 'c1', custom_name: 'Riz', name: null }];

    await expect(
      CategoriesService.createDishCategory(BAR_ID, { name: '  Riz  ' })
    ).rejects.toThrow(/existe déjà/);
  });

  it('⛔ REFUSE un nom vide', async () => {
    await expect(
      CategoriesService.createDishCategory(BAR_ID, { name: '   ' })
    ).rejects.toThrow(/obligatoire/);

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('⭐ enregistre le nom SANS espaces superflus', async () => {
    await CategoriesService.createDishCategory(BAR_ID, { name: '  Accompagnements  ' });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ custom_name: 'Accompagnements' })
    );
  });

  it('⭐ marque bien la catégorie comme type=dish', () => {
    // ⚠️ §13.10 — une catégorie de plats mal typée remonterait dans le
    // catalogue de BOISSONS : c'est l'étanchéité de tout le module.
    return CategoriesService.createDishCategory(BAR_ID, { name: 'Desserts' }).then(() => {
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'dish', bar_id: BAR_ID })
      );
    });
  });
});
