import React from 'react';
import {
    BarChart,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell
} from '../charts/RechartsWrapper';
import { Bar } from 'recharts/es6/cartesian/Bar';
import { ChartTooltipShell } from '../charts/ChartTooltip';
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
            <div className="w-full h-[300px] flex items-center justify-center bg-muted rounded-lg border border-dashed border-border">
                <p className="text-muted-foreground text-sm">Aucune donnée de performance disponible</p>
            </div>
        );
    }

    // Recharts tooltip props are typed loosely by the library
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const CustomTooltip = ({ active, payload, label: _label }: any) => {
        if (active && payload && payload.length) {
            const dataPoint = payload[0].payload;
            return (
                <ChartTooltipShell title={dataPoint.name}>
                    <p className="text-sm text-brand-primary font-bold">
                        {formatPrice(dataPoint.revenue)}
                    </p>
                    <div className="mt-2 border-t border-border pt-2 flex justify-between gap-4 text-xs text-muted-foreground">
                        <span>Ventes: {dataPoint.sales}</span>
                        <span>Articles: {dataPoint.items}</span>
                    </div>
                    <p className="text-xs text-brand-primary mt-1 capitalize">{dataPoint.role}</p>
                </ChartTooltipShell>
            );
        }
        return null;
    };

    return (
        <div className="bg-card rounded-xl p-4 border border-border shadow-sm">
            <h4 className="text-sm font-semibold text-foreground mb-4 px-2">Performance par Membre</h4>

            <div className="w-full h-[300px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
                    <BarChart
                        data={sortedData}
                        layout="horizontal"
                        margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
                        barSize={40} // Consistent bar width
                    >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.55} />
                        <XAxis
                            dataKey="name"
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            interval={0}
                            angle={-45}
                            textAnchor="end"
                            height={60}
                        />
                        <YAxis
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(value: number | string) => `${value}`} // Simplify axis labels, keep detail in tooltip
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.35 }} />
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
