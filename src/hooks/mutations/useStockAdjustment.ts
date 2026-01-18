import { useMutation, useQueryClient } from '@tanstack/react-query';
import { StockAdjustmentsService } from '../../services/supabase/stock-adjustments.service';
import { auditLogger } from '../../services/AuditLogger';
import { UserSession, Bar } from '../../types';

export function useStockAdjustment() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (data: {
      productId: string;
      productName: string;
      oldStock: number;
      newStock: number;
      delta: number;
      reason: string;
      notes?: string;
      barId: string;
      barName: string;
      userId: string;
      userName: string;
      userRole: string;
    }) => {
      if (!data.barId || !data.userId) throw new Error('Missing context: bar or user');

      // Create adjustment via RPC
      const adjustment = await StockAdjustmentsService.createAdjustment({
        barId: data.barId,
        productId: data.productId,
        delta: data.delta,
        reason: data.reason,
        notes: data.notes
      });

      // Audit log
      await auditLogger.log({
        event: 'STOCK_ADJUSTED',
        severity: 'info',
        userId: data.userId,
        userName: data.userName,
        userRole: data.userRole,
        barId: data.barId,
        barName: data.barName,
        description: `Ajustement stock: ${data.productName} (${data.delta > 0 ? '+' : ''}${data.delta}), Raison: ${data.reason}`,
        relatedEntityId: data.productId,
        relatedEntityType: 'product',
        metadata: {
          oldStock: data.oldStock,
          newStock: data.newStock,
          delta: data.delta,
          reason: data.reason,
          notes: data.notes
        }
      });

      return adjustment;
    },
    onSuccess: () => {
      // Invalidate product queries to refetch updated stock
      queryClient.invalidateQueries({ queryKey: ['bar-products'] });
      queryClient.invalidateQueries({ queryKey: ['stock-adjustments'] });
    },
    onError: (error) => {
      console.error('Stock adjustment error:', error);
    }
  });

  return mutation;
}
