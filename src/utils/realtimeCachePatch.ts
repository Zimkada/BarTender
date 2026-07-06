/**
 * realtimeCachePatch.ts
 * Helpers purs pour appliquer un événement Realtime directement au cache React Query
 * au lieu d'invalider + refetcher la liste complète (optimisation egress).
 *
 * Contrat commun : chaque fonction retourne
 *  - la nouvelle liste si le patch a pu être appliqué,
 *  - `null` si l'événement ne peut pas être appliqué localement de façon sûre
 *    → l'appelant doit alors retomber sur l'invalidation classique (refetch).
 *  - la MÊME référence si l'événement ne concerne pas cette liste (aucun setQueryData nécessaire).
 *
 * ⚠️ Ces fonctions ne touchent jamais aux champs invariants du catalogue
 * (global_product_id / is_custom_product) : toute divergence détectée sur ces
 * champs force un refetch complet (cf. chk_custom_product_consistency).
 */

import type { Product, Sale } from '../types';
import type { Database } from '../lib/database.types';

export type BarProductRow = Database['public']['Tables']['bar_products']['Row'];

/**
 * ⚠️ Supabase Realtime sérialise les colonnes NUMERIC/DECIMAL Postgres en CHAÎNES
 * dans les payloads postgres_changes (contrairement à PostgREST qui renvoie des
 * nombres JSON). Toute valeur issue d'un payload Realtime destinée à de
 * l'arithmétique DOIT passer par cette coercition, sinon `sum + total` concatène.
 */
const toNumber = (value: unknown, fallback: number): number => {
    if (value == null) return fallback;
    const n = Number(value);
    return Number.isNaN(n) ? fallback : n;
};

export interface PendingStockSale {
    id: string;
    items: unknown;
    idempotency_key?: string;
}

/** Forme minimale du payload realtime `sales` pertinente pour le patch pending-stock */
export interface PendingSaleEventPayload {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    id?: string;
    status?: string;
    items?: unknown;
    idempotency_key?: string;
}

/**
 * Résultat de `applyPendingSaleEvent` :
 *  - `{ next: [...] }` : nouvelle liste à écrire dans le cache
 *  - `{ next: null }` : l'événement ne modifie pas la liste (même référence à
 *    conserver — pas de setQueryData nécessaire)
 *  - `{ refetch: true }` : items illisible pour une vente pending → écrire
 *    `items: []` sous-déduirait silencieusement le stock disponible (garde-fou
 *    anti-survente affaibli) ; l'appelant doit invalider/refetch au lieu de patcher.
 */
export type ApplyPendingSaleEventResult =
    | { next: PendingStockSale[] | null }
    | { refetch: true };

/**
 * Calcule la prochaine valeur du cache `server-pending-sales-for-stock` à partir
 * d'un événement Realtime `sales`, sans effet de bord (le hook appelant se charge
 * de `queryClient.setQueryData`/invalidation). Consommé par useUnifiedStock pour
 * le calcul `availableStock -= item.quantity` (garde-fou anti-survente).
 */
