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
import { useSmartSync } from '../useSmartSync';
import { KitchenService, type KitchenQueueItem } from '../../services/supabase/kitchen.service';

// ===== Query Keys =====
export const kitchenKeys = {
  all: ['kitchen'] as const,
  queue: (barId: string) => [...kitchenKeys.all, 'queue', barId] as const,
};

/**
 * ⭐ File de production — LA query de l'écran Service.
 *
 * ⭐⭐ SYNCHRONISATION MULTI-APPAREILS — ajoutée le 04/08/2026 après test
 * terrain : « j'ai commencé des plats sur le compte cuisinier, mais le
 * promoteur continuait à voir que ça n'a pas commencé ».
 *
 * ⚠️ C'est L'ÉCRAN LE PLUS PARTAGÉ DU MODULE : le cuisinier fait avancer, le
 * serveur retire, le gérant surveille — trois appareils sur la même file, en
 * même temps. Un cache de 5 minutes y était intenable : chacun voyait un
 * service différent.
 *
 * ⭐ `useSmartSync` plutôt qu'un `refetchInterval` nu : BroadcastChannel entre
 * onglets (gratuit), Realtime entre appareils, polling en REPLI seulement. Le
 * §3 impose de ne pas ajouter de trafic à l'aveugle — un polling systématique
 * à 10 s représenterait ~2 900 requêtes par service et par appareil.
 *
 * ⚠️ Écoute `kitchen_order_items` et NON `kitchen_orders` : ce sont les LIGNES
 * qui portent le statut (§4.3), la commande parente n'a volontairement pas de
 * colonne `status`. S'abonner au parent ne verrait aucune transition.
 *
 * ⚠️ Repli à 20 s : plus court que les ventes (30 s) car une assiette prête
 * qui refroidit coûte plus qu'une vente affichée avec 30 s de retard. Ce repli
 * ne s'active que si Realtime est indisponible.
 */
export function useKitchenQueue(barId: string | undefined) {
  const { hasRestaurant } = useBarContext();
  const isEnabled = !!barId && hasRestaurant;

  // ⭐ §3 — `enabled: false` sur un bar pur : ni abonnement, ni polling.
  useSmartSync({
    table: 'kitchen_order_items',
    event: '*',
    barId: barId || undefined,
    enabled: isEnabled,
    staleTime: CACHE_STRATEGY.salesAndStock.staleTime,
    refetchInterval: 20000,
    queryKeysToInvalidate: [
      kitchenKeys.queue(barId ?? ''),
      /**
       * ⚠️ Les TICKETS aussi : leur résumé compte les plats en cuisine depuis
       * le 04/08/2026. Sans cette clé, le bon garderait un montant périmé
       * pendant que la file, elle, se met à jour.
       *
       * ⛔ LITTÉRAL et non `ticketKeys.all` — SEULE exception de ce module.
       * `useTickets` importe déjà `useKitchenQueue` : importer ses clés ici
       * créerait un CYCLE d'imports. La duplication est assumée et bornée à
       * cette ligne ; le préfixe `['tickets']` est stable depuis l'origine.
       */
      ['tickets'] as const,
    ],
  });

  return useQuery<KitchenQueueItem[]>({
    queryKey: kitchenKeys.queue(barId ?? ''),
    queryFn: () => KitchenService.getQueue(barId as string),
    // ⭐ §3 — aucune requête sur un bar pur.
    enabled: isEnabled,
    ...CACHE_STRATEGY.salesAndStock,
  });
}
