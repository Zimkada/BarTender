import React from 'react';
import { LucideIcon } from 'lucide-react';

type GradientVariant = 'green' | 'blue' | 'purple' | 'amber';

interface DashboardStatCardProps {
    icon: LucideIcon;
    label: string;
    value: string | number;
    subValue?: string;
    gradient: GradientVariant;
    trend?: {
        direction: 'up' | 'down';
        percentage: number;
    };
}

const gradientClasses: Record<GradientVariant, { bg: string; border: string; text: string }> = {
    green: {
        bg: 'from-green-50 to-emerald-100',
        border: 'border-green-200',
        text: 'text-green-600',
    },
    blue: {
        bg: 'from-blue-50 to-sky-100',
        border: 'border-blue-200',
        text: 'text-blue-600',
    },
    purple: {
        bg: 'from-indigo-50 to-purple-100',
        border: 'border-indigo-200',
        text: 'text-indigo-600',
    },
    amber: {
        bg: 'from-amber-50 to-yellow-100',
        border: 'border-amber-200',
        text: 'text-amber-600',
    },
};

export const DashboardStatCard = React.memo<DashboardStatCardProps>(
    ({ icon: Icon, label, value, subValue, gradient, trend }) => {
        const classes = gradientClasses[gradient];

        return (
            <div className={`bg-gradient-to-br ${classes.bg} rounded-xl p-6 shadow-sm border ${classes.border}`}>
                <div className="flex items-center gap-4">
                    <Icon className={`w-8 h-8 ${classes.text} flex-shrink-0`} />
                    <div>
                        <p className="text-gray-600 text-sm mb-1">{label}</p>
                        <p className={`text-3xl font-bold ${classes.text}`}>
                            {typeof value === 'number' ? value.toLocaleString('fr-FR') : value}
                            {subValue && <span className="text-xl"> {subValue}</span>}
                        </p>
                        {trend && (
                            <p className={`text-xs mt-1 ${trend.direction === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                                {trend.direction === 'up' ? '↑' : '↓'} {trend.percentage}%
                            </p>
                        )}
                    </div>
                </div>
            </div>
        );
    }
);

DashboardStatCard.displayName = 'DashboardStatCard';