export function applyPendingSaleEvent(
    pendingSales: PendingStockSale[],
    payload: PendingSaleEventPayload,
): ApplyPendingSaleEventResult {
    const saleId = payload.id;
    if (!saleId) return { next: null };

    const isNoLongerPending =
        payload.eventType === 'DELETE' ||
        (payload.eventType === 'UPDATE' && payload.status !== 'pending');

    if (isNoLongerPending) {
        const next = pendingSales.filter(s => s.id !== saleId);
        return { next: next.length !== pendingSales.length ? next : null };
    }

    const isNewOrUpdatedPending =
        (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') &&
        payload.status === 'pending';

    if (!isNewOrUpdatedPending) return { next: null };

    const existingIdx = pendingSales.findIndex(s => s.id === saleId);
    const existing = existingIdx === -1 ? undefined : pendingSales[existingIdx];

    // 🛡️ Supabase Realtime peut envoyer les JSONB comme strings. items absent
    // (undefined/null) est bénin uniquement pour une entrée déjà connue : payload
    // partiel → on conserve les items existants. Pour une nouvelle entrée pending,
    // l'absence d'items rend la déduction stock impossible → refetch ciblé.
    // Une string qui échoue au parsing JSON, ou une valeur d'un autre type (objet,
    // nombre...), signale aussi un payload illisible : écrire `items: []`
    // sous-déduirait silencieusement availableStock.
    let items: unknown;
    if (payload.items == null) {
        if (!existing) return { refetch: true };
        items = existing.items;
    } else if (Array.isArray(payload.items)) {
        items = normalizePendingSaleItems(payload.items);
    } else if (typeof payload.items === 'string') {
        try {
            const parsed = JSON.parse(payload.items);
            if (!Array.isArray(parsed)) return { refetch: true };
            items = normalizePendingSaleItems(parsed);
        } catch (e) {
            console.error('Failed to parse realtime items', e);
            return { refetch: true };
        }
    } else {
        return { refetch: true };
    }

    const newPendingItem: PendingStockSale = {
        id: saleId,
        items,
        idempotency_key: payload.idempotency_key ?? existing?.idempotency_key,
    };

    if (existingIdx === -1) {
        return { next: [...pendingSales, newPendingItem] };
    }
    const next = [...pendingSales];
    next[existingIdx] = newPendingItem;
    return { next };
}

/**
 * Normalise les items jsonb d'une vente `pending` reçus via Realtime, pour le
 * cache `server-pending-sales-for-stock` consommé par useUnifiedStock (calcul
 * `availableStock -= item.quantity` — garde-fou anti-survente).
 *
 * ⚠️ Une `quantity` non numérique (string, undefined) produirait NaN, qui
 * désactive silencieusement ce garde-fou (`NaN < quantitéDemandée` vaut
 * toujours `false`). Les items sans product_id/quantity exploitable sont
 * filtrés plutôt que de laisser une entrée corrompue polluer le calcul.
 */
export function normalizePendingSaleItems(rawItems: unknown[]): Record<string, unknown>[] {
    const normalized: Record<string, unknown>[] = [];
    for (const item of rawItems) {
        if (typeof item !== 'object' || item === null) continue;
        const i = item as Record<string, unknown>;
        const productId = i.product_id;
        const quantity = Number(i.quantity);
        if (typeof productId !== 'string' || !productId || Number.isNaN(quantity)) continue;
        normalized.push({ ...i, product_id: productId, quantity });
    }
    return normalized;
}

/**
 * Coerce les colonnes NUMERIC d'une ligne `sales` Realtime en nombres
 * (total, subtotal, discount_total sont NUMERIC(12,2) en DB).
 */
export function coerceSaleRowNumerics<
    T extends { total: number; subtotal: number; discount_total: number | null },
>(row: T): T {
    return {
        ...row,
        total: toNumber(row.total, 0),
        subtotal: toNumber(row.subtotal, 0),
        discount_total: row.discount_total == null ? row.discount_total : toNumber(row.discount_total, 0),
    };
}

/**
 * Fusionne un UPDATE Realtime de `bar_products` dans la liste produits en cache.
 *
 * Champs patchés : stock, prix, seuil d'alerte, CUMP, nom d'affichage, volume,
 * catégorie, updated_at. L'image n'est écrasée que si `local_image` est présent
 * (l'`official_image` du catalogue global n'est pas dans le payload Realtime).
 *
 * Retourne `null` (→ invalidation) si :
 *  - le produit n'est pas dans le cache (INSERT vu comme UPDATE, cache partiel...)
 *  - le produit est désactivé (`is_active === false`) — le RPC filtre les actifs
 *  - les champs invariants du catalogue divergent du cache
 */
export function mergeProductRowIntoList(
    products: Product[],
    row: BarProductRow,
    // bar_products est en REPLICA IDENTITY FULL (migration 20251218150000) : le
    // payload UPDATE contient la ligne AVANT modification — elle permet de savoir
    // si display_name/local_image ont changé DANS CET événement.
    oldRow?: Partial<BarProductRow>,
): Product[] | null {
    const idx = products.findIndex(p => p.id === row.id);
    if (idx === -1) return null;

    if (row.is_active === false) return null;

    const cached = products[idx];

    // Garde-fou invariant catalogue : ne jamais laisser dériver silencieusement
    if ((row.global_product_id ?? undefined) !== cached.globalProductId) return null;
    if (
        row.is_custom_product !== null &&
        cached.isCustomProduct !== undefined &&
        row.is_custom_product !== cached.isCustomProduct
    ) {
        return null;
    }

    // ⚠️ Nom d'affichage : la colonne stockée bar_products.display_name n'est
    // resynchronisée par trigger QUE sur écriture de local_name/global_product_id/
    // is_custom_product — un renommage du catalogue GLOBAL la laisse périmée, alors
    // que le RPC get_bar_products calcule COALESCE(local_name, gp.name) en direct.
    // Avec l'ancienne ligne : si display_name a changé DANS CET événement, le trigger
    // vient de la recalculer → autoritative ; sinon on garde le nom en cache
    // (potentiellement plus frais que la colonne stockée). Sans ancienne ligne :
    // custom → colonne fiable ; lié divergent → refetch (prudence).
    let name = cached.name;
    if (oldRow && 'display_name' in oldRow) {
        if (row.display_name !== oldRow.display_name) name = row.display_name;
    } else if (cached.isCustomProduct) {
        name = row.display_name;
    } else if (row.display_name !== cached.name) {
        return null;
    }

    // ⚠️ Image : display_image = local_image || official_image (jointure RPC), mais
    // official_image n'est PAS dans le payload Realtime. Si local_image vient d'être
    // SUPPRIMÉE dans cet événement, le repli correct (official ou rien) est
    // inconnaissable localement → refetch. Sinon : nouvelle local_image → patch ;
    // local_image inchangée/absente → conserver l'image en cache.
    let image = cached.image;
    if (oldRow && 'local_image' in oldRow && oldRow.local_image !== row.local_image) {
        if (row.local_image) {
            image = row.local_image;
        } else {
            return null; // image locale supprimée → repli inconnaissable → refetch
        }
    } else if (row.local_image) {
        image = row.local_image;
    }

    const next = [...products];
    next[idx] = {
        ...cached,
        name,
        volume: row.volume || '',
        // ⚠️ price/CUMP sont NUMERIC en DB → chaînes dans le payload Realtime
        price: toNumber(row.price, cached.price),
        stock: toNumber(row.stock, 0),
        categoryId: row.local_category_id || '',
        alertThreshold: toNumber(row.alert_threshold, 0),
        updatedAt: row.updated_at ? new Date(row.updated_at) : cached.updatedAt,
        currentAverageCost: toNumber(row.current_average_cost, 0),
        initialUnitCost: toNumber(row.initial_unit_cost, 0),
        lastUnitCost: toNumber(row.last_unit_cost, 0),
        image,
    };
    return next;
}

/**
 * Retire un produit de la liste (DELETE Realtime — payload.old ne contient que l'id).
 * Retourne la même référence si le produit n'était pas dans la liste.
 */
export function removeProductFromList(products: Product[], id: string): Product[] {
    const next = products.filter(p => p.id !== id);
    return next.length === products.length ? products : next;
}

// ============ VENTES ============

/** Sous-ensemble des options de useSales pertinentes pour le filtrage local */
export interface SalesListFilter {
    startDate?: string; // YYYY-MM-DD (business_date)
    endDate?: string;   // YYYY-MM-DD
    status?: string;
    /**
     * Plafond de lignes de la variante (miroir du limit(500) serveur pour les
     * variantes sans bornes de dates — cf. getBarSales Cas 2). Sans lui, une
     * variante non bornée grossirait indéfiniment au fil des INSERT patchés.
     */
    limit?: number;
}

export type SalesListPatch =
    | { type: 'INSERT' | 'UPDATE'; sale: Sale; businessDate: string }
    | { type: 'DELETE'; id: string };

/** Ordre serveur : business_date DESC puis created_at DESC (cf. SalesService.getBarSales) */
const bySaleOrderDesc = (a: Sale, b: Sale): number => {
    const bd = new Date(b.businessDate).getTime() - new Date(a.businessDate).getTime();
    if (bd !== 0) return bd;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
};

/**
 * Applique un événement Realtime de `sales` à UNE variante de liste en cache,
 * en respectant les filtres de cette variante (fenêtre de dates, statut).
 *
 * - INSERT/UPDATE qui matche les filtres → remplace la vente si présente
 *   (dédoublonnage par id OU idempotency_key), sinon l'insère à sa position triée.
 * - UPDATE qui ne matche plus les filtres (ex: pending → validated dans une liste
 *   filtrée status='pending') → retire la vente.
 * - DELETE → retire par id.
 *
 * ⚠️ Ne gère PAS `searchTerm` (ilike côté serveur, non évaluable localement).
 * L'appelant doit invalider ces variantes au lieu d'appeler cette fonction.
 */
export function applySaleEventToList(
    list: Sale[],
    patch: SalesListPatch,
    filter: SalesListFilter,
): Sale[] {
    if (patch.type === 'DELETE') {
        const next = list.filter(s => s.id !== patch.id);
        return next.length === list.length ? list : next;
    }

    const { sale, businessDate } = patch;

    const matchesStatus = !filter.status || sale.status === filter.status;
    const matchesWindow =
        (!filter.startDate || businessDate >= filter.startDate) &&
        (!filter.endDate || businessDate <= filter.endDate);
    const matches = matchesStatus && matchesWindow;

    const idx = list.findIndex(
        s =>
            s.id === sale.id ||
            (!!sale.idempotencyKey && s.idempotencyKey === sale.idempotencyKey),
    );

    if (matches) {
        if (idx === -1) {
            // Fast-path : la nouvelle vente est presque toujours la plus récente
            // → simple prepend, sans re-trier toute la liste sur le thread UI.
            const next = (list.length === 0 || bySaleOrderDesc(sale, list[0]) <= 0)
                ? [sale, ...list]
                : [sale, ...list].sort(bySaleOrderDesc);
            // Miroir du plafond serveur : tronquer aux N plus récentes
            return filter.limit && next.length > filter.limit
                ? next.slice(0, filter.limit)
                : next;
        }
        const prev = list[idx];
        const next = [...list];
        next[idx] = sale;
        // business_date/created_at sont immuables dans les flux actuels (validation,
        // rejet, annulation ne touchent que le statut) — garde-fou si un futur flux
        // altérait une clé de tri : re-tri uniquement dans ce cas (pas de coût sinon).
        if (
            new Date(prev.businessDate).getTime() !== new Date(sale.businessDate).getTime() ||
            new Date(prev.createdAt).getTime() !== new Date(sale.createdAt).getTime()
        ) {
            next.sort(bySaleOrderDesc);
        }
        return next;
    }

    // Ne matche pas les filtres de cette variante
    if (idx !== -1) {
        const next = [...list];
        next.splice(idx, 1);
        return next;
    }
    return list;
}
