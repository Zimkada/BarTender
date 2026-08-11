/**
 * kitchenCartPriceOptions.test.ts
 *
 * ⛔⛔ GARDE DU DÉFAUT LE PLUS GRAVE QUE §19.5 AURAIT INTRODUIT.
 *
 * `useKitchenCart` indexait ses lignes sur `dish.id` SEUL. Avec les formats de
 * prix, un grand et un petit poisson y auraient fusionné en « 2 × Poisson
 * braisé » au même prix — et la perte se produisait AVANT l'envoi au serveur,
 * donc irrattrapable en base : le client aurait payé deux fois le même montant
 * pour deux assiettes différentes.
 *
 * ⭐ ON TESTE LA RÈGLE DE CLÉ, pas le hook monté : `lineKey` est la fonction
 * dont toutes les opérations du panier dépendent (ajout, quantité, retrait,
 * modificateurs, rendu). Un test de rendu serait fragile sans mieux protéger.
 */

import { describe, it, expect } from 'vitest';
import { lineKey } from '../../hooks/useKitchenCart';
import {
  hasPriceOptions,
  formatPriceRange,
  effectivePrice,
} from '../../components/kitchen/priceOptionHelpers';
import type { DishPriceOptionRow } from '../../services/supabase/dishes.service';

const opt = (id: string, label: string, price: number): DishPriceOptionRow => ({
  id,
  label,
  price,
  sort_order: 0,
  is_active: true,
});

describe('lineKey - deux formats du même plat ne fusionnent pas', () => {
  it('⛔ distingue deux formats du MÊME plat', () => {
    // Le défaut : sans le format dans la clé, ces deux lignes se confondaient.
    expect(lineKey('poisson', 'grand')).not.toBe(lineKey('poisson', 'petit'));
  });

  it('regroupe deux fois le MÊME format', () => {
    // Deux « Grand » ajoutés successivement doivent incrémenter une seule
    // ligne, pas en créer deux.
    expect(lineKey('poisson', 'grand')).toBe(lineKey('poisson', 'grand'));
  });

  it('distingue deux plats différents', () => {
    expect(lineKey('poisson', 'grand')).not.toBe(lineKey('poulet', 'grand'));
  });

  it('⭐ un plat SANS format garde sa clé d\'origine - le `dish_id` nu', () => {
    // ⚠️ Non cosmétique : c'est ce qui garantit qu'un bar à prix fixe se
    // comporte EXACTEMENT comme avant §19.5.
    expect(lineKey('poisson')).toBe('poisson');
    expect(lineKey('poisson', undefined)).toBe('poisson');
  });

  it('un plat à format ne peut pas collider avec un plat sans format', () => {
    expect(lineKey('poisson')).not.toBe(lineKey('poisson', 'grand'));
  });
});

describe('hasPriceOptions - quand proposer un choix', () => {
  it('aucun format → prix ferme', () => {
    expect(hasPriceOptions(undefined)).toBe(false);
    expect(hasPriceOptions([])).toBe(false);
  });

  it('⚠️ UN SEUL format → prix ferme, pas un choix à une option', () => {
    // La base refuse un format unique, mais une donnée héritée ou un import
    // pourrait en produire un. On retombe alors sur le prix ferme plutôt que
    // d'imposer au serveur une étape qui ne lui apprend rien.
    expect(hasPriceOptions([opt('a', 'Grand', 2000)])).toBe(false);
  });

  it('deux formats ou plus → le serveur choisit', () => {
    expect(hasPriceOptions([opt('a', 'Grand', 2000), opt('b', 'Petit', 1000)])).toBe(true);
  });
});

describe('formatPriceRange - ce que la grille affiche', () => {
  const fmt = (v: number) => `${v} F`;

  it('affiche une FOURCHETTE, pas « à partir de »', () => {
    // ⭐ « à partir de 1 000 F » sous-estime la carte ; le prix du premier
    // format serait arbitraire. La fourchette dit la vérité sans trancher.
    const options = [opt('a', 'Grand', 2000), opt('b', 'Petit', 1000)];
    expect(formatPriceRange(options, fmt)).toBe('1000 F - 2000 F');
  });

  it('deux formats au MÊME prix → un seul montant', () => {
    // « Grand » et « Familial » à 2 000 F est légitime ; afficher
    // « 2 000 - 2 000 F » serait absurde.
    const options = [opt('a', 'Grand', 2000), opt('b', 'Familial', 2000)];
    expect(formatPriceRange(options, fmt)).toBe('2000 F');
  });

  it('ordonne du plus BAS au plus haut, quel que soit l\'ordre reçu', () => {
    const options = [opt('a', 'Petit', 1000), opt('b', 'Grand', 3000), opt('c', 'Moyen', 2000)];
    expect(formatPriceRange(options, fmt)).toBe('1000 F - 3000 F');
  });
});

describe('effectivePrice - ce que le panier additionne', () => {
  it('prend le prix du FORMAT quand il y en a un', () => {
    expect(effectivePrice(1500, opt('a', 'Grand', 2000))).toBe(2000);
  });

  it('⚠️ retombe sur le prix du plat sans format - jamais 0', () => {
    // Un plat à formats porte un `price` TECHNIQUE (la base l'exige NOT NULL).
    // Le repli doit rester ce prix, pas zéro : afficher « 0 F » dans le panier
    // ferait croire à un plat offert.
    expect(effectivePrice(1500, undefined)).toBe(1500);
  });
});
