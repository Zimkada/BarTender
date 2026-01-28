import React from 'react';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { TimeRange } from '../../../types/dateFilters';
import { TIME_RANGE_CONFIGS } from '../../../config/dateFilters';

interface PeriodFilterProps {
    timeRange: TimeRange;
    setTimeRange: (range: TimeRange) => void;
    availableFilters: TimeRange[];
    customRange?: { start: string; end: string };
    updateCustomRange?: (field: 'start' | 'end', value: string) => void;
    className?: string;
    buttonClassName?: string;
}

/**
 * PeriodFilter - Composant réutilisable pour le filtrage par période
 */
export const PeriodFilter: React.FC<PeriodFilterProps> = ({
    timeRange,
    setTimeRange,
    availableFilters,
    customRange,
    updateCustomRange,
    className = "",
    buttonClassName = "",
}) => {
    const isCustom = timeRange === 'custom';

    return (
        <div className={`space-y-3 ${className}`}>
            {/* Boutons de filtres rapides */}
            <div className="flex bg-white/80 backdrop-blur-sm rounded-xl p-1.5 flex-wrap gap-1.5 border border-amber-200/30 shadow-sm shadow-amber-500/5">
                {availableFilters.map((filter) => (
                    <Button
                        key={filter}
                        onClick={() => setTimeRange(filter)}
                        variant={timeRange === filter ? "default" : "ghost"}
                        className={`px-3 py-1.5 h-9 rounded-lg text-xs font-bold transition-all flex-1 min-w-[80px] ${timeRange === filter
                            ? 'bg-gradient-to-br from-amber-500 to-amber-700 text-white shadow-md shadow-amber-500/30'
                            : 'text-amber-700 hover:bg-amber-50 hover:text-amber-800'
                            } ${buttonClassName}`}
                    >
                        {TIME_RANGE_CONFIGS[filter]?.label || filter}
                    </Button>
                ))}
            </div>

            {/* Date Range Personnalisé */}
            {isCustom && customRange && updateCustomRange && (
                <div className="flex items-center gap-2 bg-amber-50/50 p-3 rounded-xl border border-amber-200/30 shadow-sm shadow-amber-500/5 animate-in fade-in slide-in-from-top-1">
                    <Input
                        type="date"
                        value={customRange.start}
                        onChange={(e) => updateCustomRange('start', e.target.value)}
                        className="flex-1 text-sm h-9 bg-white rounded-lg border-amber-200/50"
                    />
                    <span className="text-amber-500 font-bold">→</span>
                    <Input
                        type="date"
                        value={customRange.end}
                        onChange={(e) => updateCustomRange('end', e.target.value)}
                        className="flex-1 text-sm h-9 bg-white rounded-lg border-amber-200/50"
                    />
                </div>
            )}
        </div>
    );
};
