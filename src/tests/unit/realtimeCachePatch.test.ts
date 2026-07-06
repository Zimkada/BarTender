/**
 * realtimeCachePatch.test.ts
 * Tests des helpers purs de patch de cache Realtime (optimisation egress).
 */

import { describe, it, expect } from 'vitest';
import {
    mergeProductRowIntoList,
    removeProductFromList,
    applySaleEventToList,
    coerceSaleRowNumerics,
    normalizePendingSaleItems,
    applyPendingSaleEvent,
    type BarProductRow,
    type PendingStockSale,
} from '../../utils/realtimeCachePatch';
import type { Product, Sale } from '../../types';

// ============ FIXTURES ============

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
    id: 'p1',
    barId: 'bar1',
    name: 'Beaufort 65cl',
    volume: '65cl',
    price: 700,
    stock: 24,
    categoryId: 'cat1',
    alertThreshold: 10,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    currentAverageCost: 500,
    initialUnitCost: 480,
    lastUnitCost: 520,
    globalProductId: 'gp1',
    isCustomProduct: false,
    ...overrides,
});

const makeRow = (overrides: Partial<BarProductRow> = {}): BarProductRow => ({
    id: 'p1',
    bar_id: 'bar1',
    display_name: 'Beaufort 65cl',
    price: 700,
    stock: 24,
    alert_threshold: 10,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-07-04T12:00:00Z',
    current_average_cost: 500,
    initial_unit_cost: 480,
    last_unit_cost: 520,
    global_product_id: 'gp1',
    is_custom_product: false,
    is_source_of_global: null,
    is_active: true,
    local_category_id: 'cat1',
    local_image: null,
    local_name: null,
    volume: '65cl',
    ...overrides,
});

const makeSale = (overrides: Partial<Sale> = {}): Sale => ({
    id: 's1',
    barId: 'bar1',
    items: [],
    total: 2100,
    currency: 'XOF',
    status: 'validated',
    createdBy: 'u1',
    soldBy: 'u1',
    createdAt: new Date('2026-07-04T10:00:00Z'),
    businessDate: new Date('2026-07-04T00:00:00Z'),
    ...overrides,
});

// ============ PRODUITS ============

