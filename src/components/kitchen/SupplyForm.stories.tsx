/**
 * ⚠️ `@storybook/react` et non `@storybook/react-vite` — ESLint le signale
 * (`storybook/no-renderer-packages`), et il a raison sur le principe : le
 * framework configuré dans `.storybook/main.ts` EST `react-vite`.
 *
 * ⭐ On reste néanmoins ALIGNÉ sur les 13 stories existantes du projet, qui
 * importent toutes ce chemin. Corriger celle-ci seule créerait deux
 * conventions pour un même type de fichier — pire que l'avertissement qu'on
 * évite. La migration se fera en une fois, ou pas du tout.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { SupplyForm } from './SupplyForm';
import type { IngredientWithAlerts } from '../../hooks/pivots/useUnifiedKitchen';

/**
 * Saisie d'un approvisionnement d'ingrédient — module restauration.
 *
 * ⭐⭐ DEUX MÉCANISMES PORTENT LA VALEUR DE CE FORMULAIRE, et les stories
 * ci-dessous existent pour les rendre observables :
 *
 * 1. La CONVERSION achat → unité de suivi. Le promoteur achète « 3 sacs de
 *    25 kg à 12 000 F le sac » ; lui demander un prix au kilo l'obligerait à
 *    diviser de tête à chaque livraison — donc à arrondir, donc à fausser le
 *    coût matière que tout le module promet d'être juste.
 *
 * 2. Le MODE D'ACHAT, choisi et non deviné. Une détection automatique sur la
 *    nature de l'unité (« morceau ⟹ pas de contenant ») s'est révélée FAUSSE
 *    au premier contre-exemple : de la viande achetée au kilo mais servie au
 *    morceau. Voir `AchatEnGros` et `AchatALUnite`.
 */
