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
import { useAuth } from '../../context/AuthContext';
import { CACHE_STRATEGY } from '../../lib/cache-strategy';
import { useSmartSync } from '../useSmartSync';
import {
  KitchenService,
  type KitchenQueueItem,
  type KitchenMetrics,
  type KitchenProduction,
  type QueueShortfalls,
} from '../../services/supabase/kitchen.service';

// ===== Query Keys =====
export const kitchenKeys = {
  all: ['kitchen'] as const,
  queue: (barId: string) => [...kitchenKeys.all, 'queue', barId] as const,
  /**
   * ⚠️ Les DATES font partie de la clé : sans elles, changer de période
   * servirait le cache de la précédente.
   */
  metrics: (barId: string, start?: string, end?: string) =>
    [...kitchenKeys.all, 'metrics', barId, start ?? '', end ?? ''] as const,
  /**
   * ⛔ CLÉ DISTINCTE de `metrics`, et ce n'est PAS un détail.
   * Les deux RPC couvrent la même période mais renvoient des objets
   * différents (l'un avec montants, l'autre sans). Une clé partagée ferait
   * servir la réponse AVEC MONTANTS depuis le cache à un cuisinier dès qu'un
   * gérant aurait consulté le même bar sur le même appareil.
   */
  production: (barId: string, start?: string, end?: string) =>
    [...kitchenKeys.all, 'production', barId, start ?? '', end ?? ''] as const,
  /**
   * ⭐ Manques de stock pour la file en cours (§4.4).
   * ⚠️ Sous `kitchenKeys.all` : les mutations de la file invalident déjà cette
   * racine, donc l'alerte se rafraîchit quand la file change - sans qu'aucune
   * mutation ait à connaître cette clé.
   */
  shortfalls: (barId: string) => [...kitchenKeys.all, 'shortfalls', barId] as const,
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

/**
 * ⭐⭐ Les 4 métriques du §8 — l'écran de rentabilité cuisine.
 *
 * ⚠️ `dailyStats` (2 min) et NON `salesAndStock` : ces chiffres se lisent en
 * CONSULTATION, pas en réaction. Le gérant ouvre l'écran, regarde, décide —
 * il n'a pas besoin d'un rafraîchissement à la seconde comme la file de
 * production.
 *
 * ⚠️ AUCUN `useSmartSync` ici, contrairement à la file : ces agrégats n'ont
 * pas besoin d'être poussés. Ajouter un abonnement Realtime sur un écran
 * consulté quelques minutes par jour coûterait de l'egress pour un gain nul
 * (§3 — mesurer avant d'ajouter du trafic).
 *
 * ⭐ §3 — `enabled: hasRestaurant` : aucune requête sur un bar pur.
 *
 * ⛔⛔ ET `canViewKitchenCosts` — defaut de SECURITE trouve a la code review
 * du 05/08/2026.
 *
 * Cette RPC renvoie des MARGES, des COUTS et des PERTES chiffrees. Elle
 * verifie l appartenance au bar, PAS la permission de voir les montants —
 * c est au client de ne pas la demander.
 * ⚠️ Sans cette garde, la requete partait pour un SERVEUR (qui accede au
 * Dashboard et peut basculer en portee Restau) : les montants arrivaient
 * dans son cache reseau, meme si l ecran les masquait. Le §8 (« il voit les
 * quantites, pas les montants ») etait contourne PAR LE RESEAU.
 * ⭐ Corrige ICI et non dans chaque composant : la garde profite a tous les
 * appelants, presents et futurs.
 */
export function useKitchenMetrics(
  barId: string | undefined,
  startDate?: string,
  endDate?: string
) {
  const { hasRestaurant } = useBarContext();
  const { hasPermission } = useAuth();

  return useQuery<KitchenMetrics>({
    queryKey: kitchenKeys.metrics(barId ?? '', startDate, endDate),
    queryFn: () => KitchenService.getMetrics(barId as string, startDate, endDate),
    enabled: !!barId && hasRestaurant && hasPermission('canViewKitchenCosts'),
    ...CACHE_STRATEGY.dailyStats,
  });
}

/**
 * ⭐⭐ L'ACTIVITÉ DU CUISINIER — le pendant SANS MONTANTS de `useKitchenMetrics`.
 *
 * Répond aux trois questions posées : ce qui l'attend, ce qu'il a fait, ce
 * qui est perdu. `getQueue` n'expose que le PRÉSENT (elle filtre sur
 * pending/accepted/preparing/ready) : dès qu'un plat est servi ou annulé, il
 * disparaît. En fin de service, l'écran du cuisinier est vide.
 *
 * ⛔⛔ LA GARDE EST `canViewKitchenOrders`, PAS `canViewKitchenCosts` — et
 * c'est TOUT L'INTÉRÊT de ce hook. Le cuisinier a `canViewKitchenCosts:
 * false` : le brancher sur `useKitchenMetrics` lui aurait tout fermé.
 *
 * ⚠️ Ce relâchement n'est SÛR que parce que la RPC `get_kitchen_production`
 * NE CALCULE AUCUN MONTANT. La protection est dans le SQL, pas ici — une
 * garde applicative se contourne en lisant la réponse réseau, une colonne
 * absente non. Si un montant réapparaissait dans la RPC, cette garde
 * deviendrait une faille (cf. post-vol n°3 de la migration).
 *
 * ⭐ §3 — `enabled: hasRestaurant` : aucune requête sur un bar pur.
 */
export function useKitchenProduction(
  barId: string | undefined,
  startDate?: string,
  endDate?: string
) {
  const { hasRestaurant } = useBarContext();
  const { hasPermission } = useAuth();

  return useQuery<KitchenProduction>({
    queryKey: kitchenKeys.production(barId ?? '', startDate, endDate),
    queryFn: () => KitchenService.getProduction(barId as string, startDate, endDate),
    enabled: !!barId && hasRestaurant && hasPermission('canViewKitchenOrders'),
    ...CACHE_STRATEGY.dailyStats,
  });
}

/**
 * ⭐ Ce qui MANQUERA pour la file en cours (§4.4).
 *
 * ⛔ AVERTISSEMENT, JAMAIS UN BLOCAGE. Le serveur ne refuse pas sur un stock à
 * 0 : il crée une DETTE. Sans cette query, la préparation réussit et l'anomalie
 * n'apparaît que dans un écran que le cuisinier n'ouvre pas.
 *
 * ⭐ UN SEUL APPEL pour toute la file - c'est la raison d'être de la RPC.
 * `useDishRecipe` charge une recette par requête : 20 plats en file auraient
 * fait 20 requêtes sur l'écran le plus sollicité (§3, egress).
 *
 * ⚠️ Garde `canViewKitchenOrders` et NON `canViewKitchenCosts` : le cuisinier
 * est le premier destinataire de cette alerte. Ce relâchement n'est SÛR que
 * parce que la RPC ne renvoie AUCUN montant - la protection est dans le SQL
 * (post-vol n°3), pas ici.
 *
 * ⚠️ `salesAndStock` (5 min) et non `dailyStats` : le stock bouge à chaque
 * plat terminé. Un cache long annoncerait un manque déjà comblé, ou tairait
 * celui qui vient d'apparaître.
 *
 * ⭐ §3 — `enabled: hasRestaurant` : aucune requête sur un bar pur.
 */
export function useQueueShortfalls(barId: string | undefined) {
  const { hasRestaurant } = useBarContext();
  const { hasPermission } = useAuth();

  return useQuery<QueueShortfalls>({
    queryKey: kitchenKeys.shortfalls(barId ?? ''),
    queryFn: () => KitchenService.getQueueShortfalls(barId as string),
    enabled: !!barId && hasRestaurant && hasPermission('canViewKitchenOrders'),
    ...CACHE_STRATEGY.salesAndStock,
  });
}
