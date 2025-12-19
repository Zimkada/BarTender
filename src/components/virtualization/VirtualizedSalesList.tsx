import React, { CSSProperties } from 'react';
import { VirtualizedList, type VirtualizedListProps } from './VirtualizedList';
import type { SaleWithDetails } from '../../types/sales.types';

export interface VirtualizedSalesListProps
  extends Omit<
    VirtualizedListProps<SaleWithDetails>,
    'renderItem' | 'itemHeight'
  > {
  renderSaleRow: (
    sale: SaleWithDetails,
    index: number,
    style: CSSProperties
  ) => React.ReactNode;
  itemHeight?: number;
}

/**
 * Composant virtualisé spécialisé pour les listes de ventes
 * Wrapper autour de VirtualizedList avec configuration optimisée pour ventes
 *
 * Item height par défaut: 80px (pour une ligne de vente avec infos essentielles)
 * Peut être ajusté si le layout change
 *
 * Exemple:
 * ```tsx
 * <VirtualizedSalesList
 *   items={sales}
 *   height={600}
 *   width="100%"
 *   renderSaleRow={(sale, index, style) => (
 *     <div style={style} key={sale.id}>
 *       <div className="p-4 border-b">
 *         <p>{sale.seller_name} - {sale.total}€</p>
 *       </div>
 *     </div>
 *   )}
 * />
 * ```
 */
export const VirtualizedSalesList: React.FC<VirtualizedSalesListProps> = ({
  renderSaleRow,
  itemHeight = 80,
  ...props
}) => {
  return (
    <VirtualizedList
      {...props}
      itemHeight={itemHeight}
      renderItem={(sale, index, style) =>
        renderSaleRow(sale, index, style)
      }
      noItemsMessage="Aucune vente"
    />
  );
};

VirtualizedSalesList.displayName = 'VirtualizedSalesList';
