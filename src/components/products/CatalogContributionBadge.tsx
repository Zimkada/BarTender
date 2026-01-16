/**
 * components/products/CatalogContributionBadge.tsx
 * Badge pour afficher qu'un produit local est la source d'un produit global
 * Affiche dans l'inventaire du bar source
 */

import { Award, ExternalLink } from 'lucide-react';
import { Badge } from '../ui/Badge';

interface CatalogContributionBadgeProps {
  globalProductId?: string;
  barName?: string;
  showLink?: boolean;
}

export function CatalogContributionBadge({
  globalProductId,
  barName,
  showLink = false
}: CatalogContributionBadgeProps) {
  if (!globalProductId) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant="success" className="flex items-center gap-1">
        <Award className="h-3 w-3" />
        <span>Produit Global</span>
      </Badge>

      {showLink && globalProductId && (
        <a
          href={`/admin/global-catalog/${globalProductId}`}
          className="text-xs text-blue-600 hover:underline flex items-center gap-1"
          title="Voir le produit global"
        >
          Voir
          <ExternalLink className="h-3 w-3" />
        </a>
      )}

      {barName && (
        <span className="text-xs text-gray-600">
          🏆 Source : {barName}
        </span>
      )}
    </div>
  );
}

/**
 * Version alternative : Tooltip version
 */
export function CatalogContributionBadgeTooltip({
  globalProductId,
  barName
}: CatalogContributionBadgeProps) {
  if (!globalProductId) {
    return null;
  }

  return (
    <div
      className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 border border-yellow-300 rounded-full text-xs font-medium text-yellow-800 cursor-help"
      title={`Ce produit a été promu au catalogue global${barName ? ` depuis le bar ${barName}` : ''}`}
    >
      <Award className="h-3 w-3" />
      <span>Catalogue Global</span>
    </div>
  );
}
