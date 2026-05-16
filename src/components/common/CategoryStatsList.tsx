import React from 'react';

interface CategoryStat {
    categoryId: string;
    categoryName: string;
    categoryColor: string;
    totalProducts: number;
    alertsCount: number;
}

interface CategoryStatsListProps {
    stats: CategoryStat[];
    showAlerts?: boolean;
}

export const CategoryStatsList: React.FC<CategoryStatsListProps> = ({ stats, showAlerts = true }) => {
    return (
        <div className="space-y-2">
            {stats.map(stat => (
                <div key={stat.categoryId} className="flex items-center justify-between p-2 bg-muted/70 border border-border rounded-lg">
                    <div className="flex items-center gap-2">
                        <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: stat.categoryColor }}
                        />
                        <span className="text-sm font-medium text-foreground">{stat.categoryName}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">
                            {stat.totalProducts} produit{stat.totalProducts > 1 ? 's' : ''}
                        </span>
                        {showAlerts && stat.alertsCount > 0 && (
                            <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-900/50 text-xs font-medium rounded-full">
                                {stat.alertsCount} alerte{stat.alertsCount > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};
