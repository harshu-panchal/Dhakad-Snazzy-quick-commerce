import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { getHomeContent } from "../../../services/api/customerHomeService";
import { getTheme } from "../../../utils/themes";
import { resolveMediaUrl } from "../../../utils/media";

export interface MediaSlide {
  id?: string | number;
  _id?: string;
  type: "image" | "video";
  mediaUrl: string;
  thumbnailUrl?: string;
  title?: string;
  subtitle?: string;
  badge?: string;
  link?: string;
  buttonText?: string;
  order?: number;
  isActive?: boolean;
}

interface PromoStripProps {
  activeTab?: string;
}

// Curated high quality default category banners and videos
const DEFAULT_CATEGORY_SLIDES: Record<string, MediaSlide[]> = {
  all: [
    {
      id: "all-1",
      type: "image",
      mediaUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1400&q=80",
      title: "Mega Supermarket Savings",
      subtitle: "Up to 50% Off on Daily Essentials & Groceries",
      badge: "⚡ MEGA SALE",
      link: "/category/all",
      buttonText: "Shop Now",
    },
    {
      id: "all-2",
      type: "video",
      mediaUrl: "/assets/login/loginvideo.mp4",
      title: "Lightning 10-Minute Delivery",
      subtitle: "Instant Delivery Right to Your Doorstep",
      badge: "🚀 FAST DELIVERY",
      link: "/category/all",
      buttonText: "Order Now",
    },
    {
      id: "all-3",
      type: "image",
      mediaUrl: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1400&q=80",
      title: "Exclusive Weekend Flash Deals",
      subtitle: "Extra Discounts on Best-Selling Brands",
      badge: "🔥 LIMITED TIME",
      link: "/category/all",
      buttonText: "Explore Deals",
    },
  ],
  fashion: [
    {
      id: "fashion-1",
      type: "image",
      mediaUrl: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1400&q=80",
      title: "Trending Fashion & Style 2026",
      subtitle: "Curated Ethnic, Western & Streetwear Collections",
      badge: "✨ NEW ARRIVALS",
      link: "/category/fashion",
      buttonText: "Discover Fashion",
    },
    {
      id: "fashion-2",
      type: "video",
      mediaUrl: "/assets/login/loginvideo.mp4",
      title: "Step Out in Confidence",
      subtitle: "Flat 60% Off on Premium Women & Men Apparel",
      badge: "👗 HOT TRENDS",
      link: "/category/fashion",
      buttonText: "Shop Styles",
    },
    {
      id: "fashion-3",
      type: "image",
      mediaUrl: "https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=1400&q=80",
      title: "Footwear & Accessories Carnival",
      subtitle: "Complete Your Look with Designer Handbags & Shoes",
      badge: "👜 FLAT 50% OFF",
      link: "/category/fashion",
      buttonText: "View Collection",
    },
  ],
  grocery: [
    {
      id: "grocery-1",
      type: "image",
      mediaUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1400&q=80",
      title: "Farm-Fresh Fruits & Vegetables",
      subtitle: "Handpicked Organic Produce Delivered Fresh Everyday",
      badge: "🥦 100% FRESH",
      link: "/category/grocery",
      buttonText: "Shop Fresh",
    },
    {
      id: "grocery-2",
      type: "video",
      mediaUrl: "/assets/login/loginvideo.mp4",
      title: "Kitchen Staples & Pantry Bash",
      subtitle: "Atta, Rice, Pure Ghee & Spices at Wholesale Prices",
      badge: "🌾 PANTRY SAVER",
      link: "/category/grocery",
      buttonText: "Stock Up",
    },
    {
      id: "grocery-3",
      type: "image",
      mediaUrl: "https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=1400&q=80",
      title: "Dairy, Breads & Quick Breakfast",
      subtitle: "Start Every Morning with Pure Delight",
      badge: "🥛 MORNING ESSENTIALS",
      link: "/category/grocery",
      buttonText: "Order Now",
    },
  ],
  electronics: [
    {
      id: "electronics-1",
      type: "image",
      mediaUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1400&q=80",
      title: "Next-Gen Audio & Smart Gadgets",
      subtitle: "Wireless Earbuds, Smartwatches & Premium Sound",
      badge: "🎧 BEST OF TECH",
      link: "/category/electronics",
      buttonText: "Explore Tech",
    },
    {
      id: "electronics-2",
      type: "video",
      mediaUrl: "/assets/login/loginvideo.mp4",
      title: "Smart Accessories & Fast Chargers",
      subtitle: "Unbeatable Deals on Mobile & Home Tech",
      badge: "⚡ TOP GADGETS",
      link: "/category/electronics",
      buttonText: "Shop Gadgets",
    },
  ],
  beauty: [
    {
      id: "beauty-1",
      type: "image",
      mediaUrl: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1400&q=80",
      title: "Glow & Glamour Beauty Fest",
      subtitle: "Luxury Makeup, Skincare Serums & Fragrances",
      badge: "💄 BEAUTY DEALS",
      link: "/category/beauty",
      buttonText: "Explore Glow",
    },
    {
      id: "beauty-2",
      type: "video",
      mediaUrl: "/assets/login/loginvideo.mp4",
      title: "Self-Care & Daily Wellness",
      subtitle: "Gentle Bath, Haircare & Herbal Solutions",
      badge: "🌿 NATURAL CARE",
      link: "/category/beauty",
      buttonText: "Shop Beauty",
    },
  ],
};

