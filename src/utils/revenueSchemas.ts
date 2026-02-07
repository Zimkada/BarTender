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

export const SaleSchema = z.object({
    id: z.string(), // Peut être UUID ou temp ID string
    barId: z.string().uuid(),
    total: z.number().min(0), // Total de la vente
    status: z.enum(['pending', 'validated', 'rejected', 'cancelled']),
    soldBy: z.string().uuid(),
    items: z.array(SaleItemSchema),
    createdAt: z.string().datetime().or(z.date()), // Accepte Date ou ISO string
    validatedAt: z.string().datetime().or(z.date()).optional(),
    rejectedAt: z.string().datetime().or(z.date()).optional(),
    cancelledAt: z.string().datetime().or(z.date()).optional(),
    businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.date()), // YYYY-MM-DD ou Date
    idempotencyKey: z.string().optional(),
    isOptimistic: z.boolean().optional(),
});

export const ReturnSchema = z.object({
    id: z.string().uuid(),
    barId: z.string().uuid(),
    saleId: z.string().uuid(),
    productId: z.string().uuid(),
    quantityReturned: z.number().min(0),
    refundAmount: z.number().min(0),
    status: z.enum(['pending', 'approved', 'rejected', 'restocked']),
    isRefunded: z.boolean(),
    returnedBy: z.string().uuid(),
    serverId: z.string().uuid().optional(),
    returnedAt: z.string().datetime().or(z.date()),
    businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.date()),
});

export const MinimalOfflineSaleSchema = z.object({
    idempotency_key: z.string().optional(),
    total: z.number().min(0),
    sold_by: z.string().uuid(),
});

// --- Types Inférés ---
export type ValidatedSale = z.infer<typeof SaleSchema>;
export type ValidatedReturn = z.infer<typeof ReturnSchema>;
export type ValidatedOfflineSale = z.infer<typeof MinimalOfflineSaleSchema>;
