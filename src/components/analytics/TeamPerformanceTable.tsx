import React from 'react';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { UserPerformanceStat } from '../../hooks/useTeamPerformance';
import { Select } from '../ui/Select';

interface TeamPerformanceTableProps {
    data: UserPerformanceStat[];
    totalRevenue: number;
    filter: 'all' | 'servers' | 'management';
    onFilterChange: (filter: 'all' | 'servers' | 'management') => void;
    title?: string;
    subtitle?: string;
    compact?: boolean; // Pour le Dashboard qui a moins d'espace
}

export function TeamPerformanceTable({
    data,
    totalRevenue,
    filter,
    onFilterChange,
    title = "Performance Équipe",
    subtitle = "Par serveur assigné (Net)",
    compact = false
}: TeamPerformanceTableProps) {
    const { formatPrice } = useCurrencyFormatter();

    const filteredData = React.useMemo(() => {
        if (filter === 'servers') {
            return data.filter(u => u.role === 'serveur');
        } else if (filter === 'management') {
            return data.filter(u => u.role === 'gerant' || u.role === 'promoteur');
        }
        return data;
    }, [data, filter]);

    const getRoleBadge = (role: string) => {
        if (role === 'promoteur') return { icon: '🏆', color: 'bg-yellow-100 text-yellow-800', label: 'Promoteur' };
        if (role === 'gerant') return { icon: '👔', color: 'bg-purple-100 text-purple-800', label: 'Gérant' };
        return { icon: '👨‍💼', color: 'bg-blue-100 text-blue-800', label: 'Serveur' };
    };

    if (data.length === 0) {
        return (
            <div className="bg-white rounded-xl p-4 border border-amber-100 text-center text-gray-500 text-sm">
                Aucune donnée de performance disponible.
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl p-4 border border-amber-100">
            <div className="flex items-center justify-between mb-3">
                <div>
                    <h4 className="text-sm font-semibold text-gray-800">{title}</h4>
                    {!compact && <p className="text-xs text-gray-500">{subtitle}</p>}
                </div>
                <Select
                    options={[
                        { value: 'all', label: 'Tous' },
                        { value: 'servers', label: 'Serveurs' },
                        { value: 'management', label: 'Managers' },
                    ]}
                    value={filter}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onFilterChange(e.target.value as any)}
                    size="sm"
                    className="w-32 sm:w-40"
                />
            </div>
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-amber-100">
                            <th className="text-left text-xs font-medium text-gray-600 pb-2 px-1">Nom</th>
                            <th className="text-right text-xs font-medium text-gray-600 pb-2 px-2">CA</th>
                            <th className="text-right text-xs font-medium text-gray-600 pb-2 px-2">{compact ? 'Vtes' : 'Ventes'}</th>
                            <th className="text-right text-xs font-medium text-gray-600 pb-2 px-1">% CA</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredData.map((user, index) => {
                            const badge = getRoleBadge(user.role);
                            return (
                                <tr key={user.userId} className="border-b border-amber-50 last:border-0 hover:bg-amber-50/30 transition-colors">
                                    <td className="py-2 px-1">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${badge.color}`}>
                                                {badge.icon}
                                            </span>
                                            <span className="text-sm font-medium text-gray-800 truncate max-w-[120px] sm:max-w-none">
                                                {user.name}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="text-right text-sm font-semibold text-amber-600 py-2 px-2 whitespace-nowrap">
                                        {formatPrice(user.revenue)}
                                    </td>
                                    <td className="text-right text-sm text-gray-600 py-2 px-2">
                                        {user.sales}
                                    </td>
                                    <td className="text-right text-sm font-medium text-gray-700 py-2 px-1">
                                        {totalRevenue > 0 ? ((user.revenue / totalRevenue) * 100).toFixed(1) : '0.0'}%
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
