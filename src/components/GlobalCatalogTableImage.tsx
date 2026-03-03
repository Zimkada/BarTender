import { OptimizedImage } from './ui/OptimizedImage';

interface GlobalCatalogTableImageProps {
  src: string;
  alt: string;
}

/**
 * Optimized product image for global catalog table view (thumbnail)
 * Used in: GlobalProductList table thumbnails (10x10px)
 * Sizes: 10px (always small table thumbnail)
 */
export const GlobalCatalogTableImage = ({
  src,
  alt
}: GlobalCatalogTableImageProps) => (
  <OptimizedImage
    src={src}
    alt={alt}
    className="w-full h-full object-contain"
    sizes="10px"
  />
);

GlobalCatalogTableImage.displayName = 'GlobalCatalogTableImage';
