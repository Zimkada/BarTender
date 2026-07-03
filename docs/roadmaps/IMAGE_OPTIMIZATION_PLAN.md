# Image Optimization Plan - BarTender

**Date:** 02/01/2026
**Status:** À implémenter
**Impact estimé:** +5-6 Lighthouse points
**Effort:** 2-3h

---

## 🔍 Current State Analysis

### What's Already Good
- ✅ `loading="lazy"` implemented in ProductCard
- ✅ Alt text provided for all images
- ✅ Images served from Supabase Storage (optimized CDN)
- ✅ Proper aspect ratios maintained

### What's Missing
- ❌ WebP format with JPEG fallback
- ❌ Responsive images (srcset for different screen sizes)
- ❌ Image compression/optimization
- ❌ LCP image preloading
- ❌ Placeholder while loading

---

## 🎯 Implementation Strategy

### Phase 1: Supabase Image Transformations (If Supported)

Check if Supabase Storage supports image transformations:
```typescript
// Test URL pattern
const imageUrl = "https://xxx.supabase.co/storage/v1/object/public/products/image.jpg?width=200&format=webp"
```

If supported, use this pattern:
```typescript
interface ResponsiveImage {
  src: string;
  srcSet: {
    mobile: string;    // 200px
    tablet: string;    // 400px
    desktop: string;   // 800px
  };
  webp: {
    mobile: string;
    tablet: string;
    desktop: string;
  };
}
```

### Phase 2: React Image Component

Create an optimized image component:

```typescript
// src/components/ui/OptimizedImage.tsx
import React, { useState } from 'react';

interface OptimizedImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  priority?: boolean; // For LCP images
  className?: string;
}

export const OptimizedImage = ({
  src,
  alt,
  width,
  height,
  priority = false,
  className
}: OptimizedImageProps) => {
  const [isLoading, setIsLoading] = useState(true);

  // Generate responsive URLs (if Supabase supports it)
  const generateImageUrl = (size: number, format: 'webp' | 'jpg' = 'webp') => {
    const params = new URLSearchParams({
      width: size.toString(),
      format,
      quality: '80'
    });
    return `${src}?${params.toString()}`;
  };

  return (
    <picture>
      {/* WebP format - modern browsers */}
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

      {/* Fallback <img> */}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        className={`${className} ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity`}
        onLoad={() => setIsLoading(false)}
      />
    </picture>
  );
};
```

### Phase 3: Update Components

Replace existing images:

```typescript
// ProductCard.tsx - BEFORE
<img
  src={product.image}
  alt={product.name}
  loading="lazy"
  className="w-full h-full object-contain"
/>

// ProductCard.tsx - AFTER
<OptimizedImage
  src={product.image}
  alt={product.name}
  width={200}
  height={200}
  className="w-full h-full object-contain"
/>

// HomePage - LCP image - BEFORE
<img src={heroImage} alt="Hero" />

// HomePage - LCP image - AFTER
<OptimizedImage
  src={heroImage}
  alt="Hero"
  priority={true}  // Preload for LCP
  width={1200}
  height={600}
/>
```

### Phase 4: Preload LCP Image

Add preload link for critical images (hero, main product):

```html
<!-- In index.html <head> or RootLayout -->
<link rel="preload" as="image" href="https://xxx.supabase.co/storage/v1/object/public/..." />
```

Or in code:
```typescript
// main.tsx or RootLayout
useEffect(() => {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = lcpImageUrl;
  document.head.appendChild(link);
}, []);
```

---

## 📋 Affected Components

### High Priority (Product images)
- [ ] ProductCard.tsx - ~100+ instances
- [ ] ProductImport.tsx - Preview images
- [ ] GlobalCatalogPage.tsx - Catalog images

### Medium Priority (Avatar/Logo)
- [ ] Header.tsx - Logo image
- [ ] TeamCard.tsx - Avatar images
- [ ] ProfilePage.tsx - User avatar

### Low Priority (Charts/Icons)
- [ ] Chart backgrounds
- [ ] Icon images (if any)

---

## 🚀 Quick Implementation (If Supabase doesn't support transforms)

Use Cloudinary or similar (free tier):

```typescript
// Option: Use imgix or Cloudinary for transforms
const optimizedUrl = `https://api.imgix.net/${imageUrl}?w=200&fm=webp&q=80`;
```

Or use Sharp library at build time:
```bash
npm install sharp
# Process images during build
```

---

## 💡 Expected Improvements

### Before
```
LCP image: Full resolution (2MB)
Formats: JPEG only
Sizes: One size for all devices
```

### After
```
LCP image: 200px WebP (15KB) + preload
Formats: WebP (modern) + JPEG (fallback)
Sizes: 200px (mobile), 400px (tablet), 800px (desktop)
Estimated savings: 60-70% for product images
```

### Impact on Lighthouse
- **LCP:** -500ms to -1000ms (smaller images load faster)
- **Performance score:** +5-6 points
- **Best Practices:** +1 point (modern image formats)

---

## ⏱️ Implementation Timeline

| Step | Time | Effort |
|------|------|--------|
| 1. Create OptimizedImage component | 30 min | Easy |
| 2. Update ProductCard | 30 min | Easy |
| 3. Update HomePage/Hero | 15 min | Easy |
| 4. Update other components | 45 min | Medium |
| 5. Test & Validate | 30 min | Medium |
| **Total** | **~2.5h** | **Medium** |

---

## ✅ Validation Checklist

After implementation:
- [ ] All images load via `<picture>` tag
- [ ] WebP served to modern browsers
- [ ] JPEG fallback works
- [ ] Responsive srcset working
- [ ] LCP image preloaded
- [ ] Lazy loading still functional
- [ ] Lighthouse LCP improved
- [ ] No broken images

---

## 🎯 Priority Matrix

```
HIGH IMPACT, LOW EFFORT:
✅ Use existing Supabase transforms (if available)
✅ Update ProductCard (most visible)

MEDIUM IMPACT, MEDIUM EFFORT:
✅ Create OptimizedImage component (reusable)
✅ Preload LCP images

LOW IMPACT, LOW EFFORT:
✅ Update secondary images
```

**Recommendation:** Implement if Lighthouse audit shows LCP > 3.5s
Otherwise, defer to Phase 5.
