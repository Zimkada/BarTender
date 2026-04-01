import { useEffect, useRef } from 'react';
import { RotateCcw, Clock, AlertCircle } from 'lucide-react';
import { useViewFreshness, useViewRefresh } from '../hooks/useViewMonitoring';

interface DataFreshnessIndicatorProps {
    viewName: string;
    showRefreshButton?: boolean;
    onRefreshComplete?: () => void | Promise<void>;
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
            await onRefreshComplete?.();
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
                            ? 'bg-gray-100 text-gray-600 cursor-not-allowed'
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
 * Version compacte pour les petits espaces.
 * Auto-refresh silencieux au montage si les données sont stale.
 */
export function DataFreshnessIndicatorCompact({
    viewName,
    onRefreshComplete,
    className = ''
}: Omit<DataFreshnessIndicatorProps, 'showRefreshButton'>) {
    const { freshness, isLoading } = useViewFreshness(viewName);
    const { refresh, isRefreshing } = useViewRefresh(viewName);

    // Ref stable pour onRefreshComplete (évite boucle infinie si closure inline)
    const onRefreshCompleteRef = useRef(onRefreshComplete);
    useEffect(() => { onRefreshCompleteRef.current = onRefreshComplete; }, [onRefreshComplete]);

    // Auto-refresh silencieux au montage si les données sont stale
    const hasAutoRefreshed = useRef(false);
    useEffect(() => {
        if (!freshness?.is_stale || hasAutoRefreshed.current) return;
        hasAutoRefreshed.current = true;
        refresh()
            .then(() => onRefreshCompleteRef.current?.())
            .catch(() => {}); // Silencieux — bouton manuel toujours disponible
    }, [freshness?.is_stale, refresh]);

    const handleRefresh = async () => {
        try {
            await refresh();
            await onRefreshComplete?.();
        } catch (error) {
            console.error('Refresh failed:', error);
        }
    };

    if (isLoading || !freshness) {
        return null;
    }

    const minutesOld = Math.round(freshness.minutes_old);
    const isStale = freshness.is_stale;

    // Bandeau visible quand les données sont périmées
    if (isStale && !isRefreshing) {
        return (
            <button
                onClick={handleRefresh}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium
                    bg-amber-50 text-amber-700 border border-amber-200
                    hover:bg-amber-100 transition-all duration-200 cursor-pointer ${className}`}
                title="Les graphiques et statistiques ne sont pas à jour. Cliquez ici pour actualiser — utilisez ce bouton si les montants affichés vous semblent incorrects."
            >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Données non à jour — Actualiser</span>
            </button>
        );
    }

    return (
        <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`
        flex items-center gap-1.5 px-2 py-1 rounded-md text-xs
        transition-all duration-200
        ${isStale ? 'text-amber-600 hover:bg-amber-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}
        ${isRefreshing ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
        ${className}
      `}
            title={`Actualiser les graphiques et statistiques comptables (mis à jour il y a ${minutesOld < 60 ? `${minutesOld} min` : `${Math.floor(minutesOld / 60)}h`}). Cliquez ici si les montants affichés vous semblent incorrects.`}
        >
            <RotateCcw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Mise à jour...' : 'Actualiser'}</span>
        </button>
    );
}