describe('mergeProductRowIntoList', () => {
    it('fusionne stock, prix et CUMP dans la ligne en cache', () => {
        const products = [makeProduct(), makeProduct({ id: 'p2' })];
        const row = makeRow({ stock: 21, price: 750, current_average_cost: 510 });

        const next = mergeProductRowIntoList(products, row);

        expect(next).not.toBeNull();
        expect(next![0].stock).toBe(21);
        expect(next![0].price).toBe(750);
        expect(next![0].currentAverageCost).toBe(510);
        // Les autres lignes sont inchangées (même référence)
        expect(next![1]).toBe(products[1]);
        // Immutabilité : la liste d'origine n'est pas mutée
        expect(products[0].stock).toBe(24);
    });

    it('met à jour la catégorie quand display_name est inchangé', () => {
        const products = [makeProduct()];
        const row = makeRow({ local_category_id: 'cat2' });

        const next = mergeProductRowIntoList(products, row);

        expect(next![0].categoryId).toBe('cat2');
        expect(next![0].name).toBe('Beaufort 65cl');
    });

    it('produit LIÉ : display_name divergent → null (colonne stockée potentiellement périmée)', () => {
        // Le RPC calcule COALESCE(local_name, gp.name) en direct ; la colonne stockée
        // n'est resynchronisée que par trigger. Divergence → refetch.
        const products = [makeProduct({ isCustomProduct: false })];
        const row = makeRow({ display_name: 'Beaufort Light 65cl' });

        expect(mergeProductRowIntoList(products, row)).toBeNull();
    });

    it('produit CUSTOM : display_name patché directement (colonne toujours fiable)', () => {
        const products = [makeProduct({ isCustomProduct: true, globalProductId: undefined })];
        const row = makeRow({
            display_name: 'Cocktail Maison XL',
            is_custom_product: true,
            global_product_id: null,
        });

        const next = mergeProductRowIntoList(products, row);

        expect(next).not.toBeNull();
        expect(next![0].name).toBe('Cocktail Maison XL');
    });

    it('avec oldRow : renommage réel dans cet événement → nom patché (autoritatif)', () => {
        const products = [makeProduct({ isCustomProduct: false })];
        const row = makeRow({ display_name: 'Beaufort Light 65cl' });
        const oldRow = { display_name: 'Beaufort 65cl' };

        const next = mergeProductRowIntoList(products, row, oldRow);

        expect(next).not.toBeNull();
        expect(next![0].name).toBe('Beaufort Light 65cl');
    });

    it('avec oldRow : colonne stockée périmée mais inchangée → nom du cache conservé (pas de refetch)', () => {
        // Cache frais (nom recalculé par le RPC) ≠ colonne stockée périmée,
        // mais l'événement ne touche pas display_name → on garde le cache.
        const products = [makeProduct({ isCustomProduct: false, name: 'Nom Frais RPC' })];
        const row = makeRow({ display_name: 'Ancien Nom Stocké' });
        const oldRow = { display_name: 'Ancien Nom Stocké' };

        const next = mergeProductRowIntoList(products, row, oldRow);

        expect(next).not.toBeNull();
        expect(next![0].name).toBe('Nom Frais RPC');
    });

    it('avec oldRow : image locale SUPPRIMÉE dans cet événement → null (repli official inconnaissable)', () => {
        const products = [makeProduct({ image: 'https://cdn/local.png' })];
        const row = makeRow({ local_image: null });
        const oldRow = { display_name: 'Beaufort 65cl', local_image: 'https://cdn/local.png' };

        expect(mergeProductRowIntoList(products, row, oldRow)).toBeNull();
    });

    it('avec oldRow : image locale CHANGÉE dans cet événement → patchée', () => {
        const products = [makeProduct({ image: 'https://cdn/old.png' })];
        const row = makeRow({ local_image: 'https://cdn/new.png' });
        const oldRow = { display_name: 'Beaufort 65cl', local_image: 'https://cdn/old.png' };

        const next = mergeProductRowIntoList(products, row, oldRow);

        expect(next![0].image).toBe('https://cdn/new.png');
    });

    it('avec oldRow : local_image inchangée (null) → image du cache conservée (official)', () => {
        const products = [makeProduct({ image: 'https://cdn/official.png' })];
        const row = makeRow({ local_image: null });
        const oldRow = { display_name: 'Beaufort 65cl', local_image: null };

        const next = mergeProductRowIntoList(products, row, oldRow);

        expect(next).not.toBeNull();
        expect(next![0].image).toBe('https://cdn/official.png');
    });

    // ⚠️ Garde-fous « config Realtime dégradée » : si REPLICA IDENTITY repassait à
    // DEFAULT, payload.old serait absent ou réduit à {id}. Ces tests figent le
    // comportement de repli conservateur — toute régression ici signifierait
    // qu'un changement de config Realtime peut produire du cache stale silencieux.
    describe('payload.old absent ou partiel (REPLICA IDENTITY DEFAULT)', () => {
        it('old partiel {id} : produit lié divergent → null (repli conservateur, pas de patch aveugle)', () => {
            const products = [makeProduct({ isCustomProduct: false })];
            const row = makeRow({ display_name: 'Beaufort Light 65cl' });

            expect(mergeProductRowIntoList(products, row, { id: 'p1' })).toBeNull();
        });

        it('old partiel {id} : produit custom → nom patché (colonne stockée fiable pour les customs)', () => {
            const products = [makeProduct({ isCustomProduct: true, globalProductId: undefined })];
            const row = makeRow({
                display_name: 'Cocktail Maison V2',
                is_custom_product: true,
                global_product_id: null,
            });

            const next = mergeProductRowIntoList(products, row, { id: 'p1' });

            expect(next).not.toBeNull();
            expect(next![0].name).toBe('Cocktail Maison V2');
        });

        it('old partiel {id} : local_image null → image du cache conservée (staleness bornée, jamais d\'écrasement erroné)', () => {
            const products = [makeProduct({ image: 'https://cdn/official.png' })];
            const row = makeRow({ local_image: null });

            const next = mergeProductRowIntoList(products, row, { id: 'p1' });

            expect(next).not.toBeNull();
            expect(next![0].image).toBe('https://cdn/official.png');
        });

        it('old absent (undefined) : patch du stock fonctionne, nom/image en repli conservateur', () => {
            const products = [makeProduct()];
            const row = makeRow({ stock: 17 });

            const next = mergeProductRowIntoList(products, row, undefined);

            expect(next).not.toBeNull();
            expect(next![0].stock).toBe(17);
            expect(next![0].name).toBe('Beaufort 65cl');
        });
    });

    it('coerce les colonnes NUMERIC livrées en chaînes par Realtime', () => {
        const products = [makeProduct()];
        const row = makeRow({
            price: '750.50' as unknown as number,
            stock: '21' as unknown as number,
            current_average_cost: '510.25' as unknown as number,
        });

        const next = mergeProductRowIntoList(products, row);

        expect(next![0].price).toBe(750.5);
        expect(next![0].stock).toBe(21);
        expect(next![0].currentAverageCost).toBe(510.25);
        expect(typeof next![0].price).toBe('number');
    });

    it('préserve l\'image en cache quand local_image est null (official_image absente du payload)', () => {
        const products = [makeProduct({ image: 'https://cdn/official.png' })];
        const row = makeRow({ local_image: null });

        const next = mergeProductRowIntoList(products, row);

        expect(next![0].image).toBe('https://cdn/official.png');
    });

    it('écrase l\'image quand local_image est fournie', () => {
        const products = [makeProduct({ image: 'https://cdn/official.png' })];
        const row = makeRow({ local_image: 'https://cdn/local.png' });

        const next = mergeProductRowIntoList(products, row);

        expect(next![0].image).toBe('https://cdn/local.png');
    });

    it('retourne null si le produit est absent du cache (→ invalidation)', () => {
        const products = [makeProduct({ id: 'autre' })];
        expect(mergeProductRowIntoList(products, makeRow())).toBeNull();
    });

    it('retourne null si le produit est désactivé (→ invalidation)', () => {
        const products = [makeProduct()];
        expect(mergeProductRowIntoList(products, makeRow({ is_active: false }))).toBeNull();
    });

    it('retourne null si l\'invariant catalogue diverge (global_product_id)', () => {
        const products = [makeProduct({ globalProductId: 'gp1' })];
        expect(mergeProductRowIntoList(products, makeRow({ global_product_id: 'gp2' }))).toBeNull();
        expect(mergeProductRowIntoList(products, makeRow({ global_product_id: null }))).toBeNull();
    });

    it('retourne null si l\'invariant catalogue diverge (is_custom_product)', () => {
        const products = [makeProduct({ isCustomProduct: false })];
        expect(mergeProductRowIntoList(products, makeRow({ is_custom_product: true }))).toBeNull();
    });
});

