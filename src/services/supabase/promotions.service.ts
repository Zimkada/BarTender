/**
 * Service de gestion des promotions
 * 
 * Gère les promotions commerciales (bundle, prix spécial, réductions)
 * avec calcul automatique du meilleur prix et historique des applications.
 * 
 * @module promotions.service
 */

import { z } from 'zod';
import { supabase } from '../../lib/supabase';
import { Promotion, PromotionApplication, Product, PromotionPriceResult } from '../../types';
import type { Database } from '../../lib/database.types';
import { getErrorMessage } from '../../utils/errorHandler';

type PromotionRow = Database['public']['Tables']['promotions']['Row'];
type PromotionInsert = Database['public']['Tables']['promotions']['Insert'];
type PromotionUpdate = Database['public']['Tables']['promotions']['Update'];

// ✅ Zod Schemas for Runtime Validation
const PromotionGlobalStatsSchema = z.object({
    total_revenue: z.coerce.number().default(0),
    total_discount: z.coerce.number().default(0),
    total_applications: z.coerce.number().default(0),
    total_cost_of_goods: z.coerce.number().default(0),
    net_profit: z.coerce.number().default(0),
    margin_percentage: z.coerce.number().default(0),
    roi_percentage: z.coerce.number().default(0),
});

const PromotionPerformanceStatSchema = z.object({
    promotion_id: z.string(),
    promotion_name: z.string(),
    total_applications: z.coerce.number().default(0),
    total_revenue: z.coerce.number().default(0),
    total_discount: z.coerce.number().default(0),
    total_cost_of_goods: z.coerce.number().default(0),
    net_profit: z.coerce.number().default(0),
    margin_percentage: z.coerce.number().default(0),
    roi_percentage: z.coerce.number().default(0),
});

/**
 * ✅ Type-safe result interface for promotion performance analytics
 */
export interface PromotionPerformanceResult {
    id: string;
    name: string;
    uses: number;
    revenue: number;
    discount: number;
    costOfGoods: number;
    netProfit: number;
    marginPercentage: number;
    roi: number;
}

/**
 * Convertit les données SQL (snake_case) en objet TypeScript (camelCase)
 */
function mapDbPromoToPromotion(dbPromo: PromotionRow): Promotion {
    return {
        id: dbPromo.id,
        barId: dbPromo.bar_id,
        name: dbPromo.name,
        description: dbPromo.description || '',
        type: dbPromo.type as Promotion['type'],
        status: (dbPromo.status as Promotion['status']) || 'inactive',
        targetType: dbPromo.target_type as Promotion['targetType'],
        targetProductIds: dbPromo.target_product_ids ? (dbPromo.target_product_ids as string[]) : [],
        targetCategoryIds: dbPromo.target_category_ids ? (dbPromo.target_category_ids as string[]) : [],
        bundleQuantity: dbPromo.bundle_quantity || 0,
        bundlePrice: dbPromo.bundle_price || 0,
        discountAmount: dbPromo.discount_amount || 0,
        discountPercentage: dbPromo.discount_percentage || 0,
        specialPrice: dbPromo.special_price || 0,
        timeStart: dbPromo.time_start || undefined,
        timeEnd: dbPromo.time_end || undefined,
        startDate: dbPromo.start_date || '',
        endDate: dbPromo.end_date || undefined,
        isRecurring: dbPromo.is_recurring || false,
        recurrenceDays: dbPromo.recurrence_days ? (dbPromo.recurrence_days as number[]) : [],
        maxUsesPerCustomer: dbPromo.max_uses_per_customer || undefined,
        maxTotalUses: dbPromo.max_total_uses || undefined,
        currentUses: dbPromo.current_uses || 0,
        priority: dbPromo.priority || 0,
        createdBy: dbPromo.created_by || '',
        createdAt: new Date(dbPromo.created_at || new Date().toISOString()),
        updatedAt: new Date(dbPromo.updated_at || new Date().toISOString())
    };
}

/**
 * Convertit un objet Promotion (camelCase) en données SQL (snake_case)
 */
