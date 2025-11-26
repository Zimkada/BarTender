import { useEffect, useState, useCallback } from 'react';
import { AnalyticsService } from '../services/supabase/analytics.service';

interface ViewFreshness {
    view_name: string;
    last_refresh: string | null;
    minutes_old: number;
    is_stale: boolean;
}

/**
 * Hook pour gérer le cache warming au démarrage de l'app
 */
export function useCacheWarming(enabled: boolean = true) {
    const [isWarming, setIsWarming] = useState(false);
    const [warmingComplete, setWarmingComplete] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!enabled || warmingComplete) return;

        const warmCache = async () => {
            setIsWarming(true);
            setError(null);

            try {
                // Vérifier si les données sont stale avant de rafraîchir
                const metrics = await AnalyticsService.getViewMetrics();
                const hasStaleData = metrics.some(m => m.minutes_since_last_refresh > 60);

                if (hasStaleData || metrics.length === 0) {
                    console.log('[Cache Warming] Refreshing stale views...');
                    await AnalyticsService.refreshAllViews('app_startup');
                    console.log('[Cache Warming] ✓ Complete');
                } else {
                    console.log('[Cache Warming] Data is fresh, skipping refresh');
                }

                setWarmingComplete(true);
            } catch (err) {
                console.error('[Cache Warming] Error:', err);
                setError(err as Error);
                // Ne pas bloquer l'app si le warming échoue
                setWarmingComplete(true);
            } finally {
                setIsWarming(false);
            }
        };

        warmCache();
    }, [enabled, warmingComplete]);

    return { isWarming, warmingComplete, error };
}

/**
 * Hook pour surveiller la fraîcheur d'une vue matérialisée
 */
export function useViewFreshness(viewName: string, refreshInterval: number = 60000) {
    const [freshness, setFreshness] = useState<ViewFreshness | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const checkFreshness = useCallback(async () => {
        try {
            const data = await AnalyticsService.getViewFreshness(viewName);
            setFreshness(data);
        } catch (error) {
            console.error(`Error checking freshness for ${viewName}:`, error);
        } finally {
            setIsLoading(false);
        }
    }, [viewName]);

    useEffect(() => {
        checkFreshness();

        // Vérifier périodiquement la fraîcheur
        const interval = setInterval(checkFreshness, refreshInterval);

        return () => clearInterval(interval);
    }, [checkFreshness, refreshInterval]);

    return { freshness, isLoading, refresh: checkFreshness };
}

/**
 * Hook pour rafraîchir manuellement une vue
 */
export function useViewRefresh(viewName: string) {
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const refresh = useCallback(async () => {
        setIsRefreshing(true);
        setError(null);

        try {
            await AnalyticsService.refreshView(viewName, 'manual');
            console.log(`[Manual Refresh] ✓ ${viewName} refreshed`);
        } catch (err) {
            console.error(`[Manual Refresh] Error refreshing ${viewName}:`, err);
            setError(err as Error);
            throw err;
        } finally {
            setIsRefreshing(false);
        }
    }, [viewName]);

    return { refresh, isRefreshing, error };
}
