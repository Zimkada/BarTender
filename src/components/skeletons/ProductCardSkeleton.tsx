/**
 * ProductCardSkeleton - Placeholder while loading product card
 * Prevents CLS (Cumulative Layout Shift) by reserving space early
 */
export function ProductCardSkeleton() {
  return (
    <div className="bg-card rounded-xl border border-border shadow-sm relative overflow-hidden h-full flex flex-col animate-pulse">
      {/* Stock Badge placeholder */}
      <div className="absolute top-2 right-2 w-8 h-5 bg-muted-foreground/30 rounded-full" />

      {/* Image placeholder */}
      <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden p-2">
        <div className="w-full h-full bg-muted rounded" />
      </div>

      {/* Content placeholder */}
      <div className="p-2 flex flex-col flex-1 gap-2">
        {/* Title placeholder (2 lines) */}
        <div className="space-y-1">
          <div className="h-3 bg-muted rounded w-full" />
          <div className="h-3 bg-muted rounded w-2/3" />
        </div>

        {/* Volume placeholder */}
        <div className="h-2 bg-muted rounded w-1/2" />

        {/* Price + Button row */}
        <div className="mt-auto flex items-center justify-between">
          <div className="h-4 bg-muted rounded w-1/3" />
          <div className="w-7 h-7 bg-muted rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/**
 * ProductGridSkeleton - Grid of skeleton loaders
 */
interface ProductGridSkeletonProps {
  count?: number;
}

export function ProductGridSkeleton({ count = 12 }: ProductGridSkeletonProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}