export default function PromoStrip({ activeTab = "all" }: PromoStripProps) {
  const navigate = useNavigate();
  const theme = getTheme(activeTab);

  const [slides, setSlides] = useState<MediaSlide[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [videoProgress, setVideoProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchEndXRef = useRef<number | null>(null);

  // Fetch or resolve category banners/videos
  useEffect(() => {
    let isMounted = true;

    const loadCategoryMedia = async () => {
      try {
        const response = await getHomeContent(activeTab, undefined, undefined, false);
        if (!isMounted) return;

        let dbBanners: MediaSlide[] = [];
        if (response.success && response.data) {
          // Check promoStrip banners first
          if (response.data.promoStrip?.banners && Array.isArray(response.data.promoStrip.banners) && response.data.promoStrip.banners.length > 0) {
            dbBanners = response.data.promoStrip.banners.filter((b: MediaSlide) => b.isActive !== false);
          } else if (response.data.promoBanners && Array.isArray(response.data.promoBanners) && response.data.promoBanners.length > 0) {
            dbBanners = response.data.promoBanners.filter((b: MediaSlide) => b.isActive !== false);
          } else if (response.data.banners && Array.isArray(response.data.banners) && response.data.banners.length > 0) {
            dbBanners = response.data.banners.filter((b: MediaSlide) => b.isActive !== false);
          }
        }

        if (dbBanners.length > 0) {
          // Sort by order if available
          dbBanners.sort((a, b) => (a.order || 0) - (b.order || 0));
          setSlides(dbBanners);
        } else {
          // Fallback to high quality curated defaults for this header category
          const defaultList = DEFAULT_CATEGORY_SLIDES[activeTab.toLowerCase()] || DEFAULT_CATEGORY_SLIDES.all;
          setSlides(defaultList);
        }
        setCurrentIndex(0);
      } catch (err) {
        console.error("Failed to load header category media carousel:", err);
        const defaultList = DEFAULT_CATEGORY_SLIDES[activeTab.toLowerCase()] || DEFAULT_CATEGORY_SLIDES.all;
        setSlides(defaultList);
        setCurrentIndex(0);
      }
    };

    loadCategoryMedia();

    return () => {
      isMounted = false;
    };
  }, [activeTab]);

  // Current active slide
  const currentSlide = slides[currentIndex] || slides[0];

  // Navigation handlers
  const goToNext = useCallback(() => {
    setSlides((prev) => {
      if (prev.length === 0) return prev;
      setCurrentIndex((curr) => (curr + 1) % prev.length);
      return prev;
    });
  }, []);

  const goToPrev = useCallback(() => {
    setSlides((prev) => {
      if (prev.length === 0) return prev;
      setCurrentIndex((curr) => (curr - 1 + prev.length) % prev.length);
      return prev;
    });
  }, []);

  const goToSlide = (idx: number) => {
    setCurrentIndex(idx);
  };

  // Autoplay timer
  useEffect(() => {
    if (slides.length <= 1 || isPaused) {
      if (autoPlayTimerRef.current) clearInterval(autoPlayTimerRef.current);
      return;
    }

    // Give video slides slightly more time (8s) vs image slides (5s)
    const duration = currentSlide?.type === "video" ? 8000 : 5000;

    autoPlayTimerRef.current = setTimeout(() => {
      goToNext();
    }, duration);

    return () => {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    };
  }, [slides.length, currentIndex, isPaused, currentSlide?.type, goToNext]);

  // Video progress and lifecycle management
  useEffect(() => {
    setVideoProgress(0);
    setIsPlaying(true);

    if (currentSlide?.type === "video" && videoRef.current) {
      videoRef.current.currentTime = 0;
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Autoplay policy fallback: ensure muted and try again
          if (videoRef.current) {
            videoRef.current.muted = true;
            setIsMuted(true);
            videoRef.current.play().catch(() => {});
          }
        });
      }
    }
  }, [currentIndex, currentSlide?.type]);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const current = videoRef.current.currentTime;
      const total = videoRef.current.duration || 1;
      setVideoProgress((current / total) * 100);
    }
  };

  const toggleVideoPlayback = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  const handleSlideClick = (slide: MediaSlide) => {
    if (slide.link) {
      if (slide.link.startsWith("http://") || slide.link.startsWith("https://")) {
        window.open(slide.link, "_blank");
      } else {
        navigate(slide.link);
      }
    }
  };

  // Touch Swipe Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.targetTouches[0].clientX;
    setIsPaused(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndXRef.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartXRef.current || !touchEndXRef.current) {
      setIsPaused(false);
      return;
    }
    const distance = touchStartXRef.current - touchEndXRef.current;
    const isLeftSwipe = distance > 45;
    const isRightSwipe = distance < -45;

    if (isLeftSwipe) {
      goToNext();
    } else if (isRightSwipe) {
      goToPrev();
    }

    touchStartXRef.current = null;
    touchEndXRef.current = null;
    setTimeout(() => setIsPaused(false), 800);
  };

  if (!slides || slides.length === 0) {
    return null;
  }

  // Display name of category for banner tag
  const categoryDisplayName =
    activeTab === "all"
      ? "All Specials"
      : activeTab.charAt(0).toUpperCase() + activeTab.slice(1);

  return (
    <div
      className="relative w-full overflow-hidden transition-colors duration-500"
      style={{
        background: `linear-gradient(to bottom, #ffffff 0%, ${theme.primary[1]} 60%, ${theme.primary[2]} 100%)`,
        paddingTop: "6px",
        paddingBottom: "8px",
      }}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6">
        {/* Main Unified Media Carousel Container */}
        <div
          className="relative w-full rounded-2xl md:rounded-3xl overflow-hidden shadow-lg border border-black/5 group"
          style={{
            height: "clamp(180px, 32vw, 360px)",
            backgroundColor: "#0f172a",
          }}
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Animated Slide Transition */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlide?.id || currentSlide?._id || currentIndex}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="absolute inset-0 w-full h-full cursor-pointer select-none"
              onClick={() => handleSlideClick(currentSlide)}
            >
              {/* VIDEO SLIDE */}
              {currentSlide?.type === "video" ? (
                <div className="relative w-full h-full overflow-hidden bg-black flex items-center justify-center">
                  <video
                    ref={videoRef}
                    src={resolveMediaUrl(currentSlide.mediaUrl)}
                    poster={resolveMediaUrl(currentSlide.thumbnailUrl)}
                    className="w-full h-full object-cover"
                    autoPlay
                    muted={isMuted}
                    loop
                    playsInline
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={goToNext}
                  />

                  {/* Video Play/Pause Overlay Indicator on click */}
                  <div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    style={{ background: isPlaying ? "transparent" : "rgba(0,0,0,0.3)" }}
                  >
                    {!isPlaying && (
                      <div className="w-14 h-14 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white border border-white/30 shadow-xl">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Video Floating Controls */}
                  <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
                    {/* Play / Pause Toggle Button */}
                    <button
                      type="button"
                      onClick={toggleVideoPlayback}
                      className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-md border border-white/20 text-white flex items-center justify-center hover:bg-black/80 transition-all shadow-md active:scale-90"
                      title={isPlaying ? "Pause Video" : "Play Video"}
                    >
                      {isPlaying ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="6" y="4" width="4" height="16" />
                          <rect x="14" y="4" width="4" height="16" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      )}
                    </button>

                    {/* Mute / Unmute Toggle Button */}
                    <button
                      type="button"
                      onClick={toggleMute}
                      className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-md border border-white/20 text-white flex items-center justify-center hover:bg-black/80 transition-all shadow-md active:scale-90"
                      title={isMuted ? "Unmute Audio" : "Mute Audio"}
                    >
                      {isMuted ? (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="1" y1="1" x2="23" y2="23" />
                          <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                          <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                          <line x1="12" y1="19" x2="12" y2="23" />
                          <line x1="8" y1="23" x2="16" y2="23" />
                        </svg>
                      ) : (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                        </svg>
                      )}
                    </button>
                  </div>

                  {/* Video Playback Progress Bar */}
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-20 overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 transition-all duration-200"
                      style={{ width: `${videoProgress}%` }}
                    />
                  </div>
                </div>
              ) : (
                /* IMAGE BANNER SLIDE */
                <div className="relative w-full h-full overflow-hidden bg-neutral-900">
                  <img
                    src={resolveMediaUrl(currentSlide.mediaUrl)}
                    alt={currentSlide.title || "Banner"}
                    className="w-full h-full object-cover transform hover:scale-105 transition-transform duration-700 ease-out"
                    loading="eager"
                  />
                </div>
              )}

              {/* Dynamic Gradient Readability Scrim Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10 pointer-events-none z-10" />

              {/* Top-Left Category Badge */}
              <div className="absolute top-3 left-3 z-20">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider text-white bg-black/40 backdrop-blur-md border border-white/20 shadow-md">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  {categoryDisplayName}
                </span>
              </div>

              {/* Slide Content Overlay (Title, Subtitle, CTA) */}
              <div className="absolute bottom-4 sm:bottom-6 left-3 sm:left-6 right-3 sm:right-6 z-20 text-white flex flex-col sm:flex-row sm:items-end justify-between gap-3 pointer-events-none">
                <div className="max-w-xl">
                  {/* Badge / Offer Tag */}
                  {(currentSlide.badge || currentSlide.subtitle) && (
                    <div className="inline-block mb-1 sm:mb-1.5">
                      <span className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[9px] sm:text-[11px] font-extrabold uppercase px-2 py-0.5 rounded shadow">
                        {currentSlide.badge || "SPECIAL OFFER"}
                      </span>
                    </div>
                  )}

                  {/* Title */}
                  {currentSlide.title && (
                    <h3 className="text-base sm:text-2xl md:text-3xl font-black text-white leading-tight drop-shadow-md tracking-tight line-clamp-1">
                      {currentSlide.title}
                    </h3>
                  )}

                  {/* Subtitle */}
                  {currentSlide.subtitle && (
                    <p className="text-[11px] sm:text-sm text-neutral-200 line-clamp-1 mt-0.5 drop-shadow font-medium">
                      {currentSlide.subtitle}
                    </p>
                  )}
                </div>

                {/* Call-to-action Button */}
                <div className="self-start sm:self-end flex-shrink-0 pointer-events-auto">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSlideClick(currentSlide);
                    }}
                    className="inline-flex items-center gap-1.5 bg-white hover:bg-neutral-100 text-neutral-900 text-xs sm:text-sm font-bold px-3.5 sm:px-5 py-1.5 sm:py-2 rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95"
                  >
                    <span>{currentSlide.buttonText || "Shop Now"}</span>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-emerald-600"
                    >
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Navigation Arrows (Visible on Desktop Hover) */}
          {slides.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goToPrev();
                }}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 z-30 w-9 h-9 rounded-full bg-black/40 hover:bg-black/75 text-white backdrop-blur-md border border-white/20 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 shadow-xl active:scale-90 hidden sm:flex"
                aria-label="Previous slide"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goToNext();
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 z-30 w-9 h-9 rounded-full bg-black/40 hover:bg-black/75 text-white backdrop-blur-md border border-white/20 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 shadow-xl active:scale-90 hidden sm:flex"
                aria-label="Next slide"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </>
          )}

          {/* Pagination Indicators */}
          {slides.length > 1 && (
            <div className="absolute bottom-2.5 sm:bottom-3 left-0 right-0 z-30 flex items-center justify-center gap-1.5 pointer-events-auto">
              {slides.map((s, idx) => {
                const isActive = idx === currentIndex;
                return (
                  <button
                    key={s.id || s._id || idx}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      goToSlide(idx);
                    }}
                    className={`transition-all duration-300 rounded-full h-1.5 sm:h-2 ${
                      isActive
                        ? "w-6 sm:w-8 bg-white shadow-md"
                        : "w-2 sm:w-2.5 bg-white/45 hover:bg-white/70"
                    }`}
                    aria-label={`Go to slide ${idx + 1}`}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
