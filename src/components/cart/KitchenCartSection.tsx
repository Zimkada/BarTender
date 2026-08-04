/**
 * KitchenCartSection
 * Section « Cuisine » du panier — §16.7.
 *
 * ⭐⭐ SECTION DISTINCTE, PAS UNE LISTE À PART.
 * Le §16.7 impose « toutes les lignes rattachées au même bon, boissons
 * incluses — sinon l'addition serait fragmentée ». La séparation visuelle dit
 * que ces lignes suivent un chemin différent (cuisine, puis vente au service),
 * pas qu'elles forment une seconde addition.
 *
 * ⚠️ COMPOSANT SÉPARÉ de `CartShared`, qui est typé sur `CalculatedItem`
 * (produits, promotions, stock). Un plat n'a rien de tout cela. Sur un bar pur,
 * cette section n'est jamais rendue (§3).
 *
 * ⭐ PAS DE CONTRÔLE DE STOCK, contrairement aux boissons : la disponibilité
 * d'un plat dépend de ses ingrédients, et seul `mark_ready` la vérifie
 * réellement. Plafonner ici sur une valeur devinée bloquerait des commandes
 * légitimes.
 */

import { Minus, Plus, Trash2, UtensilsCrossed, Clock } from 'lucide-react';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import type { KitchenCartItem } from '../../hooks/useKitchenCart';

interface Props {
  items: KitchenCartItem[];
  onUpdateQuantity: (dishId: string, quantity: number) => void;
  onRemove: (dishId: string) => void;
  subtotal: number;
}

export function KitchenCartSection({
  items,
  onUpdateQuantity,
  onRemove,
  subtotal,
}: Props) {
  const { formatPrice } = useCurrencyFormatter();

  // ⚠️ Rien à afficher : la section disparaît entièrement plutôt que de
  // montrer un en-tête vide au-dessus d'un sous-total à 0.
  if (items.length === 0) return null;

  /**
   * Délai le PLUS LONG de la commande — c'est lui qui détermine l'attente
   * réelle du client, les plats étant préparés en parallèle.
   */
  const longestPrep = items.reduce(
    (max, i) => Math.max(max, i.dish.preparation_time_min ?? 0),
    0
  );

  return (
    <section className="mt-4 rounded-2xl border border-border bg-muted/40 p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-foreground">
          <UtensilsCrossed size={14} className="text-brand-primary" />
          Cuisine
        </h3>
        {longestPrep > 0 && (
          /* ⭐ Le délai est affiché AU MOMENT DE LA COMMANDE, pas seulement en
             cuisine : c'est ce qui permet au serveur d'annoncer l'attente au
             client plutôt que de la lui faire découvrir. */
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock size={12} />~{longestPrep} min
          </span>
        )}
      </header>

      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.dish.id}
            className="flex items-center gap-2 rounded-xl bg-card px-3 py-2 border border-border"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {item.dish.name}
              </p>
              {/* ⚠️ Les modificateurs restent VISIBLES dans le panier : c'est
                  la dernière occasion de corriger « sans piment » avant que la
                  commande ne parte en cuisine. */}
              {item.modifiers && item.modifiers.length > 0 && (
                <p className="truncate text-[11px] font-medium text-amber-700 dark:text-amber-500">
                  {item.modifiers.join(' • ')}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">
                {formatPrice(item.dish.price)} × {item.quantity}
              </p>
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted p-0.5">
              <button
                type="button"
                onClick={() => onUpdateQuantity(item.dish.id, item.quantity - 1)}
                aria-label={`Retirer un ${item.dish.name}`}
                className="flex h-6 w-6 items-center justify-center rounded-md border border-brand-subtle bg-card text-brand-primary transition-transform active:scale-90"
              >
                <Minus size={12} />
              </button>
              <span className="min-w-[1.25rem] text-center text-sm font-bold tabular-nums">
                {item.quantity}
              </span>
              <button
                type="button"
                onClick={() => onUpdateQuantity(item.dish.id, item.quantity + 1)}
                aria-label={`Ajouter un ${item.dish.name}`}
                className="flex h-6 w-6 items-center justify-center rounded-md border border-brand-subtle bg-card text-brand-primary transition-transform active:scale-90"
              >
                <Plus size={12} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => onRemove(item.dish.id)}
              aria-label={`Supprimer ${item.dish.name}`}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950"
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 space-y-1 border-t border-border pt-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-muted-foreground">Sous-total cuisine</span>
          <span className="font-bold tabular-nums">{formatPrice(subtotal)}</span>
        </div>
        {/* ⭐⭐ LE PAIEMENT DIFFÉRÉ EST DIT EXPLICITEMENT (demande du
            04/08/2026). Le moyen de paiement choisi plus bas ne vaut que pour
            les boissons : un plat est encaissé quand il est SERVI (§6). Sans
            cette phrase, le serveur croirait la commande entièrement réglée et
            oublierait de faire payer les plats. */}
        <p className="text-[11px] leading-snug text-muted-foreground">
          Ces plats partent en cuisine maintenant. Ils seront encaissés au
          moment où ils seront servis.
        </p>
      </div>
    </section>
  );
}
