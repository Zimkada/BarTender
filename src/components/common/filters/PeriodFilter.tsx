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
            <div className="flex bg-gray-100 rounded-lg p-1 flex-wrap gap-1">
                {availableFilters.map((filter) => (
                    <Button
                        key={filter}
                        onClick={() => setTimeRange(filter)}
                        variant={timeRange === filter ? "default" : "ghost"}
                        className={`px-3 py-1.5 h-9 rounded-md text-xs font-medium transition-all flex-1 min-w-[80px] ${timeRange === filter
                                ? 'bg-amber-500 text-white shadow-sm ring-1 ring-amber-600'
                                : 'text-gray-600 hover:bg-gray-200'
                            } ${buttonClassName}`}
                    >
                        {TIME_RANGE_CONFIGS[filter]?.label || filter}
                    </Button>
                ))}
            </div>

            {/* Date Range Personnalisé */}
            {isCustom && customRange && updateCustomRange && (
                <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border border-gray-200 animate-in fade-in slide-in-from-top-1">
                    <Input
                        type="date"
                        value={customRange.start}
                        onChange={(e) => updateCustomRange('start', e.target.value)}
                        className="flex-1 text-sm h-9 bg-white"
                    />
                    <span className="text-gray-400 font-medium">→</span>
                    <Input
                        type="date"
                        value={customRange.end}
                        onChange={(e) => updateCustomRange('end', e.target.value)}
                        className="flex-1 text-sm h-9 bg-white"
                    />
                </div>
            )}
        </div>
    );
};
