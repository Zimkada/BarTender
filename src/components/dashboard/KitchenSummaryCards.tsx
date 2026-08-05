/**
 * KitchenSummaryCards
 * Cartes du Dashboard en portée RESTAU — §8, §9.
 *
 * ⭐⭐ CE BLOC REMPLACE, IL NE COMPLÈTE PAS.
 *
 * En portée Restau, trois cartes du Dashboard n'ont aucun sens :
 *   · Retours       — un plat ne se retourne pas (§13.1)
 *   · Consignations — réservées aux bouteilles
 *   · Alertes stock — porte sur `bar_products`, pas sur les ingrédients
 *
 * ⛔ Les masquer laisserait un écran à trous. Les afficher à zéro
 * suggérerait qu'un plat POURRAIT être retourné. On les remplace donc par
 * ce que la cuisine a de réellement utile à dire.
 *
 * ⭐ AUCUN CALCUL NOUVEAU : `useUnifiedKitchenQueue` expose déjà les trois
 * états de la file, et `useUnifiedKitchen` les alertes ingrédients. Les
 * queries sont partagées avec l'écran Service — donc en cache.
 *
 * ⚠️ §3 — les deux hooks portent `enabled: hasRestaurant` : sur un bar pur,
 * aucune requête ne part et ce composant n'est jamais monté.
 */

import { ChefHat, Flame, HandPlatter, Carrot, RotateCcw } from 'lucide-react';
import { useUnifiedKitchenQueue } from '../../hooks/pivots/useUnifiedKitchenQueue';
import { useUnifiedKitchen } from '../../hooks/pivots/useUnifiedKitchen';
import { useAuth } from '../../context/AuthContext';

interface Props {
  barId: string | undefined;
  /**
   * Journée commerciale courante, au format `YYYY-MM-DD`.
   * ⚠️ N'est PLUS lue depuis le retrait des cartes Pertes / Préparation (les
   * seules qui bornaient sur une date). Conservée dans le contrat : l'appelant
   * la passe déjà, et les métriques du §8 pourraient y revenir.
   */
  businessDate?: string;
}

/**
 * Étiquette d'univers — « Bar » ou « Restau ».
 *
 * ⭐ VOLONTAIREMENT EN GRIS. Les trois couleurs sémantiques du projet
 * (brand / succès / danger) signalent une ACTION ou un ÉTAT. Or l'univers
 * d'une carte n'est ni l'un ni l'autre : c'est une provenance. La colorer
 * entrerait en concurrence avec le rouge d'« Alertes », qui, lui, doit
 * rester le seul élément qui saute aux yeux.
 */
function ScopeTag({ kind }: { kind: 'bar' | 'restau' }) {
  return (
    <span className="px-1.5 py-px rounded text-micro font-medium bg-muted text-muted-foreground border border-border leading-tight">
      {kind === 'bar' ? 'Bar' : 'Restau'}
    </span>
  );
}

interface CardProps {
  label: string;
  value: number | string;
  hint: string;
  icon: React.ReactNode;
  tone?: 'neutral' | 'warn' | 'danger';
  /**
   * ⭐ Étiquette d'univers, affichée UNIQUEMENT en portée « Tout ».
   *
   * ⛔ Elle ne sert QUE sur les cartes qui ne s'additionnent PAS : Alertes
   * (boissons) et Ingrédients mesurent deux stocks différents, les sommer
   * n'aurait aucun sens. Les cartes CA / Ventes / Articles, elles, sont de
   * vraies sommes — les étiqueter les ferait passer pour des moitiés.
   *
   * ⚠️ En portée Bar ou Restau, l'étiquette est REDONDANTE (le sélecteur
   * l'affiche déjà) : ne la passer qu'en « Tout ».
   */
  scopeTag?: 'bar' | 'restau';
}

