import { ProductsService } from '../../services/supabase/products.service';
import { useApiQuery } from './useApiQuery';
import { useActingAs } from '../../context/ActingAsContext';
import { ProxyAdminService } from '../../services/supabase/proxy-admin.service';
import type { Product } from '../../types';

/**
 * Hook Factory for "Acting As" Queries
 * Routes queries to proxy admin RPCs when in "Acting As" mode
 * Falls back to normal queries when not impersonating
 */

/**
 * useProductsWithActingAs
 * Intelligently routes product queries based on acting-as state
 */
export const useProductsWithActingAs = (barId: string | undefined) => {
  const { actingAs } = useActingAs();

  // When acting as another user, fetch with proxy admin RPC
  if (actingAs.isActive && actingAs.userId && actingAs.barId) {
    return useApiQuery(
      ['products-proxy', barId, actingAs.userId],
      async () => {
        if (!barId) return [];
        const dbProducts = await ProxyAdminService.getBarProductsAsProxy(actingAs.userId!, barId);

        return dbProducts.map((p: any) => ({
          id: p.id,
          barId: p.bar_id,
          name: p.display_name,
          volume: p.global_product?.volume || p.volume || 'N/A',
          price: p.price,
          stock: p.stock ?? 0,
          categoryId: p.local_category_id || '',
          image: p.local_image || undefined,
          alertThreshold: p.alert_threshold ?? 0,
          createdAt: new Date(p.created_at || Date.now()),
        }));
      },
      { enabled: !!barId }
    );
  }

  // Fall back to normal query when not acting as
  return useApiQuery(
    ['products', barId],
    async (impersonatingUserId) => {
      if (!barId) return [];
      const dbProducts = await ProductsService.getBarProducts(barId, impersonatingUserId);

      return dbProducts.map((p: any) => ({
        id: p.id,
        barId: p.bar_id,
        name: p.display_name,
        volume: p.global_product?.volume || p.volume || 'N/A',
        price: p.price,
        stock: p.stock ?? 0,
        categoryId: p.local_category_id || '',
        image: p.local_image || undefined,
        alertThreshold: p.alert_threshold ?? 0,
        createdAt: new Date(p.created_at || Date.now()),
      }));
    },
    { enabled: !!barId }
  );
};

/**
 * useBarMembersWithActingAs
 * Intelligently routes bar members queries based on acting-as state
 */
export const useBarMembersWithActingAs = (barId: string | undefined) => {
  const { actingAs } = useActingAs();

  // When acting as another user, fetch with proxy admin RPC
  if (actingAs.isActive && actingAs.userId && actingAs.barId) {
    return useApiQuery(
      ['members-proxy', barId, actingAs.userId],
      async () => {
        if (!barId) return [];
        const members = await ProxyAdminService.getBarMembersAsProxy(actingAs.userId!, barId);
        return members || [];
      },
      { enabled: !!barId }
    );
  }

  // Fall back to normal query
  return useApiQuery(
    ['members', barId],
    async (impersonatingUserId) => {
      if (!barId) return [];
      // Use normal service when not in acting-as mode
      return [];
    },
    { enabled: !!barId }
  );
};

/**
 * useUserBarsWithActingAs
 * Intelligently routes user bars queries based on acting-as state
 */
export const useUserBarsWithActingAs = () => {
  const { actingAs } = useActingAs();

  // When acting as another user, fetch with proxy admin RPC
  if (actingAs.isActive && actingAs.userId) {
    return useApiQuery(
      ['bars-proxy', actingAs.userId],
      async () => {
        const bars = await ProxyAdminService.getUserBarsAsProxy(actingAs.userId!);
        return bars || [];
      }
    );
  }

  // Fall back to normal query
  return useApiQuery(
    ['bars'],
    async () => {
      return [];
    }
  );
};