function mapPromotionToDbPromo(promo: Partial<Promotion>): PromotionUpdate {
    const dbPromo: PromotionUpdate = {};

    if (promo.barId !== undefined) dbPromo.bar_id = promo.barId;
    if (promo.name !== undefined) dbPromo.name = promo.name;
    if (promo.description !== undefined) dbPromo.description = promo.description;
    if (promo.type !== undefined) dbPromo.type = promo.type;
    if (promo.status !== undefined) dbPromo.status = promo.status;
    if (promo.targetType !== undefined) dbPromo.target_type = promo.targetType;
    if (promo.targetProductIds !== undefined) dbPromo.target_product_ids = promo.targetProductIds;
    if (promo.targetCategoryIds !== undefined) dbPromo.target_category_ids = promo.targetCategoryIds;
    if (promo.bundleQuantity !== undefined) dbPromo.bundle_quantity = promo.bundleQuantity;
    if (promo.bundlePrice !== undefined) dbPromo.bundle_price = promo.bundlePrice;
    if (promo.discountAmount !== undefined) dbPromo.discount_amount = promo.discountAmount;
    if (promo.discountPercentage !== undefined) dbPromo.discount_percentage = promo.discountPercentage;
    if (promo.specialPrice !== undefined) dbPromo.special_price = promo.specialPrice;
    if (promo.timeStart !== undefined) dbPromo.time_start = promo.timeStart;
    if (promo.timeEnd !== undefined) dbPromo.time_end = promo.timeEnd;
    if (promo.startDate !== undefined) dbPromo.start_date = promo.startDate;
    if (promo.endDate !== undefined) dbPromo.end_date = promo.endDate;
    if (promo.isRecurring !== undefined) dbPromo.is_recurring = promo.isRecurring;
    if (promo.recurrenceDays !== undefined) dbPromo.recurrence_days = promo.recurrenceDays;
    if (promo.maxUsesPerCustomer !== undefined) dbPromo.max_uses_per_customer = promo.maxUsesPerCustomer;
    if (promo.maxTotalUses !== undefined) dbPromo.max_total_uses = promo.maxTotalUses;
    if (promo.currentUses !== undefined) dbPromo.current_uses = promo.currentUses;
    if (promo.priority !== undefined) dbPromo.priority = promo.priority;
    if (promo.createdBy !== undefined) dbPromo.created_by = promo.createdBy;

    return dbPromo;
}

