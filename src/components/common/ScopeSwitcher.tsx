/**
 * ScopeSwitcher
 * Sélecteur de portée — Tout / Bar / Restau (§9).
 *
 * ⭐ TROIS POSITIONS, PAS UN BASCULEUR BINAIRE
 * « Un basculeur binaire obligerait le promoteur à faire l'addition
 * mentalement — régression par rapport à aujourd'hui » (§9). La position
 * « Tout » n'est pas un confort : c'est la vue par défaut, celle qui répond à
 * « combien j'ai fait aujourd'hui ».
 *
 * ⭐⭐ §3 — SUR UN BAR PUR, CE COMPOSANT NE REND RIEN.
 * Pas une position grisée, pas un onglet vide : ABSENT. « Un bar pur ne doit
 * pas être PRESQUE inchangé, il doit être STRICTEMENT identique. » Un sélecteur
 * à une seule position utile serait un contrôle menteur.
 *
 * ⚠️ ZÉRO REQUÊTE au changement de portée (§9). Ce composant ne fait que
 * remonter un état ; le filtrage se fait sur des données DÉJÀ en cache.
 * L'egress a fait l'objet de 3 vagues d'optimisation — un refetch par clic les
 * annulerait.
 *
 * ⚠️ PARTAGÉ entre le Dashboard et l'Historique. Le §9 ne le prévoyait que
 * pour le Dashboard ; l'étendre à l'Historique est une décision du 04/08/2026 :
 * les deux écrans montrent des agrégats de ventes, et deux sélecteurs
 * différents pour le même geste seraient une incohérence.
 */

import { Beer, ChefHat, LayoutGrid } from 'lucide-react';
import { cn } from '../../lib/utils';

// ⚠️ Type et règles dans `scopeHelpers.ts` : les exporter d'ici casserait
// le Fast Refresh (un fichier de composant ne doit exporter que des composants).
import type { ActivityScope } from './scopeHelpers';
export type { ActivityScope };

interface Props {
  scope: ActivityScope;
  onScopeChange: (scope: ActivityScope) => void;
  /**
   * §3 — le composant ne rend RIEN si le bar n'a pas de cuisine.
   * Passé explicitement plutôt que lu du contexte : le composant reste
   * testable isolément et l'appelant garde la responsabilité de la garde.
   */
  hasRestaurant: boolean;
  className?: string;
}

const SCOPES: ReadonlyArray<{
  id: ActivityScope;
  label: string;
  Icon: typeof Beer;
}> = [
  { id: 'all', label: 'Tout', Icon: LayoutGrid },
  { id: 'bar', label: 'Bar', Icon: Beer },
  { id: 'kitchen', label: 'Restau', Icon: ChefHat },
];

export function ScopeSwitcher({ scope, onScopeChange, hasRestaurant, className }: Props) {
  // ⭐ §3 — bar pur : le sélecteur n'existe pas.
  if (!hasRestaurant) return null;

  return (
    /**
     * ⭐ « Afficher » PRÉCÈDE le sélecteur en desktop (demande du 08/08/2026).
     * Sans lui, trois pastilles flottent sans dire de quoi elles parlent : sur
     * un écran qui porte déjà un filtre de période, rien ne distingue « ce que
     * je regarde » de « quand je le regarde ».
     *
     * ⛔ MASQUÉ SOUS `sm` : sur téléphone la place va aux cibles tactiles, et
     * le mot volerait la largeur des trois positions.
     * ⚠️ `aria-hidden` : le groupe porte déjà `aria-label="Portée des
     * statistiques"`. Sans cela un lecteur d'écran annoncerait deux intitulés
     * concurrents pour un seul contrôle.
     */
    <div className={cn('flex items-center gap-2', className)}>
      <span
        aria-hidden="true"
        className="hidden shrink-0 text-caption font-medium text-muted-foreground sm:inline"
      >
        Afficher
      </span>

      <div
        role="radiogroup"
        aria-label="Portée des statistiques"
        /**
         * ⭐ PLEINE LARGEUR SUR MOBILE, largeur alignée sur `PeriodFilter` en
         * desktop - les deux cohabitent sur le Dashboard et l'Historique.
         *
         * ⚠️ `inline-flex` ne s'étire JAMAIS : le sélecteur restait court et
         * flottait à gauche pendant que le bandeau de période occupait toute la
         * ligne. Deux contrôles du même écran, deux largeurs - l'œil y lit une
         * hiérarchie qui n'existe pas.
         *
         * ⚠️ La largeur desktop se joue sur `sm:min-w-[90px]` des BOUTONS, pas
         * ici : étirer le conteneur seul aurait espacé les positions sans les
         * agrandir.
         */
        className="flex w-full items-center p-0.5 bg-muted rounded-full border border-border sm:w-auto"
      >
        {SCOPES.map(({ id, label, Icon }) => {
          const isActive = scope === id;

          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => onScopeChange(id)}
              /**
               * ⚠️ `flex-1` sur mobile : les trois positions se partagent la
               * largeur à parts égales, ce qui agrandit les cibles tactiles sur
               * un écran utilisé debout.
               *
               * ⭐ `sm:min-w-[90px]` reprend EXACTEMENT la valeur de
               * `PeriodFilter`. C'est ce qui manquait : le sélecteur revenait à
               * sa largeur naturelle en desktop et paraissait rabougri à côté
               * du filtre de période, sur les mêmes écrans (défaut relevé le
               * 08/08/2026).
               *
               * ⚠️ `justify-center` : sans lui, les libellés se colleraient à
               * gauche de leur zone une fois celle-ci élargie.
               */
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 px-3 py-1.5',
                'rounded-full text-caption transition-all',
                'sm:flex-none sm:min-w-[90px]',
                isActive
                  ? 'bg-card text-brand-primary shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground font-medium'
              )}
            >
              <Icon size={14} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}


/**
 * ⏸ PAS de variante compacte pour l'instant.
 *
 * Le §9 prévoit un « sélecteur compact (emojis seuls) » sur mobile, « avec
 * header + onglets + BonStrip, le premier chiffre descend bas ». Une première
 * version se contentait de réduire la taille du texte — ce qui n'est pas ce
 * que le §9 demande, et aurait laissé croire le besoin traité.
 *
 * ⚠️ À reprendre quand le BonStrip existera (phase 3B) : c'est lui qui crée la
 * contrainte de hauteur. La mesurer avant d'y répondre évite d'optimiser un
 * encombrement qu'on n'a pas encore.
 */
