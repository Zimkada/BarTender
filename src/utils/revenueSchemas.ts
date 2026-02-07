import { z } from 'zod';

// --- Schémas de Base ---

export const SaleItemSchema = z.object({
    product_id: z.string().uuid(),
    product_name: z.string(),
    quantity: z.number().min(0), // Quantité positive
    unit_price: z.number().min(0), // Prix positif
    total_price: z.number().min(0), // Total positif
    original_unit_price: z.number().min(0).optional(),
    discount_amount: z.number().min(0).optional(),
    promotion_id: z.string().uuid().optional(),
    promotion_name: z.string().optional(),
});

// Helper to map DB casing to CamelCase
const mapSaleToCamel = (val: unknown) => {
    if (typeof val === 'object' && val !== null) {
        const v = val as any;
        return {
            ...v,
            barId: v.barId ?? v.bar_id,
            soldBy: v.soldBy ?? v.sold_by,
            createdAt: v.createdAt ?? v.created_at,
            validatedAt: v.validatedAt ?? v.validated_at,
            rejectedAt: v.rejectedAt ?? v.rejected_at,
            cancelledAt: v.cancelledAt ?? v.cancelled_at,
            businessDate: v.businessDate ?? v.business_date,
            idempotencyKey: v.idempotencyKey ?? v.idempotency_key,
            isOptimistic: v.isOptimistic ?? v.is_optimistic,
        };
    }
    return val;
};

// Schema for full sale entities
export const SaleSchema = z.preprocess(mapSaleToCamel, z.object({
    id: z.string(), // Peut être UUID ou temp ID string
    barId: z.string().uuid(),
    total: z.number().min(0), // Total de la vente
    status: z.enum(['pending', 'validated', 'rejected', 'cancelled']),
    soldBy: z.string().uuid(),
    items: z.array(SaleItemSchema).optional().default([]),
    createdAt: z.string().datetime().or(z.date()),
    validatedAt: z.string().datetime().or(z.date()).optional().nullable(),
    rejectedAt: z.string().datetime().or(z.date()).optional().nullable(),
    cancelledAt: z.string().datetime().or(z.date()).optional().nullable(),
    businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.date()),
    idempotencyKey: z.string().optional().nullable(),
    isOptimistic: z.boolean().optional(),
}));

/**
 * Schema for Revenue Calculation
 * More lenient: accepts partial objects (e.g. from optimized SQL queries)
 * as long as they have the fields required for calculation.
 */
export const CalculableSaleSchema = z.preprocess(mapSaleToCamel, z.object({
    id: z.string().optional(), // Optional for calculation
    barId: z.string().uuid().optional(), // Optional for calculation
    total: z.number().min(0),
    status: z.enum(['pending', 'validated', 'rejected', 'cancelled']),
    soldBy: z.string().uuid(),
    items: z.array(SaleItemSchema).optional().default([]),
    createdAt: z.string().datetime().or(z.date()).optional(), // Optional
    businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.date()), // Required for filtering
    idempotencyKey: z.string().optional().nullable(),
    isOptimistic: z.boolean().optional(),
}));

const mapReturnToCamel = (val: unknown) => {
    if (typeof val === 'object' && val !== null) {
        const v = val as any;
        return {
            ...v,
            barId: v.barId ?? v.bar_id,
            saleId: v.saleId ?? v.sale_id,
            productId: v.productId ?? v.product_id,
            quantityReturned: v.quantityReturned ?? v.quantity_returned,
            refundAmount: v.refundAmount ?? v.refund_amount,
            isRefunded: v.isRefunded ?? v.is_refunded,
            returnedBy: v.returnedBy ?? v.returned_by,
            serverId: v.serverId ?? v.server_id ?? v.user_id, // handling alias
            returnedAt: v.returnedAt ?? v.returned_at ?? v.created_at,
            businessDate: v.businessDate ?? v.business_date,
        };
    }
    return val;
};

export const ReturnSchema = z.preprocess(mapReturnToCamel, z.object({
    id: z.string().uuid(),
    barId: z.string().uuid(),
    saleId: z.string().uuid(),
    productId: z.string().uuid(),
    quantityReturned: z.number().min(0),
    refundAmount: z.number().min(0),
    status: z.enum(['pending', 'approved', 'rejected', 'restocked']),
    isRefunded: z.boolean(),
    returnedBy: z.string().uuid(),
    serverId: z.string().uuid().optional().nullable(),
    returnedAt: z.string().datetime().or(z.date()),
    businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.date()),
}));

export const MinimalOfflineSaleSchema = z.preprocess(mapSaleToCamel, z.object({
    idempotencyKey: z.string().optional().nullable(),
    total: z.number().min(0),
    soldBy: z.string().uuid(),
}));

// --- Types Inférés ---
export type ValidatedSale = z.infer<typeof SaleSchema>;
export type ValidatedCalculableSale = z.infer<typeof CalculableSaleSchema>;
export type ValidatedReturn = z.infer<typeof ReturnSchema>;
export type ValidatedOfflineSale = z.infer<typeof MinimalOfflineSaleSchema>;
