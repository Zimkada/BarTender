/**
 * DishForm
 * Création et modification d'un plat.
 *
 * ⭐⭐ §16.8 — DEUX CHOIX, PAS TROIS
 * Le plan est explicite : « La distinction batch / batch_finish N'A PAS À ÊTRE
 * DEMANDÉE : si la recette contient des ingrédients marqués
 * consumed_at_stage='finish', il y a une finition ; sinon, non. Le système le
 * DÉDUIT au lieu de l'exiger. »
 * Ce formulaire ne propose donc que « à la commande » ou « préparé d'avance ».
 * Le régime précis est dérivé par le serveur à l'enregistrement de la recette.
 *
 * ⚠️ Les libellés techniques (`on_order`, `batch_finish`) ne sortent JAMAIS
 * dans l'UI (§16.8 : « Libellés UI en langage clair, jamais le nom technique »).
 */

import { useState } from 'react';
import { AlertTriangle, Plus, X, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import type { DishRow, DishInput } from '../../services/supabase/dishes.service';

interface DishCategoryOption {
  id: string;
  name: string;
}

interface Props {
  /** `undefined` = création. */
  dish?: DishRow;
  categories: DishCategoryOption[];
  isSaving: boolean;
  /**
   * ⚠️ SECOND ARGUMENT OPTIONNEL (§19.5) : les formats de prix, envoyés dans
   * un appel SÉPARÉ par le parent (`replace_dish_price_options`) car
   * `upsert_dish` ne les connaît pas. Optionnel pour ne casser aucun appelant.
   *
   * ⭐ Tableau VIDE = « ce plat n'a plus de formats », instruction ACTIVE qui
   * les retire tous. `undefined` = « ne touche pas aux formats ». La
   * distinction compte : sans elle, décocher la case ne retirerait rien.
   */
  onSave: (
    dish: DishInput,
    priceOptions?: Array<{ label: string; price: number; sort_order: number }>
  ) => void;
  onCancel: () => void;
  /**
   * ⭐ Création de catégorie EN LIGNE.
   *
   * Le besoin naît ICI et nulle part ailleurs : « je crée mon plat, il me faut
   * une catégorie qui n'existe pas encore ». Renvoyer vers un écran de gestion
   * de catégories obligerait à abandonner la saisie en cours — le §13.12
   * identifie précisément ce genre de friction comme risque d'abandon.
   *
   * Retourne l'id créé pour que le formulaire le sélectionne aussitôt.
   */
  onCreateCategory: (name: string) => Promise<string | null>;
  isCreatingCategory: boolean;
}

export function DishForm({
  dish,
  categories,
  isSaving,
  onSave,
  onCancel,
  onCreateCategory,
  isCreatingCategory,
}: Props) {
  const [name, setName] = useState(dish?.name ?? '');
  const [price, setPrice] = useState<string>(dish ? String(dish.price) : '');
  const [categoryId, setCategoryId] = useState(dish?.category_id ?? '');
  const [prepTime, setPrepTime] = useState<string>(
    dish?.preparation_time_min ? String(dish.preparation_time_min) : ''
  );

  /** Saisie de nouvelle catégorie — repliée par défaut. */
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const handleCreateCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;

    // ⚠️ Garde anti-double-soumission — le bouton « Créer » est désactivé
    // pendant l'appel, mais la touche ENTRÉE contourne cette protection : une
    // double frappe rapide enverrait deux requêtes. Comme la garde d'unicité
    // lit AVANT d'écrire, les deux pourraient passer et créer un doublon.
    // C'est la seule façon réaliste d'atteindre cette fenêtre de concurrence.
    if (isCreatingCategory) return;

    const createdId = await onCreateCategory(trimmed);

    // ⚠️ En cas d'échec (nom déjà pris), on GARDE la saisie ouverte et son
    // contenu : l'utilisateur corrige au lieu de tout retaper. Le toast
    // d'erreur est géré par la mutation.
    if (createdId) {
      setCategoryId(createdId);
      setNewCategoryName('');
      setShowNewCategory(false);
    }
  };

  /**
   * ⭐ « Préparé d'avance » = `is_batch_base` (le plat produit un lot).
   * C'est le SEUL des deux axes que l'utilisateur déclare ; `production_mode`
   * est dérivé par le serveur.
   */
  const [preparedInAdvance, setPreparedInAdvance] = useState(dish?.is_batch_base ?? false);
  /**
   * ⭐ §19.1 - « Le client peut demander à compléter une boule d'akassa ou une
   * portion de frite ». Un plat-base sert surtout à composer, mais certains se
   * vendent AUSSI seuls : c'est le bar qui tranche, pas le modèle.
   *
   * ⚠️ Défaut `true` : à la création d'un plat-base, il reste visible tant que
   * l'utilisateur n'a rien décidé. Le défaut sûr est celui qui ne cache rien.
   */
  const [sellable, setSellable] = useState(dish?.is_sellable ?? true);
  const [portions, setPortions] = useState<string>(
    dish?.portions_per_batch ? String(dish.portions_per_batch) : ''
  );

  /**
   * ⭐ §19.5 — FORMATS DE PRIX, désactivés par défaut.
   *
   * Répond au carton de poisson non trié : le même plat se vend 2 000 F avec
   * un gros poisson et 1 000 F avec un petit. Mêmes ingrédients, même recette,
   * même coût — seul le PRIX varie.
   *
   * ⚠️ REPLIÉ tant que le gérant ne l'active pas. Trois mécanismes optionnels
   * qui s'empilent rendraient ce formulaire illisible : celui qui vend à prix
   * fixe ne doit rien voir de plus qu'avant.
   */
  const [useFormats, setUseFormats] = useState(
    (dish?.dish_price_options?.length ?? 0) > 1
  );

  /**
   * ⚠️ Le prix reste du TEXTE tant qu'on saisit — leçon du 09/08 : convertir à
   * chaque frappe détruit la saisie (taper « 15 » donne 1 puis 15, effacer
   * réécrit 0) et `parseFloat('1,5')` vaut 1 sur un clavier français.
   */
  const [formats, setFormats] = useState<Array<{ label: string; price: string }>>(() => {
    const existing = dish?.dish_price_options ?? [];
    if (existing.length > 1) {
      return existing.map((o) => ({ label: o.label, price: String(o.price) }));
    }
    // ⭐ Trois SUGGESTIONS, pas un référentiel : le gérant renomme, supprime,
    // complète. Un poulet se vend « Entier / Demi », une boisson « 33 / 50cl ».
    return [
      { label: 'Grand', price: '' },
      { label: 'Moyen', price: '' },
      { label: 'Petit', price: '' },
    ];
  });

  /** ⚠️ Accepte la virgule : clavier français. Miroir de `parseQty` (09/08). */
  const parseAmount = (v: string): number => parseFloat(v.replace(',', '.'));

  const activeFormats = useFormats
    ? formats
        .filter((f) => f.label.trim() && f.price.trim())
        .map((f, i) => ({
          label: f.label.trim(),
          price: parseAmount(f.price),
          sort_order: i,
        }))
    : [];

  const priceValue = parseFloat(price);
  const portionsValue = parseInt(portions, 10);

  /**
   * Validation en miroir des contraintes serveur — évite un aller-retour
   * réseau pour une erreur évidente. Le serveur reste la seule autorité.
   */
  const validationError = (() => {
    if (!name.trim()) return 'Le nom du plat est obligatoire';

    /**
     * ⭐ §19.5 — avec des formats, le prix du plat n'est plus demandé : il
     * devient une valeur technique (`dishes.price` est NOT NULL) que
     * `create_kitchen_order` ignore au profit du format choisi. Le remplir
     * automatiquement évite de poser au gérant une question sans usage.
     */
    if (!useFormats && (!price || Number.isNaN(priceValue) || priceValue < 0)) {
      return 'Indiquez un prix de vente';
    }

    if (useFormats) {
      // ⚠️ Miroir de la garde SQL : un choix unique n'est pas un choix, il
      // impose une étape au serveur sans rien lui apprendre.
      if (activeFormats.length < 2) {
        return 'Indiquez au moins deux formats, avec leur nom et leur prix';
      }
      if (activeFormats.some((f) => Number.isNaN(f.price) || f.price < 0)) {
        return 'Chaque format doit avoir un prix valide';
      }
      // ⚠️ Miroir du `lower(TRIM(...))` serveur : la contrainte UNIQUE est
      // sensible à la casse, « Grand » et « grand » y passeraient tous deux.
      const labels = activeFormats.map((f) => f.label.toLowerCase());
      if (new Set(labels).size !== labels.length) {
        return 'Deux formats portent le même nom';
      }
    }
    // ⚠️ Miroir de `dishes_batch_portions_coherence` : sans rendement, le coût
    // d'une portion serait une division par NULL, donc silencieusement nul.
    if (preparedInAdvance && (!portions || Number.isNaN(portionsValue) || portionsValue <= 0)) {
      return 'Indiquez combien de portions donne une préparation';
    }
    return null;
  })();

  const handleSubmit = () => {
    if (validationError) return;

    onSave({
      id: dish?.id,
      name: name.trim(),
      /**
       * ⭐ §19.5 — avec des formats, `price` est rempli AUTOMATIQUEMENT avec
       * le prix du premier format. La base l'exige (NOT NULL) mais plus rien
       * ne le lit : les grilles affichent une fourchette, et la commande relit
       * le prix du format choisi. Demander ce chiffre au gérant serait une
       * question sans usage ; y mettre 0 ferait afficher « 0 F » partout où un
       * écran non encore adapté lirait `dish.price`.
       */
      price: useFormats ? activeFormats[0].price : priceValue,
      category_id: categoryId || null,
      preparation_time_min: prepTime ? parseInt(prepTime, 10) : null,
      is_batch_base: preparedInAdvance,
      // ⚠️ `null` obligatoire quand le plat n'est pas préparé d'avance : la
      // contrainte SQL refuse un rendement sur un plat qui n'en produit pas.
      portions_per_batch: preparedInAdvance ? portionsValue : null,
      /**
       * ⭐ §19.1 - la case n'existe QUE pour un plat-base. Un plat normal est
       * vendable par nature : envoyer `true` en dur pour lui évite qu'un état
       * résiduel du formulaire le fasse disparaître de la carte.
       */
      is_sellable: preparedInAdvance ? sellable : true,
      is_available: dish?.is_available ?? true,
    },
    /**
     * ⭐ TABLEAU VIDE quand la case est décochée, jamais `undefined` : c'est
     * une instruction ACTIVE de retirer les formats existants. Passer
     * `undefined` laisserait un plat afficher une fourchette après que le
     * gérant a demandé un prix ferme.
     */
    activeFormats);
  };

  const inputClass =
    'w-full h-11 rounded-md border border-border bg-background px-3 text-sm';

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="dish-name" className="block text-sm font-medium mb-1.5">
          Nom du plat
        </label>
        <input
          id="dish-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          placeholder="Poulet braisé"
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* ⭐ §19.5 — le champ prix DISPARAÎT quand les formats sont actifs :
            le garder demanderait un chiffre que plus rien ne facture. */}
        {!useFormats && (
          <div>
            <label htmlFor="dish-price" className="block text-sm font-medium mb-1.5">
              Prix de vente
            </label>
            <input
              id="dish-price"
              type="number"
              inputMode="numeric"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className={inputClass}
              placeholder="2500"
            />
          </div>
        )}

        {/* ⭐⭐ §19.5 — FORMATS DE PRIX, repliés par défaut.
            Un gérant qui vend à prix fixe ne voit qu'une case décochée. */}
        <div className="rounded-lg border border-border p-3">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={useFormats}
              onChange={(e) => setUseFormats(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">
                Plusieurs prix selon la taille
              </span>
              <span className="block text-caption text-muted-foreground">
                Pour un plat dont la taille varie d'une assiette à l'autre - un
                poisson pris dans un carton, par exemple. Le serveur choisira le
                format à la commande.
              </span>
            </span>
          </label>

          {useFormats && (
            <div className="mt-3 space-y-2">
              {formats.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={f.label}
                    onChange={(e) =>
                      setFormats((cur) =>
                        cur.map((x, j) => (j === i ? { ...x, label: e.target.value } : x))
                      )
                    }
                    className={cn(inputClass, 'flex-1')}
                    placeholder="Grand"
                    aria-label={`Nom du format ${i + 1}`}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={f.price}
                    onChange={(e) =>
                      setFormats((cur) =>
                        cur.map((x, j) => (j === i ? { ...x, price: e.target.value } : x))
                      )
                    }
                    className={cn(inputClass, 'w-28')}
                    placeholder="2000"
                    aria-label={`Prix du format ${i + 1}`}
                  />
                  {/* ⚠️ Retrait possible jusqu'à DEUX lignes : en dessous, la
                      validation refuse de toute façon. */}
                  <button
                    type="button"
                    onClick={() => setFormats((cur) => cur.filter((_, j) => j !== i))}
                    disabled={formats.length <= 2}
                    className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                    aria-label={`Supprimer le format ${i + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setFormats((cur) => [...cur, { label: '', price: '' }])}
                className="text-caption text-brand-primary hover:underline"
              >
                + Ajouter un format
              </button>

              {/* ⚠️ Dit ce qui se passe AVANT que le gérant ne s'en étonne :
                  un format retiré reste dans l'historique des ventes. */}
              <p className="text-caption text-muted-foreground">
                Un format retiré ne disparaît pas de vos ventes passées.
              </p>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="dish-prep" className="block text-sm font-medium mb-1.5">
            Temps de préparation
          </label>
          <div className="flex items-center gap-1.5">
            <input
              id="dish-prep"
              type="number"
              inputMode="numeric"
              min={1}
              value={prepTime}
              onChange={(e) => setPrepTime(e.target.value)}
              className={inputClass}
              placeholder="25"
            />
            <span className="text-sm text-muted-foreground">min</span>
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="dish-category" className="block text-sm font-medium mb-1.5">
          Catégorie
        </label>
        <div className="flex items-center gap-2">
          <select
            id="dish-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={cn(inputClass, 'flex-1 min-w-0')}
          >
            <option value="">Sans catégorie</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* ⚠️ Zone de tap ≥ 44px - cohérent avec le reste du module. */}
          {!showNewCategory && (
            <button
              type="button"
              onClick={() => setShowNewCategory(true)}
              className="h-11 w-11 flex-shrink-0 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label="Créer une catégorie de plats"
              title="Créer une catégorie"
            >
              <Plus size={18} />
            </button>
          )}
        </div>

        {/* ⭐ Création EN LIGNE — évite d'abandonner la saisie du plat pour
            aller créer une catégorie ailleurs (§13.12 : la friction est le
            principal risque d'abandon). */}
        {showNewCategory && (
          <div className="mt-2 flex items-center gap-2">
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => {
                // Entrée valide, Échap annule — attendu dans un champ inline.
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreateCategory();
                }
                if (e.key === 'Escape') {
                  // ⚠️⚠️ INDISPENSABLE : `Modal` écoute Escape sur `document`
                  // sans filtrer la cible. Sans stopPropagation, l'événement
                  // remonte et FERME TOUTE LA MODALE — l'utilisateur qui voulait
                  // seulement annuler la saisie de catégorie perdrait tout son
                  // formulaire de plat.
                  e.stopPropagation();
                  setShowNewCategory(false);
                  setNewCategoryName('');
                }
              }}
              className={cn(inputClass, 'flex-1 min-w-0')}
              placeholder="Grillades, Riz, Accompagnements…"
              autoFocus
              aria-label="Nom de la nouvelle catégorie"
            />
            <Button
              type="button"
              size="sm"
              onClick={handleCreateCategory}
              disabled={isCreatingCategory || !newCategoryName.trim()}
              className="flex-shrink-0"
            >
              {isCreatingCategory ? '…' : 'Créer'}
            </Button>
            <button
              type="button"
              onClick={() => {
                setShowNewCategory(false);
                setNewCategoryName('');
              }}
              className="h-11 w-11 flex-shrink-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent transition-colors"
              aria-label="Annuler la création de catégorie"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {categories.length === 0 && !showNewCategory && (
          <p className="mt-1 text-xs text-muted-foreground">
            Aucune catégorie de plats - utilisez le bouton + pour en créer une.
          </p>
        )}
      </div>

      {/* ⭐ §16.8 — DEUX choix seulement. Le troisième régime (batch_finish)
          est DÉDUIT de la recette par le serveur, jamais demandé ici. */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium mb-1.5">Mode de préparation</legend>

        {[
          {
            value: false,
            label: 'Préparé à la commande',
            hint: 'Cuisiné quand le client le commande. Peut prélever dans d’autres plats préparés d’avance.',
          },
          {
            value: true,
            label: 'Préparé d\'avance',
            hint: 'Cuisiné en quantité, puis servi à la portion. Ne peut pas prélever dans un autre plat.',
          },
        ].map((option) => (
          <label
            key={String(option.value)}
            className={cn(
              'flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
              preparedInAdvance === option.value
                ? 'border-brand-primary bg-brand-subtle'
                : 'border-border hover:bg-accent'
            )}
          >
            <input
              type="radio"
              name="preparation-mode"
              checked={preparedInAdvance === option.value}
              onChange={() => setPreparedInAdvance(option.value)}
              className="mt-0.5 h-4 w-4 accent-brand"
            />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="block text-xs text-muted-foreground">{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {/* ⛔⛔ AVERTISSEMENT AVANT LA PERTE — défaut trouvé au test terrain du
          08/08/2026. Un plat composé qu'on bascule en « préparé d'avance »
          perd sa composition : le §13.8 n'autorise QU'UN SEUL NIVEAU, donc le
          bouton Composition disparaît et le plat repart des ingrédients bruts.
          ⚠️ L'utilisateur découvrait cela par l'ABSENCE d'un bouton, sans
          jamais faire le lien avec la case qu'il venait de cocher — et son
          lot produit n'était plus consommé par personne.
          ⭐ `production_mode === 'batch_finish'` SUFFIT à détecter le cas : ce
          régime est DÉRIVÉ de l'existence de composants (§16.8). Inutile de
          charger la composition pour le savoir. */}
      {preparedInAdvance && dish?.production_mode === 'batch_finish' && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <AlertTriangle
            size={16}
            className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400"
          />
          <p className="text-xs text-amber-900 dark:text-amber-200">
            Ce plat prélève actuellement dans d’autres plats préparés d’avance.
            En l’enregistrant ainsi, il perdra sa composition et repartira de
            ses ingrédients bruts - un plat préparé d’avance ne peut pas
            prélever dans un autre.
          </p>
        </div>
      )}

      {preparedInAdvance && (
        <div>
          <label htmlFor="dish-portions" className="block text-sm font-medium mb-1.5">
            Portions par préparation
          </label>
          <input
            id="dish-portions"
            type="number"
            inputMode="numeric"
            min={1}
            value={portions}
            onChange={(e) => setPortions(e.target.value)}
            className={inputClass}
            placeholder="20"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Combien d'assiettes donne une préparation ? Sert à calculer le coût d'une portion.
          </p>
        </div>
      )}

      {/* ⭐ §19.1 — VENDABLE SEUL, uniquement pour un plat préparé d'avance.
          Un plat normal est vendable par nature : lui poser la question
          ajouterait un choix sans objet.
          ⚠️ Le libellé parle de ce que l'utilisateur VOIT (« proposé à la
          vente »), pas du modèle (« is_sellable »). */}
      {preparedInAdvance && (
        <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer transition-colors hover:bg-accent">
          <input
            type="checkbox"
            checked={sellable}
            onChange={(e) => setSellable(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-brand"
          />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium">Proposer à la vente</span>
            <span className="block text-xs text-muted-foreground">
              Décochez si ce plat sert uniquement à en composer d'autres. Il
              restera produit et prélevé, mais n'apparaîtra pas sur l'écran de
              vente.
            </span>
          </span>
        </label>
      )}

      {validationError && (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertTriangle size={15} />
          {validationError}
        </p>
      )}

      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} className="flex-1" disabled={isSaving}>
          Annuler
        </Button>
        <Button
          onClick={handleSubmit}
          className="flex-1"
          disabled={isSaving || !!validationError}
        >
          {isSaving ? 'Enregistrement…' : dish ? 'Enregistrer' : 'Créer le plat'}
        </Button>
      </div>
    </div>
  );
}
