import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { getCurrentBusinessDateString } from '../../utils/businessDateHelpers';
import { useBarContext } from '../../context/BarContext';
import { CACHE_STRATEGY } from '../../lib/cache-strategy';

export interface StaleSaleInfo {
    id: string;
    total: number;
    created_at: string;
    business_date: string;
}

export function useStalePendingSales(barId: string | undefined) {
    const { currentBar } = useBarContext();
    const todayStr = getCurrentBusinessDateString(currentBar?.closingHour);

    return useQuery({
        queryKey: ['stale-pending-sales', barId, todayStr],
        queryFn: async (): Promise<StaleSaleInfo[]> => {
            if (!barId) return [];

            const { data, error } = await supabase
                .from('sales')
                .select('id, total, created_at, business_date')
                .eq('bar_id', barId)
                .eq('status', 'pending')
                .lt('business_date', todayStr)
                .order('business_date', { ascending: true });

            if (error) {
                console.error('[useStalePendingSales] Error fetching stale sales:', error);
                throw error;
            }

            return data as StaleSaleInfo[];
        },
        enabled: !!barId,
        staleTime: CACHE_STRATEGY.salesAndStock.staleTime,
    });
}
