import React from 'react';

interface AdminPanelSkeletonProps {
    count?: number;
    type?: 'card' | 'table';
}

export const AdminPanelSkeleton: React.FC<AdminPanelSkeletonProps> = ({
    count = 4,
    type = 'card'
}) => {
    if (type === 'table') {
        return (
            <div className="p-4 space-y-3 animate-pulse">
                {Array.from({ length: count }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                        <div className="w-12 h-12 bg-muted-foreground/30 rounded-full flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                            <div className="h-4 bg-muted-foreground/30 rounded w-1/3" />
                            <div className="h-3 bg-muted rounded w-1/2" />
                        </div>
                        <div className="w-24 h-8 bg-muted-foreground/30 rounded" />
                    </div>
                ))}
            </div>
        );
    }

    // Card type (default)
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 md:p-6">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="bg-card rounded-lg p-4 border-2 border-border animate-pulse">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-3">
                        <div className="flex-1 space-y-2">
                            <div className="h-5 bg-muted-foreground/30 rounded w-2/3" />
                            <div className="h-3 bg-muted rounded w-1/2" />
                        </div>
                        <div className="w-16 h-6 bg-muted-foreground/30 rounded-full ml-2" />
                    </div>

                    {/* Info lines */}
                    <div className="space-y-2 mb-3">
                        <div className="h-3 bg-muted rounded w-full" />
                        <div className="h-3 bg-muted rounded w-5/6" />
                        <div className="h-3 bg-muted rounded w-4/6" />
                        <div className="h-3 bg-muted rounded w-3/6" />
                    </div>

                    {/* Action buttons */}
                    <div className="grid grid-cols-2 gap-2">
                        <div className="h-9 bg-muted-foreground/30 rounded-lg" />
                        <div className="h-9 bg-muted-foreground/30 rounded-lg" />
                        <div className="h-9 bg-muted-foreground/30 rounded-lg col-span-2" />
                    </div>
                </div>
            ))}
        </div>
    );
};