describe('removeProductFromList', () => {
    it('retire le produit par id', () => {
        const products = [makeProduct(), makeProduct({ id: 'p2' })];
        const next = removeProductFromList(products, 'p1');
        expect(next).toHaveLength(1);
        expect(next[0].id).toBe('p2');
    });

    it('retourne la même référence si le produit est absent', () => {
        const products = [makeProduct()];
        expect(removeProductFromList(products, 'inconnu')).toBe(products);
    });
});

// ============ VENTES ============

describe('applySaleEventToList', () => {
    it('INSERT dans la fenêtre → insère en tête (ordre business_date desc)', () => {
        const list = [makeSale({ id: 's1', businessDate: new Date('2026-07-03') })];
        const sale = makeSale({ id: 's2', businessDate: new Date('2026-07-04') });

        const next = applySaleEventToList(
            list,
            { type: 'INSERT', sale, businessDate: '2026-07-04' },
            { startDate: '2026-06-27' },
        );

        expect(next).toHaveLength(2);
        expect(next[0].id).toBe('s2');
        expect(next[1].id).toBe('s1');
    });

    it('INSERT hors fenêtre → liste inchangée (même référence)', () => {
        const list = [makeSale()];
        const sale = makeSale({ id: 's2' });

        const next = applySaleEventToList(
            list,
            { type: 'INSERT', sale, businessDate: '2026-06-01' },
            { startDate: '2026-06-27', endDate: '2026-07-04' },
        );

        expect(next).toBe(list);
    });

    it('INSERT avec status non conforme au filtre → liste inchangée', () => {
        const list = [makeSale({ status: 'pending' })];
        const sale = makeSale({ id: 's2', status: 'validated' });

        const next = applySaleEventToList(
            list,
            { type: 'INSERT', sale, businessDate: '2026-07-04' },
            { status: 'pending' },
        );

        expect(next).toBe(list);
    });

    it('dédoublonne par idempotency_key (vente optimiste déjà en cache)', () => {
        const list = [makeSale({ id: 'local-1', idempotencyKey: 'idem-1' })];
        const sale = makeSale({ id: 'server-1', idempotencyKey: 'idem-1' });

        const next = applySaleEventToList(
            list,
            { type: 'INSERT', sale, businessDate: '2026-07-04' },
            {},
        );

        expect(next).toHaveLength(1);
        expect(next[0].id).toBe('server-1');
    });

    it('UPDATE remplace la vente existante', () => {
        const list = [makeSale({ status: 'pending' }), makeSale({ id: 's2' })];
        const sale = makeSale({ status: 'validated', validatedBy: 'g1' });

        const next = applySaleEventToList(
            list,
            { type: 'UPDATE', sale, businessDate: '2026-07-04' },
            {},
        );

        expect(next).toHaveLength(2);
        expect(next[0].status).toBe('validated');
        expect(next[0].validatedBy).toBe('g1');
    });

    it('UPDATE sortant du filtre status → retire la vente (pending → validated)', () => {
        const list = [makeSale({ status: 'pending' })];
        const sale = makeSale({ status: 'validated' });

        const next = applySaleEventToList(
            list,
            { type: 'UPDATE', sale, businessDate: '2026-07-04' },
            { status: 'pending' },
        );

        expect(next).toHaveLength(0);
    });

    it('UPDATE entrant dans le filtre status → insère la vente (liste validated)', () => {
        const list = [makeSale({ id: 's0', status: 'validated' })];
        const sale = makeSale({ id: 's1', status: 'validated' });

        const next = applySaleEventToList(
            list,
            { type: 'UPDATE', sale, businessDate: '2026-07-04' },
            { status: 'validated' },
        );

        expect(next).toHaveLength(2);
        expect(next.some(s => s.id === 's1')).toBe(true);
    });

    it('DELETE retire la vente par id', () => {
        const list = [makeSale(), makeSale({ id: 's2' })];
        const next = applySaleEventToList(list, { type: 'DELETE', id: 's1' }, {});
        expect(next).toHaveLength(1);
        expect(next[0].id).toBe('s2');
    });

    it('DELETE d\'une vente absente → même référence', () => {
        const list = [makeSale()];
        expect(applySaleEventToList(list, { type: 'DELETE', id: 'zz' }, {})).toBe(list);
    });

    it('coerceSaleRowNumerics convertit les NUMERIC en chaînes (payload Realtime) en nombres', () => {
        const row = {
            id: 's1',
            total: '2100.00' as unknown as number,
            subtotal: '2100.00' as unknown as number,
            discount_total: '100.50' as unknown as number,
        };

        const coerced = coerceSaleRowNumerics(row);

        expect(coerced.total).toBe(2100);
        expect(coerced.subtotal).toBe(2100);
        expect(coerced.discount_total).toBe(100.5);
        expect(typeof coerced.total).toBe('number');
    });

    it('coerceSaleRowNumerics préserve null pour discount_total', () => {
        const row = { id: 's1', total: 2100, subtotal: 2100, discount_total: null };
        expect(coerceSaleRowNumerics(row).discount_total).toBeNull();
    });

    it('respecte le plafond limit (miroir du limit(500) serveur des variantes sans dates)', () => {
        const list = [
            makeSale({ id: 's1', createdAt: new Date('2026-07-04T10:00:00Z') }),
            makeSale({ id: 's2', createdAt: new Date('2026-07-04T09:00:00Z') }),
            makeSale({ id: 's3', createdAt: new Date('2026-07-04T08:00:00Z') }),
        ];
        const sale = makeSale({ id: 's-new', createdAt: new Date('2026-07-04T11:00:00Z') });

        const next = applySaleEventToList(
            list,
            { type: 'INSERT', sale, businessDate: '2026-07-04' },
            { limit: 3 },
        );

        expect(next).toHaveLength(3);
        expect(next[0].id).toBe('s-new'); // la plus récente entre
        expect(next.some(s => s.id === 's3')).toBe(false); // la plus ancienne sort
    });

    it('UPDATE altérant une clé de tri → liste re-triée (garde-fou, flux futur)', () => {
        const list = [
            makeSale({ id: 's1', businessDate: new Date('2026-07-04'), createdAt: new Date('2026-07-04T10:00:00Z') }),
            makeSale({ id: 's2', businessDate: new Date('2026-07-03'), createdAt: new Date('2026-07-03T10:00:00Z') }),
        ];
        // s1 recule d'une journée → doit passer derrière s2... non : 2026-07-02 < 2026-07-03
        const sale = makeSale({ id: 's1', businessDate: new Date('2026-07-02'), createdAt: new Date('2026-07-02T10:00:00Z') });

        const next = applySaleEventToList(
            list,
            { type: 'UPDATE', sale, businessDate: '2026-07-02' },
            {},
        );

        expect(next.map(s => s.id)).toEqual(['s2', 's1']);
    });

    it('UPDATE sans changement de clé de tri → position conservée sans re-tri', () => {
        const list = [makeSale({ status: 'pending' }), makeSale({ id: 's2', businessDate: new Date('2026-07-03') })];
        const sale = makeSale({ status: 'validated' });

        const next = applySaleEventToList(
            list,
            { type: 'UPDATE', sale, businessDate: '2026-07-04' },
            {},
        );

        expect(next[0].id).toBe('s1');
        expect(next[0].status).toBe('validated');
    });

    it('tri stable : même business_date → created_at desc', () => {
        const list = [
            makeSale({ id: 'old', createdAt: new Date('2026-07-04T09:00:00Z') }),
        ];
        const sale = makeSale({ id: 'new', createdAt: new Date('2026-07-04T11:00:00Z') });

        const next = applySaleEventToList(
            list,
            { type: 'INSERT', sale, businessDate: '2026-07-04' },
            {},
        );

        expect(next[0].id).toBe('new');
        expect(next[1].id).toBe('old');
    });
});