const meta = {
  title: 'Kitchen/SupplyForm',
  component: SupplyForm,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          "Approvisionnement d'un ingrédient. La conversion contenant → unité de suivi est faite ici, une fois, sans arrondi.",
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SupplyForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Fabrique un ingrédient de démonstration. */
const makeIngredient = (
  over: Partial<IngredientWithAlerts> = {}
): IngredientWithAlerts => ({
  id: 'ing-riz',
  bar_id: 'bar-1',
  name: 'Riz',
  unit: 'kg',
  cost_mode: 'direct',
  flat_cost_per_dish: null,
  current_stock: 10,
  last_unit_cost: 500,
  min_stock_alert: null,
  is_active: true,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  isLowStock: false,
  hasDebt: false,
  expiringLotsCount: 0,
  ...over,
});

const INGREDIENTS: IngredientWithAlerts[] = [
  makeIngredient(),
  makeIngredient({ id: 'ing-viande', name: 'Viande de boeuf', unit: 'morceau' }),
  makeIngredient({ id: 'ing-huile', name: 'Huile', unit: 'L', current_stock: 4 }),
];

/**
 * ⭐ Le cas le plus courant : achat en GROS, suivi à l'unité de mesure.
 * Sélectionnez « Riz », saisissez 3 lots de 25 kg à 12 000 F — le
 * récapitulatif affiche 75 kg à 480 F/kg. C'est cette division que le
 * promoteur n'a plus à faire de tête.
 */
export const AchatEnGros: Story = {
  // ⚠️ `args` porte les props — `render` ne fait que les PROPAGER. Les
  // dupliquer dans le JSX les ferait diverger silencieusement : le panneau
  // Controls de Storybook modifierait `args` sans effet sur le rendu.
  args: { ingredients: INGREDIENTS, onSubmit: () => {}, onCancel: () => {} },
  render: (args) => (
    <div className="w-[420px]">
      <SupplyForm {...args} />
    </div>
  ),
};

/**
 * ⭐⭐ Achat À L'UNITÉ — cochez « J'achète au morceau » après avoir choisi
 * « Viande de boeuf ».
 *
 * Le champ « Chaque lot contient » DISPARAÎT et les libellés nomment l'unité
 * réelle : « Combien de morceaux ? », « Prix d'un morceau ».
 *
 * ⚠️ La case est DÉCOCHÉE par défaut, même sur une unité dénombrable. C'est
 * délibéré : de la viande achetée AU KILO mais servie AU MORCEAU a besoin du
 * champ de conversion (5 kg ≈ 33 morceaux). Le masquer automatiquement
 * supprimerait le seul endroit où cette conversion s'exprime.
 */
export const AchatALUnite: Story = {
  args: {
    ingredients: INGREDIENTS,
    initialIngredientId: 'ing-viande',
    onSubmit: () => {},
    onCancel: () => {},
  },
  render: (args) => (
    <div className="w-[420px]">
      <SupplyForm {...args} />
    </div>
  ),
};

/**
 * ⚠️ STOCK NÉGATIF — un avertissement prévient que l'appro soldera d'abord
 * les dettes (§13.2).
 *
 * Sans ce message, le gérant s'étonnerait d'un stock final inférieur à ce
 * qu'il vient de saisir.
 */
export const StockNegatif: Story = {
  args: {
    ingredients: [
      makeIngredient({ id: 'ing-dette', name: 'Tomate', current_stock: -3, hasDebt: true }),
    ],
    initialIngredientId: 'ing-dette',
    onSubmit: () => {},
    onCancel: () => {},
  },
  render: (args) => (
    <div className="w-[420px]">
      <SupplyForm {...args} />
    </div>
  ),
};

/**
 * ⭐ ENVOI EN COURS — le bouton se verrouille.
 *
 * ⚠️ La clé d'idempotence est fixée à l'OUVERTURE, pas à la soumission : un
 * double-clic envoie DEUX FOIS LA MÊME CLÉ, et le RPC reconnaît le rejeu. Sans
 * cela, chaque clic produirait son propre lot — stock doublé, marge fausse,
 * aucune erreur visible.
 */
export const EnCoursDEnvoi: Story = {
  args: {
    ingredients: INGREDIENTS,
    isSubmitting: true,
    onSubmit: () => {},
    onCancel: () => {},
  },
  render: (args) => (
    <div className="w-[420px]">
      <SupplyForm {...args} />
    </div>
  ),
};

/**
 * ⭐⭐ RÉINITIALISATION APRÈS SUCCÈS — cliquez « Simuler un enregistrement ».
 *
 * Le formulaire se vide ENTIÈREMENT, ingrédient compris. Ce n'est pas un
 * détail d'ergonomie : un formulaire qui reste rempli après validation ne dit
 * pas « c'est enregistré », il dit « rien ne s'est passé ». Le geste naturel
 * est de re-cliquer — et comme la clé d'idempotence vient d'être renouvelée,
 * ce second envoi créerait un VRAI second lot.
 *
 * ⚠️ Le champ vide est donc le SIGNAL DE RÉUSSITE.
 */
export const ResetApresSucces: Story = {
  args: { ingredients: INGREDIENTS, onSubmit: () => {}, onCancel: () => {} },
  render: (args) => {
    const [resetSignal, setResetSignal] = useState(0);

    return (
      <div className="w-[420px] space-y-3">
        <button
          type="button"
          onClick={() => setResetSignal((n) => n + 1)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm"
        >
          Simuler un enregistrement réussi
        </button>
        <SupplyForm {...args} resetSignal={resetSignal} />
      </div>
    );
  },
};

/**
 * ⚠️ AUCUN INGRÉDIENT — le formulaire doit rester compréhensible.
 *
 * Cas atteignable sur un bar qui vient d'activer sa cuisine : le promoteur
 * arrive sur l'appro avant d'avoir créé son premier ingrédient.
 */
export const SansIngredient: Story = {
  // ⚠️ Liste VIDE dans args — pas INGREDIENTS. Les deux se seraient
  // contredits si render avait garde son propre tableau.
  args: { ingredients: [], onSubmit: () => {}, onCancel: () => {} },
  render: (args) => (
    <div className="w-[420px]">
      <SupplyForm {...args} />
    </div>
  ),
};
