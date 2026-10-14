import { useState, useRef, useEffect, useMemo } from 'react';
import { getOptimizedImageUrl } from '../utils/cloudinary';
import { isVideoUrl } from '../utils/media';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  placeholder?: string;
  rootMargin?: string;
  onError?: (e: React.SyntheticEvent<HTMLImageElement, Event>) => void;
  /** Optional target width - applies a Cloudinary resize/auto-quality transform when the src is a Cloudinary URL. */
  width?: number;
  [key: string]: any;
}

/**
 * Optimized lazy loading image component
 * Only loads images when they're about to enter the viewport
 */
export default function LazyImage({
  src,
  alt,
  className = '',
  placeholder,
  rootMargin = '200px',
  onError,
  width,
  ...props
}: LazyImageProps) {
  const isVideo = isVideoUrl(src);
  const resolvedSrc = useMemo(
    () => (width && !isVideo ? getOptimizedImageUrl(src, { width }) || '' : src),
    [src, width, isVideo]
  );
  const [imageSrc, setImageSrc] = useState<string | null>(placeholder || null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!resolvedSrc) return;

    // Video: no Image()-based preload trick (that only works for images) —
    // just lazily mount the <video> element itself once it's near the viewport.
    if (isVideo) {
      const target = videoRef.current;
      if (!target) return;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setImageSrc(resolvedSrc);
              setIsLoaded(true);
              observer.disconnect();
            }
          });
        },
        { rootMargin }
      );

      observer.observe(target);
      return () => observer.disconnect();
    }

    // Use Intersection Observer for lazy loading
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Start loading the image
            const img = new Image();
            img.src = resolvedSrc;
            img.onload = () => {
              setImageSrc(resolvedSrc);
              setIsLoaded(true);
            };
            img.onerror = () => {
              setHasError(true);
              // onError will be called by the img element's onError handler below
            };
            observer.disconnect();
          }
        });
      },
      {
        rootMargin,
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [resolvedSrc, rootMargin, onError, isVideo]);

  if (isVideo) {
    return (
      <video
        ref={videoRef}
        src={imageSrc || undefined}
        muted
        playsInline
        preload="metadata"
        className={`${className} ${isLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
      />
    );
  }

  return (
    <img
      ref={imgRef}
      src={imageSrc || placeholder || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"%3E%3C/svg%3E'}
      alt={alt}
      className={`${className} ${isLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
      loading="lazy"
      decoding="async"
      onError={(e) => {
        setHasError(true);
        if (onError) onError(e);
      }}
      {...props}
    />
  );
}

