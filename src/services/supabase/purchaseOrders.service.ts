import { supabase } from '../../lib/supabase';
import type {
    PurchaseOrder,
    PurchaseOrderSummary,
    PurchaseOrderStatus,
    PurchaseOrderItem,
} from '../../types';
import type { OrderDraftItem } from '../../hooks/useOrderDraft';
import type { Database } from '../../lib/database.types';

type PORow = Database['public']['Tables']['purchase_orders']['Row'];
type POItemRow = Database['public']['Tables']['purchase_order_items']['Row'];

// Shape returned by the join query (items embedded)
type PORowWithItems = PORow & {
    purchase_order_items: (POItemRow & {
        bar_products: { display_name: string; volume: string | null } | null;
    })[];
};

function mapItem(row: POItemRow & { bar_products?: { display_name: string; volume: string | null } | null }): PurchaseOrderItem {
    return {
        id: row.id,
        purchaseOrderId: row.purchase_order_id,
        productId: row.product_id,
        productName: row.bar_products?.display_name ?? 'Produit inconnu',
        productVolume: row.bar_products?.volume ?? '',
        supplierName: row.supplier_name,
        supplierPhone: row.supplier_phone,
        quantity: row.quantity,
        lotSize: row.lot_size,
        lotPrice: row.lot_price,
        unitPrice: row.unit_price,
        receivedQuantity: row.received_quantity,
        createdAt: new Date(row.created_at),
    };
}

function mapOrder(row: PORowWithItems): PurchaseOrder {
    return {
        id: row.id,
        barId: row.bar_id,
        createdBy: row.created_by,
        status: row.status as PurchaseOrderStatus,
        notes: row.notes,
        orderedAt: row.ordered_at ? new Date(row.ordered_at) : null,
        receivedAt: row.received_at ? new Date(row.received_at) : null,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        items: (row.purchase_order_items ?? []).map(mapItem),
    };
}

function computeSummary(row: PORow, items: POItemRow[]): PurchaseOrderSummary {
    const totalCost = items.reduce((acc, i) => {
        const cost = i.lot_price > 0 && i.lot_size > 0
            ? (i.quantity / i.lot_size) * i.lot_price
            : i.quantity * i.unit_price;
        return acc + cost;
    }, 0);

    return {
        id: row.id,
        barId: row.bar_id,
        createdBy: row.created_by,
        status: row.status as PurchaseOrderStatus,
        notes: row.notes,
        orderedAt: row.ordered_at ? new Date(row.ordered_at) : null,
        receivedAt: row.received_at ? new Date(row.received_at) : null,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        itemsCount: items.length,
        totalCost,
    };
}

export class PurchaseOrdersService {
    static async getOrders(barId: string): Promise<PurchaseOrderSummary[]> {
        const { data, error } = await supabase
            .from('purchase_orders')
            .select(`
                *,
                purchase_order_items (
                    id, quantity, lot_size, lot_price, unit_price
                )
            `)
            .eq('bar_id', barId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return (data ?? []).map(row => {
            const items = (row as any).purchase_order_items ?? [];
            return computeSummary(row as PORow, items);
        });
    }

    static async getOrder(orderId: string): Promise<PurchaseOrder> {
        const { data, error } = await supabase
            .from('purchase_orders')
            .select(`
                *,
                purchase_order_items (
                    *,
                    bar_products ( display_name, volume )
                )
            `)
            .eq('id', orderId)
            .single();

        if (error) throw error;
        return mapOrder(data as unknown as PORowWithItems);
    }

    static async createOrder(params: {
        barId: string;
        createdBy: string;
        items: OrderDraftItem[];
        notes?: string;
    }): Promise<PurchaseOrder> {
        // 1. Insert header
        const { data: orderRow, error: orderError } = await supabase
            .from('purchase_orders')
            .insert({
                bar_id: params.barId,
                created_by: params.createdBy,
                notes: params.notes || null,
                status: 'draft',
            })
            .select('*')
            .single();

        if (orderError) throw orderError;

        // 2. Insert items (DB CHECK requires quantity > 0)
        const validItems = params.items.filter(i => i.quantity > 0);
        if (validItems.length === 0) {
            await supabase.from('purchase_orders').delete().eq('id', orderRow.id);
            throw new Error('Aucun article avec quantité > 0');
        }

        const itemsPayload = validItems.map(i => ({
            purchase_order_id: orderRow.id,
            product_id: i.productId,
            quantity: i.quantity,
            lot_size: i.lotSize || 1,
            lot_price: i.lotPrice || 0,
            unit_price: i.unitPrice || 0,
            supplier_name: i.supplier || null,
            supplier_phone: null as string | null,
        }));

        const { error: itemsError } = await supabase
            .from('purchase_order_items')
            .insert(itemsPayload);

        if (itemsError) {
            // Rollback header best-effort
            await supabase.from('purchase_orders').delete().eq('id', orderRow.id);
            throw itemsError;
        }

        return this.getOrder(orderRow.id);
    }

    static async markAsOrdered(orderId: string): Promise<void> {
        const { error } = await supabase
            .from('purchase_orders')
            .update({ status: 'ordered', ordered_at: new Date().toISOString() })
            .eq('id', orderId);

        if (error) throw error;
    }

    static async cancelOrder(orderId: string): Promise<void> {
        const { error } = await supabase
            .from('purchase_orders')
            .update({ status: 'cancelled' })
            .eq('id', orderId);

        if (error) throw error;
    }

    static async convertToSupplies(params: {
        orderId: string;
        userId: string;
        receivedItems: { itemId: string; receivedQuantity: number }[];
    }): Promise<{ status: PurchaseOrderStatus; suppliesCreated: number }> {
        const { data, error } = await supabase.rpc('convert_purchase_order_to_supplies', {
            p_order_id: params.orderId,
            p_user_id: params.userId,
            p_received_items: params.receivedItems.map(i => ({
                item_id: i.itemId,
                received_quantity: i.receivedQuantity,
            })),
        });

        if (error) throw error;

        const result = data as { success: boolean; status: string; supplies_created: { item_id: string }[] };
        if (!result?.success) throw new Error('Conversion échouée');

        return {
            status: result.status as PurchaseOrderStatus,
            suppliesCreated: result.supplies_created?.length ?? 0,
        };
    }

    static async closePartialOrder(params: {
        orderId: string;
        reason?: string;
    }): Promise<{ status: PurchaseOrderStatus }> {
        const { data, error } = await supabase.rpc('close_partial_purchase_order', {
            p_order_id: params.orderId,
            p_reason: params.reason || undefined,
        });

        if (error) throw error;

        const result = data as { success: boolean; status: string } | null;
        if (!result?.success) throw new Error('Clôture échouée');

        return { status: result.status as PurchaseOrderStatus };
    }
}
