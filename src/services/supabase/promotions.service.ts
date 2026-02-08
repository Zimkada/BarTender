/**
 * Service de gestion des promotions
 * 
 * Gère les promotions commerciales (bundle, prix spécial, réductions)
 * avec calcul automatique du meilleur prix et historique des applications.
 * 
 * @module promotions.service
 */

import { supabase } from '../../lib/supabase';
import { Promotion, PromotionApplication, Product, PromotionPriceResult } from '../../types';
import type { Database } from '../../lib/database.types';
import { getErrorMessage } from '../../utils/errorHandler';

type PromotionRow = Database['public']['Tables']['promotions']['Row'];
type PromotionInsert = Database['public']['Tables']['promotions']['Insert'];
type PromotionUpdate = Database['public']['Tables']['promotions']['Update'];

interface PromotionGlobalStats {
    total_revenue: number;
    total_discount: number;
    total_applications: number;
    total_cost_of_goods: number;
    net_profit: number;
    margin_percentage: number;
    roi_percentage: number;
}

interface PromotionPerformanceStat {
    promotion_id: string;
    promotion_name: string;
    total_applications: number;
    total_revenue: number;
    total_discount: number;
    total_cost_of_goods: number;
    net_profit: number;
    margin_percentage: number;
    roi_percentage: number;
}

