/**
 * useUnifiedKitchenQueue
 * Pivot Hook de l'écran Service — file prête à l'emploi (§9, §13.15).
 *
 * ⭐ Regroupe la file en TROIS colonnes conformes au §9, et par TABLE à
 * l'intérieur de chacune. Le regroupement vit ICI et non dans le composant :
 * c'est de la logique métier, testable sans rendu.
 *
 * ⚠️ AUCUNE requête supplémentaire : tout dérive de `useKitchenQueue`. Le
 * changement de colonne ne déclenche RIEN — même principe que le sélecteur de
 * portée du §9.
 */

import { useMemo } from 'react';
import { useKitchenQueue } from '../queries/useKitchenQueries';
import type { KitchenQueueItem } from '../../services/supabase/kitchen.service';

/** Les trois colonnes du §9. */
export type KitchenColumn = 'todo' | 'doing' | 'done';

/**
 * Un groupe de lignes partageant la même destination.
 *
 * ⚠️ `tableNumber` est NULLABLE en base : une commande à emporter n'a pas de
 * table. Le §9 impose de les regrouper quand même — sinon chaque plat à
 * emporter formerait son propre groupe et la colonne deviendrait illisible.
 */
export interface KitchenGroup {
  /** Clé stable de rendu. `takeaway` ou `table-12`, jamais un index. */
  key: string;
  tableNumber: number | null;
  customerName: string | null;
  isTakeaway: boolean;
  items: KitchenQueueItem[];
  /** Arrivée de la ligne la PLUS ANCIENNE — pilote l'ordre des groupes. */
  oldestAt: string;
}

/**
 * ⭐ Répartition en colonnes — LISTE BLANCHE explicite.
 *
 * ⛔ Volontairement PAS de `default` fourre-tout ni de test par exclusion. Le
 * défaut récurrent de ce chantier (trois occurrences corrigées) est exactement
 * celui-là : un test « tout sauf X » range silencieusement les nouveaux statuts
 * du mauvais côté. Ici, un statut inconnu est EXCLU de la file — visible
 * nulle part plutôt que faussement « à faire ».
 */
function columnOf(status: KitchenQueueItem['status']): KitchenColumn | null {
  if (status === 'pending' || status === 'accepted') return 'todo';
  if (status === 'preparing') return 'doing';
  if (status === 'ready') return 'done';
  // `served` et `cancelled` ne sont plus dans la file (filtrés côté serveur).
  return null;
}

/** Regroupe par destination, en préservant l'ordre d'ancienneté. */
function groupByDestination(items: KitchenQueueItem[]): KitchenGroup[] {
  const groups = new Map<string, KitchenGroup>();

  for (const item of items) {
    const isTakeaway = item.service_mode === 'takeaway';
    // ⚠️ Les plats à emporter d'un MÊME ticket restent ensemble : la clé porte
    // le ticket, pas un libellé global « emporter » qui mélangerait des
    // commandes de clients différents.
    const key = isTakeaway
      ? `takeaway-${item.ticket_id}`
      : item.table_number !== null
        ? `table-${item.table_number}`
        : `ticket-${item.ticket_id}`;

    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      if (item.order_created_at < existing.oldestAt) {
        existing.oldestAt = item.order_created_at;
      }
    } else {
      groups.set(key, {
        key,
        tableNumber: item.table_number,
        customerName: item.customer_name,
        isTakeaway,
        items: [item],
        oldestAt: item.order_created_at,
      });
    }
  }

  // ⭐ Le plus ANCIEN en tête : une file cuisine se sert dans l'ordre d'arrivée.
  return Array.from(groups.values()).sort((a, b) =>
    a.oldestAt < b.oldestAt ? -1 : a.oldestAt > b.oldestAt ? 1 : 0
  );
}

export function useUnifiedKitchenQueue(barId: string | undefined) {
  const { data: queue, isLoading, error, refetch } = useKitchenQueue(barId);

  const columns = useMemo(() => {
    const buckets: Record<KitchenColumn, KitchenQueueItem[]> = {
      todo: [],
      doing: [],
      done: [],
    };

    for (const item of queue ?? []) {
      const column = columnOf(item.status);
      if (column) buckets[column].push(item);
    }

    return {
      todo: groupByDestination(buckets.todo),
      doing: groupByDestination(buckets.doing),
      done: groupByDestination(buckets.done),
    };
  }, [queue]);

  /**
   * Compteurs par colonne — pour les badges d'en-tête.
   * ⚠️ Compte les PLATS, pas les groupes : « 3 tables » ne dit pas au cuisinier
   * combien d'assiettes il doit sortir.
   */
  const counts = useMemo(
    () => ({
      todo: columns.todo.reduce((n, g) => n + g.items.length, 0),
      doing: columns.doing.reduce((n, g) => n + g.items.length, 0),
      done: columns.done.reduce((n, g) => n + g.items.length, 0),
    }),
    [columns]
  );

  return {
    columns,
    counts,
    /** File brute, si un écran a besoin de la liste non regroupée. */
    items: queue ?? [],
    isLoading,
    error,
    refetch,
  };
}
