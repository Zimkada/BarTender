/**
 * IngredientSizesEditor — tailles d'un ingrédient acheté en gros (§19.6).
 *
 * ⭐ LE BESOIN, remonté du terrain et déjà pratiqué au cahier. Un carton de
 * poisson contient des tailles différentes. À la réception, le restaurateur
 * trie et compte : « ce carton a 12 grands, 20 moyens, 8 petits ». Ce comptage
 * sert au CONTRÔLE A POSTERIORI — si 18 grands ont été vendus alors que le
 * carton n'en contenait que 12, il y a un problème.
 *
 * ⛔⛔ CE BLOC NE TOUCHE NI AU STOCK NI AU COÛT. Déclarer des tailles ne
 * scinde pas le stock : vendre un « Grand » retire UN poisson du stock commun.
 * Et le carton garde son prix global, chaque unité portant le CUMP - répartir
 * ce prix entre les tailles exigerait une clé que personne ne possède.
 *
 * ⭐ SUR L'INGRÉDIENT ET NON SUR LE PLAT : un même carton alimente plusieurs
 * plats (poisson braisé ET frit). « Grand » est une caractéristique du
 * poisson, pas d'une recette.
 *
 * ⚠️ EN MODIFICATION UNIQUEMENT. La RPC exige un ingrédient EXISTANT : à la
 * création, l'id n'existe pas encore. Le bloc ne se rend donc pas - c'est ce
 * que garde `ingredientId`, jamais une condition dans le parent.
 */

import { useState, useEffect } from 'react';
import { Trash2, Ruler } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { useIngredientSizes } from '../../hooks/queries/useIngredientsQueries';
import { useIngredientMutations } from '../../hooks/mutations/useIngredientMutations';

interface Props {
  barId: string | undefined;
  /** `undefined` = création : le bloc ne se rend pas. */
  ingredientId: string | undefined;
  ingredientName: string;
}

/** ⭐ Suggestions, PAS un référentiel : le gérant renomme et complète. */
const DEFAULT_LABELS = ['Grand', 'Moyen', 'Petit'];

export function IngredientSizesEditor({ barId, ingredientId, ingredientName }: Props) {
  const { data: existing = [], isLoading } = useIngredientSizes(barId, ingredientId);
  const { replaceSizes } = useIngredientMutations();

  const [enabled, setEnabled] = useState(false);
  const [labels, setLabels] = useState<string[]>(DEFAULT_LABELS);

  /**
   * ⛔ SYNCHRONISATION APRÈS CHARGEMENT - et c'est le motif qui a piégé ce
   * module QUATRE fois : une donnée pas encore chargée lue comme ABSENTE.
   *
   * `existing` vaut `[]` pendant le fetch. Initialiser l'état directement
   * afficherait « aucune taille » sur un ingrédient qui en a, et enregistrer
   * dans cet état les RETIRERAIT toutes.
   *
   * ⚠️ La garde `isLoading` est donc indispensable, pas défensive.
   */
  useEffect(() => {
    if (isLoading) return;
    if (existing.length > 0) {
      setEnabled(true);
      setLabels(existing.map((s) => s.label));
    }
  }, [isLoading, existing]);

  // ⚠️ Rien à afficher en création : la RPC exige un ingrédient existant.
  if (!ingredientId) return null;

  const cleaned = labels.map((l) => l.trim()).filter(Boolean);

  /**
   * ⚠️ MIROIR de la garde serveur : la contrainte UNIQUE est sensible à la
   * casse, « Grand » et « grand » y passeraient tous les deux.
   */
  const hasDuplicates =
    new Set(cleaned.map((l) => l.toLowerCase())).size !== cleaned.length;

  const canSave = enabled
    ? cleaned.length > 0 && !hasDuplicates
    : existing.length > 0; // désactiver n'a de sens que s'il y avait des tailles

  const handleSave = () => {
    if (!ingredientId || !canSave) return;
    replaceSizes.mutate({
      // ⭐ Liste VIDE = instruction ACTIVE de tout retirer. C'est ce qui rend
      // la case décochable : sans elle, décocher ne ferait rien.
      ingredientId,
      sizes: enabled ? cleaned.map((label, i) => ({ label, sort_order: i })) : [],
    });
  };

  return (
    <div className="rounded-lg border border-border p-3">
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-brand"
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <Ruler size={14} />
            Trier par taille à la réception
          </span>
          <span className="block text-caption text-muted-foreground">
            Pour un ingrédient acheté en gros dont les unités n'ont pas la même
            taille - un carton de poisson, par exemple. Vous pourrez compter
            chaque livraison et vérifier ensuite ce qui a été vendu.
          </span>
        </span>
      </label>

      {enabled && (
        <div className="mt-3 space-y-2">
          {labels.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={label}
                onChange={(e) =>
                  setLabels((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))
                }
                className={cn(
                  'flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm',
                  'focus:border-brand-primary focus:outline-none'
                )}
                placeholder="Grand"
                aria-label={`Nom de la taille ${i + 1}`}
              />
              <button
                type="button"
                onClick={() => setLabels((cur) => cur.filter((_, j) => j !== i))}
                disabled={labels.length <= 1}
                className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                aria-label={`Supprimer la taille ${i + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setLabels((cur) => [...cur, ''])}
            className="text-caption text-brand-primary hover:underline"
          >
            + Ajouter une taille
          </button>

          {hasDuplicates && (
            <p className="text-caption text-red-600 dark:text-red-400">
              Deux tailles portent le même nom.
            </p>
          )}

          {/* ⚠️ Dit ce qui se passe AVANT que le gérant ne s'en étonne : une
              taille retirée reste dans l'historique des comptages. */}
          <p className="text-caption text-muted-foreground">
            Une taille retirée ne disparaît pas de vos livraisons passées.
          </p>
        </div>
      )}

      {/*
        ⚠️ BOUTON SÉPARÉ du formulaire de l'ingrédient, et c'est délibéré :
        les tailles passent par une RPC DISTINCTE de `upsert_ingredient`. Les
        fusionner ferait croire qu'un seul enregistrement suffit, alors que
        deux appels indépendants ont lieu - dont un peut échouer seul.
      */}
      <div className="mt-3 flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={handleSave}
          disabled={!canSave || replaceSizes.isPending}
        >
          {replaceSizes.isPending
            ? 'Enregistrement…'
            : `Enregistrer les tailles de « ${ingredientName} »`}
        </Button>
      </div>
    </div>
  );
}

IngredientSizesEditor.displayName = 'IngredientSizesEditor';
