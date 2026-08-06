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