export const PromotionsService = {
    /**
     * Récupère les promotions actives pour un bar
     */
    async getActivePromotions(barId: string, productId?: string, categoryId?: string): Promise<Promotion[]> {
        try {
            const now = new Date();
            const currentDate = now.toISOString().split('T')[0];
            const currentTime = now.toTimeString().split(' ')[0].substring(0, 5);
            const currentDayOfWeek = now.getDay();

            const { data, error } = await supabase
                .from('promotions')
                .select('*')
                .eq('bar_id', barId)
                .eq('status', 'active')
                .lte('start_date', currentDate)
                .or(`end_date.is.null,end_date.gte.${currentDate}`);

            if (error) throw error;

            const promotions = (data || []).map((row) => mapDbPromoToPromotion(row as PromotionRow));

            return promotions.filter(promo => {
                if (promo.isRecurring && promo.recurrenceDays && promo.recurrenceDays.length > 0) {
                    if (!promo.recurrenceDays.includes(currentDayOfWeek)) return false;
                }
                if (promo.timeStart && promo.timeEnd) {
                    if (currentTime < promo.timeStart || currentTime > promo.timeEnd) return false;
                }
                if (promo.maxTotalUses && promo.currentUses >= promo.maxTotalUses) return false;
                if (promo.targetType === 'product' && productId) {
                    if (!promo.targetProductIds?.includes(productId)) return false;
                } else if (promo.targetType === 'category' && categoryId) {
                    if (!promo.targetCategoryIds?.includes(categoryId)) return false;
                }
                return true;
            });
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            console.error('Erreur récupération promotions actives:', errorMessage);
            throw new Error(errorMessage);
        }
    },

    /**
     * Calcule le meilleur prix pour un produit avec les promotions applicables
     */
    calculateBestPrice(
        product: Product,
        quantity: number,
        promotions: Promotion[]
    ): PromotionPriceResult {
        const originalPrice = product.price * quantity;
        let bestPrice = originalPrice;
        let bestPromotion: Promotion | undefined;

        for (const promo of promotions) {
            let calculatedPrice = originalPrice;

            switch (promo.type) {
                case 'lot':
                case 'bundle':
                    const bundleQty = promo.bundleQuantity || 0;
                    const bundlePrice = promo.bundlePrice || 0;
                    if (bundleQty > 0 && bundlePrice > 0 && quantity >= bundleQty) {
                        const bundles = Math.floor(quantity / bundleQty);
                        const remaining = quantity % bundleQty;
                        calculatedPrice = bundles * bundlePrice + remaining * product.price;
                    }
                    break;

                case 'prix_special':
                case 'special_price':
                    const specialPrice = promo.specialPrice || 0;
                    if (specialPrice > 0) calculatedPrice = specialPrice * quantity;
                    break;

                case 'reduction_vente':
                case 'fixed_discount':
                    const discountAmount = promo.discountAmount || 0;
                    if (discountAmount > 0) calculatedPrice = Math.max(0, originalPrice - discountAmount);
                    break;

                case 'pourcentage':
                case 'percentage':
                    const discountPercentage = promo.discountPercentage || 0;
                    if (discountPercentage > 0 && discountPercentage <= 100) {
                        calculatedPrice = originalPrice * (1 - discountPercentage / 100);
                    }
                    break;

                case 'reduction_produit':
                    const discountPerUnit = promo.discountAmount || 0;
                    if (discountPerUnit > 0) calculatedPrice = Math.max(0, originalPrice - (discountPerUnit * quantity));
                    break;

                case 'majoration_produit':
                    const surchargePerUnit = promo.discountAmount || 0;
                    if (surchargePerUnit > 0) calculatedPrice = originalPrice + (surchargePerUnit * quantity);
                    break;
            }

            if (calculatedPrice < bestPrice ||
                (calculatedPrice === bestPrice && (promo.priority > (bestPromotion?.priority || 0)))) {
                bestPrice = calculatedPrice;
                bestPromotion = promo;
            }
        }

        return {
            finalPrice: Math.round(bestPrice * 100) / 100,
            originalPrice,
            discount: Math.round((originalPrice - bestPrice) * 100) / 100,
            appliedPromotion: bestPromotion
        };
    },

    /**
     * Enregistre l'application d'une promotion à une vente
     */
    async recordApplication(
        application: Omit<PromotionApplication, 'id' | 'appliedAt'>
    ): Promise<void> {
        try {
            const dbApplication = {
                bar_id: application.barId,
                promotion_id: application.promotionId,
                sale_id: application.saleId,
                product_id: application.productId,
                quantity_sold: application.quantitySold,
                original_price: application.originalPrice,
                discounted_price: application.discountedPrice,
                discount_amount: application.discountAmount,
                applied_by: application.appliedBy
            };

            const { error: insertError } = await supabase
                .from('promotion_applications')
                .insert(dbApplication);

            if (insertError) throw insertError;

            const { error: rpcError } = await supabase.rpc('increment_promotion_uses', {
                p_promotion_id: application.promotionId
            });

            if (rpcError) {
                console.warn('Erreur incrémentation compteur (non bloquant):', getErrorMessage(rpcError));
            }
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            console.error('Erreur enregistrement application promotion:', errorMessage);
            throw new Error(errorMessage);
        }
    },

    /**
     * Crée une nouvelle promotion
     */
    async createPromotion(
        promotion: Omit<Promotion, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<Promotion> {
        try {
            const dbPromo = mapPromotionToDbPromo(promotion) as PromotionInsert;

            const { data, error } = await supabase
                .from('promotions')
                .insert(dbPromo)
                .select()
                .single();

            if (error) throw error;
            return mapDbPromoToPromotion(data as PromotionRow);
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            console.error('Erreur création promotion:', errorMessage);
            throw new Error(errorMessage);
        }
    },

    /**
     * Met à jour une promotion existante
     */
    async updatePromotion(
        id: string,
        updates: Partial<Promotion>
    ): Promise<Promotion> {
        try {
            const dbUpdates = mapPromotionToDbPromo(updates);
            dbUpdates.updated_at = new Date().toISOString();

            const { data, error } = await supabase
                .from('promotions')
                .update(dbUpdates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return mapDbPromoToPromotion(data as PromotionRow);
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            console.error('Erreur mise à jour promotion:', errorMessage);
            throw new Error(errorMessage);
        }
    },

    /**
     * Supprime une promotion
     */
    async deletePromotion(id: string): Promise<void> {
        try {
            const { error } = await supabase
                .from('promotions')
                .delete()
                .eq('id', id);

            if (error) throw error;
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            console.error('Erreur suppression promotion:', errorMessage);
            throw new Error(errorMessage);
        }
    },

    /**
     * Récupère toutes les promotions d'un bar
     */
    async getAllPromotions(barId: string): Promise<Promotion[]> {
        try {
            const { data, error } = await supabase
                .from('promotions')
                .select('*')
                .eq('bar_id', barId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return (data || []).map((row) => mapDbPromoToPromotion(row as PromotionRow));
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            console.error('Erreur récupération promotions:', errorMessage);
            throw new Error(errorMessage);
        }
    },

    /**
     * Récupère les statistiques globales des promotions pour un bar
     */
    async getGlobalStats(
        barId: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<{
        totalRevenue: number;
        totalDiscount: number;
        totalApplications: number;
        totalCostOfGoods: number;
        netProfit: number;
        marginPercentage: number;
        roi: number;
    }> {
        try {
            const { data, error } = await supabase.rpc('get_bar_global_promotion_stats_with_profit', {
                p_bar_id: barId,
                p_start_date: startDate?.toISOString() || undefined,
                p_end_date: endDate?.toISOString() || undefined
            }).single();

            if (error) throw error;

            // ✅ Runtime validation with Zod (No more unsafe cast)
            const stats = PromotionGlobalStatsSchema.parse(data);

            return {
                totalRevenue: stats.total_revenue,
                totalDiscount: stats.total_discount,
                totalApplications: stats.total_applications,
                totalCostOfGoods: stats.total_cost_of_goods,
                netProfit: stats.net_profit,
                marginPercentage: stats.margin_percentage,
                roi: stats.roi_percentage
            };
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            console.error('Erreur récupération stats globales promotions:', errorMessage);
            // Return zeros instead of throwing to avoid breaking the UI
            return {
                totalRevenue: 0,
                totalDiscount: 0,
                totalApplications: 0,
                totalCostOfGoods: 0,
                netProfit: 0,
                marginPercentage: 0,
                roi: 0
            };
        }
    },

    /**
     * Récupère les performances par promotion
     */
    async getPromotionsPerformance(
        barId: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<PromotionPerformanceResult[]> {
        try {
            const { data, error } = await supabase.rpc('get_bar_promotion_stats_with_profit', {
                p_bar_id: barId,
                p_start_date: startDate?.toISOString() || undefined,
                p_end_date: endDate?.toISOString() || undefined
            });

            if (error) throw error;

            // ✅ Type-safe mapping with Zod validation
            return (data || []).map((item) => {
                const stat = PromotionPerformanceStatSchema.parse(item);
                return {
                    id: stat.promotion_id,
                    name: stat.promotion_name,
                    uses: stat.total_applications,
                    revenue: stat.total_revenue,
                    discount: stat.total_discount,
                    costOfGoods: stat.total_cost_of_goods,
                    netProfit: stat.net_profit,
                    marginPercentage: stat.margin_percentage,
                    roi: stat.roi_percentage
                };
            });
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            console.error('Erreur récupération performance promotions:', errorMessage);
            return [];
        }
    },

    /**
     * Active automatiquement les promotions programmées
     * À appeler périodiquement (ex: au démarrage de l'app)
     */
    async autoActivateScheduled(): Promise<void> {
        try {
            const { error } = await supabase.rpc('auto_activate_scheduled_promotions');
            if (error) throw error;
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            console.error('Erreur activation automatique:', errorMessage);
        }
    },

    /**
     * Expire automatiquement les promotions dont la date de fin est dépassée
     * À appeler périodiquement (ex: au démarrage de l'app)
     */
    async autoExpirePromotions(): Promise<void> {
        try {
            const { error } = await supabase.rpc('auto_expire_promotions');
            if (error) throw error;
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            console.error('Erreur expiration automatique:', errorMessage);
        }
    }
};
