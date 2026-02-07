import { z } from 'zod';

/**
 * Schémas de validation pour les opérations offline
 * Garantit l'intégrité des données avant stockage dans IndexedDB
 */

export const SaleItemSchema = z.object({
    product_id: z.string().uuid(),
    product_name: z.string(),
    quantity: z.number().positive(),
    unit_price: z.number().nonnegative(),
    total_price: z.number().nonnegative(),
    original_unit_price: z.number().optional(),
    discount_amount: z.number().optional(),
    promotion_id: z.string().uuid().optional(),
});

export const CreateSaleSchema = z.object({
    bar_id: z.string().uuid(),
    items: z.array(SaleItemSchema).min(1),
    payment_method: z.enum(['cash', 'mobile_money', 'card', 'credit', 'ticket']),
    sold_by: z.string().uuid(),
    server_id: z.string().uuid().nullable().optional(),
    status: z.string(),
    customer_name: z.string().nullable().optional(),
    customer_phone: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    business_date: z.string().nullable().optional(),
    ticket_id: z.string().nullable().optional(),
    idempotency_key: z.string(),
});

export const CreateTicketSchema = z.object({
    bar_id: z.string().uuid(),
    created_by: z.string().uuid(),
    notes: z.string().nullable().optional(),
    server_id: z.string().uuid().nullable().optional(),
    closing_hour: z.number(),
    table_number: z.number().nullable().optional(),
    customer_name: z.string().nullable().optional(),
    idempotency_key: z.string(),
    temp_id: z.string(),
});

export const PayTicketSchema = z.object({
    ticket_id: z.string(),
    paid_by: z.string().uuid(),
    payment_method: z.string(),
    idempotency_key: z.string(),
});

export const UpdateBarSchema = z.object({
    barId: z.string().uuid(),
    updates: z.record(z.string(), z.any()), // On pourra affiner davantage si nécessaire
});

export const CreateReturnSchema = z.object({
    bar_id: z.string().uuid(),
    sale_id: z.string().uuid(),
    product_id: z.string().uuid(),
    quantity_returned: z.number().positive(),
    refund_amount: z.number().nonnegative(),
    reason: z.string().nullable().optional(),
    returned_by: z.string().uuid(),
    business_date: z.string().nullable().optional(),
});

export const UpdateReturnSchema = z.object({
    id: z.string().uuid(),
    updates: z.record(z.string(), z.any()),
});

export const AddExpenseSchema = z.object({
    bar_id: z.string().uuid(),
    amount: z.number().positive(),
    category: z.string(),
    description: z.string().nullable().optional(),
    expense_date: z.string(),
    created_by: z.string().uuid(),
});

export const AddSupplySchema = z.object({
    bar_id: z.string().uuid(),
    product_id: z.string().uuid(),
    quantity: z.number().positive(),
    unit_cost: z.number().nonnegative(),
    total_cost: z.number().nonnegative(),
    supply_date: z.string(),
    created_by: z.string().uuid(),
});

export const CreateProductSchema = z.object({
    bar_id: z.string().uuid(),
    local_name: z.string(),
    unit_price: z.number().nonnegative(),
    current_stock: z.number().nonnegative(),
});

export const UpdateProductSchema = z.object({
    id: z.string().uuid(),
    updates: z.record(z.string(), z.any()),
});

export const DeleteProductSchema = z.object({
    id: z.string().uuid(),
});

export const CreateConsignmentSchema = z.object({
    bar_id: z.string().uuid(),
    sale_id: z.string().uuid(),
    product_id: z.string().uuid(),
    quantity: z.number().positive(),
});

export const UpdateConsignmentSchema = z.object({
    id: z.string().uuid(),
    status: z.string(),
    updates: z.record(z.string(), z.any()).optional(),
});

export const CreateServerMappingSchema = z.object({
    barId: z.string().uuid(),
    serverName: z.string(),
    userId: z.string().uuid(),
});

export const CreateStockAdjustmentSchema = z.object({
    bar_id: z.string().uuid(),
    product_id: z.string().uuid(),
    delta: z.number(),
    reason: z.string(),
    notes: z.string().nullable().optional(),
});

export const MutationSchemas: Record<string, z.ZodType<any>> = {
    'CREATE_SALE': CreateSaleSchema,
    'CREATE_TICKET': CreateTicketSchema,
    'PAY_TICKET': PayTicketSchema,
    'UPDATE_BAR': UpdateBarSchema,
    'CREATE_RETURN': CreateReturnSchema,
    'UPDATE_RETURN': UpdateReturnSchema,
    'ADD_EXPENSE': AddExpenseSchema,
    'ADD_SALARY': AddExpenseSchema,
    'ADD_SUPPLY': AddSupplySchema,
    'CREATE_PRODUCT': CreateProductSchema,
    'UPDATE_PRODUCT': UpdateProductSchema,
    'DELETE_PRODUCT': DeleteProductSchema,
    'CREATE_CONSIGNMENT': CreateConsignmentSchema,
    'CLAIM_CONSIGNMENT': UpdateConsignmentSchema,
    'FORFEIT_CONSIGNMENT': UpdateConsignmentSchema,
    'CREATE_SERVER_MAPPING': CreateServerMappingSchema,
    'CREATE_STOCK_ADJUSTMENT': CreateStockAdjustmentSchema,
};
