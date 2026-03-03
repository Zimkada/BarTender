import { OptimizedImage } from './ui/OptimizedImage';

interface GlobalCatalogProductImageProps {
  src: string;
  alt: string;
}

/**
 * Optimized product image for global catalog grid view
 * Used in: GlobalProductsTab grid layout (2-5 responsive columns)
 * Sizes: 120px (mobile 2col), 150px (tablet 3-4col), 180px (desktop 5col)
 */
export const GlobalCatalogProductImage = ({
  src,
  alt
}: GlobalCatalogProductImageProps) => (
  <OptimizedImage
    src={src}
    alt={alt}
    className="w-full h-full object-contain p-2"
    sizes="(max-width: 640px) 120px, (max-width: 1024px) 150px, 180px"
  />
);

GlobalCatalogProductImage.displayName = 'GlobalCatalogProductImage';
