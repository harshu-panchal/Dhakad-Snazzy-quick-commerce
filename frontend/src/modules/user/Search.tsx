import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ProductCard from './components/ProductCard';
import { getProducts } from '../../services/api/customerProductService';
import { Product } from '../../types/domain';
import { useLocation } from '../../hooks/useLocation';

// Fetching everything up front (previously limit: 1000) meant rendering
// hundreds of cards at once for a popular search term. Paginate instead and
// load more as the user scrolls near the bottom.
const PAGE_SIZE = 40;

export default function Search() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { location } = useLocation();
  const searchQuery = searchParams.get('q') || '';
  const [searchInput, setSearchInput] = useState(searchQuery);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Update input when URL param changes (e.g. back button)
  useEffect(() => {
    if (searchQuery !== searchInput) {
      setSearchInput(searchQuery);
    }
  }, [searchQuery]);

  // Debounced search: update URL q param when searchInput changes
  useEffect(() => {
    // Don't sync if they are already the same
    if (searchInput === searchQuery) return;

    const timeoutId = setTimeout(() => {
      if (searchInput.trim()) {
        setSearchParams({ q: searchInput.trim() }, { replace: true });
      } else {
        setSearchParams({}, { replace: true });
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchInput, searchQuery, setSearchParams]);

  // Fetch page 1 whenever the search query or location changes
  useEffect(() => {
    // Fast typing can fire several requests before earlier ones resolve;
    // this guards against an older response overwriting a newer one.
    let ignore = false;

    const fetchFirstPage = async () => {
      const q = searchParams.get('q') || '';
      if (!q.trim()) {
        setSearchResults([]);
        setTotalCount(0);
        setHasMore(false);
        setPage(1);
        return;
      }

      setLoading(true);
      try {
        const params: any = { search: q, limit: PAGE_SIZE, page: 1 };
        // Include user location for seller service radius filtering
        if (location?.latitude && location?.longitude) {
          params.latitude = location.latitude;
          params.longitude = location.longitude;
        }
        const response = await getProducts(params);
        if (ignore) return;
        const results = response.data as unknown as Product[];
        setSearchResults(results);
        setTotalCount(response.pagination?.total ?? results.length);
        setPage(1);
        setHasMore(response.pagination ? response.pagination.page < response.pagination.pages : false);
      } catch (error) {
        if (ignore) return;
        console.error('Error searching products:', error);
        setSearchResults([]);
        setTotalCount(0);
        setHasMore(false);
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    fetchFirstPage();

    return () => {
      ignore = true;
    };
  }, [searchParams, location]);

  // Load the next page and append it to the current results
  const loadMore = useCallback(async () => {
    const q = searchParams.get('q') || '';
    if (!q.trim() || loading || loadingMore || !hasMore) return;

    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const params: any = { search: q, limit: PAGE_SIZE, page: nextPage };
      if (location?.latitude && location?.longitude) {
        params.latitude = location.latitude;
        params.longitude = location.longitude;
      }
      const response = await getProducts(params);
      const results = response.data as unknown as Product[];
      setSearchResults((prev) => [...prev, ...results]);
      setPage(nextPage);
      setHasMore(response.pagination ? response.pagination.page < response.pagination.pages : false);
    } catch (error) {
      console.error('Error loading more search results:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [searchParams, location, page, loading, loadingMore, hasMore]);

  // Trigger loadMore when the sentinel at the bottom of the grid scrolls into view
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: '400px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setSearchParams({ q: searchInput.trim() });
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearchParams({});
    setSearchResults([]);
  };

  return (
    <div className="pb-24 md:pb-8 bg-neutral-50 min-h-screen">
      {/* Search Header - Sticky but consistent */}
      <div className="sticky top-0 z-30 bg-white border-b border-neutral-200 px-4 py-3 md:py-4 md:px-6">
        <form onSubmit={handleSearchSubmit} className="max-w-3xl mx-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="p-1 text-neutral-600 hover:text-neutral-900"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <input
              type="text"
              value={searchInput}
              onChange={handleInputChange}
              placeholder="Search for groceries, snacks and more"
              className="w-full bg-neutral-100 border-none rounded-xl py-2.5 pl-10 pr-10 text-sm focus:ring-2 focus:ring-green-500 focus:bg-white transition-all outline-none"
              autoFocus
            />
            {searchInput && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <button
            type="submit"
            className="hidden md:block bg-green-600 text-white px-6 py-2 rounded-xl font-semibold hover:bg-green-700 transition-colors"
          >
            Search
          </button>
        </form>
      </div>

      {/* Search Results */}
      <div className="px-4 md:px-6 lg:px-8 py-4 md:py-6">
        {searchQuery.trim() ? (
          <>
            <h2 className="text-lg md:text-2xl font-semibold text-neutral-900 mb-3 md:mb-6">
              {loading ? 'Searching...' : `Search Results ${totalCount > 0 ? `(${totalCount})` : ''}`}
            </h2>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
              </div>
            ) : searchResults.length > 0 ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
                  {searchResults.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      categoryStyle={true}
                      showBadge={true}
                      showPackBadge={false}
                      showStockInfo={true}
                    />
                  ))}
                </div>
                {/* Sentinel that triggers loading the next page when scrolled into view */}
                <div ref={sentinelRef} className="h-1" />
                {loadingMore && (
                  <div className="flex justify-center py-6">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 md:py-16 bg-white rounded-2xl border border-neutral-100 shadow-sm">
                <div className="text-6xl mb-4">🔍</div>
                <p className="text-lg md:text-xl font-medium text-neutral-900 mb-2">No products found for "{searchQuery}"</p>
                <p className="text-sm md:text-base text-neutral-500">Try a different search term or browse categories</p>
                <button
                  onClick={() => navigate('/')}
                  className="mt-6 text-green-600 font-semibold hover:underline"
                >
                  Back to Home
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20">
            <div className="text-6xl mb-6">✨</div>
            <h2 className="text-xl md:text-2xl font-bold text-neutral-900 mb-2">What are you looking for today?</h2>
            <p className="text-neutral-500 max-w-sm mx-auto">Search for groceries, snacks, personal care and more to get them delivered in minutes.</p>
          </div>
        )}
      </div>
    </div>
  );
}
