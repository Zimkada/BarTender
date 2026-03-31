/**
 * costResolution.ts — Source of truth for UI cost display
 *
 * This module centralizes the logic for determining which cost to display
 * in the inventory UI. It does NOT affect accounting/analytics calculations,
 * which always use currentAverageCost (CUMP).
 *
 * Responsibilities:
 * - Resolve the display cost based on bar settings (costDisplayMethod)
 * - Provide the source of the resolved cost for UI badges/indicators
 * - Cascade: preferred method → initialUnitCost fallback → 0
 */

import type { Product, BarSettings } from '../types';

export type CostSource = 'cump' | 'last_cost' | 'initial_cost' | 'none';

export type CostDisplayMethod = 'cump' | 'last_cost';

export interface DisplayCost {
  /** The resolved cost value (0 if no cost available) */
  cost: number;
  /** Where this cost came from */
  source: CostSource;
}

/**
 * Resolves the display cost for a product based on bar settings.
 *
 * Cascade logic:
 *   costDisplayMethod === 'last_cost'
 *     → lastUnitCost > 0 ? lastUnitCost
 *     : initialUnitCost > 0 ? initialUnitCost
 *     : currentAverageCost > 0 ? currentAverageCost (fallback cross-méthode)
 *     : 0 (none)
 *
 *   costDisplayMethod === 'cump' (default)
 *     → currentAverageCost > 0 ? currentAverageCost
 *     : initialUnitCost > 0 ? initialUnitCost
 *     : 0 (none)
 *
 * Le fallback cross-méthode en mode last_cost évite d'afficher "-" quand le
 * CUMP existe mais qu'aucun supply récent n'a mis à jour last_unit_cost.
 *
 * @param product - The product to resolve cost for
 * @param settings - Bar settings (reads costDisplayMethod)
 * @returns DisplayCost with resolved cost and source
 */
export function getDisplayCost(product: Product, settings?: BarSettings | null): DisplayCost {
  const method: CostDisplayMethod = settings?.costDisplayMethod ?? 'cump';

  const cump = product.currentAverageCost ?? 0;
  const lastCost = product.lastUnitCost ?? 0;
  const initialCost = product.initialUnitCost ?? 0;

  if (method === 'last_cost') {
    if (lastCost > 0) return { cost: lastCost, source: 'last_cost' };
    if (initialCost > 0) return { cost: initialCost, source: 'initial_cost' };
    // Fallback cross-méthode : mieux vaut afficher le CUMP que rien
    if (cump > 0) return { cost: cump, source: 'cump' };
    return { cost: 0, source: 'none' };
  }

  // Default: CUMP mode
  if (cump > 0) return { cost: cump, source: 'cump' };
  if (initialCost > 0) return { cost: initialCost, source: 'initial_cost' };
  return { cost: 0, source: 'none' };
}

/**
 * Returns a human-readable label for the cost source (French).
 */
export function getCostSourceLabel(source: CostSource): string {
  switch (source) {
    case 'cump': return 'CUMP';
    case 'last_cost': return 'Dernier coût';
    case 'initial_cost': return 'Coût initial';
    case 'none': return '-';
  }
}
