/**
 * DashboardSkeleton - Placeholder for dashboard stats and charts
 * Prevents CLS by reserving space for statistics cards and charts
 */
export function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
      <div className="h-8 bg-gray-200 rounded w-1/2 mb-2" />
      <div className="h-3 bg-gray-200 rounded w-1/4" />
    </div>
  );
}

export function DashboardStatsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 h-80 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-1/3 mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-gray-200 rounded" />
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <DashboardStatsSkeleton />

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>

      {/* Bottom Section */}
      <ChartSkeleton />
    </div>
  );
}
