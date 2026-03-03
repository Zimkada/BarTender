import { useState } from 'react';

interface OptimizedImageProps {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
  sizes?: string; // Responsive sizes hint — pass the real container width for best results
}

/**
 * Optimized image component with WebP support, responsive srcset, and lazy loading.
 * Always wrap with a sized container; pass `sizes` matching the real rendered width.
 */
export const OptimizedImage = ({
  src,
  alt,
  priority = false,
  className,
  sizes = '(max-width: 640px) 200px, (max-width: 1024px) 400px, 800px'
}: OptimizedImageProps) => {
  const [isLoading, setIsLoading] = useState(true);

  const generateImageUrl = (size: number, format: 'webp' | 'jpg' = 'webp') => {
    const separator = src.includes('?') ? '&' : '?';
    const params = new URLSearchParams({ width: size.toString(), format, quality: '80' });
    return `${src}${separator}${params.toString()}`;
  };

  return (
    // display:block + w/h 100% so <picture> behaves like a sized block container,
    // allowing object-contain on the inner <img> to work correctly.
    <picture style={{ display: 'block', width: '100%', height: '100%' }}>
      <source
        srcSet={`${generateImageUrl(200, 'webp')} 200w, ${generateImageUrl(400, 'webp')} 400w, ${generateImageUrl(800, 'webp')} 800w`}
        sizes={sizes}
        type="image/webp"
      />
      <source
        srcSet={`${generateImageUrl(200, 'jpg')} 200w, ${generateImageUrl(400, 'jpg')} 400w, ${generateImageUrl(800, 'jpg')} 800w`}
        sizes={sizes}
        type="image/jpeg"
      />
      <img
        src={src}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        className={`${className} ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
        onLoad={() => setIsLoading(false)}
        decoding="async"
      />
    </picture>
  );
};
