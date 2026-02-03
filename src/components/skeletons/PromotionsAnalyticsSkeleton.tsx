// motion removed as it was unused
export function PromotionsAnalyticsSkeleton() {
    return (
        <div className="space-y-8 p-6 sm:p-10 bg-slate-50/30 animate-pulse">
            {/* Header & Filter Section Skeleton */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-gray-200 rounded-2xl" />
                    <div className="space-y-2">
                        <div className="h-6 bg-gray-200 rounded w-48" />
                        <div className="h-4 bg-gray-200 rounded w-32" />
                    </div>
                </div>
                <div className="w-full lg:w-64 h-12 bg-gray-200 rounded-2xl" />
            </div>

            {/* KPI Grid Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="bg-white p-6 rounded-[2rem] border border-gray-100 h-44 flex flex-col justify-between">
                        <div className="flex justify-between items-start">
                            <div className="w-12 h-12 bg-gray-200 rounded-2xl" />
                            <div className="w-16 h-6 bg-gray-200 rounded-xl" />
                        </div>
                        <div className="space-y-2">
                            <div className="h-3 bg-gray-200 rounded w-1/2" />
                            <div className="h-8 bg-gray-200 rounded w-3/4" />
                        </div>
                    </div>
                ))}
            </div>

            {/* Performance Details Card Skeleton */}
            <div className="bg-white rounded-[2.5rem] border border-gray-100 h-[500px] overflow-hidden">
                <div className="p-8 sm:p-10 border-b border-gray-50 flex justify-between items-center">
                    <div className="space-y-2">
                        <div className="h-6 bg-gray-200 rounded w-64" />
                        <div className="h-4 bg-gray-200 rounded w-48" />
                    </div>
                    <div className="w-32 h-8 bg-gray-200 rounded-full" />
                </div>
                <div className="p-6 space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-16 bg-gray-50 rounded-2xl w-full" />
                    ))}
                </div>
            </div>
        </div>
    );
}
