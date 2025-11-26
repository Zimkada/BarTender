import { RotateCcw, Clock, AlertCircle } from 'lucide-react';
import { useViewFreshness, useViewRefresh } from '../hooks/useViewMonitoring';

interface DataFreshnessIndicatorProps {
    viewName: string;
    showRefreshButton?: boolean;
    onRefreshComplete?: () => void;
    className?: string;
}

/**
 * Composant pour afficher la fraîcheur des données et permettre le refresh manuel
 */
export function DataFreshnessIndicator({
    viewName,
    showRefreshButton = true,
    onRefreshComplete,
    className = ''
}: DataFreshnessIndicatorProps) {
    const { freshness, isLoading, refresh: checkFreshness } = useViewFreshness(viewName);
    const { refresh, isRefreshing } = useViewRefresh(viewName);

    const handleRefresh = async () => {
        try {
            await refresh();
            await checkFreshness(); // Re-check freshness after refresh
            onRefreshComplete?.();
        } catch (error) {
            console.error('Refresh failed:', error);
        }
    };

    if (isLoading || !freshness) {
        return null;
    }

    const minutesOld = Math.round(freshness.minutes_old);
    const isStale = freshness.is_stale;

    // Format du temps écoulé
    const formatTimeAgo = (minutes: number): string => {
        if (minutes < 1) return 'à l\'instant';
        if (minutes < 60) return `il y a ${minutes} min`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `il y a ${hours}h`;
        const days = Math.floor(hours / 24);
        return `il y a ${days}j`;
    };

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            {/* Indicateur de fraîcheur */}
            <div className={`flex items-center gap-1.5 text-xs ${isStale ? 'text-amber-600' : 'text-gray-500'
                }`}>
                {isStale ? (
                    <AlertCircle className="w-3.5 h-3.5" />
                ) : (
                    <Clock className="w-3.5 h-3.5" />
                )}
                <span>
                    {isStale && '⚠️ '}
                    Mis à jour {formatTimeAgo(minutesOld)}
                </span>
            </div>

            {/* Bouton de refresh manuel */}
            {showRefreshButton && (
                <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className={`
            flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium
            transition-all duration-200
            ${isRefreshing
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-white hover:bg-gray-50 text-gray-700 hover:text-amber-600 border border-gray-200 hover:border-amber-300'
                        }
          `}
                    title="Actualiser les données"
                >
                    <RotateCcw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>{isRefreshing ? 'Actualisation...' : 'Actualiser'}</span>
                </button>
            )}
        </div>
    );
}

/**
 * Version compacte pour les petits espaces
 */
export function DataFreshnessIndicatorCompact({
    viewName,
    onRefreshComplete
}: Omit<DataFreshnessIndicatorProps, 'showRefreshButton' | 'className'>) {
    const { freshness, isLoading } = useViewFreshness(viewName);
    const { refresh, isRefreshing } = useViewRefresh(viewName);

    const handleRefresh = async () => {
        try {
            await refresh();
            onRefreshComplete?.();
        } catch (error) {
            console.error('Refresh failed:', error);
        }
    };

    if (isLoading || !freshness) {
        return null;
    }

    const minutesOld = Math.round(freshness.minutes_old);
    const isStale = freshness.is_stale;

    return (
        <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`
        flex items-center gap-1.5 px-2 py-1 rounded-md text-xs
        transition-all duration-200
        ${isStale ? 'text-amber-600 hover:bg-amber-50' : 'text-gray-500 hover:bg-gray-50'}
        ${isRefreshing ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
      `}
            title={`Dernière mise à jour: il y a ${minutesOld} min`}
        >
            <RotateCcw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{minutesOld < 60 ? `${minutesOld}m` : `${Math.floor(minutesOld / 60)}h`}</span>
        </button>
    );
}
