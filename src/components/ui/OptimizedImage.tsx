import { useState } from 'react';

interface OptimizedImageProps {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
  sizes?: string;
}

/**
 * Image component with lazy loading and fade-in.
 * Supabase Storage Free plan does not support image transformations (width/format params),
 * so we serve the original URL directly without srcset transformation.
 */
export const OptimizedImage = ({
  src,
  alt,
  priority = false,
  className,
}: OptimizedImageProps) => {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <img
      src={src}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      className={`${className} ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
      onLoad={() => setIsLoading(false)}
      decoding="async"
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  );
};
