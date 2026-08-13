/**
 * useBatchAlerts
 * Alerte de lot épuisé — §16.8, phase 3B.
 *
 * ⭐⭐ INFORMER AVANT, PAS SEULEMENT REFUSER APRÈS.
 *
 * `accept_kitchen_item` refuse déjà de démarrer un plat dont le lot est vide,
 * et c'est le bon garde-fou. Mais il est RÉACTIF : le cuisinier découvre le
 * problème au moment où il prend la commande en main, devant une table qui
 * attend.
 *
 * Cette alerte est PROACTIVE — elle signale la rupture dès qu'elle survient,
 * pendant qu'il reste du temps pour produire un lot. C'est ce que prévoyait
 * l'arbitrage du 06/08/2026 : « dès que le lot est fini, avant même la
 * commande ».
 *
 * ⚠️ COÛT RÉSEAU — mesuré, pas supposé (correction d'un commentaire faux
 * relevé à la code review du 07/08/2026, qui affirmait « aucune requête
 * supplémentaire »).
 *
 * Sur l'écran Service, ce hook ajoute DEUX queries :
 *   · `useActiveBatches`     — `salesAndStock`, 5 min
 *   · `useAllDishComponents` — `products`, 30 min
 * `useDishes` et la file y étaient déjà.
 *
 * ⭐ Le coût reste faible et BORNÉ : aucun `useSmartSync`, aucun
 * `refetchInterval`. Ces données ne sont pas poussées — un lot change quand
 * on en produit un, une composition quand on modifie une recette. Ajouter du
 * temps réel ici coûterait de l'egress pour un gain nul (§3).
 * ⭐ §3 — les deux portent `enabled: hasRestaurant` : sur un bar pur, zéro
 * requête.
 */

import { useMemo } from 'react';
import { useActiveBatches } from '../queries/useBatchQueries';
import { useAllDishComponents, useDishes } from '../queries/useDishesQueries';
import { useUnifiedKitchenQueue } from './useUnifiedKitchenQueue';
import { useAuth } from '../../context/AuthContext';

export interface BatchAlert {
  /** Le plat-BASE en rupture — celui dont il faut produire un lot. */
  baseDishId: string;
  baseDishName: string;
  /** Portions encore disponibles, tous lots actifs confondus. */
  availableQty: number;
  /**
   * ⭐ Portions déjà ENGAGÉES par les plats en attente ou en préparation.
   * C'est ce chiffre qui rend l'alerte actionnable : « il manque 3 portions »
   * dit quoi faire, « le lot est vide » ne dit rien de l'urgence.
   */
  neededQty: number;
  /** Noms des plats vendus qui dépendent de cette base — pour le message. */
  affectedDishNames: string[];
  /**
   * ⚠️ `true` = plus AUCUNE portion. Distinct de « insuffisant » : dans le
   * premier cas plus rien ne peut être servi, dans le second une partie passe
   * encore.
   */
  isEmpty: boolean;
}

/**
 * Alertes de lot pour le bar courant.
 *
 * ⚠️ Ne remonte QUE les bases réellement sollicitées : un plat-base dont
 * aucun plat en attente ne dépend n'est pas une alerte, même si son lot est
 * vide. Alerter sur tout produirait du bruit que le cuisinier apprendrait à
 * ignorer — et il ignorerait aussi les vraies alertes.
 */
