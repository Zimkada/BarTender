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
                <div key={stat.categoryId} className="flex items-center justify-between p-2 bg-amber-50 rounded-lg">
                    <div className="flex items-center gap-2">
                        <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: stat.categoryColor }}
                        />
                        <span className="text-sm font-medium text-gray-700">{stat.categoryName}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600">
                            {stat.totalProducts} produit{stat.totalProducts > 1 ? 's' : ''}
                        </span>
                        {showAlerts && stat.alertsCount > 0 && (
                            <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded-full">
                                {stat.alertsCount} alerte{stat.alertsCount > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};
