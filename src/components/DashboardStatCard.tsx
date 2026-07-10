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
        bg: 'from-green-50 to-emerald-100 dark:from-green-950/40 dark:to-emerald-900/30',
        border: 'border-green-200 dark:border-green-900/40',
        text: 'text-green-600 dark:text-green-400',
    },
    blue: {
        bg: 'from-blue-50 to-sky-100 dark:from-blue-950/40 dark:to-sky-900/30',
        border: 'border-blue-200 dark:border-blue-900/40',
        text: 'text-blue-600 dark:text-blue-400',
    },
    purple: {
        bg: 'from-indigo-50 to-purple-100 dark:from-indigo-950/40 dark:to-purple-900/30',
        border: 'border-indigo-200 dark:border-indigo-900/40',
        text: 'text-indigo-600 dark:text-indigo-400',
    },
    amber: {
        bg: 'from-amber-50 to-yellow-100 dark:from-amber-950/40 dark:to-yellow-900/30',
        border: 'border-amber-200 dark:border-amber-900/40',
        text: 'text-amber-600 dark:text-amber-400',
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
                        <p className="text-foreground/70 text-sm mb-1">{label}</p>
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
