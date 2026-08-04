/**
 * useKitchenQueries
 * Couche QUERIES de la file cuisine — fetching pur (§13.15).
 *
 * ⭐⭐ INVARIANCE DES BARS PURS (§3)
 * Chaque query porte `enabled: !!barId && hasRestaurant`. Un bar sans cuisine ne
 * doit émettre AUCUNE requête cuisine — le §3 identifie le niveau RÉSEAU comme
 * « le plus insidieux et le plus coûteux », et un `enabled` oublié ne produit
 * aucune erreur, aucun test rouge, aucun symptôme visible avant la facture.
 */

import { useQuery } from '@tanstack/react-query';
import { useBarContext } from '../../context/BarContext';
import { CACHE_STRATEGY } from '../../lib/cache-strategy';
import { KitchenService, type KitchenQueueItem } from '../../services/supabase/kitchen.service';

// ===== Query Keys =====
export const kitchenKeys = {
  all: ['kitchen'] as const,
  queue: (barId: string) => [...kitchenKeys.all, 'queue', barId] as const,
};

/**
 * ⭐ File de production — LA query de l'écran Service.
 *
 * ⚠️ `salesAndStock` (5 min) et NON `products` : cette liste bouge à CHAQUE
 * commande passée et à chaque plat terminé. C'est la donnée la plus volatile du
 * module — un cache long afficherait au cuisinier une file déjà obsolète.
 *
 * ⚠️ `refetchInterval` volontairement ABSENT à ce stade. Le §3 impose de
 * MESURER avant d'ajouter du trafic : un polling à 10 s sur un écran laissé
 * ouvert toute la soirée représente ~2 900 requêtes par service. La décision
 * Realtime vs polling se prendra sur des chiffres réels, pas par anticipation.
 */
export function useKitchenQueue(barId: string | undefined) {
  const { hasRestaurant } = useBarContext();

  return useQuery<KitchenQueueItem[]>({
    queryKey: kitchenKeys.queue(barId ?? ''),
    queryFn: () => KitchenService.getQueue(barId as string),
    // ⭐ §3 — aucune requête sur un bar pur.
    enabled: !!barId && hasRestaurant,
    ...CACHE_STRATEGY.salesAndStock,
  });
}