/**
 * ✅ Type-safe result interface for promotion performance analytics
 * Returned by getPromotionsPerformance() with aggregated metrics
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
 * Résout le mismatch entre les conventions SQL et TypeScript
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
     * Filtre par date, horaires (Happy Hour), jours de récurrence, et ciblage produit/catégorie
     *
     * @param barId - ID du bar
     * @param productId - ID du produit (optionnel, pour filtrage)
     * @param categoryId - ID de la catégorie du produit (optionnel, pour filtrage)
     * @returns Liste des promotions actives applicables
     *
     * @example
     * const promos = await PromotionsService.getActivePromotions('bar-123', 'product-456', 'category-789');
     */
    async getActivePromotions(barId: string, productId?: string, categoryId?: string): Promise<Promotion[]> {
        const now = new Date();
        const currentDate = now.toISOString().split('T')[0];
        const currentTime = now.toTimeString().split(' ')[0].substring(0, 5); // HH:MM
        const currentDayOfWeek = now.getDay(); // 0=Dimanche, 1=Lundi, ..., 6=Samedi

        // Requête de base : promotions actives dans la plage de dates
        const query = supabase
            .from('promotions')
            .select('*')
            .eq('bar_id', barId)
            .eq('status', 'active')
            .lte('start_date', currentDate)
            .or(`end_date.is.null,end_date.gte.${currentDate}`);

        const { data, error } = await query;

        if (error) {
            console.error('Erreur récupération promotions:', error);
            throw error;
        }

        // Mapper les données DB (snake_case) vers TypeScript (camelCase)
        const promotions = (data || []).map((row) => mapDbPromoToPromotion(row as PromotionRow));

        // Filtrage côté client pour logique complexe
        return promotions.filter(promo => {
            // 1. Vérifier récurrence (jours de la semaine)
            if (promo.isRecurring && promo.recurrenceDays && promo.recurrenceDays.length > 0) {
                if (!promo.recurrenceDays.includes(currentDayOfWeek)) {
                    return false;
                }
            }

            // 2. Vérifier horaires (Happy Hour)
            if (promo.timeStart && promo.timeEnd) {
                if (currentTime < promo.timeStart || currentTime > promo.timeEnd) {
                    return false;
                }
            }

            // 3. Vérifier limite d'utilisations globale
            if (promo.maxTotalUses && promo.currentUses >= promo.maxTotalUses) {
                return false;
            }

            // 4. Vérifier ciblage produit/catégorie
            if (promo.targetType === 'product' && productId) {
                if (!promo.targetProductIds?.includes(productId)) {
                    return false;
                }
            } else if (promo.targetType === 'category' && categoryId) {
                if (!promo.targetCategoryIds?.includes(categoryId)) {
                    return false;
                }
            }
            // Si targetType === 'all', pas de filtrage nécessaire

            return true;
        });
    },

    /**
     * Calcule le meilleur prix pour un produit avec les promotions applicables
     * Compare toutes les promotions et retourne celle qui offre le meilleur prix
     *
     * IMPORTANT: Cette fonction ne vérifie PAS les contraintes suivantes (à gérer côté appelant):
     * - Limite d'utilisations par client (maxUsesPerCustomer)
     * - Stock disponible suffisant pour les bundles
     *
     * @param product - Produit concerné
     * @param quantity - Quantité achetée
     * @param promotions - Liste des promotions applicables (déjà filtrées par getActivePromotions)
     * @returns Résultat avec prix final, prix original, économie, et promotion appliquée
     *
     * @example
     * const activePromos = await PromotionsService.getActivePromotions(barId, productId, categoryId);
     * const result = PromotionsService.calculateBestPrice(product, 3, activePromos);
     * console.log(`Prix: ${result.finalPrice} FCFA (économie: ${result.discount} FCFA)`);
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
                // ===== Types français (nouveaux) =====
                case 'lot':
                    // Exemple: 3 bières à 1000 FCFA au lieu de 1050 FCFA (3 × 350)
                    // Appliqué seulement si la quantité atteint le seuil du bundle
                    const bundleQty = promo.bundleQuantity || 0;
                    const bundlePrice = promo.bundlePrice || 0;

                    if (bundleQty > 0 && bundlePrice > 0 && quantity >= bundleQty) {
                        const bundles = Math.floor(quantity / bundleQty);
                        const remaining = quantity % bundleQty;
                        calculatedPrice = bundles * bundlePrice + remaining * product.price;
                    }
                    break;

                case 'prix_special':
                    // Exemple: Bière à 300 FCFA au lieu de 350 FCFA
                    const specialPrice = promo.specialPrice || 0;
                    if (specialPrice > 0) {
                        calculatedPrice = specialPrice * quantity;
                    }
                    break;

                case 'reduction_vente':
                    // Exemple: -50 FCFA sur le total (pas × quantité)
                    // Prix: 350 FCFA × 3 = 1050 FCFA → 1050 - 50 = 1000 FCFA
                    const discountAmount = promo.discountAmount || 0;
                    if (discountAmount > 0) {
                        calculatedPrice = Math.max(0, originalPrice - discountAmount);
                    }
                    break;

                case 'pourcentage':
                    // Exemple: -10% sur le total
                    const discountPercentage = promo.discountPercentage || 0;
                    if (discountPercentage > 0 && discountPercentage <= 100) {
                        calculatedPrice = originalPrice * (1 - discountPercentage / 100);
                    }
                    break;

                case 'reduction_produit':
                    // Nouveau: Réduction par unité × quantité
                    // Exemple: -20 FCFA par unité → 3 × 20 = -60 FCFA total
                    // Prix: 350 FCFA × 3 = 1050 FCFA → 1050 - 60 = 990 FCFA
                    const discountPerUnit = promo.discountAmount || 0;
                    if (discountPerUnit > 0) {
                        calculatedPrice = Math.max(0, originalPrice - (discountPerUnit * quantity));
                    }
                    break;

                case 'majoration_produit':
                    // Nouveau: Majoration par unité × quantité (prix augmente)
                    // Exemple: +30 FCFA par unité → 3 × 30 = +90 FCFA total
                    // Prix: 350 FCFA × 3 = 1050 FCFA → 1050 + 90 = 1140 FCFA
                    const surchargePerUnit = promo.discountAmount || 0;
                    if (surchargePerUnit > 0) {
                        calculatedPrice = originalPrice + (surchargePerUnit * quantity);
                    }
                    break;

                // ===== Types anglais (anciens, rétro-compatibilité) =====
                case 'bundle':
                    const bundleQty2 = promo.bundleQuantity || 0;
                    const bundlePrice2 = promo.bundlePrice || 0;
                    if (bundleQty2 > 0 && bundlePrice2 > 0 && quantity >= bundleQty2) {
                        const bundles = Math.floor(quantity / bundleQty2);
                        const remaining = quantity % bundleQty2;
                        calculatedPrice = bundles * bundlePrice2 + remaining * product.price;
                    }
                    break;

                case 'special_price':
                    const specialPrice2 = promo.specialPrice || 0;
                    if (specialPrice2 > 0) {
                        calculatedPrice = specialPrice2 * quantity;
                    }
                    break;

                case 'fixed_discount':
                    const discountAmount2 = promo.discountAmount || 0;
                    if (discountAmount2 > 0) {
                        calculatedPrice = Math.max(0, originalPrice - discountAmount2);
                    }
                    break;

                case 'percentage':
                    const discountPercentage2 = promo.discountPercentage || 0;
                    if (discountPercentage2 > 0 && discountPercentage2 <= 100) {
                        calculatedPrice = originalPrice * (1 - discountPercentage2 / 100);
                    }
                    break;
            }

            // Garder la meilleure offre (priorité en cas d'égalité)
            if (calculatedPrice < bestPrice ||
                (calculatedPrice === bestPrice && (promo.priority > (bestPromotion?.priority || 0)))) {
                bestPrice = calculatedPrice;
                bestPromotion = promo;
            }
        }

        return {
            finalPrice: Math.round(bestPrice * 100) / 100, // Arrondi à 2 décimales
            originalPrice,
            discount: Math.round((originalPrice - bestPrice) * 100) / 100,
            appliedPromotion: bestPromotion
        };
    },

    /**
     * Enregistre l'application d'une promotion à une vente
     * Incrémente automatiquement le compteur d'utilisations
     * 
     * @param application - Données de l'application (sans id et appliedAt)
     * 
     * @example
     * await PromotionsService.recordApplication({
     *   barId: 'bar-123',
     *   promotionId: 'promo-456',
     *   saleId: 'sale-789',
     *   productId: 'product-012',
     *   quantitySold: 3,
     *   originalPrice: 1050,
     *   discountedPrice: 1000,
     *   discountAmount: 50,
     *   appliedBy: 'user-345'
     * });
     */
    async recordApplication(
        application: Omit<PromotionApplication, 'id' | 'appliedAt'>
    ): Promise<void> {
        try {
            // Convertir camelCase → snake_case pour l'insertion
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

            // 1. Enregistrer l'application
            const { error: insertError } = await supabase
                .from('promotion_applications')
                .insert(dbApplication);

            if (insertError) throw insertError;

            // 2. Incrémenter le compteur d'utilisations
            const { error: rpcError } = await supabase.rpc('increment_promotion_uses', {
                p_promotion_id: application.promotionId
            });

            if (rpcError) {
                console.error('Erreur incrémentation compteur:', rpcError);
                // Ne pas bloquer si l'incrémentation échoue
            }
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            console.error('Erreur enregistrement application promotion:', errorMessage);
            throw new Error(errorMessage);
        }
    },

    /**
     * Crée une nouvelle promotion
     * 
     * @param promotion - Données de la promotion (sans id, createdAt, updatedAt)
     * @returns Promotion créée
     * 
     * @example
     * const promo = await PromotionsService.createPromotion({
     *   barId: 'bar-123',
     *   name: '3 bières à 1000 FCFA',
     *   type: 'bundle',
     *   bundleQuantity: 3,
     *   bundlePrice: 1000,
     *   targetType: 'product',
     *   targetProductIds: ['beer-id'],
     *   startDate: '2025-12-01',
     *   endDate: '2025-12-31',
     *   status: 'active',
     *   createdBy: 'user-123'
     * });
     */
    async createPromotion(
        promotion: Omit<Promotion, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<Promotion> {
        try {
            // Convertir camelCase → snake_case pour l'insertion
            const dbPromo = mapPromotionToDbPromo(promotion) as PromotionInsert;

            const { data, error } = await supabase
                .from('promotions')
                .insert(dbPromo)
                .select()
                .single();

            if (error) throw error;

            // Convertir snake_case → camelCase pour le retour
            return mapDbPromoToPromotion(data as PromotionRow);
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            console.error('Erreur création promotion:', errorMessage);
            throw new Error(errorMessage);
        }
    },

    /**
     * Met à jour une promotion existante
     * 
     * @param id - ID de la promotion
     * @param updates - Champs à mettre à jour
     * @returns Promotion mise à jour
     * 
     * @example
     * const updated = await PromotionsService.updatePromotion('promo-123', {
     *   status: 'paused'
     * });
     */
    async updatePromotion(
        id: string,
        updates: Partial<Promotion>
    ): Promise<Promotion> {
        try {
            // Convertir camelCase → snake_case pour la mise à jour
            const dbUpdates = mapPromotionToDbPromo(updates);
            dbUpdates.updated_at = new Date().toISOString();

            const { data, error } = await supabase
                .from('promotions')
                .update(dbUpdates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;

            // Convertir snake_case → camelCase pour le retour
            return mapDbPromoToPromotion(data as PromotionRow);
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            console.error('Erreur mise à jour promotion:', errorMessage);
            throw new Error(errorMessage);
        }
    },

    /**
     * Supprime une promotion
     * 
     * @param id - ID de la promotion
     * 
     * @example
     * await PromotionsService.deletePromotion('promo-123');
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
     * Récupère toutes les promotions d'un bar (tous statuts)
     * 
     * @param barId - ID du bar
     * @returns Liste des promotions
     * 
     * @example
     * const allPromos = await PromotionsService.getAllPromotions('bar-123');
     */
    async getAllPromotions(barId: string): Promise<Promotion[]> {
        try {
            const { data, error } = await supabase
                .from('promotions')
                .select('*')
                .eq('bar_id', barId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Convertir snake_case → camelCase
            return (data || []).map((row) => mapDbPromoToPromotion(row as PromotionRow));
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            console.error('Erreur récupération promotions:', errorMessage);
            throw new Error(errorMessage);
        }
    },

    /**
     * Récupère les statistiques globales des promotions pour un bar
     * Utilise une fonction RPC optimisée côté base de données
     *
     * @param barId - ID du bar
     * @param startDate - Date de début (optionnel, NULL = toutes les données)
     * @param endDate - Date de fin (optionnel, NULL = toutes les données)
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

            // ✅ Type correction: Cast unknown RPC result to defined interface
            const stats = data as unknown as PromotionGlobalStats;

            const totalRevenue = Number(stats?.total_revenue || 0);
            const totalDiscount = Number(stats?.total_discount || 0);
            const totalCostOfGoods = Number(stats?.total_cost_of_goods || 0);
            const netProfit = Number(stats?.net_profit || 0);
            const marginPercentage = Number(stats?.margin_percentage || 0);
            const roi = Number(stats?.roi_percentage || 0);

            return {
                totalRevenue,
                totalDiscount,
                totalApplications: Number(stats?.total_applications || 0),
                totalCostOfGoods,
                netProfit,
                marginPercentage,
                roi
            };
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            console.error('Erreur stats globales:', errorMessage);
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
     * Utilise une fonction RPC optimisée
     *
     * @param barId - ID du bar
     * @param startDate - Date de début (optionnel, NULL = toutes les données)
     * @param endDate - Date de fin (optionnel, NULL = toutes les données)
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

            // ✅ Type-safe mapping with explicit interface and cast
            return (data || []).map((item) => {
                const stat = item as unknown as PromotionPerformanceStat;
                return {
                    id: stat.promotion_id,
                    name: stat.promotion_name,
                    uses: Number(stat.total_applications),
                    revenue: Number(stat.total_revenue),
                    discount: Number(stat.total_discount),
                    costOfGoods: Number(stat.total_cost_of_goods),
                    netProfit: Number(stat.net_profit),
                    marginPercentage: Number(stat.margin_percentage),
                    roi: Number(stat.roi_percentage)
                };
            });
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            console.error('Erreur performance promotions:', errorMessage);
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
