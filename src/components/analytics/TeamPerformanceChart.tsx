import React from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell
} from '../charts/RechartsWrapper';
import { UserPerformanceStat } from '../../hooks/useTeamPerformance';

interface TeamPerformanceChartProps {
    data: UserPerformanceStat[];
    formatPrice: (value: number) => string;
    colors?: string[];
}

const DEFAULT_COLORS = ['var(--brand-primary)', 'var(--brand-primary-dark)', 'var(--brand-accent)', 'var(--brand-border)', '#94a3b8'];

export const TeamPerformanceChart: React.FC<TeamPerformanceChartProps> = ({ data, formatPrice, colors }) => {
    const chartColors = colors || DEFAULT_COLORS;
    // Sort data strictly by revenue descending for better visualization
    const sortedData = [...data].sort((a, b) => b.revenue - a.revenue);

    if (!sortedData || sortedData.length === 0) {
        return (
            <div className="w-full h-[300px] flex items-center justify-center bg-gray-50 rounded-lg border border-dashed border-gray-200">
                <p className="text-gray-400 text-sm">Aucune donnée de performance disponible</p>
            </div>
        );
    }

    const CustomTooltip = ({ active, payload, label: _label }: any) => {
        if (active && payload && payload.length) {
            const dataPoint = payload[0].payload;
            return (
                <div className="bg-white p-3 border border-brand-subtle rounded-xl shadow-lg">
                    <p className="font-bold text-gray-800 mb-1">{dataPoint.name}</p>
                    <p className="text-sm text-brand-primary font-bold">
                        {formatPrice(dataPoint.revenue)}
                    </p>
                    <div className="mt-2 border-t border-gray-100 pt-2 flex justify-between gap-4 text-xs text-gray-500">
                        <span>Ventes: {dataPoint.sales}</span>
                        <span>Articles: {dataPoint.items}</span>
                    </div>
                    <p className="text-xs text-purple-500 mt-1 capitalize">{dataPoint.role}</p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="bg-white rounded-xl p-4 border border-brand-subtle shadow-sm">
            <h4 className="text-sm font-semibold text-gray-800 mb-4 px-2">Performance par Membre</h4>

            <div className="w-full h-[300px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
                    <BarChart
                        data={sortedData}
                        layout="horizontal"
                        margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
                        barSize={40} // Consistent bar width
                    >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--brand-bg-subtle)" opacity={0.5} />
                        <XAxis
                            dataKey="name"
                            tick={{ fill: '#4b5563', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            interval={0}
                            angle={-45}
                            textAnchor="end"
                            height={60}
                        />
                        <YAxis
                            tick={{ fill: '#9ca3af', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(value: any) => `${value}`} // Simplify axis labels, keep detail in tooltip
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--brand-bg-subtle)' }} />
                        <Bar
                            dataKey="revenue"
                            radius={[4, 4, 0, 0]}
                            animationDuration={1500}
                        >
                            {sortedData.map((_entry, index) => (
                                <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
