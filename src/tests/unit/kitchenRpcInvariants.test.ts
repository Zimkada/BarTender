/**
 * kitchenRpcInvariants.test.ts
 *
 * ⭐⭐ LES INVARIANTS DES RPC CUISINE, VÉRIFIÉS SUR LE TEXTE DU SQL.
 *
 * ⛔ POURQUOI CE FICHIER EXISTE — un angle mort complet, mesuré le 06/08/2026.
 * Deux défauts graves sont passés en production ce jour-là pendant que les
 * 857 tests restaient VERTS :
 *   · l'écran cuisinier affichait 0 alors qu'un plat venait d'être servi ;
 *   · « Rentabilité cuisine » renvoyait `null` sur une journée à 2 500 F.
 * Aucun test ne pouvait les voir : tous mockent la couche service et ne
 * regardent jamais le SQL. Les seules vérifications réelles étaient les
 * post-vols — exécutés À LA MAIN, une seule fois, jamais rejoués.
 *
 * ⚠️ CE QUE CES TESTS NE FONT PAS. Ils ne valident PAS des résultats de
 * requête : cela demanderait une vraie base. Ils protègent les propriétés
 * STRUCTURELLES dont la violation est silencieuse — pas d'erreur, pas
 * d'exception, juste un chiffre faux ou une métrique éteinte.
 *
 * ⭐ Chaque assertion correspond à un post-vol de migration. La différence,
 * c'est qu'ici elle rejoue à chaque `npm test`, au lieu d'une fois à la main.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

/**
 * Concatène toutes les migrations touchant une fonction, dans l'ordre
 * chronologique (les noms sont horodatés `YYYYMMDDHHMMSS`), et renvoie la
 * DERNIÈRE définition — celle qui est réellement en base.
 *
 * ⚠️ Prendre la dernière et non la première : une RPC peut être corrigée par
 * une migration ultérieure, et c'est précisément le cas ici (deux corrections
 * le 06/08/2026). Tester la définition d'origine validerait un état périmé.
 */
function lastDefinitionOf(functionName: string): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let last: string | null = null;
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf-8');
    // ⚠️ On cherche la CRÉATION, pas une simple mention : un commentaire
    // citant le nom de la fonction ne doit pas être pris pour sa définition.
    const re = new RegExp(
      `CREATE(?:\\s+OR\\s+REPLACE)?\\s+FUNCTION\\s+public\\.${functionName}\\s*\\(`,
      'i'
    );
    if (re.test(sql)) {
      const start = sql.search(re);
      /**
       * ⛔⛔ BORNER À LA FIN DU CORPS — défaut trouvé le 09/08/2026 en
       * CERTIFIANT un nouvel invariant : la régression injectée n'était pas
       * détectée.
       *
       * Le `slice(start)` sans borne renvoyait TOUT le fichier à partir de la
       * fonction. Dès qu'une migration en contient deux, la première
       * « contenait » le corps de la seconde : un invariant sur `close_batch`
       * passait au vert grâce à du code de `record_batch_loss`.
       *
       * ⚠️ Silencieux et GÉNÉRALISÉ : tous les tests portant sur une migration
       * multi-fonctions étaient concernés, sans qu'aucun n'échoue.
       *
       * ⭐ `$$;` termine un corps PL/pgSQL et n'apparaît pas à l'intérieur -
       * les corps de ce module sont tous délimités par `AS $$ … $$;`.
       */
      const body = sql.slice(start);
      const end = body.indexOf('$$;');
      last = end === -1 ? body : body.slice(0, end + 3);
    }
  }

  if (!last) throw new Error(`Aucune définition trouvée pour ${functionName}`);
  return last;
}

