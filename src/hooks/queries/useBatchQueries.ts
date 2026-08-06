/**
 * useBatchQueries
 * Couche QUERIES des lots de production — fetching pur (§13.15).
 *
 * ⭐⭐ INVARIANCE DES BARS PURS (§3)
 * Chaque query porte `enabled: !!barId && hasRestaurant`. Un bar sans cuisine
 * ne doit émettre AUCUNE requête de lot — le §3 identifie le niveau RÉSEAU
 * comme « le plus insidieux et le plus coûteux », et un `enabled` oublié ne
 * produit aucune erreur, aucun test rouge, aucun symptôme visible avant la
 * facture.
 */

import { useQuery } from '@tanstack/react-query';
import { useBarContext } from '../../context/BarContext';
import { useAuth } from '../../context/AuthContext';
import { CACHE_STRATEGY } from '../../lib/cache-strategy';
import {
  BatchesService,
  type BatchWithDish,
} from '../../services/supabase/batches.service';

export const batchKeys = {
  all: ['batches'] as const,
  active: (barId: string) => [...batchKeys.all, 'active', barId] as const,
};

/**
 * Lots ACTIFS du bar — ce que l'écran Production affiche.
 *
 * ⭐ `salesAndStock` et non `products` : un lot se vide au fil du service.
 * Une donnée fraîche de 30 minutes ferait prélever dans un lot déjà épuisé.
 *
 * ⛔ GARDE `canManageIngredientStock` — la permission de l'écran Ingrédients.
 * Elle n'exclut PAS le cuisinier (il l'a), mais bien le SERVEUR, qui n'a
 * aucune raison de charger des lots portant un `unit_cost`.
 *
 * ⚠️ TENSION ASSUMÉE, à connaître : le cuisinier a `canManageIngredientStock`
 * mais `canViewKitchenCosts: false`. Il reçoit donc `unit_cost` dans cette
 * réponse alors que le §8 dit « il voit les quantités, pas les montants ».
 * ⭐ C'est COHÉRENT avec l'existant, pas une brèche nouvelle : les
 * `ingredient_lots` qu'il consulte déjà portent eux aussi un coût unitaire —
 * il a besoin de savoir ce qu'il sort du stock. La règle du §8 vise les
 * MARGES et le CA, pas le coût matière de sa propre production.
 * ⚠️ L'AFFICHAGE, lui, reste conditionné à `canViewKitchenCosts` côté
 * composant : recevoir n'est pas montrer.
 */
export function useActiveBatches(barId: string | undefined) {
  const { hasRestaurant } = useBarContext();
  const { hasPermission } = useAuth();

  return useQuery<BatchWithDish[]>({
    queryKey: batchKeys.active(barId ?? ''),
    queryFn: () => BatchesService.getActiveBatches(barId as string),
    enabled:
      !!barId && hasRestaurant && hasPermission('canManageIngredientStock'),
    ...CACHE_STRATEGY.salesAndStock,
  });
}
