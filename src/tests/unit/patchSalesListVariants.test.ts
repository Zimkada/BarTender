/**
 * patchSalesListVariants.test.ts
 * Tests du patch multi-variantes du cache ventes (egress vague 3) : chaque
 * variante de salesKeys.list(barId) est patchée selon SES filtres, au lieu
 * d'une invalidation par préfixe qui refetchait toutes les fenêtres 7-60j
 * à chaque mutation. Utilise un VRAI QueryClient (pas de mocks React Query)
 * pour exercer le mécanisme getQueriesData/setQueryData réel.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

// Isole useSalesQueries de sa chaîne d'imports lourde (client Supabase,
// realtime) — patchSalesListVariants n'utilise ni l'un ni l'autre.
vi.mock('../../services/supabase/sales.service', () => ({ SalesService: {} }));
vi.mock('../../hooks/useSmartSync', () => ({ useSmartSync: vi.fn() }));

import { patchSalesListVariants, salesKeys, type UseSalesOptions } from '../../hooks/queries/useSalesQueries';
import type { Sale } from '../../types';

const BAR_ID = 'bar-123';

const makeSale = (overrides: Partial<Sale> = {}): Sale => ({
    id: 'sale-1',
    barId: BAR_ID,
    items: [{ product_id: 'p1', product_name: 'Bière Flag', quantity: 1, unit_price: 500, total_price: 500 }] as unknown as Sale['items'],
    total: 500,
    currency: 'XOF',
    paymentMethod: 'cash',
    status: 'validated',
    createdBy: 'user-1',
    soldBy: 'user-1',
    createdAt: new Date('2026-07-08T12:00:00Z'),
    businessDate: new Date('2026-07-08'),
    ...overrides,
});

/** Clé d'une variante telle que produite par useSales : [...list(barId), options] */
const variantKey = (options: UseSalesOptions) => [...salesKeys.list(BAR_ID), options];

const seedVariant = (qc: QueryClient, options: UseSalesOptions, data: Sale[]) => {
    qc.setQueryData(variantKey(options), data);
    return variantKey(options);
};

