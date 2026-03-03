import { OptimizedImage } from './ui/OptimizedImage';

interface ProductCardImageProps {
  src: string;
  alt: string;
  priority?: boolean;
}

/**
 * Optimized product image for grid cards (2-5 responsive columns)
 * Used in: HomePage ProductCard, GlobalProductsTab grid view
 * Sizes: 120px (mobile 2col), 150px (tablet 3-4col), 180px (desktop 5col)
 */
export const ProductCardImage = ({
  src,
  alt,
  priority = false
}: ProductCardImageProps) => (
  <OptimizedImage
    src={src}
    alt={alt}
    priority={priority}
    className="w-full h-full object-contain mix-blend-multiply max-w-full max-h-full"
    sizes="(max-width: 640px) 120px, (max-width: 1024px) 150px, 180px"
  />
);

ProductCardImage.displayName = 'ProductCardImage';
