import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from '../../hooks/useLocation';
import { getNearbyShops, Shop } from '../../services/api/customerShopService';
import LocationPermissionRequest from '../../components/LocationPermissionRequest';

type FilterTab = 'all' | 'open' | 'fastest' | 'rating';

export default function Shops() {
  const navigate = useNavigate();
  const { location: userLocation, isLocationEnabled } = useLocation();

  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showLocationModal, setShowLocationModal] = useState<boolean>(false);

  // Fetch shops when location changes or component mounts
  const fetchShops = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const lat = userLocation?.latitude;
      const lng = userLocation?.longitude;
      const response = await getNearbyShops({
        latitude: lat,
        longitude: lng,
        search: searchQuery,
      });

      if (response.success) {
        setShops(response.data || []);
      } else {
        setShops([]);
      }
    } catch (err: any) {
      console.error('Failed to load nearby shops:', err);
      setError('Unable to load nearby stores. Please try again.');
      setShops([]);
    } finally {
      setLoading(false);
    }
  }, [userLocation?.latitude, userLocation?.longitude, searchQuery]);

  useEffect(() => {
    fetchShops();
  }, [fetchShops]);

  // Extract all unique store categories for filter chips
  const categoriesList = useMemo(() => {
    const cats = new Set<string>();
    shops.forEach((shop) => {
      if (shop.category) cats.add(shop.category);
      if (shop.categories && Array.isArray(shop.categories)) {
        shop.categories.forEach((c) => cats.add(c));
      }
    });
    return Array.from(cats);
  }, [shops]);

  // Filter and sort shops based on search & filter selections
  const filteredShops = useMemo(() => {
    let list = [...shops];

    // Filter by selected category chip
    if (selectedCategory !== 'all') {
      list = list.filter(
        (shop) =>
          shop.category?.toLowerCase() === selectedCategory.toLowerCase() ||
          shop.categories?.some((c) => c.toLowerCase() === selectedCategory.toLowerCase())
      );
    }

    // Apply main filter tab logic
    if (activeFilter === 'open') {
      list = list.filter((shop) => shop.isShopOpen);
    } else if (activeFilter === 'rating') {
      list = list.filter((shop) => shop.rating >= 4.0);
    }

    // Apply sorting
    if (activeFilter === 'fastest') {
      list.sort((a, b) => (a.distanceKm || 999) - (b.distanceKm || 999));
    } else if (activeFilter === 'rating') {
      list.sort((a, b) => b.rating - a.rating);
    }

    return list;
  }, [shops, selectedCategory, activeFilter]);

  return (
    <div className="min-h-screen bg-neutral-50 pb-20">
      {/* Top Header Section */}
      <div className="bg-white border-b border-neutral-200 sticky top-0 z-20 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 py-3.5">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-neutral-900 tracking-tight flex items-center gap-2">
                <span>Nearby Stores</span>
                <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2.5 py-0.5 rounded-full">
                  {filteredShops.length} Stores
                </span>
              </h1>
              <p className="text-xs md:text-sm text-neutral-500 mt-0.5 flex items-center gap-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span className="truncate max-w-[240px] md:max-w-md">
                  {userLocation?.address || userLocation?.city || 'Location unavailable'}
                </span>
                <button
                  onClick={() => setShowLocationModal(true)}
                  className="text-emerald-600 font-medium hover:underline text-xs ml-1 flex-shrink-0"
                >
                  Change
                </button>
              </p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative mb-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search stores by name, category, or area..."
              className="w-full bg-neutral-100 text-neutral-900 placeholder-neutral-400 text-sm rounded-xl pl-10 pr-10 py-2.5 border border-transparent focus:bg-white focus:border-emerald-500 focus:outline-none transition-all"
            />
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 p-1"
              >
                ✕
              </button>
            )}
          </div>

          {/* Primary Filter Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1 text-xs font-medium">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3.5 py-1.5 rounded-full whitespace-nowrap transition-all ${
                activeFilter === 'all'
                  ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              All Stores
            </button>
            <button
              onClick={() => setActiveFilter('open')}
              className={`px-3.5 py-1.5 rounded-full whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeFilter === 'open'
                  ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Open Now
            </button>
            <button
              onClick={() => setActiveFilter('fastest')}
              className={`px-3.5 py-1.5 rounded-full whitespace-nowrap transition-all flex items-center gap-1 ${
                activeFilter === 'fastest'
                  ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              ⚡ Fastest Delivery
            </button>
            <button
              onClick={() => setActiveFilter('rating')}
              className={`px-3.5 py-1.5 rounded-full whitespace-nowrap transition-all flex items-center gap-1 ${
                activeFilter === 'rating'
                  ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              ⭐ Top Rated 4.0+
            </button>
          </div>

          {/* Secondary Category Chips */}
          {categoriesList.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pt-2 text-[11px] text-neutral-600 border-t border-neutral-100 mt-2">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-2.5 py-1 rounded-md border transition-all ${
                  selectedCategory === 'all'
                    ? 'border-emerald-600 text-emerald-700 bg-emerald-50 font-semibold'
                    : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
                }`}
              >
                All Categories
              </button>
              {categoriesList.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-md border whitespace-nowrap transition-all ${
                    selectedCategory === cat
                      ? 'border-emerald-600 text-emerald-700 bg-emerald-50 font-semibold'
                      : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto px-4 pt-4">
        {loading ? (
          /* Skeleton Loading View */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-neutral-200 overflow-hidden animate-pulse">
                <div className="h-32 bg-neutral-200 w-full" />
                <div className="p-4">
                  <div className="h-5 bg-neutral-200 rounded w-2/3 mb-2" />
                  <div className="h-4 bg-neutral-200 rounded w-1/3 mb-3" />
                  <div className="flex gap-2 mb-3">
                    <div className="h-6 bg-neutral-200 rounded w-16" />
                    <div className="h-6 bg-neutral-200 rounded w-20" />
                    <div className="h-6 bg-neutral-200 rounded w-16" />
                  </div>
                  <div className="flex gap-2">
                    {[1, 2, 3].map((j) => (
                      <div key={j} className="w-16 h-16 bg-neutral-200 rounded-lg" />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          /* Error State */
          <div className="bg-white rounded-2xl border border-red-100 p-8 text-center max-w-md mx-auto my-8">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center mx-auto mb-3 text-xl font-bold">
              !
            </div>
            <h3 className="text-lg font-semibold text-neutral-900 mb-1">Failed to load stores</h3>
            <p className="text-sm text-neutral-500 mb-4">{error}</p>
            <button
              onClick={fetchShops}
              className="bg-neutral-900 text-white font-medium text-sm px-4 py-2 rounded-lg hover:bg-neutral-800 transition-all"
            >
              Retry
            </button>
          </div>
        ) : filteredShops.length === 0 ? (
          /* Empty State */
          <div className="bg-white rounded-2xl border border-neutral-200 p-12 text-center max-w-md mx-auto my-8">
            <div className="w-16 h-16 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto mb-4 text-2xl">
              🏬
            </div>
            <h3 className="text-lg font-bold text-neutral-900 mb-1">No stores found</h3>
            <p className="text-xs md:text-sm text-neutral-500 mb-4">
              {searchQuery || selectedCategory !== 'all' || activeFilter !== 'all'
                ? 'Try matching different keywords or clearing your active filters.'
                : 'There are no active sellers delivering in your area right now.'}
            </p>
            {(searchQuery || selectedCategory !== 'all' || activeFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                  setActiveFilter('all');
                }}
                className="bg-emerald-600 text-white font-medium text-xs px-4 py-2 rounded-lg hover:bg-emerald-700 transition-all"
              >
                Clear All Filters
              </button>
            )}
          </div>
        ) : (
          /* Store List Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AnimatePresence>
              {filteredShops.map((shop) => (
                <motion.div
                  key={shop.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  whileHover={{ y: -3 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => navigate(`/shop/${shop.sellerId}`)}
                  className="bg-white rounded-2xl border border-neutral-200/80 shadow-xs hover:shadow-md transition-all cursor-pointer overflow-hidden flex flex-col group"
                >
                  {/* Store Banner / Image Header */}
                  <div className="h-32 md:h-36 w-full relative bg-neutral-100 overflow-hidden">
                    {shop.storeBanner || shop.logo ? (
                      <img
                        src={shop.storeBanner || shop.logo}
                        alt={shop.storeName}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&auto=format&fit=crop&q=60';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-r from-emerald-600 to-teal-700 flex items-center justify-center text-white font-bold text-2xl">
                        {shop.storeName.charAt(0)}
                      </div>
                    )}

                    {/* Dark gradient overlay for text readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

                    {/* Open / Closed Status Pill */}
                    <div className="absolute top-3 right-3 z-10">
                      {shop.isShopOpen ? (
                        <span className="inline-flex items-center gap-1.5 bg-emerald-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-xs backdrop-blur-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          OPEN
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-red-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-xs backdrop-blur-sm">
                          CLOSED
                        </span>
                      )}
                    </div>

                    {/* Store Logo Overlay */}
                    <div className="absolute -bottom-4 left-4 z-10">
                      <div className="w-14 h-14 rounded-xl border-2 border-white bg-white shadow-sm overflow-hidden flex items-center justify-center">
                        {shop.logo ? (
                          <img
                            src={shop.logo}
                            alt={shop.storeName}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <span className="text-xl font-bold text-neutral-800">
                            {shop.storeName.charAt(0)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Store Card Details */}
                  <div className="p-4 pt-6 flex-1 flex flex-col justify-between">
                    <div>
                      {/* Store Title & Category */}
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div>
                          <h2 className="text-base md:text-lg font-bold text-neutral-900 group-hover:text-emerald-600 transition-colors leading-snug">
                            {shop.storeName}
                          </h2>
                          <p className="text-xs text-neutral-500 font-medium">
                            {shop.category || 'Grocery & Daily Needs'}
                          </p>
                        </div>

                        {/* Rating Badge */}
                        <div className="flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200/60 px-2 py-1 rounded-lg text-xs font-bold flex-shrink-0">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="#059669" stroke="none">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                          </svg>
                          <span>{shop.rating}</span>
                        </div>
                      </div>

                      {/* Store Meta Specs Row */}
                      <div className="flex items-center gap-3 text-xs text-neutral-600 my-2 font-medium">
                        <div className="flex items-center gap-1 bg-neutral-100 px-2 py-0.5 rounded-md">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                          <span>{shop.deliveryTimeText}</span>
                        </div>

                        <div className="flex items-center gap-1 bg-neutral-100 px-2 py-0.5 rounded-md">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          <span>{shop.distanceText}</span>
                        </div>

                        <div className="text-neutral-400 font-normal">
                          {shop.productCount} items
                        </div>
                      </div>

                      {/* Address / Location snippet */}
                      {shop.address && (
                        <p className="text-[11px] text-neutral-400 line-clamp-1 mb-3">
                          📍 {shop.address}{shop.city ? `, ${shop.city}` : ''}
                        </p>
                      )}
                    </div>

                    {/* Product Preview Thumbnails (Zomato Style) */}
                    {shop.previewProducts && shop.previewProducts.length > 0 && (
                      <div className="pt-3 border-t border-neutral-100">
                        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">
                          Featured Products
                        </p>
                        <div className="grid grid-cols-4 gap-2">
                          {shop.previewProducts.map((prod) => (
                            <div
                              key={prod.id}
                              className="bg-neutral-50 rounded-lg p-1.5 border border-neutral-200/50 flex flex-col items-center text-center group/item"
                            >
                              <div className="w-10 h-10 mb-1 rounded-md overflow-hidden bg-white flex items-center justify-center">
                                {prod.image ? (
                                  <img
                                    src={prod.image}
                                    alt={prod.name}
                                    className="w-full h-full object-cover group-hover/item:scale-110 transition-transform"
                                  />
                                ) : (
                                  <span className="text-xs font-bold text-neutral-400">
                                    {prod.name.charAt(0)}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] font-medium text-neutral-700 line-clamp-1 w-full">
                                {prod.name}
                              </span>
                              <span className="text-[10px] font-bold text-emerald-700 mt-0.5">
                                ₹{prod.price}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Location Change Modal toggle */}
      {showLocationModal && (
        <LocationPermissionRequest
          onLocationGranted={() => setShowLocationModal(false)}
          skipable={true}
          forceOpen={true}
          title="Change Location"
          description="Update your delivery location to view nearby stores."
        />
      )}
    </div>
  );
}
