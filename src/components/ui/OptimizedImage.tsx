import React, { useState } from 'react';

interface OptimizedImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  priority?: boolean; // For LCP images
  className?: string;
}

/**
 * Optimized image component with WebP support, responsive srcset, and lazy loading
 * Provides better performance by:
 * 1. Using WebP format for modern browsers (60-70% smaller)
 * 2. Serving different sizes for different devices
 * 3. Lazy loading by default for non-critical images
 * 4. JPEG fallback for older browsers
 */
export const OptimizedImage = ({
  src,
  alt,
  width,
  height,
  priority = false,
  className
}: OptimizedImageProps) => {
  const [isLoading, setIsLoading] = useState(true);

  // Generate responsive URLs with Supabase image transformation parameters
  // Supabase Storage supports: width, quality, format parameters
  const generateImageUrl = (size: number, format: 'webp' | 'jpg' = 'webp') => {
    // If src is already a full URL with query params, append carefully
    const separator = src.includes('?') ? '&' : '?';
    const params = new URLSearchParams({
      width: size.toString(),
      format,
      quality: '80'
    });
    return `${src}${separator}${params.toString()}`;
  };

  return (
    <picture>
      {/* WebP format - modern browsers (60-70% smaller than JPEG) */}
      <source
        srcSet={`
          ${generateImageUrl(200, 'webp')} 200w,
          ${generateImageUrl(400, 'webp')} 400w,
          ${generateImageUrl(800, 'webp')} 800w
        `}
        sizes="(max-width: 640px) 200px, (max-width: 1024px) 400px, 800px"
        type="image/webp"
      />

      {/* JPEG fallback - older browsers */}
      <source
        srcSet={`
          ${generateImageUrl(200, 'jpg')} 200w,
          ${generateImageUrl(400, 'jpg')} 400w,
          ${generateImageUrl(800, 'jpg')} 800w
        `}
        sizes="(max-width: 640px) 200px, (max-width: 1024px) 400px, 800px"
        type="image/jpeg"
      />

      {/* Fallback <img> for browsers that don't support <picture> */}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        className={`${className} ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
        onLoad={() => setIsLoading(false)}
        decoding="async"
      />
    </picture>
  );
};
