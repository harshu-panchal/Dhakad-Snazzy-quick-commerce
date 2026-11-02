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
  rootMargin = '800px 400px',
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

    // Use the actual rendered <img> as the request owner. The previous
    // Image()-preload-then-swap sequence kept the rendered image transparent
    // until every byte had arrived and added a second lazy-loading gate.
    // Observing the nearest scrollable <main> also makes the preload margin
    // effective in AppLayout, whose page scroll happens inside <main> rather
    // than on window.
    const target = imgRef.current;
    if (!target) return;
    const mainScrollContainer = target.closest('main');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Assigning the real src starts one request and allows progressive
            // rendering/decoding instead of waiting on an invisible preloader.
            setImageSrc(resolvedSrc);
            observer.disconnect();
          }
        });
      },
      {
        root: mainScrollContainer instanceof Element ? mainScrollContainer : null,
        rootMargin,
      }
    );

    observer.observe(target);

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

  // IntersectionObserver already controls when the real URL is assigned;
  // eager prevents a second, browser-defined lazy-loading delay.
  return (
    <img
      ref={imgRef}
      src={imageSrc || placeholder || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"%3E%3C/svg%3E'}
      alt={alt}
      className={className}
      loading="eager"
      decoding="async"
      onLoad={() => setIsLoaded(true)}
      onError={(e) => {
        if (onError) onError(e);
      }}
      {...props}
    />
  );
}

