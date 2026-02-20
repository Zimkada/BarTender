import React from 'react';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { TimeRange } from '../../../types/dateFilters';
import { TIME_RANGE_CONFIGS } from '../../../config/dateFilters';
import { useViewport } from '../../../hooks/useViewport';

interface PeriodFilterProps {
    timeRange: TimeRange;
    setTimeRange: (range: TimeRange) => void;
    availableFilters: TimeRange[];
    customRange?: { start: string; end: string };
    updateCustomRange?: (field: 'start' | 'end', value: string) => void;
    className?: string;
    buttonClassName?: string;
    justify?: 'start' | 'center' | 'end' | 'between';
}

/**
 * PeriodFilter - Composant réutilisable pour le filtrage par période
 * Utilise les classes CSS glass-action-button-*-2026 pour le theming dynamique
 */
export const PeriodFilter: React.FC<PeriodFilterProps> = ({
    timeRange,
    setTimeRange,
    availableFilters,
    customRange,
    updateCustomRange,
    className = "",
    buttonClassName = "",
    justify = "start",
}) => {
    const { isMobile } = useViewport();
    const isCustom = timeRange === 'custom';

    return (
        <div className={`space-y-3 px-1 ${className}`}>
            {/* Boutons de filtres rapides */}
            <div className={`flex flex-wrap bg-white/40 backdrop-blur-md rounded-2xl p-1 gap-1.5 border border-brand-subtle shadow-sm overflow-hidden sm:w-auto justify-${justify}`}>
                {availableFilters.map((filter) => (
                    <Button
                        key={filter}
                        onClick={() => setTimeRange(filter)}
                        variant={timeRange === filter ? "default" : "ghost"}
                        className={`px-4 py-2 h-10 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all flex-1 sm:flex-none sm:min-w-[90px] whitespace-nowrap min-w-max ${timeRange === filter
                            ? 'glass-action-button-active-2026 shadow-md shadow-brand-subtle'
                            : 'glass-action-button-2026 text-gray-400 hover:text-brand-primary'
                            } ${buttonClassName}`}
                    >
                        {isMobile && TIME_RANGE_CONFIGS[filter]?.shortLabel
                            ? TIME_RANGE_CONFIGS[filter].shortLabel
                            : (TIME_RANGE_CONFIGS[filter]?.label || filter)}
                    </Button>
                ))}
            </div>

            {/* Date Range Personnalisé */}
            {isCustom && customRange && updateCustomRange && (
                <div className="flex items-center gap-2 bg-white/40 backdrop-blur-md p-3 rounded-2xl border border-brand-subtle shadow-sm animate-in fade-in slide-in-from-top-1">
                    <Input
                        type="date"
                        value={customRange.start}
                        onChange={(e) => updateCustomRange('start', e.target.value)}
                        className="flex-1 text-sm h-9 bg-white rounded-lg border-brand-subtle focus:ring-brand-primary focus:border-brand-primary transition-all"
                    />
                    <span className="text-brand-primary font-bold">→</span>
                    <Input
                        type="date"
                        value={customRange.end}
                        onChange={(e) => updateCustomRange('end', e.target.value)}
                        className="flex-1 text-sm h-9 bg-white rounded-lg border-brand-subtle focus:ring-brand-primary focus:border-brand-primary transition-all"
                    />
                </div>
            )}
        </div>
    );
};