/** Retire les commentaires SQL : seul le code exécuté fait foi. */
function codeOnly(sql: string): string {
  return sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('get_kitchen_production — aucun montant ne peut fuir', () => {
  const sql = codeOnly(lastDefinitionOf('get_kitchen_production'));

  /**
   * ⛔⛔ L'INVARIANT QUI JUSTIFIE L'EXISTENCE DE CETTE RPC.
   *
   * Le cuisinier a `canViewKitchenCosts: false` (§8 : « il voit les
   * quantités, pas les montants »). La protection ne tient PAS à une garde
   * applicative — celle-ci se contourne en lisant la réponse réseau — mais au
   * fait que la fonction NE CALCULE PAS ces colonnes.
   *
   * ⚠️ Réintroduire `unit_price` ici, même pour un calcul intermédiaire,
   * rouvrirait la fuite. C'est le post-vol n°3 de la migration 20260806100000,
   * rejoué automatiquement.
   */
  it.each(['unit_price', 'computed_cost', 'revenue', 'margin', 'loss_cost'])(
    'ne référence jamais `%s`',
    (colonne) => {
      expect(sql).not.toMatch(new RegExp(`\\b${colonne}\\b`, 'i'));
    }
  );

  /**
   * ⭐ Chaque compteur sur SA date d'événement — le défaut du 06/08/2026.
   * Un plat commandé le 4 et servi le 5 comptait dans les « servis du 4 »,
   * un jour où cette assiette n'avait rien servi.
   */
  it('borne les plats servis sur `served_at`, pas sur `created_at`', () => {
    expect(sql).toMatch(/served_at/);
  });

  it('borne les pertes sur `consumed_at`', () => {
    expect(sql).toMatch(/consumed_at/);
  });

  /**
   * ⚠️ La perte n'est DÉFINITIVE que si le plat est annulé. Sans ce filtre,
   * les plats `ready` qui attendent leur serveur — cas normal en plein
   * service — seraient comptés comme perdus : le cuisinier verrait des pertes
   * fantômes disparaître au fil du service et cesserait de croire le chiffre.
   */
  it("n'appelle perte qu'un plat `cancelled`", () => {
    expect(sql).toMatch(/status\s*=\s*'cancelled'/);
  });

  /** ⭐ Journée commerciale : le bar ferme après minuit. */
  it('applique la journée commerciale du bar', () => {
    expect(sql).toMatch(/closing_hour/);
    expect(sql).toMatch(/AT TIME ZONE/);
  });

  /** ⛔ SECURITY DEFINER sans `search_path` figé = résolution détournable. */
  it('fige le search_path', () => {
    expect(sql).toMatch(/SET search_path\s*=\s*public/i);
  });

  /** ⛔ En SECURITY DEFINER la RLS ne s'applique pas : garde explicite. */
  it('filtre explicitement l’appartenance au bar', () => {
    expect(sql).toMatch(/is_bar_member\s*\(|can_write_kitchen\s*\(/);
  });
});

describe('get_kitchen_metrics — les pertes ne doivent jamais s’éteindre', () => {
  const sql = codeOnly(lastDefinitionOf('get_kitchen_metrics'));

  /**
   * ⛔⛔ LE POINT DE RUPTURE DE LA MIGRATION 20260806160000.
   *
   * Le CA cuisine reprend `sales.business_date` — même source que le CA
   * global, pour que les deux chiffres du même écran ne divergent jamais.
   * Mais une PERTE a `sale_id IS NULL` par définition : un `JOIN` simple les
   * ferait TOUTES disparaître, sans lever la moindre erreur. La métrique la
   * plus précieuse du module s'éteindrait en silence.
   *
   * ⚠️ C'est exactement le genre de régression qu'une relecture rapide laisse
   * passer — « JOIN » et « LEFT JOIN » se ressemblent.
   */
  it('joint `sales` en LEFT, jamais en JOIN simple', () => {
    expect(sql).toMatch(/LEFT\s+JOIN\s+public\.sales/i);
    // Aucun JOIN sur sales qui ne soit précédé de LEFT.
    const jointuresSeches = sql.match(/(?<!LEFT\s)JOIN\s+public\.sales/gi);
    expect(jointuresSeches).toBeNull();
  });

  /**
   * ⭐ Le CA REPREND `business_date`, il ne la recalcule pas. Recalculer
   * depuis `served_at` créerait une seconde méthode de calcul : deux chiffres
   * du même écran finiraient par diverger, et le gérant ne saurait plus
   * lequel croire.
   */
  it('borne le CA sur `sales.business_date`', () => {
    expect(sql).toMatch(/s\.business_date/);
  });

  /** ⚠️ Une perte n'a pas de vente dont emprunter la journée. */
  it('borne les pertes sur `consumed_at` et non sur la vente', () => {
    expect(sql).toMatch(/consumed_at/);
    expect(sql).toMatch(/sale_id\s+IS\s+NULL/i);
  });

  it("n'appelle perte qu'un plat `cancelled`", () => {
    expect(sql).toMatch(/status\s*=\s*'cancelled'/);
  });

  it('applique la journée commerciale du bar', () => {
    expect(sql).toMatch(/closing_hour/);
  });

  it('fige le search_path', () => {
    expect(sql).toMatch(/SET search_path\s*=\s*public/i);
  });

  it('filtre explicitement l’appartenance au bar', () => {
    expect(sql).toMatch(/is_bar_member\s*\(|can_write_kitchen\s*\(/);
  });
});

describe('replace_dish_components — le niveau unique n’est pas contournable', () => {
  const sql = codeOnly(lastDefinitionOf('replace_dish_components'));

  /**
   * ⛔⛔ LE DÉFAUT DE LA CODE REVIEW DU 07/08/2026.
   *
   * Le garde par ligne refuse un plat-base DÉJÀ composé. Il ne couvre qu'un
   * sens :
   *   · B composé de C, puis A composé de B → refusé ✓
   *   · A composé de B, puis B composé de C → PASSAIT, profondeur 2
   *
   * ⚠️ Le second ordre est la façon NATURELLE de saisir : composer le plat
   * vendu, puis détailler la base. Le garde le plus important du RPC (§13.8)
   * était donc contournable par un usage normal.
   *
   * ⭐ Le garde symétrique ferme aussi TOUS les cycles : un plat ne peut
   * jamais être à la fois composé et servir de base, donc le graphe reste
   * plat par construction.
   */
  it('refuse de composer un plat qui sert déjà de base (garde symétrique)', () => {
    expect(sql).toMatch(/base_dish_id\s*=\s*p_dish_id/);
  });

  /** ⭐ Le garde dans l'autre sens : un plat-base déjà composé est refusé. */
  it('refuse un plat-base lui-même composé (garde par ligne)', () => {
    expect(sql).toMatch(/dish_id\s*=\s*v_base_id/);
  });

  /**
   * ⚠️ Vider la composition d'un plat utilisé comme base doit rester
   * POSSIBLE — c'est la façon de sortir d'une situation bloquée. Le garde
   * symétrique ne doit donc s'appliquer que sur une composition non vide.
   */
  it('laisse vider une composition même sur un plat utilisé comme base', () => {
    expect(sql).toMatch(/jsonb_array_length\(p_lines\)\s*>\s*0/);
  });

  /** ⛔ On ne prélève que dans un plat qui PRODUIT un lot. */
  it('exige que le plat-base soit un plat-base', () => {
    expect(sql).toMatch(/is_batch_base\s*=\s*TRUE/i);
  });

  /**
   * ⛔ Isolation multi-tenant : composer avec le plat d'un autre bar.
   *
   * ⚠️ ACCEPTE LES DEUX GARDES depuis le 11/08 : `can_write_kitchen` a
   * remplacé `is_bar_member` sur les RPC d'ÉCRITURE (§19.7), parce que
   * `is_bar_member` ne teste AUCUN rôle - un serveur y passait. Exiger
   * l'ancien nom ferait échouer ce test sur une fonction MIEUX protégée.
   */
  it('filtre explicitement l’appartenance au bar', () => {
    expect(sql).toMatch(/is_bar_member\s*\(|can_write_kitchen\s*\(/);
    expect(sql).toMatch(/bar_id\s*=\s*p_bar_id/);
  });

  it('fige le search_path', () => {
    expect(sql).toMatch(/SET search_path\s*=\s*public/i);
  });
});

describe('derive_dish_production_mode — la règle de régime, en un seul endroit', () => {
  const sql = codeOnly(lastDefinitionOf('derive_dish_production_mode'));

  /**
   * ⛔⛔ LE DÉFAUT CORRIGÉ PAR 3B.0. `replace_dish_recipe` dérivait
   * `batch_finish` uniquement si le plat était LUI-MÊME un plat-base. Or le
   * cas central du régime est l'inverse : le spaghetti-poulet prélève dans le
   * lot d'un AUTRE plat et n'est pas plat-base. Il tombait en `on_order` et
   * n'aurait jamais prélevé de lot — le régime était inapplicable.
   */
  it('déduit batch_finish depuis les COMPOSANTS, pas seulement is_batch_base', () => {
    expect(sql).toMatch(/dish_recipe_components/);
    expect(sql).toMatch(/v_has_components/);
  });

  /**
   * ⚠️ L'ORDRE compte : « a des composants » doit être testé AVANT « est
   * plat-base ». Un plat qui prélève dans un lot est servi par prélèvement,
   * qu'il produise ou non le sien.
   */
  it('teste les composants en premier dans le CASE', () => {
    const posComponents = sql.search(/WHEN v_has_components/);
    const posIsBase = sql.search(/WHEN NOT v_is_base/);
    expect(posComponents).toBeGreaterThan(-1);
    expect(posIsBase).toBeGreaterThan(-1);
    expect(posComponents).toBeLessThan(posIsBase);
  });
});

describe('produce_batch — la matière sortie doit toujours produire un lot', () => {
  const sql = codeOnly(lastDefinitionOf('produce_batch'));

  /**
   * ⛔⛔ LE DÉFAUT DE LA CODE REVIEW DU 07/08/2026.
   *
   * `consume_ingredients_fefo` attrape ses propres erreurs et retourne
   * `success: false` SANS LEVER. Un simple `RETURN` en réponse sortirait donc
   * NORMALEMENT de la fonction — et validerait tout ce qui a précédé.
   *
   * ⚠️ Il n'y a pas de ROLLBACK dans une fonction PL/pgSQL : `RAISE` +
   * `EXCEPTION` est le SEUL moyen d'annuler réellement. Sans lui, rien ne
   * garantit que l'appelant annule sa propre transaction en voyant l'échec.
   */
  it('LÈVE une exception si le FEFO échoue, au lieu de retourner', () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'FEFO_FAILED/);
  });

  /** ⭐ Et la rattrape pour restituer le message métier, pas le marqueur. */
  it('rattrape FEFO_FAILED et n’expose pas le marqueur technique', () => {
    expect(sql).toMatch(/WHEN raise_exception THEN/);
    expect(sql).toMatch(/SQLERRM LIKE 'FEFO_FAILED:%'/);
  });

  /**
   * ⛔⛔ SEULS LES INGRÉDIENTS 'batch'. C'est LA distinction du régime : le
   * poulet bouilli du matin ne consomme pas l'huile de friture, qui part à la
   * finition. Consommer tout ici sortirait de l'huile pour des portions
   * peut-être jamais servies.
   */
  it('ne consomme que les ingrédients de production', () => {
    expect(sql).toMatch(/consumed_at_stage\s*=\s*'batch'/);
  });

  /**
   * ⛔ Le coût divise par les portions RÉELLEMENT produites, jamais par
   * `portions_per_batch`. Un lot de 12 quand la fiche en prévoit 20 doit
   * coûter le douzième du réel — sinon chaque portion est sous-évaluée
   * de 40 %.
   */
  it('divise le coût par les portions produites, pas par la fiche', () => {
    expect(sql).toMatch(/v_total_cost\s*\/\s*p_produced_qty/);
    expect(sql).not.toMatch(/v_total_cost\s*\/\s*.*portions_per_batch/);
  });

  /**
   * ⭐ La course d'idempotence est un cas NOMINAL, pas une incohérence.
   * Sans branche dédiée, un double-clic afficherait « Incohérence de données
   * détectée » — un message alarmant pour un comportement normal.
   */
  it('traite la course d’idempotence comme un rejeu, pas comme une erreur', () => {
    const posUnique = sql.search(/WHEN unique_violation THEN/);
    const posCheck = sql.search(/WHEN check_violation/);
    expect(posUnique).toBeGreaterThan(-1);
    // ⚠️ L'ORDRE compte : `unique_violation` doit être traité AVANT le
    // handler générique qui la qualifierait d'invariant cassé.
    if (posCheck > -1) expect(posUnique).toBeLessThan(posCheck);
    expect(sql).toMatch(/idempotent_replay/);
  });

  /** ⚠️ Seul un plat-base produit un lot. */
  it('exige un plat-base', () => {
    expect(sql).toMatch(/is_batch_base\s*=\s*TRUE/i);
  });

  /** ⭐ Journée commerciale du BAR, pas 6 en dur comme la machine d'état. */
  it('utilise le closing_hour du bar', () => {
    expect(sql).toMatch(/closing_hour/);
  });

  // ⚠️ Accepte `can_write_kitchen` depuis le 11/08 — cf. commentaire plus haut.
  it('filtre explicitement l’appartenance au bar', () => {
    expect(sql).toMatch(/is_bar_member\s*\(|can_write_kitchen\s*\(/);
  });

  it('fige le search_path', () => {
    expect(sql).toMatch(/SET search_path\s*=\s*public/i);
  });
});

describe('mark_kitchen_item_ready — le stock des plats on_order ne doit jamais cesser de bouger', () => {
  const sql = codeOnly(lastDefinitionOf('mark_kitchen_item_ready'));

  /**
   * ⛔⛔⛔ LE PIÈGE LE PLUS DANGEREUX DE TOUT LE MODULE.
   *
   * `consumed_at_stage` a pour DÉFAUT `'batch'` (migration 20260803100000) :
   * TOUS les plats existants ont leurs ingrédients à cette valeur.
   *
   * Un filtre `WHERE consumed_at_stage = 'finish'` appliqué SANS CONDITION
   * ferait donc cesser la consommation de stock sur TOUS les plats en
   * production. Sans erreur SQL. Sans test rouge. Invisible jusqu'à
   * l'inventaire physique, des semaines plus tard.
   *
   * ⭐ La règle DOIT être conditionnée au régime : `on_order` et `batch`
   * prennent tout, seul `batch_finish` filtre.
   */
  it('conditionne le filtre de stage au régime du plat', () => {
    // ⚠️ Motif ÉLARGI le 08/08/2026 : la condition teste désormais aussi
    // `batch` (correction du double-comptage). L'invariant est INCHANGÉ —
    // le filtre de stade reste conditionné au régime, jamais global.
    expect(sql).toMatch(/v_mode <> 'batch_finish' AND v_mode <> 'batch'/);
  });

  /** ⚠️ Un filtre nu, sans la condition de régime, serait la régression. */
  it('ne filtre JAMAIS sur `finish` sans condition de régime', () => {
    // Toute occurrence de `consumed_at_stage = 'finish'` doit être précédée
    // de la garde de régime dans la même expression.
    // ⚠️ Motif ELARGI le 08/08/2026 : la garde teste maintenant `batch_finish`
    // ET `batch`. L'invariant lui-meme est INTACT - c'est le piege le plus
    // couteux du module : un `WHERE consumed_at_stage = 'finish'` inconditionnel
    // ferait cesser la consommation de stock sur TOUS les plats, sans erreur,
    // sans test rouge, invisible jusqu'a l'inventaire.
    const occurrences = sql.match(/consumed_at_stage\s*=\s*'finish'/g) ?? [];
    for (const _ of occurrences) {
      expect(sql).toMatch(
        /\(v_mode <> 'batch_finish' AND v_mode <> 'batch'\)\s*OR\s*di\.consumed_at_stage\s*=\s*'finish'/
      );
    }
  });

  /**
   * ⭐ Le prélèvement de lot est lui aussi réservé à `batch_finish` : un plat
   * `on_order` ne doit toucher à aucun lot.
   */
  it('ne prélève dans les lots qu’en régime batch_finish', () => {
    // ⚠️ La condition porte AUSSI `forced_on_order` depuis 3C.1 : une ligne
    // basculée a déjà consommé sa recette entière, y prélever un lot
    // double-compterait la matière.
    // ⚠️ Élargi à `batch` : lui aussi prélève un lot depuis le 08/08/2026.
    // Ce qui reste verrouillé : un `on_order` ne prélève JAMAIS de lot.
    expect(sql).toMatch(/v_mode IN \('batch_finish', 'batch'\) THEN/);
  });

  /**
   * ⛔⛔ PAS DE DOUBLE COMPTAGE — 3C.1.
   * Une ligne `forced_on_order` consomme sa recette ENTIÈRE (branche
   * ingrédients). Y prélever un lot EN PLUS ferait coûter le plat deux fois.
   */
  it('ne prélève AUCUN lot sur une ligne basculée à la commande', () => {
    // ⚠️ Motif élargi ; l'invariant tient : une ligne basculée ne prélève
    // aucun lot, quel que soit le régime du plat.
    expect(sql).toMatch(/NOT v_item\.forced_on_order AND v_mode IN \('batch_finish', 'batch'\)/);
  });

  /**
   * ⭐ Et sa recette entière est bien consommée : le filtre de stage laisse
   * tout passer quand `forced_on_order` est vrai.
   */
  it('consomme la recette entière sur une ligne basculée', () => {
    // ⚠️ La branche `forced_on_order` reste EN PREMIER, et le `OR` est
    // VERIFIE : les deux branches doivent rester ALTERNATIVES. Un `AND` a cet
    // endroit inverserait la logique - une ligne basculée ne consommerait plus
    // sa recette entière - sans qu'aucun autre test ne le voie.
    // ⛔ Defaut trouve a la code review du 08/08/2026 : la premiere adaptation
    // du motif avait RETIRE le `OR`, affaiblissant la garantie en silence.
    expect(sql).toMatch(
      /v_item\.forced_on_order\s+OR \(v_mode <> 'batch_finish' AND v_mode <> 'batch'\)/
    );
  });

  /**
   * ⛔ `FOR UPDATE` sur les lots : deux commandes simultanées du même plat
   * prélèveraient sinon les mêmes portions, et `remaining_qty` deviendrait
   * faux sans qu'aucune erreur ne soit levée.
   */
  it('verrouille les lots pendant le prélèvement', () => {
    expect(sql).toMatch(/ORDER BY produced_at ASC\s*\n?\s*FOR UPDATE/);
  });

  /** ⭐ Idempotence historique — un double-clic ne consomme pas deux fois. */
  it('reste idempotente via consumed_at', () => {
    expect(sql).toMatch(/v_item\.consumed_at IS NOT NULL/);
    expect(sql).toMatch(/idempotent_replay/);
  });

  /**
   * ⛔ Même correction que `produce_batch` : `consume_ingredients_fefo`
   * retourne `success: false` sans lever. Un RETURN validerait ce qui
   * précède — or à partir de 3B.2, des prélèvements de lot peuvent avoir eu
   * lieu dans la même transaction.
   */
  it('LÈVE une exception si le FEFO échoue', () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'FEFO_FAILED/);
  });

  /**
   * ⛔⛔ LOT INSUFFISANT ⟹ REFUS, PAS de dette — correction du 07/08/2026.
   *
   * Une première version créait une dette « comme les ingrédients (§4.4) ».
   * L'analogie était FAUSSE : un ingrédient manquant n'a AUCUNE alternative
   * (la matière est déjà dans l'assiette), un lot manquant en a une RÉELLE
   * (cuisiner à la commande). Une dette n'a de sens que sans alternative.
   *
   * ⚠️ Et cette dette donnait un coût ESTIMÉ sans trace dans
   * `kitchen_item_batch_consumptions` : la somme des prélèvements ne
   * réconciliait pas avec `computed_cost`.
   */
  it('REFUSE un lot insuffisant au lieu de créer une dette', () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'BATCH_EMPTY/);
    expect(sql).not.toMatch(/batch_debt_qty/);
  });

  /** ⭐ Le refus NOMME l'alternative — sinon c'est un cul-de-sac. */
  it('rattrape BATCH_EMPTY et propose une issue', () => {
    expect(sql).toMatch(/SQLERRM LIKE 'BATCH_EMPTY:%'/);
    expect(sql).toMatch(/préparation à la commande/);
  });
});

describe('accept_kitchen_item — la décision se prend AVANT de cuisiner', () => {
  const sql = codeOnly(lastDefinitionOf('accept_kitchen_item'));

  /**
   * ⭐⭐ LE BON MOMENT, arbitrage de l'exploitant du 07/08/2026 :
   *   · à `preparing` → RIEN n'est engagé, le cuisinier peut choisir ;
   *   · à `ready`     → la matière est DÉJÀ sortie, il est trop tard.
   * Le contrôle dans `mark_kitchen_item_ready` reste, mais comme dernier
   * filet — il n'attrape que le lot vidé entre-temps.
   */
  it('vérifie la disponibilité des lots au démarrage', () => {
    expect(sql).toMatch(/production_batches/);
    expect(sql).toMatch(/batch_unavailable/);
  });

  /**
   * ⛔⛔ CONDITIONNÉ AU RÉGIME. Appliqué à tous, ce contrôle bloquerait les
   * plats `on_order`, qui n'ont aucun lot par définition — AUCUNE préparation
   * ne pourrait plus démarrer.
   */
  it('ne contrôle QUE les plats batch_finish', () => {
    expect(sql).toMatch(/=\s*'batch_finish'/);
  });

  /** ⭐ Le message nomme l'alternative, il ne dit pas seulement « non ». */
  it('propose une issue dans le message de refus', () => {
    expect(sql).toMatch(/préparez ce plat à la commande/);
  });

  /**
   * ⚠️ PAS de `FOR UPDATE` sur les lots : ce n'est qu'une lecture. Verrouiller
   * ici bloquerait les prélèvements réels pendant toute la préparation, qui
   * dure des minutes.
   */
  it('ne verrouille pas les lots pendant la préparation', () => {
    // ⚠️ On isole le bloc de vérification : `accept_kitchen_item` ne contient
    // qu'une lecture de `production_batches`, jamais un FOR UPDATE dessus.
    const i = sql.indexOf('SELECT COALESCE(SUM(remaining_qty)');
    expect(i).toBeGreaterThan(-1);
    const bloc = sql.slice(i, i + 400);
    expect(bloc).not.toMatch(/FOR UPDATE/);
  });

  /**
   * ⭐ 3C.1 — une ligne basculée ne prélève aucun lot : vérifier leur
   * disponibilité la bloquerait pour une raison qui ne la concerne plus.
   * C'est précisément la sortie que la bascule doit offrir.
   */
  it('laisse passer une ligne basculée à la commande', () => {
    expect(sql).toMatch(/NOT v_item\.forced_on_order/);
  });
});

describe('Pertes de lot — écrites ET visibles', () => {
  /**
   * ⛔⛔ LE DÉFAUT DE LA CODE REVIEW DE 3B (07/08/2026).
   *
   * `close_batch` écrivait `discarded_qty` et `discarded_at` — donnée stockée,
   * datée, valorisable. Mais NI `get_kitchen_metrics` NI
   * `get_kitchen_production` ne la lisaient : jeter 15 portions n'apparaissait
   * NULLE PART.
   *
   * ⚠️ Grave parce que le régime à lot est celui où la perte est LA PLUS
   * probable — on produit d'avance, on ne vend pas tout. Et la métrique du §8,
   * « matière sortie, vente jamais née », c'est exactement cela. Le module
   * écrivait la donnée et ne la montrait pas.
   */
  it('get_kitchen_metrics expose les pertes de lot', () => {
    const sql = codeOnly(lastDefinitionOf('get_kitchen_metrics'));
    expect(sql).toMatch(/batch_loss_count/);
    expect(sql).toMatch(/batch_loss_cost/);
  });

  /**
   * ⛔⛔ CÔTÉ CUISINIER : la QUANTITÉ oui, le MONTANT jamais (§8).
   * C'est la propriété qui justifie l'existence de `get_kitchen_production` —
   * y réintroduire `batch_loss_cost` rouvrirait la fuite.
   */
  it('get_kitchen_production expose la quantité, JAMAIS le coût', () => {
    const sql = codeOnly(lastDefinitionOf('get_kitchen_production'));
    expect(sql).toMatch(/batch_loss_count/);
    expect(sql).not.toMatch(/batch_loss_cost/);
  });

  /**
   * ⭐ SOURCE UNIQUE — les deux RPC délèguent au même helper. Dupliquer le
   * calcul le ferait diverger, et le gérant verrait un chiffre différent du
   * cuisinier sur la même journée.
   */
  it('les deux RPC délèguent au même helper', () => {
    expect(codeOnly(lastDefinitionOf('get_kitchen_metrics'))).toMatch(/get_batch_losses/);
    expect(codeOnly(lastDefinitionOf('get_kitchen_production'))).toMatch(/get_batch_losses/);
  });

  /**
   * ⚠️ Borne sur `discarded_at` : un lot produit lundi et jeté mercredi est
   * une perte de MERCREDI. Même règle que partout depuis le 06/08.
   */
  it('borne les pertes de lot sur discarded_at, en journée commerciale', () => {
    const sql = codeOnly(lastDefinitionOf('get_batch_losses'));
    expect(sql).toMatch(/discarded_at/);
    expect(sql).toMatch(/closing_hour/);
  });
});

describe('produce_batch — un lot acheté ne consomme rien', () => {
  const sql = codeOnly(lastDefinitionOf('produce_batch'));

  /**
   * ⭐⭐ §19.3 — DÉCOUVERTE TERRAIN DU 08/08/2026.
   * Un maquis produit son akassa certains jours et l'achète d'autres jours.
   * Un lot acheté n'a pas de recette à consommer : il a un PRIX PAYÉ.
   */
  it('distingue un lot acheté d’un lot produit', () => {
    expect(sql).toMatch(/'purchased'/);
    expect(sql).toMatch(/p_source/);
  });

  /**
   * ⛔ Un lot ACHETÉ exige son prix. Sans lui, `unit_cost` vaudrait 0 et
   * chaque portion afficherait 100 % de marge — un chiffre faux qui ne se
   * voit pas, et qui fausserait toute la rentabilité du plat.
   */
  it('refuse un lot acheté sans prix', () => {
    expect(sql).toMatch(/p_total_cost IS NULL/);
  });

  /**
   * ⛔⛔ LISTE BLANCHE des origines, jamais une liste noire — motif récurrent
   * du projet. Une valeur ajoutée plus tard est refusée par défaut.
   */
  it('n’accepte que produced et purchased', () => {
    expect(sql).toMatch(/NOT IN \('produced', 'purchased'\)/);
  });

  /**
   * ⭐ Le coût unitaire suit la MÊME règle pour les deux origines : total
   * divisé par les portions RÉELLEMENT produites, jamais par la fiche.
   */
  it('divise par les portions produites, quelle que soit l’origine', () => {
    expect(sql).toMatch(/v_total_cost \/ p_produced_qty/);
  });
});

describe('close_batch — une clôture ne ment pas sur la cause', () => {
  const sql = codeOnly(lastDefinitionOf('close_batch'));

  /**
   * ⛔⛔ LISTE BLANCHE des statuts, jamais une liste noire — motif récurrent
   * du projet.
   *
   * `depleted` doit être REFUSÉ : il se pose automatiquement au prélèvement
   * quand `remaining_qty` atteint 0. L'accepter ici permettrait de déclarer
   * « épuisé par les ventes » un lot dont il reste 15 portions — un mensonge
   * comptable, et les trois statuts de perte (§13.3) existent précisément
   * pour distinguer ces situations.
   */
  it('n’accepte que closed, discarded et expired', () => {
    expect(sql).toMatch(/IN \('closed', 'discarded', 'expired'\)/);
    // `depleted` ne doit apparaître nulle part comme valeur acceptée.
    expect(sql).not.toMatch(/p_status[\s\S]{0,80}'depleted'/);
  });

  /**
   * ⭐ `remaining_qty` À ZÉRO dans TOUS les cas : un lot clos ne peut plus
   * rien servir. Le laisser à sa valeur permettrait d'y prélever encore.
   */
  it('vide le reliquat à la clôture', () => {
    expect(sql).toMatch(/remaining_qty\s*=\s*0/);
  });

  /**
   * ⚠️ Idempotence — un double-clic sur « Jeter » ne doit pas compter la
   * perte deux fois. Le même garde interdit de rouvrir un lot clos.
   */
  it('est idempotente et ne rouvre jamais un lot clos', () => {
    expect(sql).toMatch(/v_batch\.status <> 'active'/);
    expect(sql).toMatch(/already_closed/);
  });

  it('filtre explicitement l’appartenance au bar', () => {
    expect(sql).toMatch(/is_bar_member\s*\(|can_write_kitchen\s*\(/);
  });

  it('fige le search_path', () => {
    expect(sql).toMatch(/SET search_path\s*=\s*public/i);
  });
});

/**
 * ⛔⛔ L'IDEMPOTENCE DOIT ÊTRE PORTÉE PAR LA BASE, PAS SEULEMENT PAR LE RPC.
 * Deux requêtes concurrentes passent toutes deux le `SELECT` de contrôle
 * applicatif avant qu'aucune n'ait inséré : seule une contrainte d'unicité
 * les départage. Sans elle, un double-clic créerait un lot FANTÔME dont la
 * matière aurait déjà été consommée par le premier.
 */
describe('production_batches — unicité de la clé d’idempotence', () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));

  it('un index UNIQUE couvre (bar_id, idempotency_key)', () => {
    const trouve = files.some((f) => {
      const code = codeOnly(readFileSync(join(MIGRATIONS_DIR, f), 'utf-8'));
      return /CREATE\s+UNIQUE\s+INDEX[\s\S]{0,120}?production_batches[\s\S]{0,120}?idempotency_key/i.test(
        code
      );
    });
    expect(trouve).toBe(true);
  });
});

/**
 * ⚠️ `CREATE OR REPLACE` PERD LES GRANTS sur ce projet — leçon acquise au
 * durcissement des RPC. Les oublier ne casse rien au déploiement : l'écran
 * tombe en « permission denied » pour TOUS les utilisateurs, en production.
 */
describe('Toute migration qui remplace une RPC cuisine re-pose ses GRANTS', () => {
  const fichiers = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => {
      const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf-8');
      return /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_kitchen_/i.test(sql);
    });

  it('au moins une migration concernée est analysée', () => {
    // ⚠️ Garde-fou : sans lui, un `describe.each` vide passerait au vert et
    // ce contrôle deviendrait décoratif.
    expect(fichiers.length).toBeGreaterThan(0);
  });

  it.each(fichiers)('%s accorde EXECUTE à authenticated', (f) => {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf-8');
    expect(sql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION[\s\S]*?TO\s+authenticated/i);
  });

  /** ⛔ `anon` ne doit JAMAIS exécuter une RPC qui lit des données de bar. */
  it.each(fichiers)('%s ne donne rien à anon', (f) => {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf-8');
    const code = codeOnly(sql);
    expect(code).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION[\s\S]{0,200}?TO\s+anon\b/i);
  });
});

/**
 * ⛔⛔ UNE FONCTION `SECURITY DEFINER` SANS CONTRÔLE D'ACCÈS NE DOIT PAS ÊTRE
 * EXPOSÉE AU CLIENT — défaut trouvé à la code review du 07/08/2026.
 *
 * `derive_dish_production_mode` s'exécute avec les droits du propriétaire et
 * ne vérifie AUCUNE appartenance au bar : accordée à `authenticated`, elle
 * révélerait le régime de production des plats de n'importe quel bar.
 *
 * ⭐ La bonne réponse n'était PAS d'y ajouter `is_bar_member` — les deux RPC
 * appelantes le vérifient déjà avant de l'invoquer, et le contrôle aurait
 * vécu à deux endroits. C'est de ne pas l'exposer : un appel interne entre
 * fonctions SECURITY DEFINER ne demande aucun grant.
 */
describe('Les helpers SQL internes ne sont pas exposés au client', () => {
  const HELPERS_INTERNES = ['derive_dish_production_mode', 'get_batch_losses'];

  it.each(HELPERS_INTERNES)('%s n’est pas accordé à authenticated', (nom) => {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    // ⚠️ On cherche dans TOUTES les migrations : un grant ajouté plus tard
    // rouvrirait la faille sans toucher au fichier d'origine.
    const grants = files.flatMap((f) => {
      const code = codeOnly(readFileSync(join(MIGRATIONS_DIR, f), 'utf-8'));
      const re = new RegExp(
        `GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${nom}[^;]*?TO\\s+authenticated`,
        'i'
      );
      return re.test(code) ? [f] : [];
    });

    expect(grants).toEqual([]);
  });
});

/**
 * ⭐⭐ `get_kitchen_queue_shortfalls` — l'alerte doit dire VRAI.
 *
 * Une alerte fausse est pire que pas d'alerte : elle apprend à ignorer les
 * vraies. Ces invariants verrouillent les 5 règles qui la rendent exacte, et
 * chacune correspond à un piège rencontré pendant l'écriture.
 */
describe('get_kitchen_queue_shortfalls — une alerte qui ne ment pas', () => {
  const sql = codeOnly(lastDefinitionOf('get_kitchen_queue_shortfalls'));

  it('ne consomme rien : aucune écriture en base', () => {
    // ⛔ C'est une SIMULATION. Un INSERT ici créerait de vraies dettes à
    // chaque affichage de l'écran Service.
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\s/i);
  });

  it('est STABLE — sans quoi PostgreSQL la rappellerait par ligne', () => {
    expect(lastDefinitionOf('get_kitchen_queue_shortfalls')).toMatch(/\bSTABLE\b/);
  });

  it('garde l’isolation multi-tenant', () => {
    // ⛔ SECURITY DEFINER contourne la RLS : sans cette garde, le stock d'un
    // autre bar serait lisible en passant son UUID.
    expect(sql).toMatch(/is_bar_member|can_write_kitchen/);
  });

  it('n’expose AUCUN montant (§8)', () => {
    // ⚠️ Destinée au cuisinier. La garde du hook client s'appuie sur le fait
    // que le SQL ne calcule aucun coût — si un montant réapparaissait ici, la
    // permission `canViewKitchenOrders` deviendrait une faille.
    expect(sql).not.toMatch(/unit_cost|total_cost|last_unit_cost|\bcost\b/i);
  });

  it('ne compte que la file NON ENCORE PRÉPARÉE', () => {
    // ⛔ `ready` a DÉJÀ consommé sa matière : l'inclure ferait compter deux
    // fois un stock déjà sorti et afficherait un manque imaginaire.
    expect(sql).toMatch(/'pending'\s*,\s*'accepted'/);
    expect(sql).not.toMatch(/'preparing'/);
  });

  it('lit le stock des LOTS, jamais le cache current_stock', () => {
    // ⛔ `ingredients.current_stock` est un CACHE — son propre commentaire le
    // dit. Un cache désynchronisé ferait dire l'inverse de la réalité.
    expect(sql).toMatch(/ingredient_lots/);
    expect(sql).toMatch(/remaining_qty/);
    expect(sql).not.toMatch(/current_stock/);
  });

  it('soustrait les DETTES OUVERTES du disponible', () => {
    // ⛔⛔ DÉFAUT TROUVÉ EN CODE REVIEW le 08/08/2026. La première version
    // s'arrêtait à Σ lots actifs. La source de vérité est
    // Σ lots − Σ dettes ouvertes (`consume_ingredients_fefo`, l. 431-441) :
    // un bar portant déjà une dette de 5 kg l'aurait ignorée et l'alerte aurait
    // SOUS-ESTIMÉ le manque — l'erreur la plus grave ici, celle qui rassure à
    // tort.
    expect(sql).toMatch(/ingredient_stock_debts/);
    expect(sql).toMatch(/qty_owed\s*-\s*d?\.?settled_qty/);
    expect(sql).toMatch(/status\s*=\s*'open'/);
  });

  it('n’alerte que sur les ingrédients qui décrémentent vraiment', () => {
    // ⛔ Seul `direct` sort du stock. Alerter sur l'huile (`per_dish_flat`)
    // serait une fausse alerte : personne ne la pèse.
    expect(sql).toMatch(/cost_mode\s*=\s*'direct'/);
  });

  it('applique le yield_factor en DIVISION, avec garde sur zéro', () => {
    // ⚠️ 0.8 = 20 % de perte : il faut SORTIR 125 g pour en utiliser 100.
    // Multiplier sous-estimerait le manque et raterait les cas limites.
    expect(sql).toMatch(/quantity\s*\/\s*COALESCE\(NULLIF\(\s*di\.yield_factor/);
  });

  it('garde le filtre de stade CONDITIONNÉ, jamais global', () => {
    // ⛔⛔ Le piège le plus coûteux du module : `consumed_at_stage` a pour
    // défaut 'batch'. Un `WHERE consumed_at_stage = 'finish'` inconditionnel
    // écarterait les ingrédients de TOUS les plats et annoncerait « rien ne
    // manque » en permanence — sans erreur, sans test rouge.
    expect(sql).toMatch(/forced_on_order[\s\S]{0,120}batch_finish[\s\S]{0,120}consumed_at_stage\s*=\s*'finish'/);
  });
});

/**
 * ⭐ Manques de LOTS — ajoutés le 08/08/2026 après test terrain.
 *
 * L'alerte ne regardait que les ingrédients : sur un plat `batch_finish` elle
 * annonçait un manque de matière première alors que le vrai risque est le lot
 * épuisé, et se taisait quand le lot manquait.
 */
describe('get_kitchen_queue_shortfalls — les manques de LOTS', () => {
  const sql = codeOnly(lastDefinitionOf('get_kitchen_queue_shortfalls'));

  it('expose les deux listes SÉPARÉMENT', () => {
    // ⚠️ Gestes de réparation différents : approvisionner vs PRODUIRE. Une
    // liste unique laisserait le cuisinier sans action claire.
    expect(sql).toMatch(/'shortfalls'/);
    expect(sql).toMatch(/'batch_shortfalls'/);
  });

  it('ne compte que les plats batch_finish NON basculés', () => {
    // ⛔ `forced_on_order` cuisine la recette ENTIÈRE et ne touche AUCUN lot
    // (mark_ready l. 476). L'inclure annoncerait un manque pour une assiette
    // qui ne prélèvera rien.
    expect(sql).toMatch(/NOT\s+q\.forced_on_order/);
    expect(sql).toMatch(/d\.production_mode\s*=\s*'batch_finish'/);
  });

  it('ne compte que les lots ACTIFS', () => {
    // ⚠️ Un lot 'closed', 'discarded' ou 'depleted' n'est plus prélevable :
    // le compter annoncerait des portions qui n'existent pas.
    expect(sql).toMatch(/pb\.status\s*=\s*'active'/);
  });

  it('lit la composition, pas la recette, pour les lots', () => {
    expect(sql).toMatch(/dish_recipe_components/);
    expect(sql).toMatch(/base_dish_id/);
  });
});

/**
 * ⭐⭐ `batch` PRÉLÈVE DANS SON LOT — correction du double-comptage (08/08/2026).
 *
 * Le §16.8 interdit de décrémenter les ingrédients à chaque portion servie :
 * la matière est déjà sortie à la production. Ces invariants verrouillent les
 * trois faces de la règle, chacune correspondant à un piège réel.
 */
describe('regime batch — prélèvement du lot, jamais des ingrédients', () => {
  const accept = codeOnly(lastDefinitionOf('accept_kitchen_item'));
  const ready = codeOnly(lastDefinitionOf('mark_kitchen_item_ready'));
  const force = codeOnly(lastDefinitionOf('force_item_on_order'));

  it('accept CONTRÔLE le lot pour batch comme pour batch_finish', () => {
    // ⛔ Le contrôle est au DÉMARRAGE, pas à `ready` : le choix humain se prend
    // avant de cuisiner, jamais quand l'assiette est déjà prête (§16.9).
    expect(accept).toMatch(/IN \('batch_finish', 'batch'\)/);
  });

  it('ready PRÉLÈVE le lot pour batch', () => {
    expect(ready).toMatch(/v_mode IN \('batch_finish', 'batch'\)/);
  });

  it('⛔ ready N’ENTAME PAS les ingrédients d’un plat batch', () => {
    // ⛔⛔ LE CŒUR DE LA CORRECTION. Sans cette exclusion, le plat prélèverait
    // le lot ET ses ingrédients : la matière serait comptée deux fois, et pour
    // un lot `purchased` on décompterait du maïs jamais utilisé (§19.3).
    expect(ready).toMatch(/v_mode <> 'batch_finish' AND v_mode <> 'batch'/);
  });

  it('un plat batch est SA PROPRE base — pas de composant à chercher', () => {
    // ⭐ `batch_finish` prélève dans les lots d'AUTRES plats ; `batch` dans le
    // sien. D'où l'UNION : une boucle, deux origines.
    expect(accept).toMatch(/UNION ALL[\s\S]{0,400}v_mode = 'batch'/);
    expect(ready).toMatch(/UNION ALL[\s\S]{0,300}v_mode = 'batch'/);
  });

  it('la bascule à la commande accepte un plat batch', () => {
    // ⛔ Sinon le refus d'`accept` proposerait « préparez à la commande » et
    // cette action ÉCHOUERAIT — une alternative annoncée puis refusée est pire
    // que pas d'alternative.
    expect(force).toMatch(/NOT IN \('batch_finish', 'batch'\)/);
  });

  it('forced_on_order reste la SORTIE : aucun lot prélevé', () => {
    // ⚠️ Vrai pour `batch` comme pour `batch_finish` : une ligne basculée
    // cuisine sa recette entière.
    expect(accept).toMatch(/NOT v_item\.forced_on_order/);
    expect(ready).toMatch(/NOT v_item\.forced_on_order/);
  });
});

/**
 * ⭐ `is_sellable` — un plat-base peut se vendre seul, ou non (§19.1).
 *
 * > « Le client peut demander à compléter une boule d'akassa ou une portion de
 * >   frite [...] c'est le choix du bar. »
 */
describe('upsert_dish — la vendabilité d’un plat-base', () => {
  const sql = codeOnly(lastDefinitionOf('upsert_dish'));

  it('écrit la colonne', () => {
    // ⛔ Sans cela, la case du formulaire serait sans effet : le RPC ignorerait
    // le champ en silence.
    expect(sql).toMatch(/is_sellable/);
  });

  it('⛔ ne remet PAS en vente un plat quand le champ est omis', () => {
    // Le toggle Dispo/Coupé n'envoie pas `is_sellable`. Sans ce CASE, le
    // COALESCE à TRUE ré-afficherait un plat-base délibérément masqué —
    // à l'insu du bar, et sans aucun message.
    expect(sql).toMatch(/p_dish \? 'is_sellable'/);
  });

  it('⚠️ n’a pas perdu le correctif photo_url en le remplaçant', () => {
    // ⛔ Cette fonction avait DÉJÀ été remplacée (20260803130000). Repartir de
    // la définition d'origine aurait fait disparaître ce correctif sans bruit.
    expect(sql).toMatch(/p_dish \? 'photo_url'/);
  });
});

/**
 * ⭐ `record_batch_loss` — perte PARTIELLE sur un lot qui reste en service.
 *
 * > « Des éléments du lot expirés avant, et non déclarer tout le stock
 * >   restant expiré. » (09/08/2026)
 */
describe('record_batch_loss — la perte partielle', () => {
  const sql = codeOnly(lastDefinitionOf('record_batch_loss'));

  it('⛔ CUMULE les pertes, ne les écrase pas', () => {
    // Deux pertes sur le même lot doivent compter deux fois. Une affectation
    // simple ferait disparaître la première — silencieusement, et la perte
    // totale du mois serait sous-évaluée.
    expect(sql).toMatch(/COALESCE\(discarded_qty, 0\) \+ p_qty/);
  });

  it('REFUSE une quantité supérieure au reste', () => {
    // ⛔ Plafonner en silence masquerait soit une faute de frappe, soit un
    // écart réel entre le stock théorique et le bac.
    expect(sql).toMatch(/p_qty > v_batch\.remaining_qty/);
  });

  it('ne clôture JAMAIS le lot', () => {
    // ⭐ Seul `depleted` est posé, et c'est le seul statut automatique du
    // module (§13.3) : il constate un fait, il ne juge pas. La clôture reste
    // une décision humaine.
    expect(sql).not.toMatch(/'discarded'|'expired'|'closed'/);
    expect(sql).toMatch(/'depleted'/);
  });

  it('refuse un lot déjà clos', () => {
    // Un lot clos a `remaining_qty = 0` : y déclarer une perte créerait un
    // manque sur du stock qui n'existe plus.
    expect(sql).toMatch(/v_batch\.status <> 'active'/);
  });

  it('verrouille la ligne pendant la mise à jour', () => {
    // ⚠️ Deux déclarations simultanées doivent se sérialiser, sinon la seconde
    // lit un `remaining_qty` périmé et la perte totale est sous-comptée.
    expect(sql).toMatch(/FOR UPDATE/);
  });

  it('garde l’isolation multi-tenant', () => {
    expect(sql).toMatch(/is_bar_member|can_write_kitchen/);
  });
});

/**
 * ⭐⭐ TRAÇABILITÉ DES CLÔTURES DE LOT (09/08/2026).
 *
 * > « Est-ce que terminer n'est pas une porte ouverte à la fraude ? »
 *
 * Le bouton « Terminer » a été retiré le même jour, mais il restait qu'aucune
 * clôture n'enregistrait son auteur : un promoteur voyait « 8 portions
 * perdues » sans savoir qui l'avait saisi.
 */
describe('closed_by — un chiffre sans nom ne se contrôle pas', () => {
  const close = codeOnly(lastDefinitionOf('close_batch'));
  const loss = codeOnly(lastDefinitionOf('record_batch_loss'));

  it('close_batch enregistre son auteur', () => {
    expect(close).toMatch(/closed_by\s*=\s*v_actor/);
  });

  it('record_batch_loss aussi — c’est le geste le plus discret', () => {
    // ⚠️ Une perte partielle ne fait pas disparaître le lot de l'écran :
    // la tracer importe autant, sinon plus, qu'une clôture.
    expect(loss).toMatch(/closed_by\s*=\s*v_actor/);
  });

  it('⛔ l’auteur vient de la SESSION, jamais d’un paramètre', () => {
    // Un client peut mentir sur un paramètre ; il ne peut pas falsifier sa
    // session. Recevoir l'auteur en argument viderait la trace de son sens.
    expect(close).toMatch(/v_actor\s+UUID\s*:=\s*auth\.uid\(\)/);
    expect(loss).toMatch(/v_actor\s+UUID\s*:=\s*auth\.uid\(\)/);
  });
});

/**
 * ⭐ `record_ingredient_lot_loss` — perte PARTIELLE sur un lot d'ingrédient.
 *
 * > « Pour ingrédients, est-il possible de déclarer perte sur certains
 * >   éléments ? » (09/08/2026)
 */
describe('record_ingredient_lot_loss — la perte partielle sur ingrédient', () => {
  const sql = codeOnly(lastDefinitionOf('record_ingredient_lot_loss'));

  it('⛔ N’ÉCRIT PAS `discarded_qty` sur un lot qui reste actif', () => {
    // ⛔⛔ Défaut BLOQUANT trouvé en code review le 09/08/2026.
    // `ingredient_lots_discard_coherence` impose `discarded_qty IS NULL` tant
    // que le statut est `active` ou `depleted`. L'écrire faisait échouer le
    // RPC À CHAQUE APPEL - et aucun test ne le voyait, puisqu'ils lisent le
    // TEXTE du SQL et jamais les contraintes de la table.
    // ⭐ La perte vit dans `ingredient_consumptions`, pas sur le lot.
    expect(sql).not.toMatch(/discarded_qty\s*=/);
  });

  it('REFUSE une quantité supérieure au reste', () => {
    expect(sql).toMatch(/p_qty > v_lot\.remaining_qty/);
  });

  it('ne sort JAMAIS le lot pour cause', () => {
    // ⭐ Seul `depleted` est posé - il CONSTATE que le lot est vide. Les
    // statuts de cause (`expired`, `spoiled`) restent un geste humain.
    expect(sql).toMatch(/'depleted'/);
    expect(sql).not.toMatch(/status\s*=\s*'(expired|spoiled|damaged)'/);
  });

  it('⛔ RECALCULE le stock, ne le décrémente pas', () => {
    // Leçon du CUMP : `current_stock - p_qty` accumulerait les dérives en
    // silence. La formule doit repartir de la source de vérité, DETTES
    // COMPRISES - l'omettre ferait diverger ce cache du reste du module.
    expect(sql).toMatch(/ingredient_stock_debts/);
    expect(sql).toMatch(/SUM\(remaining_qty\)/);
  });

  it('journalise la perte dans le flux de consommation', () => {
    // ⭐ Une perte EST une sortie de matière : la tracer ailleurs créerait
    // deux historiques concurrents.
    expect(sql).toMatch(/ingredient_consumptions/);
    expect(sql).toMatch(/'inventory_adjustment'/);
  });

  it('enregistre son auteur, capté de la session', () => {
    expect(sql).toMatch(/v_actor_id\s+UUID\s*:=\s*auth\.uid\(\)/);
  });

  it('verrouille la ligne pendant la mise à jour', () => {
    expect(sql).toMatch(/FOR UPDATE/);
  });

  it('garde l’isolation multi-tenant', () => {
    expect(sql).toMatch(/is_bar_member|can_write_kitchen/);
  });
});

/**
 * ⭐ `get_kitchen_losses` — le journal des pertes, trois sources unifiées.
 *
 * La 3e source (ingrédients) n'entre dans AUCUNE autre métrique du module.
 */
describe('get_kitchen_losses — trois sources, jamais fusionnées', () => {
  const sql = codeOnly(lastDefinitionOf('get_kitchen_losses'));

  it('lit les TROIS sources de perte', () => {
    expect(sql).toMatch(/kitchen_order_items/);
    expect(sql).toMatch(/production_batches/);
    // ⭐ Celle-ci était invisible partout ailleurs.
    expect(sql).toMatch(/inventory_adjustment/);
  });

  it('⛔ ne compte un plat que si la matière est SORTIE', () => {
    // Un plat annulé avant `ready` n'a rien consommé : l'inclure gonflerait
    // les pertes de commandes qui n'ont rien coûté.
    expect(sql).toMatch(/consumed_at IS NOT NULL/);
    expect(sql).toMatch(/status = 'cancelled'/);
  });

  it('garde les sources DISTINCTES dans la sortie', () => {
    // Les additionner masquerait lequel des trois gestes corriger.
    expect(sql).toMatch(/'source'/);
    expect(sql).toMatch(/by_source/);
  });

  it('est en LECTURE SEULE', () => {
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\s/i);
  });

  it('est STABLE et garde l’isolation multi-tenant', () => {
    expect(lastDefinitionOf('get_kitchen_losses')).toMatch(/\bSTABLE\b/);
    expect(sql).toMatch(/is_bar_member|can_write_kitchen/);
  });

  it('applique la journée commerciale du bar', () => {
    expect(sql).toMatch(/closing_hour/);
  });

  it('⛔ borne les LIGNES mais jamais les TOTAUX', () => {
    // ⚠️ Le détail est plafonné à 200 lignes ; les totaux, eux, couvrent la
    // période ENTIÈRE. Calculer le total sur la version tronquée ferait
    // MENTIR le chiffre de tête - un promoteur additionnerait 200 lignes et
    // trouverait un autre montant que celui affiché.
    expect(sql).toMatch(/LIMIT 200/);
    expect(sql).toMatch(/INTO v_totals[\s\S]{0,120}FROM toutes/);
  });
});

/**
 * ⭐ Retrait d'un plat ou d'un ingrédient (09/08/2026).
 *
 * > « Est-ce possible de supprimer un plat, ingrédient… ? »
 *
 * Soft delete : l'historique reste. Deux blocages protègent chacun un chiffre.
 */
describe('set_dish_active / set_ingredient_active — retirer sans casser', () => {
  const dish = codeOnly(lastDefinitionOf('set_dish_active'));
  const ing = codeOnly(lastDefinitionOf('set_ingredient_active'));

  it('⛔ un plat servant de BASE ne peut pas être retiré', () => {
    // Retirer « Poisson braisé » alors qu'un plat composé en dépend casserait
    // ce dernier en silence : plus de lot à prélever au service.
    expect(dish).toMatch(/dish_recipe_components/);
    expect(dish).toMatch(/base_dish_id = p_dish_id/);
  });

  it('⛔ un ingrédient AVEC du stock ne peut pas être retiré', () => {
    // Ces quantités disparaîtraient des comptes sans être comptées en perte -
    // exactement le trou que le bouton « Terminer » créait sur les lots.
    expect(ing).toMatch(/ingredient_lots/);
    expect(ing).toMatch(/v_stock > 0/);
  });

  it('⭐ l’ingrédient lit les LOTS, jamais le cache `current_stock`', () => {
    // Le cache soustrait les dettes ouvertes : il pourrait valoir 0 alors
    // qu'il reste de la matière physique.
    expect(ing).not.toMatch(/current_stock/);
  });

  it('les deux blocages ne valent qu’AU RETRAIT', () => {
    // Remettre un plat ou un ingrédient ne casse rien : bloquer là serait une
    // friction sans objet.
    expect(dish).toMatch(/IF NOT p_active THEN/);
    expect(ing).toMatch(/IF NOT p_active THEN/);
  });

  it('sont idempotents — un double-clic ne lève pas d’erreur', () => {
    expect(dish).toMatch(/is_active = p_active/);
    expect(ing).toMatch(/is_active = p_active/);
  });

  it('gardent l’isolation multi-tenant', () => {
    expect(dish).toMatch(/is_bar_member|can_write_kitchen/);
    expect(ing).toMatch(/is_bar_member|can_write_kitchen/);
  });
});

/**
 * ⭐⭐ L'APPRO CUISINE ENTRE EN COMPTABILITÉ (09/08/2026).
 *
 * Le module était comptablement borgne : le CA des plats remontait, aucun de
 * leurs coûts n'y entrait.
 */
describe('receive_ingredient_supply — la dépense comptable', () => {
  const sql = codeOnly(lastDefinitionOf('receive_ingredient_supply'));

  it('crée une dépense dans une catégorie DÉDIÉE', () => {
    // ⛔ `kitchen_supply` et non `supply` : fondu dans les achats de boissons,
    // le coût de la cuisine deviendrait indistinguable.
    expect(sql).toMatch(/INSERT INTO public\.expenses/);
    expect(sql).toMatch(/'kitchen_supply'/);
  });

  it('⛔ ne fait JAMAIS échouer l’appro à cause de la dépense', () => {
    // ⛔⛔ DEUX cas RÉELS où l'insertion échouerait, faisant perdre TOUT
    // l'approvisionnement (transaction) :
    //   · `expenses.amount` exige > 0, or un fournisseur peut OFFRIR ;
    //   · `expenses.created_by` est NOT NULL, or l'acteur peut être NULL
    //     sous `service_role`.
    expect(sql).toMatch(/v_expense_amount > 0 AND v_actor_id IS NOT NULL/);
  });

  it('place la dépense APRÈS le garde d’idempotence', () => {
    // Sinon un retry réseau créerait deux dépenses pour un seul appro.
    const idx = sql.indexOf("'idempotent_replay', true");
    const ins = sql.indexOf('INSERT INTO public.expenses');
    expect(idx).toBeGreaterThan(-1);
    expect(ins).toBeGreaterThan(idx);
  });

  it('date la dépense en journée COMMERCIALE', () => {
    // Un appro reçu à 2h du matin appartient au service de la veille.
    expect(sql).toMatch(/v_business_date/);
  });
});

/**
 * ⛔⛔ CE BLOC N'EXISTAIT PAS, et c'était le trou de couverture le plus grave
 * du module : `create_kitchen_order` est le POINT D'ENTRÉE DE TOUTE COMMANDE
 * CUISINE, et aucun des 138 invariants ne le touchait.
 *
 * Il a été ajouté le 10/08/2026 après que la RPC, réécrite pour les formats
 * de prix (§19.5), a PERDU CINQ ÉLÉMENTS de sa version d'origine — dont
 * l'`UPDATE tickets SET fulfillment_status`, sans lequel un ticket devient
 * clôturable alors que ses plats sont encore au feu. Les cinq ont été
 * rattrapés par une relecture manuelle ligne à ligne ; ces invariants font
 * que la prochaine réécriture n'aura pas besoin de cette chance.
 */
describe('create_kitchen_order — le point d\'entrée de toute commande', () => {
  const sql = codeOnly(lastDefinitionOf('create_kitchen_order'));

  /**
   * ⭐ LA RÉGRESSION LA PLUS GRAVE des cinq, et la plus silencieuse : rien
   * n'échoue, le ticket devient simplement clôturable alors que la cuisine
   * travaille encore. Le serveur encaisse et ferme, les plats arrivent après.
   */
  it('marque le ticket `pending` — sinon il reste clôturable', () => {
    expect(sql).toMatch(/fulfillment_status\s*=\s*'pending'/);
    expect(sql).toMatch(/UPDATE public\.tickets/);
  });

  /** Le super_admin opère sur tous les bars sans être membre d'aucun. */
  it('laisse passer le super_admin', () => {
    expect(sql).toMatch(/is_super_admin\(\)/);
  });

  /**
   * `jsonb_array_length` LÈVE une exception sur un objet ou un scalaire :
   * sans ce test, un client mal formé reçoit une erreur SQL brute au lieu
   * d'un refus lisible.
   */
  it('vérifie que p_items est bien un TABLEAU avant d\'en prendre la longueur', () => {
    expect(sql).toMatch(/jsonb_typeof/);
  });

  /**
   * ⭐ Le nom du plat dans le message : « Poisson braisé n'est plus
   * disponible » se corrige en salle, « plat indisponible » laisse le serveur
   * sans savoir lequel.
   */
  it('nomme le plat indisponible', () => {
    expect(sql).toMatch(/v_dish\.name/);
    expect(sql).toMatch(/v_dish\.is_available/);
  });

  /** Contrat de retour lu par le client — le renommer casse l'appelant. */
  it('retourne `items_created`', () => {
    expect(sql).toMatch(/'items_created'/);
  });

  /**
   * ⛔ ISOLATION MULTI-TENANT dans l'INSERT, pas seulement dans la
   * validation : si la passe 1 passait un jour d'un RETURN à un CONTINUE,
   * cet INSERT insérerait le plat d'un AUTRE bar. Fuite silencieuse.
   */
  it('répète le filtre bar_id dans l\'écriture, pas seulement dans la validation', () => {
    expect(sql).toMatch(/JOIN public\.dishes d[\s\S]*?d\.bar_id\s*=\s*p_bar_id/);
  });

  /**
   * ⛔⛔ LA GARANTIE ANTI-FRAUDE FONDAMENTALE : le prix vient TOUJOURS de la
   * base, jamais du client. Un serveur ne peut que DÉSIGNER une option
   * existante, pas en fabriquer une.
   */
  it('relit le prix en base, ne l\'accepte jamais du client', () => {
    expect(sql).toMatch(/COALESCE\(o\.price,\s*d\.price\)/);
    // ⚠️ Aucune lecture d'un prix depuis le JSON d'entrée.
    expect(sql).not.toMatch(/l->>'unit_price'/);
    expect(sql).not.toMatch(/l->>'price'/);
  });

  /**
   * ⛔ Le format doit appartenir à CE plat ET à CE bar : sans ces deux
   * conditions, un identifiant substitué ferait payer le prix d'un autre
   * plat — une fraude par simple échange d'UUID, invisible en base.
   */
  it('lie le format au plat ET au bar', () => {
    expect(sql).toMatch(/o\.dish_id\s*=\s*d\.id/);
    expect(sql).toMatch(/o\.bar_id\s*=\s*p_bar_id/);
    expect(sql).toMatch(/o\.is_active\s*=\s*TRUE/);
  });

  /**
   * ⭐ Pas de repli silencieux sur `dishes.price` ni sur « le premier
   * format » : un serveur pressé validerait un « Grand » pour un petit
   * poisson, et l'écart ne se verrait qu'à l'inventaire.
   */
  it('exige un format quand le plat en a', () => {
    expect(sql).toMatch(/price_option_required/);
  });
});

/**
 * §19.6 — RAPPROCHEMENT REÇUS ↔ VENDUS PAR TAILLE (11/08/2026).
 *
 * Le restaurateur trie son carton à la réception et compte : « 12 grands, 20
 * moyens, 8 petits ». Ce comptage ne valorise RIEN — il sert au contrôle a
 * posteriori. Ces invariants gardent les trois décisions qui rendent ce
 * chiffre CROYABLE.
 */
describe('get_size_reconciliation — le contrôle du carton', () => {
  const sql = codeOnly(lastDefinitionOf('get_size_reconciliation'));

  /**
   * ⭐ Une assiette PRÊTE n'est pas vendue. La compter ferait apparaître un
   * écart pendant le service, qui se résorberait seul — et le gérant
   * cesserait de croire le chiffre. Les plats ANNULÉS sont exclus par le
   * même filtre : ils appartiennent au journal des pertes.
   */
  it('ne compte que les plats SERVIS', () => {
    expect(sql).toMatch(/koi\.status\s*=\s*'served'/);
    expect(sql).toMatch(/koi\.served_at IS NOT NULL/);
  });

  /**
   * ⛔ Le rapprochement passe par l'ASSOCIATION explicite, jamais par une
   * comparaison de libellés : deux « Grand » n'ont aucun rapport garanti, et
   * un renommage casserait le lien EN SILENCE.
   */
  it('relie vente et taille par IDENTIFIANT, pas par nom', () => {
    expect(sql).toMatch(/price_option_sizes/);
    expect(sql).toMatch(/pos\.price_option_id\s*=\s*koi\.price_option_id/);
  });

  /**
   * ⛔⛔ FANOUT — le défaut classique de ce genre de requête.
   *
   * Joindre reçus et vendus dans un même FROM multiplierait les lignes (un
   * carton compté × chaque vente de la période). Les deux agrégats DOIVENT
   * être calculés séparément puis rapprochés sur la taille.
   * ⚠️ Le cas nominal l'exige : « braisé » et « frit » pointent la MÊME
   * taille, et le GROUP BY les additionne au lieu de les dupliquer.
   */
  it('agrège reçus et vendus SÉPARÉMENT avant de les rapprocher', () => {
    expect(sql).toMatch(/WITH received AS/);
    expect(sql).toMatch(/sold AS/);
    expect(sql).toMatch(/GROUP BY pos\.size_id/);
  });

  /** Une taille sans mouvement noierait les écarts réels dans des lignes vides. */
  it('écarte les tailles sans aucun mouvement', () => {
    expect(sql).toMatch(/r\.qty IS NOT NULL OR so\.qty IS NOT NULL/);
  });
});

describe('record_lot_counts — compter sans jamais bloquer', () => {
  const sql = codeOnly(lastDefinitionOf('record_lot_counts'));

  /**
   * ⛔ Sans cette garde, on pourrait compter des « grands poissons » sur un
   * carton de riz — et le rapprochement deviendrait absurde en silence.
   */
  it('exige que la taille appartienne à l\'ingrédient DU LOT', () => {
    expect(sql).toMatch(/ingredient_id\s*=\s*v_lot\.ingredient_id/);
  });

  /**
   * ⭐ §4.4 — compter plus d'unités que le lot n'en contient est un
   * AVERTISSEMENT, jamais un refus : un carton annoncé pour 40 poissons peut
   * en contenir 42. On signale, on ne bloque pas.
   */
  it('signale un dépassement sans refuser la saisie', () => {
    expect(sql).toMatch(/exceeds_lot/);
    // ⚠️ Aucun RETURN d'erreur sur ce dépassement.
    expect(sql).not.toMatch(/error[^\n]*dépasse/i);
  });

  /** Le comptage se REMPLACE en entier : deux saisies ne s'additionnent pas. */
  it('remplace le comptage du lot au lieu de le cumuler', () => {
    expect(sql).toMatch(/DELETE FROM public\.ingredient_lot_counts/);
  });
});

describe('replace_ingredient_sizes — retirer sans perdre l\'historique', () => {
  const sql = codeOnly(lastDefinitionOf('replace_ingredient_sizes'));

  /**
   * ⛔ Une taille est référencée par des comptages RÉELS. La supprimer
   * ferait perdre « combien de Grands ai-je reçus en juillet » — et buterait
   * de toute façon sur le RESTRICT.
   */
  it('RETIRE une taille absente, ne la supprime jamais', () => {
    expect(sql).toMatch(/SET is_active = FALSE/);
    expect(sql).not.toMatch(/DELETE FROM public\.ingredient_sizes/);
  });

  /**
   * ⚠️ La contrainte UNIQUE est sensible à la casse : « Grand » et « grand »
   * y passeraient tous les deux (même défaut trouvé le 10/08 sur les formats
   * de prix).
   */
  it('refuse les doublons insensiblement à la casse', () => {
    expect(sql).toMatch(/lower\(TRIM\(s->>'label'\)\)/);
  });

  /**
   * ⭐ Réconciliation par LIBELLÉ : recréer une taille retirée retrouve son
   * id, donc tout son historique de comptage.
   * ⚠️ Aucun `id` accepté du client — c'est le piège du 10/08, où fournir
   * l'id faisait tomber le conflit sur la clé primaire lors d'un renommage.
   */
  it('réconcilie par libellé, sans accepter d\'id du client', () => {
    expect(sql).toMatch(/ON CONFLICT \(ingredient_id, label\)/);
    expect(sql).not.toMatch(/v_size->>'id'/);
  });
});

/**
 * ⭐⭐ §20 LOT 2 — L'IMPUTATION DU PLAT AU SERVEUR DU BON.
 *
 * ⛔ CE BLOC LIT LA MIGRATION, PAS `lastDefinitionOf`. La correction procède
 * par SUBSTITUTION sur `pg_get_functiondef` (comme la garde de rôle du 11/08)
 * : elle ne contient donc AUCUN `CREATE FUNCTION`, et le helper ne la verrait
 * pas. Tester la définition d'origine validerait un état périmé — exactement
 * le piège que ce fichier documente en tête.
 *
 * ⚠️ CE QUE CES TESTS PROTÈGENT : le montant à RECOUVRER chez chaque serveur.
 * Le gérant n'encaisse pas lui-même — les serveurs sont au contact du client.
 * Une imputation fausse, c'est de l'argent réclamé à la mauvaise personne, et
 * rien à l'écran ne le signale.
 */
describe('§20 — un plat est imputé au serveur de son bon', () => {
  const rawMigration = readFileSync(
    join(MIGRATIONS_DIR, '20260817100000_serve_inherits_ticket_server.sql'),
    'utf-8'
  );

  /**
   * ⛔⛔ ON RETIRE LES COMMENTAIRES AVANT D'ASSERTER — défaut trouvé en
   * CERTIFIANT ces tests par injection de régression le 17/08/2026.
   *
   * La première version cherchait les motifs dans le fichier ENTIER. Or
   * l'en-tête et les post-vols CITENT le SQL qu'ils décrivent : casser la
   * substitution réelle laissait les 165 tests VERTS, parce que l'assertion
   * retombait sur un commentaire.
   *
   * ⚠️ Exactement le profil que ce fichier existe pour empêcher : un test qui
   * ne peut pas échouer est pire qu'une absence de test — il donne une
   * confiance que rien ne justifie.
   */
  const migration = rawMigration
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--') && !l.trimStart().startsWith('*'))
    .join('\n');

  it('⭐ lit le serveur sur le BON, jamais sur un paramètre client', () => {
    // Le serveur vient d'une ligne en base rattachée par clé étrangère : aucune
    // validation d'appartenance n'est requise, contrairement à un p_server_id.
    expect(migration).toMatch(/COALESCE\(t\.server_id, v_actor\)/);
    expect(migration).toMatch(/FROM public\.tickets t WHERE t\.id = v_item\.ticket_id/);
  });

  it('⛔ branche le 4e argument de create_sale_idempotent — `p_sold_by`', () => {
    // C'est `sold_by` que lit « Mon équipe » (useTeamPerformance:59), donc lui
    // qui porte le recouvrement.
    expect(migration).toMatch(/p_payment_method, v_seller, v_key/);
  });

  it('⛔⛔ NE TOUCHE PAS `served_by` — fait matériel, pas imputation', () => {
    /**
     * En mode simplifié c'est bien le GÉRANT qui a appuyé sur le bouton. Y
     * écrire le serveur consignerait un fait faux et perdrait la traçabilité.
     * Une réaffectation de `v_actor` aurait changé les deux d'un coup : d'où
     * une variable NOUVELLE (`v_seller`) plutôt qu'un écrasement.
     */
    expect(migration).toMatch(/v_seller {2}UUID;/);
    expect(migration).not.toMatch(/served_by\s*=\s*v_seller/);
  });

  it('⭐ le MODE COMPLET reste inchangé, sans condition sur le mode', () => {
    /**
     * `Cart.tsx` ne peuple `serverId` qu'en mode simplifié : en complet le bon
     * a `server_id = NULL` et le COALESCE retombe sur `v_actor`. La donnée
     * porte la distinction — plus robuste qu'un `IF` qu'on peut « simplifier ».
     */
    expect(migration).not.toMatch(/operatingMode|operating_mode/);
  });

  it('⛔ un bon sans serveur ADOPTE l\'envoyeur, sans jamais écraser', () => {
    // Le scénario réel du client : bascule complet → simplifié en cours de
    // service, laissant des bons à `server_id = NULL`.
    expect(migration).toMatch(/server_id = COALESCE\(server_id, auth\.uid\(\)\)/);
  });

  it('⛔ re-pose les GRANTS — `CREATE OR REPLACE` les perd', () => {
    // Sans eux, servir un plat deviendrait impossible (leçon vagues 1-4).
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.%I/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.%I\(%s\) FROM anon/);
  });

  it('⛔⛔ re-pose `service_role` sur les DEUX fonctions — file offline', () => {
    /**
     * ⛔ DÉFAUT TROUVÉ À LA REVUE, et manqué deux fois avant elle.
     *
     * `serve_kitchen_item` ET `create_kitchen_order` portent un
     * `GRANT ... TO service_role` depuis leur création (20260804130000:721,
     * 724). Ne re-poser que `authenticated` le DÉTRUIT : la file offline ne
     * pourrait plus ni envoyer en cuisine, ni servir un plat.
     *
     * ⚠️ L'échec serait DIFFÉRÉ — visible au retour en ligne seulement, très
     * loin de la migration qui l'a causé. C'est le profil qu'on ne diagnostique
     * jamais, d'où ce test.
     */
    const grants = migration.match(/GRANT EXECUTE ON FUNCTION public\.%I\(%s\) TO service_role/g) ?? [];
    expect(
      grants.length,
      'Les DEUX blocs (serve_kitchen_item et create_kitchen_order) doivent re-poser service_role'
    ).toBe(2);
  });

  it('⛔ garde de SURCHARGE sur les deux blocs, pas seulement le premier', () => {
    /**
     * `SELECT ... INTO` sur deux signatures homonymes en prendrait une
     * ARBITRAIREMENT : la migration corrigerait peut-être la mauvaise, en
     * silence. Le bloc B ne l'avait pas — asymétrie corrigée à la revue.
     */
    const guards = migration.match(/IF v_count > 1 THEN/g) ?? [];
    expect(guards.length, 'Les deux blocs doivent refuser une fonction surchargée').toBe(2);
  });

  it('⭐ est IDEMPOTENTE — un rejeu ne double aucune substitution', () => {
    expect(migration).toMatch(/position\('v_seller' IN v_def\) > 0/);
    expect(migration).toMatch(/position\('server_id = COALESCE\(server_id, auth\.uid\(\)\)' IN v_def\) > 0/);
  });

  it('⛔ REFUSE si le motif a dérivé, plutôt que de passer en silence', () => {
    // Une fonction qu'on croit corrigée et qui ne l'est pas est le pire des
    // deux mondes : l'imputation resterait fausse sans aucun signal.
    expect(migration).toMatch(/RAISE EXCEPTION 'Motif d''appel INTROUVABLE/);
    expect(migration).toMatch(/RAISE EXCEPTION 'Motif UPDATE tickets INTROUVABLE/);
  });
});
