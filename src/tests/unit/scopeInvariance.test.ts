/**
 * scopeInvariance.test.ts
 *
 * ⛔⛔ COMBLE UNE DETTE SIGNALÉE À LA CERTIFICATION DU MERGE (13/08/2026).
 *
 * `HomePage` et `Ingredients` ont leurs tests d'invariance ; `DailyDashboard`
 * et `AnalyticsView` portent la même garde `hasRestaurant` mais rien ne la
 * protégeait. Leur code est correct - rien n'empêchait la garde de disparaître
 * demain sans qu'un test ne rougisse.
 *
 * ⭐ CE QU'ON TESTE, ET POURQUOI PAS LE RENDU. Ces deux écrans exigent une
 * douzaine de contextes pour se monter, et leurs gardes ne vivent pas au même
 * endroit :
 *   · `DailyDashboard` → garde RÉSEAU, dans `useDishes` (`enabled`)
 *   · `AnalyticsView`  → garde d'ÉTAT, le verrou de portée
 * Un test de rendu serait fragile sans mieux protéger. On teste la RÈGLE.
 *
 * ⚠️ Ces deux écrans sont ouverts par TOUS les bars du parc, restaurant ou
 * non. C'est ce qui rend leur invariance plus sensible que celle des écrans
 * cuisine, qu'un bar pur n'atteint jamais.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { itemMatchesScope, type ActivityScope } from '../../components/common/scopeHelpers';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf-8');

/** Retire les commentaires : une garde citée en commentaire n'en est pas une. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('DailyDashboard — invariance du §3', () => {
  const sql = codeOnly(read('src/components/DailyDashboard.tsx'));

  /**
   * ⭐⭐ LE VERROU D'ÉTAT. Sans lui, un bar dont la cuisine est désactivée
   * après coup - ou dont le sélecteur a gardé son état - continuerait de
   * filtrer sur « Restau » et afficherait un CA de zéro sans explication.
   */
  it('verrouille la portée sur « Tout » quand le bar n\'a pas de cuisine', () => {
    expect(sql).toMatch(/hasRestaurant\s*\?\s*rawScope\s*:\s*'all'/);
  });

  /**
   * ⛔ LE MASQUAGE. Le sélecteur ne doit pas être rendu du tout : masqué en
   * CSS, il resterait atteignable au clavier et présent dans le DOM.
   */
  it('ne rend le sélecteur de portée que si le bar a une cuisine', () => {
    expect(sql).toMatch(/\{hasRestaurant\s*&&/);
  });

  /**
   * ⚠️ La garde RÉSEAU vit dans `useDishes`, pas ici - c'est le bon endroit,
   * mais il faut que le Dashboard passe bien par ce hook et non par un appel
   * direct au service qui contournerait la garde.
   */
  it('passe par `useDishes` et jamais par le service directement', () => {
    expect(sql).toMatch(/useDishes\s*\(/);
    expect(sql).not.toMatch(/DishesService/);
  });
});

describe('AnalyticsView — invariance du §3', () => {
  const sql = codeOnly(read('src/features/Sales/SalesHistory/views/AnalyticsView.tsx'));

  it('verrouille la portée sur « Tout » quand le bar n\'a pas de cuisine', () => {
    expect(sql).toMatch(/hasRestaurant\s*\?\s*rawScope\s*:\s*'all'/);
  });

  /**
   * ⚠️ DEUX MÉCANISMES DE MASQUAGE COEXISTENT dans le projet, et c'est
   * légitime - défaut de MON test, pas du code :
   *   · `DailyDashboard` masque lui-même (`{hasRestaurant && …}`)
   *   · `AnalyticsView` PASSE la prop, et `ScopeSwitcher` retourne `null`
   * Exiger le premier motif partout ferait échouer un écran correct.
   *
   * ⭐ Ce qui compte est que la garde ARRIVE au composant : c'est ce qu'on
   * teste ici, et `scopeSwitcherGuard` ci-dessous vérifie qu'il l'applique.
   */
  it('transmet `hasRestaurant` au sélecteur de portée', () => {
    expect(sql).toMatch(/hasRestaurant=\{hasRestaurant\}/);
  });

  /**
   * ⭐ CET ÉCRAN N'ÉMET AUCUNE REQUÊTE CUISINE : il ventile des ventes déjà
   * chargées. Un appel au service plats y serait une régression de §3 sur
   * l'écran d'historique, que tous les bars ouvrent.
   */
  it('n\'appelle aucun service cuisine', () => {
    expect(sql).not.toMatch(/DishesService|IngredientsService|BatchesService/);
  });
});

describe('ScopeSwitcher — la garde que les deux écrans délèguent', () => {
  const sql = codeOnly(read('src/components/common/ScopeSwitcher.tsx'));

  /**
   * ⛔⛔ LE POINT UNIQUE DONT DÉPENDENT LES DEUX ÉCRANS. `AnalyticsView` lui
   * délègue entièrement son masquage : si ce `return null` disparaît, un bar
   * pur verrait un sélecteur « Bar / Restau » sur son historique de ventes.
   */
  it('ne rend RIEN sur un bar sans cuisine', () => {
    expect(sql).toMatch(/if\s*\(!hasRestaurant\)\s*return null/);
  });
});

describe('itemMatchesScope — la règle que les deux écrans partagent', () => {
  /**
   * ⭐ C'est ce qui garantit que Dashboard et Historique affichent le MÊME
   * chiffre pour la même journée. Deux lectures divergentes et le promoteur
   * ne saurait pas laquelle croire.
   */
  it('en portée « Tout », accepte tout — donc aucun changement pour un bar pur', () => {
    const scopes: ActivityScope[] = ['all'];
    for (const scope of scopes) {
      expect(itemMatchesScope({ item_type: 'product' }, scope)).toBe(true);
      expect(itemMatchesScope({ item_type: 'dish' }, scope)).toBe(true);
      expect(itemMatchesScope({}, scope)).toBe(true);
    }
  });

  /**
   * ⚠️ Les 19 000+ ventes antérieures au module ne portent PAS `item_type`.
   * Les lire comme autre chose que « produit » ferait diverger le client du
   * SQL, qui applique `COALESCE(item->>'item_type', 'product')`.
   */
  it('lit un item sans `item_type` comme un PRODUIT', () => {
    expect(itemMatchesScope({}, 'bar')).toBe(true);
    expect(itemMatchesScope({}, 'kitchen')).toBe(false);
  });
});
