/**
 * LotCountForm — compter un carton par taille à la réception (§19.6).
 *
 * ⭐ LE GESTE QUE LE RESTAURATEUR FAIT DÉJÀ : il ouvre le carton, trie, et
 * note « 12 grands, 20 moyens, 8 petits » dans son cahier. Ce comptage sert au
 * CONTRÔLE A POSTERIORI - si 18 grands ont été vendus alors que le carton n'en
 * contenait que 12, il y a une question à poser.
 *
 * ⛔⛔ CE FORMULAIRE NE TOUCHE NI AU STOCK NI AU COÛT. Le lot garde ses 40
 * unités et son coût moyen : le carton a été payé un prix GLOBAL, et répartir
 * ce prix entre les tailles exigerait une clé que personne ne possède. Ce que
 * l'on saisit ici est une DÉCLARATION, pas une valorisation.
 *
 * ⚠️ ENTIÈREMENT FACULTATIF. Fermer sans rien saisir est un choix valide -
 * l'appro est déjà enregistré, seul le contrôle sera indisponible. Le bouton
 * le dit explicitement.
 */

import { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import {
  useIngredientSizes,
  useLotCounts,
} from '../../hooks/queries/useIngredientsQueries';
import { useIngredientMutations } from '../../hooks/mutations/useIngredientMutations';

interface Props {
  barId: string | undefined;
  lotId: string;
  ingredientId: string;
  onDone: () => void;
}

export function LotCountForm({ barId, lotId, ingredientId, onDone }: Props) {
  const { data: sizes = [], isLoading: isLoadingSizes } = useIngredientSizes(barId, ingredientId);
  const { data: existing = [], isLoading: isLoadingCounts } = useLotCounts(barId, lotId);
  const { recordLotCounts } = useIngredientMutations();

  /**
   * ⚠️ Les quantités restent du TEXTE pendant la saisie - leçon du 09/08 :
   * convertir à chaque frappe détruit la frappe (taper « 12 » donne 1 puis
   * 12, effacer réécrit 0), et `parseFloat('1,5')` vaut 1 sur clavier
   * français.
   */
  const [values, setValues] = useState<Record<string, string>>({});

  /**
   * ⛔ SYNCHRONISATION APRÈS CHARGEMENT — le motif qui a piégé ce module
   * quatre fois. `existing` vaut `[]` pendant le fetch : initialiser l'état
   * directement afficherait un formulaire VIDE sur un lot déjà compté, et
   * enregistrer dans cet état EFFACERAIT le comptage (la RPC remplace).
   */
  useEffect(() => {
    if (isLoadingCounts || existing.length === 0) return;
    setValues(
      Object.fromEntries(existing.map((c) => [c.size_id, String(c.counted_qty)]))
    );
  }, [isLoadingCounts, existing]);

  /** ⚠️ Accepte la virgule : clavier français. */
  const parseQty = (v: string): number => parseFloat(v.replace(',', '.'));

  const counts = sizes
    .map((s) => ({ size_id: s.id, qty: parseQty(values[s.id] ?? '') }))
    .filter((c) => !Number.isNaN(c.qty) && c.qty > 0);

  if (isLoadingSizes) {
    return (
      <p className="py-6 text-center text-caption text-muted-foreground">
        Chargement…
      </p>
    );
  }

  // ⚠️ Aucune taille déclarée : rien à compter. Ne devrait pas se produire
  // (l'appelant vérifie), mais un écran vide serait pire qu'un message.
  if (sizes.length === 0) {
    return (
      <div className="py-4">
        <p className="text-caption text-muted-foreground">
          Aucune taille n'est déclarée pour cet ingrédient. Vous pouvez en
          ajouter depuis sa fiche, dans l'onglet Stock.
        </p>
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="outline" onClick={onDone}>
            Fermer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-caption text-muted-foreground">
        Combien de chaque taille dans cette livraison ? Ce comptage ne change
        ni votre stock ni vos coûts - il sert à vérifier plus tard ce qui a été
        vendu.
      </p>

      <div className="space-y-2">
        {sizes.map((size) => (
          <div key={size.id} className="flex items-center gap-2">
            <label
              htmlFor={`count-${size.id}`}
              className="flex-1 text-sm font-medium"
            >
              {size.label}
            </label>
            <input
              id={`count-${size.id}`}
              type="text"
              inputMode="decimal"
              value={values[size.id] ?? ''}
              onChange={(e) =>
                setValues((cur) => ({ ...cur, [size.id]: e.target.value }))
              }
              className={cn(
                'w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm',
                'focus:border-brand-primary focus:outline-none'
              )}
              placeholder="0"
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        {/*
          ⚠️ « Plus tard » et non « Annuler » : l'approvisionnement est DÉJÀ
          enregistré à ce stade. « Annuler » laisserait croire qu'on peut
          encore revenir dessus.
        */}
        <Button size="sm" variant="outline" onClick={onDone}>
          Plus tard
        </Button>
        <Button
          size="sm"
          onClick={() =>
            recordLotCounts.mutate({ lotId, counts }, { onSuccess: onDone })
          }
          disabled={counts.length === 0 || recordLotCounts.isPending}
        >
          {recordLotCounts.isPending ? 'Enregistrement…' : 'Enregistrer le comptage'}
        </Button>
      </div>
    </div>
  );
}

LotCountForm.displayName = 'LotCountForm';
