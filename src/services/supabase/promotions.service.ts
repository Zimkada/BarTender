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

/**
 * Convertit les données SQL (snake_case) en objet TypeScript (camelCase)
 * Résout le mismatch entre les conventions SQL et TypeScript
 */
function mapDbPromoToPromotion(dbPromo: any): Promotion {
    return {
        id: dbPromo.id,
        barId: dbPromo.bar_id,
        name: dbPromo.name,
        description: dbPromo.description,
        type: dbPromo.type,
        status: dbPromo.status,
        targetType: dbPromo.target_type,
        targetProductIds: dbPromo.target_product_ids,
        targetCategoryIds: dbPromo.target_category_ids,
        bundleQuantity: dbPromo.bundle_quantity,
        bundlePrice: dbPromo.bundle_price,
        discountAmount: dbPromo.discount_amount,
        discountPercentage: dbPromo.discount_percentage,
        specialPrice: dbPromo.special_price,
        timeStart: dbPromo.time_start,
        timeEnd: dbPromo.time_end,
        startDate: dbPromo.start_date,
        endDate: dbPromo.end_date,
        isRecurring: dbPromo.is_recurring,
        recurrenceDays: dbPromo.recurrence_days,
        maxUsesPerCustomer: dbPromo.max_uses_per_customer,
        maxTotalUses: dbPromo.max_total_uses,
        currentUses: dbPromo.current_uses || 0,
        priority: dbPromo.priority || 0,
        createdBy: dbPromo.created_by,
        createdAt: new Date(dbPromo.created_at),
        updatedAt: new Date(dbPromo.updated_at)
    };
}

/**
 * Convertit un objet Promotion (camelCase) en données SQL (snake_case)
 */
function mapPromotionToDbPromo(promo: Partial<Promotion>): any {
    const dbPromo: any = {};

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
        let query = supabase
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
        const promotions = (data || []).map(mapDbPromoToPromotion);

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
                case 'bundle':
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

                case 'special_price':
                    // Exemple: Bière à 300 FCFA au lieu de 350 FCFA
                    const specialPrice = promo.specialPrice || 0;
                    if (specialPrice > 0) {
                        calculatedPrice = specialPrice * quantity;
                    }
                    break;

                case 'fixed_discount':
                    // Exemple: -50 FCFA sur le total (pas × quantité)
                    // Prix: 350 FCFA × 3 = 1050 FCFA → 1050 - 50 = 1000 FCFA
                    const discountAmount = promo.discountAmount || 0;
                    if (discountAmount > 0) {
                        calculatedPrice = Math.max(0, originalPrice - discountAmount);
                    }
                    break;

                case 'percentage':
                    // Exemple: -10% sur le total
                    const discountPercentage = promo.discountPercentage || 0;
                    if (discountPercentage > 0 && discountPercentage <= 100) {
                        calculatedPrice = originalPrice * (1 - discountPercentage / 100);
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
            console.error('Erreur enregistrement application promotion:', error);
            throw error;
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
            const dbPromo = mapPromotionToDbPromo(promotion);

            const { data, error } = await supabase
                .from('promotions')
                .insert(dbPromo)
                .select()
                .single();

            if (error) throw error;

            // Convertir snake_case → camelCase pour le retour
            return mapDbPromoToPromotion(data);
        } catch (error) {
            console.error('Erreur création promotion:', error);
            throw error;
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
            return mapDbPromoToPromotion(data);
        } catch (error) {
            console.error('Erreur mise à jour promotion:', error);
            throw error;
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
            console.error('Erreur suppression promotion:', error);
            throw error;
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
            return (data || []).map(mapDbPromoToPromotion);
        } catch (error) {
            console.error('Erreur récupération promotions:', error);
            throw error;
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
        roi: number;
    }> {
        try {
            const { data, error } = await (supabase.rpc as any)('get_bar_global_promotion_stats', {
                p_bar_id: barId,
                p_start_date: startDate?.toISOString() || null,
                p_end_date: endDate?.toISOString() || null
            }).single();

            if (error) throw error;

            const totalRevenue = Number(data?.total_revenue || 0);
            const totalDiscount = Number(data?.total_discount || 0);

            // Calcul ROI: (Gain - Coût) / Coût * 100
            // Ici Gain = CA généré, Coût = Réduction offerte (manque à gagner)
            // C'est une approximation, le vrai ROI dépendrait de la marge
            const roi = totalDiscount > 0
                ? Math.round(((totalRevenue - totalDiscount) / totalDiscount) * 100)
                : 0;

            return {
                totalRevenue,
                totalDiscount,
                totalApplications: Number(data?.total_applications || 0),
                roi
            };
        } catch (error) {
            console.error('Erreur stats globales:', error);
            return { totalRevenue: 0, totalDiscount: 0, totalApplications: 0, roi: 0 };
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
    ): Promise<any[]> {
        try {
            const { data, error } = await (supabase.rpc as any)('get_bar_promotion_stats', {
                p_bar_id: barId,
                p_start_date: startDate?.toISOString() || null,
                p_end_date: endDate?.toISOString() || null
            });

            if (error) throw error;

            return (data || []).map((stat: any) => ({
                id: stat.promotion_id,
                name: stat.promotion_name,
                uses: Number(stat.total_applications),
                revenue: Number(stat.total_revenue),
                discount: Number(stat.total_discount)
            }));
        } catch (error) {
            console.error('Erreur performance promotions:', error);
            return [];
        }
    },

    /**
     * Active automatiquement les promotions programmées
     * À appeler périodiquement (ex: au démarrage de l'app)
     */
    async autoActivateScheduled(): Promise<void> {
        try {
            const { error } = await (supabase.rpc as any)('auto_activate_scheduled_promotions');
            if (error) throw error;
        } catch (error) {
            console.error('Erreur activation automatique:', error);
        }
    },

    /**
     * Expire automatiquement les promotions dont la date de fin est dépassée
     * À appeler périodiquement (ex: au démarrage de l'app)
     */
    async autoExpirePromotions(): Promise<void> {
        try {
            const { error } = await (supabase.rpc as any)('auto_expire_promotions');
            if (error) throw error;
        } catch (error) {
            console.error('Erreur expiration automatique:', error);
        }
    }
};