// ============ ITEMS DE VENTES PENDING (garde-fou anti-survente) ============

describe('normalizePendingSaleItems', () => {
    it('conserve un item valide et coerce quantity en nombre', () => {
        const items = [{ product_id: 'p1', quantity: '3', product_name: 'Beaufort' }];
        const result = normalizePendingSaleItems(items);

        expect(result).toHaveLength(1);
        expect(result[0].quantity).toBe(3);
        expect(typeof result[0].quantity).toBe('number');
    });

    it('filtre un item avec quantity non numérique (évite NaN dans availableStock)', () => {
        const items = [
            { product_id: 'p1', quantity: 'deux' },
            { product_id: 'p2', quantity: 2 },
        ];
        const result = normalizePendingSaleItems(items);

        expect(result).toHaveLength(1);
        expect(result[0].product_id).toBe('p2');
    });

    it('filtre un item sans product_id', () => {
        const items = [{ quantity: 2 }, { product_id: 'p2', quantity: 1 }];
        const result = normalizePendingSaleItems(items);

        expect(result).toHaveLength(1);
        expect(result[0].product_id).toBe('p2');
    });

    it('filtre un item avec product_id vide ou non-string', () => {
        const items = [
            { product_id: '', quantity: 1 },
            { product_id: 42, quantity: 1 },
            { product_id: 'ok', quantity: 1 },
        ];
        const result = normalizePendingSaleItems(items);

        expect(result).toHaveLength(1);
        expect(result[0].product_id).toBe('ok');
    });

    it('filtre les entrées non-objet (null, string, number) sans planter', () => {
        const items = [null, 'garbage', 42, { product_id: 'p1', quantity: 1 }];
        const result = normalizePendingSaleItems(items);

        expect(result).toHaveLength(1);
    });

    it('quantity=0 est valide (Number(0) n\'est pas NaN)', () => {
        const items = [{ product_id: 'p1', quantity: 0 }];
        const result = normalizePendingSaleItems(items);

        expect(result).toHaveLength(1);
        expect(result[0].quantity).toBe(0);
    });

    it('liste vide → liste vide', () => {
        expect(normalizePendingSaleItems([])).toEqual([]);
    });
});

