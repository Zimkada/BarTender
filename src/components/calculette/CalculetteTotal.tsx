/**
 * CalculetteTotal — barre de total, en bas de l'écran de chiffrage.
 *
 * ⛔⛔ UNE SEULE ACTION : EFFACER. Jamais « Valider », jamais « Lancer la
 * vente », jamais rien qui ressemble à la sortie du panier.
 *
 * C'est LE point dur de cet écran : il montre les mêmes images et les mêmes
 * prix que la grille de vente. Un serveur pressé qui croit chiffrer alors
 * qu'il vend — ou l'inverse — produit un incident de caisse. La distinction ne
 * peut donc pas reposer sur l'attention : elle repose sur le fait qu'AUCUN
 * bouton d'ici ne peut vendre quoi que ce soit. `RootLayout` masque d'ailleurs
 * le bouton flottant du panier sur cette route, pour la même raison.
 */

import { Eraser } from 'lucide-react';

interface CalculetteTotalProps {
  total: number;
  itemCount: number;
  /** Remise promotionnelle totale — masquée si nulle. */
  totalDiscount: number;
  formatPrice: (value: number) => string;
  onClear: () => void;
}

export function CalculetteTotal({
  total,
  itemCount,
  totalDiscount,
  formatPrice,
  onClear,
}: CalculetteTotalProps) {
  const isEmpty = itemCount === 0;

  return (
    /**
     * ⚠️ `md:bottom-0` INDISPENSABLE : `MobileNavigation` retourne `null` au-
     * dessus de 1024 px. Sans lui, la barre flotterait 64 px au-dessus du vide
     * sur l'écran par lequel promoteur et gérant arrivent ici (menu latéral).
     * Même idiome que `OrderPreparation`.
     *
     * ⚠️ `pb-safe-bottom` et NON `pb-safe` : Tailwind ne définit que
     * `safe-bottom` (cf. `tailwind.config.js`), `pb-safe` ne génère AUCUN CSS.
     */
    <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-30 border-t border-border bg-card shadow-[0_-4px_12px_rgba(0,0,0,0.08)] pb-safe-bottom">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-micro font-semibold uppercase tracking-widest text-muted-foreground">
            {isEmpty ? 'Aucun article' : `${itemCount} article${itemCount > 1 ? 's' : ''}`}
          </p>
          {/*
            ⭐ À VIDE, UN TIRET ET NON « 0 FCFA ». Un zéro mis en forme dans la
            même graisse qu'un vrai montant se lit comme un résultat : « j'ai
            chiffré, ça fait zéro ». Le tiret dit qu'il n'y a rien à lire —
            distinction qui compte sur un écran qu'un collègue peut reprendre
            après un « Effacer ».
          */}
          <p
            className={`text-xl font-black tabular-nums leading-tight ${
              isEmpty ? 'text-muted-foreground/50' : 'text-foreground'
            }`}
          >
            {isEmpty ? '—' : formatPrice(total)}
          </p>
          {/* ⭐ Affiché SEULEMENT s'il y a une remise : une ligne « -0 F »
              permanente ferait douter du montant principal. */}
          {totalDiscount > 0 && (
            <p className="text-micro text-emerald-600 dark:text-emerald-400 tabular-nums">
              Promotions déduites : -{formatPrice(totalDiscount)}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onClear}
          disabled={isEmpty}
          className="
            flex items-center gap-2 shrink-0
            rounded-xl border border-border bg-muted px-4 py-2.5
            text-body-sm font-semibold text-foreground
            active:scale-95 transition-transform
            disabled:opacity-40 disabled:active:scale-100
          "
        >
          <Eraser size={16} />
          Effacer
        </button>
      </div>
    </div>
  );
}