describe('patchSalesListVariants — patch multi-variantes du cache ventes', () => {
    let queryClient: QueryClient;
    let invalidated: (readonly unknown[])[];
    const invalidateVariants = (keys: readonly (readonly unknown[])[]) => {
        invalidated.push(...keys);
    };

    beforeEach(() => {
        queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        invalidated = [];
    });

    it('INSERT : ajoute la vente aux variantes dont la fenêtre matche, laisse les autres intactes', () => {
        const inWindow = seedVariant(queryClient, { startDate: '2026-07-07' }, []);
        const outOfWindow = seedVariant(queryClient, { startDate: '2026-07-01', endDate: '2026-07-05' }, []);
        const before = queryClient.getQueryData<Sale[]>(outOfWindow);

        const sale = makeSale({ id: 'sale-new' });
        patchSalesListVariants(queryClient, BAR_ID, { type: 'INSERT', sale, businessDate: '2026-07-08' }, invalidateVariants);

        expect(queryClient.getQueryData<Sale[]>(inWindow)?.map(s => s.id)).toEqual(['sale-new']);
        // Hors fenêtre : même référence (aucun setQueryData)
        expect(queryClient.getQueryData<Sale[]>(outOfWindow)).toBe(before);
        expect(invalidated).toHaveLength(0);
    });

    it('INSERT : respecte le filtre status (vente pending absente d\'une variante validated)', () => {
        const validatedOnly = seedVariant(queryClient, { startDate: '2026-07-07', status: 'validated' }, []);
        const all = seedVariant(queryClient, { startDate: '2026-07-07' }, []);

        const sale = makeSale({ id: 'sale-pending', status: 'pending' });
        patchSalesListVariants(queryClient, BAR_ID, { type: 'INSERT', sale, businessDate: '2026-07-08' }, invalidateVariants);

        expect(queryClient.getQueryData<Sale[]>(validatedOnly)).toEqual([]);
        expect(queryClient.getQueryData<Sale[]>(all)?.map(s => s.id)).toEqual(['sale-pending']);
    });

    it('INSERT : écrit items:[] dans les variantes includeItems:false (miroir SUMMARY serveur)', () => {
        const summary = seedVariant(queryClient, { startDate: '2026-07-07', includeItems: false }, []);
        const detail = seedVariant(queryClient, { startDate: '2026-07-07' }, []);

        const sale = makeSale({ id: 'sale-new' });
        patchSalesListVariants(queryClient, BAR_ID, { type: 'INSERT', sale, businessDate: '2026-07-08' }, invalidateVariants);

        expect(queryClient.getQueryData<Sale[]>(summary)?.[0].items).toEqual([]);
        expect(queryClient.getQueryData<Sale[]>(detail)?.[0].items).toHaveLength(1);
    });

    it('INSERT : invalide (ciblé) les variantes searchTerm au lieu de les patcher', () => {
        const searchKey = seedVariant(queryClient, { searchTerm: 'flag' }, []);
        const plain = seedVariant(queryClient, { startDate: '2026-07-07' }, []);

        const sale = makeSale({ id: 'sale-new' });
        patchSalesListVariants(queryClient, BAR_ID, { type: 'INSERT', sale, businessDate: '2026-07-08' }, invalidateVariants);

        expect(invalidated).toEqual([searchKey]);
        expect(queryClient.getQueryData<Sale[]>(searchKey)).toEqual([]); // non patchée
        expect(queryClient.getQueryData<Sale[]>(plain)).toHaveLength(1);
    });

    it('UPDATE pending→validated : la vente migre entre variantes filtrées par statut', () => {
        const sale = makeSale({ id: 'sale-1', status: 'pending' });
        const pendingVariant = seedVariant(queryClient, { startDate: '2026-07-07', status: 'pending' }, [sale]);
        const validatedVariant = seedVariant(queryClient, { startDate: '2026-07-07', status: 'validated' }, []);

        const updated = makeSale({ id: 'sale-1', status: 'validated' });
        patchSalesListVariants(queryClient, BAR_ID, { type: 'UPDATE', sale: updated, businessDate: '2026-07-08' }, invalidateVariants);

        expect(queryClient.getQueryData<Sale[]>(pendingVariant)).toEqual([]); // sortie
        expect(queryClient.getQueryData<Sale[]>(validatedVariant)?.map(s => s.id)).toEqual(['sale-1']); // entrée
    });

    it('DELETE : retire la vente de toutes les variantes', () => {
        const sale = makeSale({ id: 'sale-1' });
        const a = seedVariant(queryClient, { startDate: '2026-07-07' }, [sale, makeSale({ id: 'sale-2' })]);
        const b = seedVariant(queryClient, { startDate: '2026-07-01' }, [sale]);

        patchSalesListVariants(queryClient, BAR_ID, { type: 'DELETE', id: 'sale-1' }, invalidateVariants);

        expect(queryClient.getQueryData<Sale[]>(a)?.map(s => s.id)).toEqual(['sale-2']);
        expect(queryClient.getQueryData<Sale[]>(b)).toEqual([]);
        expect(invalidated).toHaveLength(0);
    });

    it('DELETE sur variante sans dates ET pleine (500) : invalidation ciblée, données intactes', () => {
        // Variante plafonnée serveur : retirer localement laisserait 499 lignes
        // sans jamais récupérer la 500e suivante → refetch ciblé obligatoire.
        const fullList = Array.from({ length: 500 }, (_, i) => makeSale({ id: `sale-${i}` }));
        const capped = seedVariant(queryClient, {}, fullList);
        const before = queryClient.getQueryData<Sale[]>(capped);

        patchSalesListVariants(queryClient, BAR_ID, { type: 'DELETE', id: 'sale-42' }, invalidateVariants);

        expect(invalidated).toEqual([capped]);
        expect(queryClient.getQueryData<Sale[]>(capped)).toBe(before);
    });

    it('cache vide : no-op complet (rien à patcher, rien à invalider)', () => {
        const spy = vi.spyOn(queryClient, 'setQueryData');
        patchSalesListVariants(queryClient, BAR_ID, { type: 'INSERT', sale: makeSale(), businessDate: '2026-07-08' }, invalidateVariants);
        expect(spy).not.toHaveBeenCalled();
        expect(invalidated).toHaveLength(0);
    });

    it('dédoublonnage : INSERT d\'une vente déjà présente (même id) remplace au lieu de dupliquer', () => {
        // Scénario réel : patch mutation onSuccess PUIS événement Realtime de la
        // même vente — le second passage ne doit jamais créer de doublon.
        const sale = makeSale({ id: 'sale-1', total: 500 });
        const key = seedVariant(queryClient, { startDate: '2026-07-07' }, [sale]);

        const fresh = makeSale({ id: 'sale-1', total: 500 });
        patchSalesListVariants(queryClient, BAR_ID, { type: 'INSERT', sale: fresh, businessDate: '2026-07-08' }, invalidateVariants);

        expect(queryClient.getQueryData<Sale[]>(key)).toHaveLength(1);
    });
});
