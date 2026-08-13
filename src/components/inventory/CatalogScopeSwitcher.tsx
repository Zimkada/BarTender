/**
 * CatalogScopeSwitcher
 * Sélecteur de portée du catalogue : Tout / Boissons / Plats.
 *
 * ⭐ TROIS POSITIONS, PAS UN BASCULEUR BINAIRE — même raison que le
 * `ScopeSwitcher` du dashboard (§9) : « un basculeur binaire obligerait le
 * promoteur à faire l'addition mentalement ». Il doit pouvoir voir son offre
 * complète d'un coup.
 *
 * ⭐⭐ §3 — SUR UN BAR PUR, CE COMPOSANT NE REND RIEN.
 * Pas une position grisée, pas un onglet vide : ABSENT. Le §3 est explicite —
 * « un bar pur ne doit pas être PRESQUE inchangé, il doit être STRICTEMENT
 * identique ». Un sélecteur à une seule position serait un contrôle menteur.
 *
 * ⚠️ ZÉRO REQUÊTE au changement de portée (§9) : les deux listes sont déjà en
 * cache (`useCategories` pour les boissons, `useDishCategories` pour les
 * plats). Le sélecteur ne fait que filtrer.
 */

import { Beer, ChefHat, LayoutGrid } from 'lucide-react';
import { cn } from '../../lib/utils';

export type CatalogScope = 'all' | 'products' | 'dishes';

interface Props {
  scope: CatalogScope;
  onScopeChange: (scope: CatalogScope) => void;
  /**
   * §3 — le composant ne rend RIEN si le bar n'a pas de cuisine.
   * Passé explicitement plutôt que lu du contexte : ce composant reste ainsi
   * testable isolément, et l'appelant garde la responsabilité de la garde.
   */
  hasRestaurant: boolean;
  /** Compteurs affichés en pastille. Omis = pas de pastille. */
  productCount?: number;
  dishCount?: number;
  className?: string;
}

const SCOPES: ReadonlyArray<{
  id: CatalogScope;
  label: string;
  Icon: typeof Beer;
}> = [
  { id: 'all', label: 'Tout', Icon: LayoutGrid },
  { id: 'products', label: 'Boissons', Icon: Beer },
  { id: 'dishes', label: 'Plats', Icon: ChefHat },
];

export function CatalogScopeSwitcher({
  scope,
  onScopeChange,
  hasRestaurant,
  productCount,
  dishCount,
  className,
}: Props) {
  // ⭐ §3 — bar pur : le sélecteur n'existe pas.
  if (!hasRestaurant) return null;

  const countFor = (id: CatalogScope): number | undefined => {
    if (id === 'products') return productCount;
    if (id === 'dishes') return dishCount;
    if (productCount == null && dishCount == null) return undefined;
    return (productCount ?? 0) + (dishCount ?? 0);
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* ⚠️ Label MASQUÉ sur mobile — signalé en test le 04/08/2026 : sur un
          téléphone, « AFFICHER » + trois pilules débordent et « Plats » est
          coupé au bord de l'écran. Le geste devient impossible.
          ⭐ Le label reste utile sur grand écran (Inventaire, desktop) où
          l'espace ne manque pas et où la portée est moins évidente. Sur
          mobile, les trois pilules se suffisent — l'icône dit déjà tout. */}
      <span className="hidden sm:inline text-micro text-muted-foreground uppercase">
        Afficher
      </span>
      {/* ⚠️ Même motif visuel que le sélecteur de tri de cette page
          (radiogroup en pilule) : deux ergonomies pour un même geste sur un
          même écran seraient une incohérence gratuite. */}
      <div
        role="radiogroup"
        aria-label="Portée du catalogue"
        className="inline-flex items-center p-0.5 bg-muted rounded-full border border-border"
      >
        {SCOPES.map(({ id, label, Icon }) => {
          const isActive = scope === id;
          const count = countFor(id);

          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => onScopeChange(id)}
              className={cn(
                // ⚠️ Padding resserré sur mobile : trois pilules à `px-3`
                // débordaient sur un téléphone étroit, rendant « Plats »
                // inatteignable. `whitespace-nowrap` empêche un libellé de se
                // couper en deux lignes dans une pilule.
                'flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-full text-caption whitespace-nowrap transition-all',
                isActive
                  ? 'bg-card text-brand-primary shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground font-medium'
              )}
            >
              <Icon size={14} />
              <span>{label}</span>
              {count != null && (
                <span className="ml-0.5 text-micro tabular-nums opacity-70">{count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