// ============ CACHE server-pending-sales-for-stock (garde-fou anti-survente) ============

describe('applyPendingSaleEvent', () => {
    const makePending = (overrides: Partial<PendingStockSale> = {}): PendingStockSale => ({
        id: 'sale-1',
        items: [{ product_id: 'p1', quantity: 2 }],
        idempotency_key: 'idem-1',
        ...overrides,
    });

    it('INSERT pending → ajoute une nouvelle entrée', () => {
        const result = applyPendingSaleEvent([], {
            eventType: 'INSERT',
            id: 'sale-1',
            status: 'pending',
            items: [{ product_id: 'p1', quantity: 3 }],
        });

        expect(result).toHaveProperty('next');
        const next = (result as { next: PendingStockSale[] | null }).next;
        expect(next).toHaveLength(1);
        expect(next![0].id).toBe('sale-1');
    });

    it('UPDATE pending sur entrée existante → remplace l\'entrée (ex: items modifiés)', () => {
        const list = [makePending()];
        const result = applyPendingSaleEvent(list, {
            eventType: 'UPDATE',
            id: 'sale-1',
            status: 'pending',
            items: [{ product_id: 'p1', quantity: 5 }],
        });

        const next = (result as { next: PendingStockSale[] | null }).next;
        expect(next).toHaveLength(1);
        expect((next![0].items as Record<string, unknown>[])[0].quantity).toBe(5);
    });

    it('UPDATE validated → retire l\'entrée (n\'est plus pending)', () => {
        const list = [makePending(), makePending({ id: 'sale-2' })];
        const result = applyPendingSaleEvent(list, {
            eventType: 'UPDATE',
            id: 'sale-1',
            status: 'validated',
        });

        const next = (result as { next: PendingStockSale[] | null }).next;
        expect(next).toHaveLength(1);
        expect(next![0].id).toBe('sale-2');
    });

    it('UPDATE rejected → retire l\'entrée', () => {
        const list = [makePending()];
        const result = applyPendingSaleEvent(list, {
            eventType: 'UPDATE',
            id: 'sale-1',
            status: 'rejected',
        });

        expect((result as { next: PendingStockSale[] | null }).next).toEqual([]);
    });

    it('DELETE → retire l\'entrée', () => {
        const list = [makePending(), makePending({ id: 'sale-2' })];
        const result = applyPendingSaleEvent(list, { eventType: 'DELETE', id: 'sale-1' });

        const next = (result as { next: PendingStockSale[] | null }).next;
        expect(next).toHaveLength(1);
        expect(next![0].id).toBe('sale-2');
    });

    it('DELETE d\'une entrée absente → next null (pas de changement, pas de setQueryData)', () => {
        const list = [makePending()];
        expect(applyPendingSaleEvent(list, { eventType: 'DELETE', id: 'inconnu' })).toEqual({ next: null });
    });

    it('UPDATE validated d\'une entrée absente → next null (pas de changement)', () => {
        const list = [makePending()];
        expect(applyPendingSaleEvent(list, { eventType: 'UPDATE', id: 'inconnu', status: 'validated' })).toEqual({ next: null });
    });

    it('sans id → next null (garde défensif)', () => {
        expect(applyPendingSaleEvent([], { eventType: 'INSERT', status: 'pending' })).toEqual({ next: null });
    });

    it('items en string JSON (Realtime) → parsés et normalisés', () => {
        const result = applyPendingSaleEvent([], {
            eventType: 'INSERT',
            id: 'sale-1',
            status: 'pending',
            items: JSON.stringify([{ product_id: 'p1', quantity: '4' }]),
        });

        const next = (result as { next: PendingStockSale[] | null }).next;
        const items = next![0].items as Record<string, unknown>[];
        expect(items[0].quantity).toBe(4);
        expect(typeof items[0].quantity).toBe('number');
    });

    it('INSERT pending avec items absent → refetch (déduction stock impossible)', () => {
        const result = applyPendingSaleEvent([], {
            eventType: 'INSERT',
            id: 'sale-1',
            status: 'pending',
        });

        expect(result).toEqual({ refetch: true });
    });

    it('UPDATE pending partiel avec items absent → conserve les items existants', () => {
        const list = [makePending({
            items: [{ product_id: 'p1', quantity: 7 }],
            idempotency_key: 'idem-existing',
        })];
        const result = applyPendingSaleEvent(list, {
            eventType: 'UPDATE',
            id: 'sale-1',
            status: 'pending',
        });

        const next = (result as { next: PendingStockSale[] | null }).next;
        expect(next).toHaveLength(1);
        expect(next![0].items).toEqual([{ product_id: 'p1', quantity: 7 }]);
        expect(next![0].idempotency_key).toBe('idem-existing');
    });

    it('items JSON string malformé → refetch (pas de patch sous-déducteur)', () => {
        const result = applyPendingSaleEvent([], {
            eventType: 'INSERT',
            id: 'sale-1',
            status: 'pending',
            items: '{not valid json',
        });

        expect(result).toEqual({ refetch: true });
    });

    it('items string JSON valide mais pas un tableau (ex: objet) → refetch', () => {
        const result = applyPendingSaleEvent([], {
            eventType: 'INSERT',
            id: 'sale-1',
            status: 'pending',
            items: JSON.stringify({ not: 'an array' }),
        });

        expect(result).toEqual({ refetch: true });
    });

    it('items d\'un type inattendu (nombre) → refetch', () => {
        const result = applyPendingSaleEvent([], {
            eventType: 'INSERT',
            id: 'sale-1',
            status: 'pending',
            items: 42,
        });

        expect(result).toEqual({ refetch: true });
    });

});
