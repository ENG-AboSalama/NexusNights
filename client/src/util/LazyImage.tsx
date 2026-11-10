import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';

interface LazyImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string;
  /** Load image when this close to viewport (default: 200px) */
  rootMargin?: string;
  /** Fallback content while loading */
  placeholder?: React.ReactNode;
}

/**
 * Lazy-loading image component that only loads when near the viewport.
 * Uses Intersection Observer for efficient detection.
 */
export function LazyImage({ src, rootMargin = '200px', placeholder, alt = '', ...props }: LazyImageProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    // If already in view or Intersection Observer not supported, load immediately
    if (isInView || !('IntersectionObserver' in window)) {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin }
    );

    observer.observe(img);

    return () => {
      observer.disconnect();
    };
  }, [isInView, rootMargin]);

  return (
    <>
      {isInView ? (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          {...props}
        />
      ) : (
        <img ref={imgRef} alt={alt} {...props} />
      )}
      {!loaded && placeholder}
    </>
  );
}
