import { Trash2, Users, Check, CreditCard, Award, TrendingUp, Trophy, Star } from 'lucide-react';
import React from 'react';
import { useCurrencyFormatter } from '../../hooks/useBeninCurrency';
import { UserPerformanceStat } from '../../hooks/useTeamPerformance';
import { Select } from '../ui/Select';
import { motion } from 'framer-motion';

interface TeamPerformanceTableProps {
    data: UserPerformanceStat[];
    totalRevenue: number;
    filter: 'all' | 'servers' | 'management';
    onFilterChange: (filter: 'all' | 'servers' | 'management') => void;
    title?: string;
    subtitle?: string;
    compact?: boolean;
}

export function TeamPerformanceTable({
    data,
    totalRevenue,
    filter,
    onFilterChange,
    title = "Performance Équipe",
    subtitle = "Ventes nettes déduites",
    compact = false
}: TeamPerformanceTableProps) {
    const { formatPrice } = useCurrencyFormatter();

    const filteredData = React.useMemo(() => {
        let result = [...data];
        if (filter === 'servers') {
            result = result.filter(u => u.role === 'serveur');
        } else if (filter === 'management') {
            result = result.filter(u => u.role === 'gerant' || u.role === 'promoteur');
        }
        return result.sort((a, b) => b.revenue - a.revenue);
    }, [data, filter]);

    const maxRevenue = Math.max(...filteredData.map(u => u.revenue), 1);

    const getRankInfo = (index: number) => {
        if (index === 0) return { icon: <Trophy size={14} className="text-amber-500" />, bg: 'bg-amber-50 border-amber-100' };
        if (index === 1) return { icon: <Award size={14} className="text-slate-400" />, bg: 'bg-slate-50 border-slate-100' };
        if (index === 2) return { icon: <Award size={14} className="text-orange-400" />, bg: 'bg-orange-50 border-orange-100' };
        return { icon: <span className="text-[10px] font-black text-gray-400">{index + 1}</span>, bg: 'bg-gray-50 border-gray-100' };
    };

    if (data.length === 0) {
        return (
            <div className="bg-white rounded-3xl p-8 border border-brand-subtle text-center">
                <Users className="mx-auto text-gray-300 mb-3" size={32} />
                <p className="text-gray-500 font-black uppercase tracking-widest text-[10px]">Aucune donnée</p>
            </div>
        );
    }

    return (
        <div className="bg-white/40 backdrop-blur-md rounded-[2.5rem] p-4 sm:p-6 border-2 border-brand-primary shadow-xl shadow-brand-subtle/10 overflow-hidden">
            {/* Header: Title & Filter on stacked layout for mobile safety */}
            <div className="flex flex-col gap-3 mb-6">
                <div className="flex items-start gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-brand-primary flex items-center justify-center text-white shadow-lg shadow-brand-subtle flex-shrink-0">
                        <TrendingUp size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h4 className="text-base font-black text-brand-dark uppercase tracking-tight leading-tight">{title}</h4>
                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mt-1 opacity-70 leading-none">{subtitle}</p>
                    </div>
                </div>

                <div className="flex justify-start">
                    <Select
                        options={[
                            { value: 'all', label: 'Toute l\'Équipe' },
                            { value: 'servers', label: 'Serveurs' },
                            { value: 'management', label: 'Managers' },
                        ]}
                        value={filter}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onFilterChange(e.target.value as any)}
                        size="sm"
                        className="w-full sm:w-40 bg-white border-brand-subtle shadow-sm rounded-xl font-black uppercase text-[10px]"
                    />
                </div>
            </div>

            {/* List */}
            <div className="space-y-3">
                {filteredData.map((user, index) => {
                    const rank = getRankInfo(index);
                    const perfPercentage = (user.revenue / maxRevenue) * 100;
                    const totalPerfShare = totalRevenue > 0 ? (user.revenue / totalRevenue) * 100 : 0;

                    return (
                        <motion.div
                            key={user.userId}
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: index * 0.05 }}
                            className="relative group bg-white rounded-2xl border border-brand-subtle/50 p-3 shadow-sm"
                        >
                            <div className="flex items-start gap-3">
                                {/* Compact Rank Icon */}
                                <div className={`w-7 h-7 rounded-lg ${rank.bg} border flex items-center justify-center flex-shrink-0 mt-0.5`}>
                                    {rank.icon}
                                </div>

                                {/* Content Block */}
                                <div className="flex-1 min-w-0">
                                    {/* Name line */}
                                    <h5 className="font-black text-xs text-brand-dark uppercase tracking-tight mb-2 leading-tight truncate">
                                        {user.name}
                                    </h5>

                                    {/* Stats Grid-like Flex */}
                                    <div className="flex flex-wrap items-center gap-y-2">
                                        {/* CA - Left side focus */}
                                        <div className="flex items-center gap-1.5 pr-3">
                                            <span className="text-xs font-black text-gray-900 font-mono tracking-tighter">
                                                {formatPrice(user.revenue)}
                                            </span>
                                        </div>

                                        {/* Sales count - with divider */}
                                        <div className="flex items-center gap-1.5 px-3 border-l border-gray-100">
                                            <div className="w-1 h-1 rounded-full bg-emerald-400"></div>
                                            <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none">
                                                {user.sales} VTES
                                            </span>
                                        </div>

                                        {/* Performance share - with divider */}
                                        <div className="flex items-center gap-1.5 px-3 border-l border-gray-100">
                                            <div className="w-1 h-1 rounded-full bg-blue-400"></div>
                                            <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none">
                                                {totalPerfShare.toFixed(1)}% JOURNÉE
                                            </span>
                                        </div>

                                        {/* Champion tag - as a separate pill if top 1 */}
                                        {index === 0 && (
                                            <div className="mt-1 w-full sm:w-auto">
                                                <div className="inline-flex items-center gap-1 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
                                                    <Star size={8} className="text-amber-500 fill-amber-500" />
                                                    <span className="text-[7px] font-black text-amber-700 uppercase tracking-widest leading-none">
                                                        Champion
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Background decoration for the bar effect */}
                            <div className="absolute inset-0 z-[-1] opacity-[0.03] rounded-2xl overflow-hidden pointer-events-none">
                                <div
                                    className="h-full bg-brand-primary"
                                    style={{ width: `${perfPercentage}%` }}
                                />
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Total Footer */}
            <div className="mt-6 pt-4 border-t border-brand-subtle/20 flex items-center justify-between">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Total Performance</span>
                <div className="bg-brand-dark/5 px-3 py-1.5 rounded-xl border border-brand-subtle/20">
                    <span className="text-xs font-black text-brand-dark font-mono tracking-tight">{formatPrice(totalRevenue)}</span>
                </div>
            </div>
        </div>
    );
}