export function useBatchAlerts(barId: string | undefined) {
  const { hasPermission } = useAuth();
  const { data: batches = [] } = useActiveBatches(barId);
  const { data: components = [] } = useAllDishComponents(barId);
  const { data: dishes = [] } = useDishes(barId);
  const { columns } = useUnifiedKitchenQueue(barId);

  /**
   * ⛔⛔ SANS LES LOTS, PAS D'ALERTE — défaut trouvé à la code review du
   * 07/08/2026.
   *
   * `useActiveBatches` est gardée par `canManageIngredientStock` (les lots
   * portent `unit_cost`, un montant). Pour un SERVEUR, elle ne charge donc
   * RIEN — et un tableau vide se lit ici comme « zéro portion disponible ».
   * ⚠️ Résultat : le serveur aurait vu « Plus de Spaghetti cuits » en
   * PERMANENCE, même devant un lot plein de 20 portions. Une fausse alerte
   * constante est pire que pas d'alerte : elle discrédite les vraies.
   *
   * ⭐ On MASQUE plutôt que d'ouvrir la donnée. Charger les lots pour le
   * serveur exposerait un coût unitaire qu'il n'a pas le droit de voir — la
   * garde posée le 05/08 existe pour cette raison.
   * ⚠️ Conséquence assumée : le serveur ne voit pas l'alerte. Il l'apprendra
   * du cuisinier, ou par le refus au démarrage de la préparation.
   */
  const canSeeBatches = hasPermission('canManageIngredientStock');

  const alerts = useMemo<BatchAlert[]>(() => {
    if (!canSeeBatches) return [];
    if (components.length === 0) return [];

    /** Portions disponibles par plat-base, tous lots actifs confondus. */
    const availableByBase = new Map<string, number>();
    for (const b of batches) {
      availableByBase.set(
        b.dish_id,
        (availableByBase.get(b.dish_id) ?? 0) + b.remaining_qty
      );
    }

    /** Index O(1) : quels composants pour un plat vendu. */
    const componentsByDish = new Map<string, typeof components>();
    for (const c of components) {
      const list = componentsByDish.get(c.dish_id) ?? [];
      list.push(c);
      componentsByDish.set(c.dish_id, list);
    }

    const dishNameById = new Map(dishes.map((d) => [d.id, d.name]));

    /**
     * ⭐ On ne compte QUE ce qui n'a pas encore prélevé.
     * `todo` et `doing` sont devant le prélèvement (qui a lieu à `ready`) ;
     * `done` a déjà consommé sa part du lot. L'inclure compterait deux fois.
     */
    const pendingItems = [
      ...columns.todo.flatMap((g) => g.items),
      ...columns.doing.flatMap((g) => g.items),
    ];

    /** Portions engagées par base, et plats concernés. */
    const neededByBase = new Map<string, number>();
    const dishesByBase = new Map<string, Set<string>>();

    for (const item of pendingItems) {
      const comps = componentsByDish.get(item.dish_id);
      if (!comps) continue;

      for (const c of comps) {
        neededByBase.set(
          c.base_dish_id,
          (neededByBase.get(c.base_dish_id) ?? 0) + c.quantity * item.quantity
        );
        const set = dishesByBase.get(c.base_dish_id) ?? new Set<string>();
        set.add(item.dish_name);
        dishesByBase.set(c.base_dish_id, set);
      }
    }

    const result: BatchAlert[] = [];
    for (const [baseId, needed] of neededByBase) {
      const available = availableByBase.get(baseId) ?? 0;
      // ⚠️ Seuil STRICT : on alerte dès que le stock ne couvre pas les plats
      // déjà commandés. Pas de marge de confort — elle rendrait l'alerte
      // floue, et le cuisinier ne saurait plus si elle est sérieuse.
      if (available >= needed) continue;

      result.push({
        baseDishId: baseId,
        baseDishName: dishNameById.get(baseId) ?? 'Plat de base',
        availableQty: available,
        neededQty: needed,
        affectedDishNames: Array.from(dishesByBase.get(baseId) ?? []),
        isEmpty: available === 0,
      });
    }

    // ⭐ Les ruptures TOTALES d'abord : plus rien ne peut être servi.
    return result.sort((a, b) => Number(b.isEmpty) - Number(a.isEmpty));
  }, [canSeeBatches, batches, components, dishes, columns]);

  return { alerts, hasAlerts: alerts.length > 0 };
}