function Card({ label, value, hint, icon, tone = 'neutral', scopeTag }: CardProps) {
  const border =
    tone === 'danger'
      ? 'border-red-200 dark:border-red-900/40'
      : tone === 'warn'
        ? 'border-amber-200 dark:border-amber-900/40'
        : 'border-border';

  const iconBg =
    tone === 'danger'
      ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400'
      : tone === 'warn'
        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
        : 'bg-brand-subtle text-brand-primary';

  const valueColor =
    tone === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-foreground';

  return (
    <div
      className={`bg-card rounded-2xl p-4 shadow-sm border ${border} hover:shadow-md transition-shadow`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconBg}`}>
          {icon}
        </div>
        {/* ⚠️ `items-end` et non `items-center` : l'etiquette s aligne sous le
            label, sans decaler verticalement les cartes qui n en ont pas. */}
        <div className="flex flex-col items-end gap-1 min-w-0">
          <span className="text-micro text-muted-foreground truncate">{label}</span>
          {scopeTag && <ScopeTag kind={scopeTag} />}
        </div>
      </div>
      <div className={`text-h2 font-semibold tabular-nums ${valueColor}`}>{value}</div>
      <p className="text-caption text-muted-foreground mt-1">{hint}</p>
    </div>
  );
}

export function KitchenSummaryCards({ barId }: Props) {
  /**
   * ⭐ CE COMPOSANT NE CHARGE PLUS QUE LA FILE — un seul hook.
   *
   * Depuis le retrait des cartes Ingrédients / Pertes / Préparation (cf. le
   * commentaire du `return`), il n'a plus besoin ni du stock ingrédients, ni
   * des métriques, ni du formateur de prix.
   *
   * ⛔ Effet de bord VOULU et important : la fuite du stock ingrédients vers
   * le serveur disparaît ici PAR SUPPRESSION DE LA CAUSE, et non par une
   * garde. Plus aucune requête ingrédients ni métriques ne part de cet écran,
   * quel que soit le rôle. La garde reste en place là où le hook est encore
   * monté — `MixedScopeKitchenCards` et `KitchenVigilanceList`.
   */
  const { counts } = useUnifiedKitchenQueue(barId);

  return (
    <>
      {/* ⭐ À FAIRE — ce que la cuisine n'a pas encore commencé. */}
      <Card
        label="À faire"
        value={counts.todo}
        hint="plats en attente"
        icon={<ChefHat size={18} />}
        tone={counts.todo > 0 ? 'warn' : 'neutral'}
      />

      <Card
        label="En cours"
        value={counts.doing}
        hint="en préparation"
        icon={<Flame size={18} />}
      />

      {/* ⭐⭐ PRÊT — la carte la plus ACTIONNABLE du bloc : ces plats ont déjà
          coûté leur matière et refroidissent. Un chiffre qui monte pendant le
          service signale un problème de salle, pas de cuisine. */}
      <Card
        label="Prêt"
        value={counts.done}
        hint="à servir maintenant"
        icon={<HandPlatter size={18} />}
        tone={counts.done > 0 ? 'warn' : 'neutral'}
      />

      {/* ⛔ INGRÉDIENTS, PERTES et PRÉPARATION ONT ÉTÉ RETIRÉES DE CET ÉCRAN.
          Elles portaient le total à 9 cartes (3 communes + 6), soit sur
          mobile une 4e ligne avec UNE SEULE carte. La grille
          `grid-cols-2 md:grid-cols-3 lg:grid-cols-6` exige 6.

          ⭐ Le choix n'est pas arbitraire : « À faire / En cours / Prêt »
          sont les trois états d'une MÊME file — isolément ils ne veulent
          rien dire, ensemble ils racontent le service en cours. C'est la
          valeur propre d'un tableau de bord.
          · Ingrédients → le panneau « Vigilance ingrédients » juste en
            dessous dit la même chose, en plus détaillé.
          · Pertes et Préparation → du BILAN, pas du pilotage : leur place
            est dans l'Historique, avec le sélecteur de période (§8).

          ⭐ Effet secondaire heureux : la file ne dépend d'AUCUNE permission,
          donc le compte de 6 tient pour le serveur sans cas particulier. */}
    </>
  );
}

/**
 * ⭐⭐ LES DEUX CARTES CUISINE DU MODE « TOUT » — §8, §9.
 *
 * En portée « Tout », le Dashboard n'affichait QUE des cartes bar : le mode
 * censé tout montrer était le seul à cacher la moitié du restaurant. Un
 * promoteur n'y voyait ni ses plats prêts, ni ses ingrédients manquants.
 *
 * ⛔ LA GRILLE DOIT RESTER À 6 CARTES. `grid-cols-2 md:grid-cols-3
 * lg:grid-cols-6` : 6 est le SEUL total propre aux trois paliers (3 lignes
 * pleines sur mobile, 2 sur tablette, 1 en desktop). 7 laisserait une carte
 * orpheline sur mobile, 8 casserait la tablette. On ÉCHANGE donc, on
 * n'ajoute pas : Retours et Consignations cèdent leur place, et restent
 * entiers en portée Bar.
 *
 * ⚠️ CE COMPOSANT REND EXACTEMENT DEUX CARTES, TOUJOURS. C'est ce qui
 * garantit le compte de 6. La carte Ingrédients étant masquée au serveur,
 * elle est REMPLACÉE par Retours (et non retirée) : sans cela le serveur
 * tomberait à 5 — impair, donc une carte seule en fin de grille, exactement
 * ce qu'on veut éviter sur petit écran.
 */
export function MixedScopeKitchenCards({
  barId,
  returnsCount,
  pendingReturnsCount,
}: {
  barId: string | undefined;
  returnsCount: number;
  pendingReturnsCount: number;
}) {
  const { hasPermission } = useAuth();
  const { counts } = useUnifiedKitchenQueue(barId);

  // ⛔ Meme garde qu ailleurs : les lots portent `unit_cost`, et le serveur
  // n a pas acces a l ecran Ingredients. Coupure A LA SOURCE (barId undefined).
  const canSeeIngredients = hasPermission('canManageIngredientStock');
  const { lowStockIngredients, ingredientsInDebt, expiringLots } =
    useUnifiedKitchen(canSeeIngredients ? barId : undefined);

  // ⚠️ Meme regle de dedoublonnage que la carte de la portee Restau : un Set
  // d identifiants, jamais `Math.max` (les ensembles ne s incluent pas).
  const ingredientAlerts = new Set([
    ...lowStockIngredients.map((i) => i.id),
    ...ingredientsInDebt.map((i) => i.id),
  ]).size;
  const totalAlerts = ingredientAlerts + expiringLots.length;

  return (
    <>
      {canSeeIngredients ? (
        <Card
          label="Ingrédients"
          value={totalAlerts}
          hint={
            expiringLots.length > 0
              ? `dont ${expiringLots.length} lot${expiringLots.length > 1 ? 's' : ''} à écouler`
              : 'stock à surveiller'
          }
          icon={<Carrot size={18} />}
          tone={totalAlerts > 0 ? 'danger' : 'neutral'}
          scopeTag="restau"
        />
      ) : (
        /* ⭐ Le SERVEUR recupere Retours a la place : une carte qui le
           concerne vraiment, et le compte de 6 est preserve. */
        <Card
          label="Retours"
          value={returnsCount}
          hint={`${pendingReturnsCount} en attente`}
          icon={<RotateCcw size={18} />}
          scopeTag="bar"
        />
      )}

      {/* ⭐⭐ PRÊT — la carte cuisine la plus urgente : ces plats ont deja
          coute leur matiere et refroidissent. C est pour elle qu on a libere
          une place. */}
      <Card
        label="Prêt"
        value={counts.done}
        hint="à servir maintenant"
        icon={<HandPlatter size={18} />}
        tone={counts.done > 0 ? 'warn' : 'neutral'}
        scopeTag="restau"
      />
    </>
  );
}

/**
 * Panneau « Points de vigilance » en portée RESTAU.
 *
 * ⭐ Remplace la liste des BOISSONS en stock bas, qui n'a rien à dire de la
 * cuisine : ses alertes portent sur `bar_products`, une table où un
 * ingrédient n'existe pas.
 *
 * ⚠️ Trois natures d'alerte dans UNE seule liste — stock bas, dette,
 * péremption. Elles appellent le même geste : aller voir l'écran
 * Ingrédients. Les séparer fragmenterait une action unique.
 */
export function KitchenVigilanceList({ barId }: { barId: string | undefined }) {
  const { hasPermission } = useAuth();
  /**
   * ⛔ MEME GARDE que la carte Ingredients : le SERVEUR n a pas acces a
   * l ecran Ingredients, lui charger ces donnees elargirait une exposition
   * inexistante ailleurs (les lots portent un cout unitaire).
   */
  const canSeeIngredients = hasPermission('canManageIngredientStock');
  const { lowStockIngredients, ingredientsInDebt, expiringLots } =
    useUnifiedKitchen(canSeeIngredients ? barId : undefined);

  /**
   * ⚠️ DÉDOUBLONNAGE par id : un ingrédient en dette est AUSSI en stock bas
   * (un stock négatif est sous n'importe quel seuil). Sans cette Map, il
   * apparaîtrait deux fois dans la liste.
   * ⭐ Les DETTES d'abord : un stock négatif est plus urgent qu'un seuil
   * franchi — la matière a déjà été consommée sans être approvisionnée.
   */
  const alerts = new Map<string, { id: string; name: string; stock: number; isDebt: boolean }>();
  for (const i of ingredientsInDebt) {
    alerts.set(i.id, { id: i.id, name: i.name, stock: i.current_stock, isDebt: true });
  }
  for (const i of lowStockIngredients) {
    if (!alerts.has(i.id)) {
      alerts.set(i.id, { id: i.id, name: i.name, stock: i.current_stock, isDebt: false });
    }
  }
  const list = Array.from(alerts.values());

  // ⚠️ Sans la permission, le panneau ne dit RIEN plutot que « tout va bien » :
  // affirmer que les stocks sont sains sur des donnees non chargees serait
  // un mensonge.
  if (!canSeeIngredients) {
    return (
      <p className="py-8 text-center text-caption text-muted-foreground">
        Le suivi des ingrédients est réservé à la gestion.
      </p>
    );
  }

  if (list.length === 0 && expiringLots.length === 0) {
    return (
      <div className="py-8 text-center bg-green-50 dark:bg-green-950/30 rounded-xl border border-dashed border-green-200 dark:border-green-900/40">
        <p className="text-body-sm text-green-700 dark:text-green-400 font-medium">
          Tous vos ingrédients sont au-dessus des seuils ✓
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {list.slice(0, 5).map((i) => (
        <div key={i.id} className="flex justify-between items-center py-1">
          <span className="text-body-sm text-foreground/80 truncate min-w-0">
            {i.name}
          </span>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            {/* ⭐ « Manque » et non « Restant » sur une dette : un stock
                négatif n'est pas un reste, c'est un découvert (§13.2). */}
            <span className="text-caption text-muted-foreground">
              {i.isDebt ? 'Manque' : 'Restant'}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-caption font-semibold tabular-nums">
              {i.isDebt ? Math.abs(i.stock) : i.stock}
            </span>
          </div>
        </div>
      ))}

      {/* ⚠️ Les péremptions sont comptées à part : ce n'est pas un manque de
          stock mais une matière qui va être PERDUE si elle n'est pas
          utilisée — un geste différent (cuisiner, pas commander). */}
      {expiringLots.length > 0 && (
        <p className="text-caption text-amber-700 dark:text-amber-400 pt-1">
          {expiringLots.length} lot{expiringLots.length > 1 ? 's' : ''} arrive
          {expiringLots.length > 1 ? 'nt' : ''} à péremption
        </p>
      )}
    </div>
  );
}
