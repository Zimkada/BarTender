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
      last = sql.slice(start);
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
    expect(sql).toMatch(/is_bar_member\s*\(/);
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
    expect(sql).toMatch(/is_bar_member\s*\(/);
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

  /** ⛔ Isolation multi-tenant : composer avec le plat d'un autre bar. */
  it('filtre explicitement l’appartenance au bar', () => {
    expect(sql).toMatch(/is_bar_member\s*\(/);
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

  it('filtre explicitement l’appartenance au bar', () => {
    expect(sql).toMatch(/is_bar_member\s*\(/);
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
    expect(sql).toMatch(/v_mode\s*<>\s*'batch_finish'\s*OR/);
  });

  /** ⚠️ Un filtre nu, sans la condition de régime, serait la régression. */
  it('ne filtre JAMAIS sur `finish` sans condition de régime', () => {
    // Toute occurrence de `consumed_at_stage = 'finish'` doit être précédée
    // de la garde de régime dans la même expression.
    const occurrences = sql.match(/consumed_at_stage\s*=\s*'finish'/g) ?? [];
    for (const _ of occurrences) {
      expect(sql).toMatch(
        /v_mode\s*<>\s*'batch_finish'\s*OR\s*di\.consumed_at_stage\s*=\s*'finish'/
      );
    }
  });

  /**
   * ⭐ Le prélèvement de lot est lui aussi réservé à `batch_finish` : un plat
   * `on_order` ne doit toucher à aucun lot.
   */
  it('ne prélève dans les lots qu’en régime batch_finish', () => {
    expect(sql).toMatch(/IF v_mode = 'batch_finish' THEN/);
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

  /** ⚠️ Lot insuffisant ⟹ dette, jamais refus (§4.4). */
  it('sert malgré un lot vide et expose la dette', () => {
    expect(sql).toMatch(/batch_debt_qty/);
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
    expect(sql).toMatch(/is_bar_member\s*\(/);
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
  const HELPERS_INTERNES = ['derive_dish_production_mode'];

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
