import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLocation } from '../../hooks/useLocation';
import {
  getShopDetails,
  getShopProducts,
  ShopDetail as ShopDetailType,
} from '../../services/api/customerShopService';
import { Product } from '../../services/api/productService';
import ProductCard from './components/ProductCard';

export default function ShopDetail() {
  const { sellerId } = useParams<{ sellerId: string }>();
  const navigate = useNavigate();
  const { location: userLocation } = useLocation();

  const [shop, setShop] = useState<ShopDetailType | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingShop, setLoadingShop] = useState<boolean>(true);
  const [loadingProducts, setLoadingProducts] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('default');

  // Load shop details
  const fetchShopInfo = useCallback(async () => {
    if (!sellerId) return;
    setLoadingShop(true);
    setError(null);

    try {
      const res = await getShopDetails(
        sellerId,
        userLocation?.latitude,
        userLocation?.longitude
      );
      if (res.success && res.data) {
        setShop(res.data);
      } else {
        setError('Store not found.');
      }
    } catch (err: any) {
      console.error('Error fetching shop info:', err);
      setError('Unable to load store details.');
    } finally {
      setLoadingShop(false);
    }
  }, [sellerId, userLocation?.latitude, userLocation?.longitude]);

  // Load shop products
  const fetchProducts = useCallback(async () => {
    if (!sellerId) return;
    setLoadingProducts(true);

    try {
      const res = await getShopProducts(sellerId, {
        category: selectedCategory !== 'all' ? selectedCategory : undefined,
        search: searchQuery.trim() ? searchQuery.trim() : undefined,
        sort: sortBy !== 'default' ? sortBy : undefined,
        limit: 1000,
      });

      if (res.success && res.data) {
        setProducts(res.data || []);
      } else {
        setProducts([]);
      }
    } catch (err: any) {
      console.error('Error fetching shop products:', err);
      setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }, [sellerId, selectedCategory, searchQuery, sortBy]);

  useEffect(() => {
    fetchShopInfo();
  }, [fetchShopInfo]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return (
    <div className="min-h-screen bg-neutral-50 pb-24">
      {/* Sticky Navigation Header */}
      <div className="bg-white border-b border-neutral-200 sticky top-0 z-20 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button
            onClick={() => navigate('/shops')}
            className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 px-3 py-1.5 rounded-lg transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span>Back to Stores</span>
          </button>

          <h1 className="text-sm font-bold text-neutral-900 truncate max-w-[200px] md:max-w-md">
            {shop?.storeName || 'Store Details'}
          </h1>

          {/* Delivery estimate badge */}
          {shop?.deliveryTimeText && (
            <div className="text-xs bg-emerald-50 text-emerald-800 font-semibold px-2.5 py-1 rounded-md border border-emerald-200/60 flex items-center gap-1">
              <span>⚡ {shop.deliveryTimeText}</span>
            </div>
          )}
        </div>
      </div>

      {loadingShop ? (
        /* Store Header Skeleton */
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden animate-pulse mb-6">
            <div className="h-40 bg-neutral-200 w-full" />
            <div className="p-6">
              <div className="h-6 bg-neutral-200 rounded w-1/3 mb-2" />
              <div className="h-4 bg-neutral-200 rounded w-1/4" />
            </div>
          </div>
        </div>
      ) : error || !shop ? (
        /* Error View */
        <div className="max-w-md mx-auto my-12 p-8 bg-white rounded-2xl border border-neutral-200 text-center">
          <div className="text-3xl mb-2">🏪</div>
          <h2 className="text-lg font-bold text-neutral-900 mb-1">Store Not Found</h2>
          <p className="text-xs text-neutral-500 mb-4">{error || 'This store is no longer active.'}</p>
          <button
            onClick={() => navigate('/shops')}
            className="bg-emerald-600 text-white font-medium text-xs px-4 py-2 rounded-lg hover:bg-emerald-700 transition-all"
          >
            Explore Other Stores
          </button>
        </div>
      ) : (
        /* Store Banner & Info Header */
        <div className="max-w-6xl mx-auto px-4 pt-4">
          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs mb-6">
            <div className="h-36 md:h-48 w-full relative bg-neutral-100 overflow-hidden">
              {shop.storeBanner || shop.logo ? (
                <img
                  src={shop.storeBanner || shop.logo}
                  alt={shop.storeName}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&auto=format&fit=crop&q=60';
                  }}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-r from-emerald-600 to-teal-700 flex items-center justify-center text-white font-bold text-3xl">
                  {shop.storeName.charAt(0)}
                </div>
              )}

              {/* Dark overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />

              {/* Status Pill */}
              <div className="absolute top-4 right-4 z-10">
                {shop.isShopOpen ? (
                  <span className="inline-flex items-center gap-1.5 bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-xs">
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    OPEN NOW
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-xs">
                    CLOSED
                  </span>
                )}
              </div>

              {/* Store Avatar */}
              <div className="absolute -bottom-5 left-6 z-10">
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl border-2 border-white bg-white shadow-md overflow-hidden flex items-center justify-center">
                  {shop.logo ? (
                    <img src={shop.logo} alt={shop.storeName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl font-bold text-neutral-800">
                      {shop.storeName.charAt(0)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Store Meta Info Header */}
            <div className="p-4 md:p-6 pt-7">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-100 pb-4">
                <div>
                  <h1 className="text-xl md:text-2xl font-bold text-neutral-900 leading-tight">
                    {shop.storeName}
                  </h1>
                  <p className="text-xs md:text-sm text-neutral-500 font-medium mt-0.5">
                    {shop.category} {shop.address ? `• 📍 ${shop.address}` : ''}
                  </p>
                  {shop.storeDescription && (
                    <p className="text-xs text-neutral-600 mt-1 line-clamp-2 max-w-2xl">
                      {shop.storeDescription}
                    </p>
                  )}
                </div>

                {/* Rating & Stats Badges */}
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-50 border border-emerald-200/80 px-3 py-1.5 rounded-xl text-center">
                    <div className="flex items-center justify-center gap-1 text-emerald-800 text-sm font-bold">
                      <span>★</span>
                      <span>{shop.rating}</span>
                    </div>
                    <span className="text-[10px] text-emerald-600 font-medium uppercase tracking-wider">
                      Rating
                    </span>
                  </div>

                  <div className="bg-neutral-100 border border-neutral-200/80 px-3 py-1.5 rounded-xl text-center">
                    <div className="text-neutral-900 text-sm font-bold">
                      {shop.distanceText}
                    </div>
                    <span className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">
                      Distance
                    </span>
                  </div>

                  <div className="bg-neutral-100 border border-neutral-200/80 px-3 py-1.5 rounded-xl text-center">
                    <div className="text-neutral-900 text-sm font-bold">
                      {shop.productCount}
                    </div>
                    <span className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">
                      Products
                    </span>
                  </div>
                </div>
              </div>

              {/* FSSAI or Additional info if present */}
              {shop.fssaiLicNo && (
                <div className="pt-3 text-[11px] text-neutral-400 flex items-center gap-1">
                  <span>🛡️ FSSAI Lic No.</span>
                  <span className="font-mono">{shop.fssaiLicNo}</span>
                </div>
              )}
            </div>
          </div>

          {/* Search & Category Filter Section */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-4 mb-6 shadow-xs">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 mb-3">
              {/* Search in this store */}
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search items in ${shop.storeName}...`}
                  className="w-full bg-neutral-100 text-neutral-900 text-sm rounded-xl pl-10 pr-10 py-2.5 border border-transparent focus:bg-white focus:border-emerald-500 focus:outline-none transition-all"
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

              {/* Sort By Select */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-neutral-500 whitespace-nowrap">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-neutral-100 text-neutral-800 text-xs font-medium rounded-xl px-3 py-2 border border-neutral-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="default">Relevance</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                  <option value="discount">Highest Discount</option>
                  <option value="popular">Popularity</option>
                </select>
              </div>
            </div>

            {/* Store Category Tabs */}
            {shop.storeCategories && shop.storeCategories.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pt-2 border-t border-neutral-100">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    selectedCategory === 'all'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  All Items
                </button>
                {shop.storeCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                      selectedCategory === cat.id
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Products Grid */}
          <div>
            <h2 className="text-base font-bold text-neutral-900 mb-3 flex items-center justify-between">
              <span>Products ({products.length})</span>
              {selectedCategory !== 'all' && (
                <button
                  onClick={() => setSelectedCategory('all')}
                  className="text-xs font-medium text-emerald-600 hover:underline"
                >
                  Show All Categories
                </button>
              )}
            </h2>

            {loadingProducts ? (
              /* Product Skeletons */
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div key={i} className="bg-white rounded-xl h-64 border border-neutral-200 animate-pulse" />
                ))}
              </div>
            ) : products.length === 0 ? (
              /* No Products Found */
              <div className="bg-white rounded-2xl border border-neutral-200 p-10 text-center max-w-sm mx-auto my-6">
                <div className="text-3xl mb-2">📦</div>
                <h3 className="text-sm font-bold text-neutral-900 mb-1">No products found</h3>
                <p className="text-xs text-neutral-500 mb-4">
                  {searchQuery
                    ? `No items match "${searchQuery}" in this category.`
                    : 'This store has no active products in this category right now.'}
                </p>
                {(searchQuery || selectedCategory !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('all');
                    }}
                    className="bg-neutral-900 text-white font-medium text-xs px-3.5 py-1.5 rounded-lg hover:bg-neutral-800 transition-all"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            ) : (
              /* Products Grid View */
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
                {products.map((prod: any) => (
                  <ProductCard
                    key={prod._id || prod.id}
                    product={{
                      ...prod,
                      id: prod._id || prod.id || '',
                      name: prod.name || prod.productName || '',
                      pack: prod.pack || prod.variations?.[0]?.value || '',
                      isAvailable: shop.isShopOpen,
                    }}
                    showBadge={true}
                    categoryStyle={true}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
