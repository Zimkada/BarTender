/**
 * PriceOptionPicker — choix du format à la commande (§19.5).
 *
 * ⭐ RÉPOND AU CARTON DE POISSON NON TRIÉ : le même plat se vend 2 000 F avec
 * un gros poisson et 1 000 F avec un petit. Le serveur, qui est face au client
 * et voit l'assiette, choisit le format.
 *
 * ⛔⛔ IL CHOISIT, IL NE SAISIT PAS. C'est toute la différence avec un champ
 * de prix libre — le levier de fraude le plus direct d'un POS, et ici le geste
 * serait QUOTIDIEN. La liste est fermée par le gérant ; le serveur ne peut que
 * désigner. Le garde-fou EST le mécanisme.
 *
 * ⚠️ AUCUN DÉFAUT PRÉ-SÉLECTIONNÉ, et c'est délibéré : un serveur pressé
 * validerait « Grand » pour un petit poisson, et l'écart ne se verrait qu'à
 * l'inventaire. La RPC refuse d'ailleurs la commande sans format explicite.
 */

import { Modal } from '../ui/Modal';
import { cn } from '../../lib/utils';
import type { DishRow, DishPriceOptionRow } from '../../services/supabase/dishes.service';

interface Props {
  dish: DishRow;
  onPick: (option: DishPriceOptionRow) => void;
  onCancel: () => void;
  formatPrice: (v: number) => string;
}

export function PriceOptionPicker({ dish, onPick, onCancel, formatPrice }: Props) {
  const options = dish.dish_price_options ?? [];

  return (
    <Modal open onClose={onCancel} title={dish.name} size="sm">
      <p className="mb-3 text-caption text-muted-foreground">
        Quelle taille servez-vous ?
      </p>

      {/*
        ⚠️ Boutons PLEINE LARGEUR et espacés : ce choix se fait debout, en
        salle, sur un téléphone, souvent d'une main. Une liste dense ferait
        toucher le mauvais format - et le client paierait le mauvais prix.
      */}
      <div className="flex flex-col gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onPick(option)}
            className={cn(
              'flex items-center justify-between rounded-xl border border-border',
              'px-4 py-3 text-left transition-colors',
              'hover:border-brand-primary hover:bg-brand-subtle'
            )}
          >
            <span className="text-body font-medium">{option.label}</span>
            <span className="text-body font-semibold text-brand-primary tabular-nums">
              {formatPrice(option.price)}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

PriceOptionPicker.displayName = 'PriceOptionPicker';
