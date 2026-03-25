import { useEffect, useState, useMemo } from "react";
import { getHomeContent } from "../../services/api/customerHomeService";
import { getHeaderCategoriesPublic, HeaderCategory } from "../../services/api/headerCategoryService";
import { getCategories, Category as ApiCategory, getProducts } from "../../services/api/customerProductService";
import { useLocation } from "../../hooks/useLocation";
import CategoryTileSection from "./components/CategoryTileSection";
import ProductCard from "./components/ProductCard";
import IconLoader from "../../components/loaders/IconLoader";
import { motion, AnimatePresence } from "framer-motion";

export default function Categories() {
  const { location: userLocation } = useLocation();
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // States for Discovery View (Grid)
  const [homeData, setHomeData] = useState<any>({ homeSections: [] });

  // States for Hierarchy View (Sidebar)
  const [headerCategories, setHeaderCategories] = useState<HeaderCategory[]>([]);
  const [allCategoriesTree, setAllCategoriesTree] = useState<ApiCategory[]>([]);
  
  const [view, setView] = useState<'grid' | 'hierarchy'>('grid');
  const [selectedHeaderId, setSelectedHeaderId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string | null>(null);
  
  const [products, setProducts] = useState<any[]>([]);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const [homeRes, headers, tree] = await Promise.all([
          getHomeContent(undefined, userLocation?.latitude, userLocation?.longitude),
          getHeaderCategoriesPublic(true),
          getCategories(true)
        ]);
        
        if (homeRes.success) {
          setHomeData(homeRes.data);
        } else {
            setError("Failed to load categories.");
        }
        
        setHeaderCategories(headers);
        setAllCategoriesTree(tree.data || []);
      } catch (err) {
        console.error("Failed to fetch categories data:", err);
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [userLocation?.latitude, userLocation?.longitude]);

  // Derived subcategories for the sidebar in Hierarchy View
  const subcategories = useMemo(() => {
    if (!selectedCategoryId) return [];
    const cat = allCategoriesTree.find(c => c._id === selectedCategoryId);
    return cat?.children || cat?.subcategories || [];
  }, [selectedCategoryId, allCategoriesTree]);

  // Click handler to switch from Grid to Hierarchy
  const handleCategoryClickFromGrid = (tile: any) => {
    const categoryId = tile.categoryId || tile.id;
    const catInfo = allCategoriesTree.find(c => c._id === categoryId);
    
    if (catInfo) {
        const headerId = typeof catInfo.headerCategoryId === 'object' 
            ? catInfo.headerCategoryId?._id 
            : catInfo.headerCategoryId;
            
        setSelectedHeaderId(headerId || null);
        setSelectedCategoryId(categoryId);
        setView('hierarchy');
        
        // Auto-select first subcategory
        const subs = catInfo.children || catInfo.subcategories || [];
        if (subs.length > 0) {
            setSelectedSubcategoryId(subs[0]._id);
        } else {
            setSelectedSubcategoryId(null);
        }
    } else {
        setSelectedCategoryId(categoryId);
        setView('hierarchy');
    }
  };

  const handleBackToGrid = () => {
    setView('grid');
    setSelectedCategoryId(null);
    setSelectedSubcategoryId(null);
  };

  // Fetch products when subcategory changes in Hierarchy View
  useEffect(() => {
    const fetchSubcategoryProducts = async () => {
      if (view !== 'hierarchy' || !selectedSubcategoryId) {
          setProducts([]);
          return;
      }
      
      try {
        setProductsLoading(true);
        const params: any = { subcategory: selectedSubcategoryId };
        if (userLocation?.latitude && userLocation?.longitude) {
            params.latitude = userLocation.latitude;
            params.longitude = userLocation.longitude;
        }
        const response = await getProducts(params);
        if (response.success) {
            setProducts(response.data);
        }
      } catch (err) {
        console.error("Failed to fetch products:", err);
      } finally {
        setProductsLoading(false);
      }
    };
    
    fetchSubcategoryProducts();
  }, [selectedSubcategoryId, userLocation, view]);

  if (loading) return <IconLoader />;

  if (error && !homeData.homeSections.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center bg-white">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Error</h3>
        <p className="text-gray-600 mb-6">{error}</p>
        <button onClick={() => window.location.reload()} className="px-6 py-2 bg-green-600 text-white rounded-full font-medium">Retry</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden font-sans">
      <AnimatePresence mode="wait">
        {view === 'grid' ? (
          /* ==================== VIEW A: GRID DISCOVERY ==================== */
          <motion.div 
            key="grid-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 overflow-y-auto pb-24"
          >
            <div className="px-5 py-6 bg-white border-b border-neutral-100 flex items-center justify-between sticky top-0 z-20">
              <h1 className="text-2xl font-black text-neutral-900 tracking-tight">Browse Categories</h1>
            </div>

            <div className="bg-neutral-50/30 pt-4 space-y-6">
              {homeData.homeSections && homeData.homeSections.length > 0 ? (
                homeData.homeSections.map((section: any) => {
                  const columnCount = Number(section.columns) || 4;
                  if (section.displayType === "products") return null;

                  return (
                    <CategoryTileSection
                      key={section.id}
                      title={section.title}
                      tiles={section.data || []}
                      columns={columnCount as any}
                      onTileClick={handleCategoryClickFromGrid}
                    />
                  );
                })
              ) : (
                <div className="text-center py-20 text-neutral-400">No categories found.</div>
              )}
            </div>
          </motion.div>
        ) : (
          /* ==================== VIEW B: HIERARCHY SIDEBAR ==================== */
          <motion.div 
            key="hierarchy-view"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="flex-1 flex flex-col h-full bg-white overflow-hidden"
          >
            {/* Header with Back Button */}
            <div className="flex-shrink-0 flex items-center gap-4 px-4 py-3 bg-white border-b border-neutral-100 shadow-sm z-20">
              <button 
                onClick={handleBackToGrid}
                className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-600 hover:bg-neutral-200 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h2 className="text-lg font-black text-neutral-900 uppercase tracking-tight">
                  {allCategoriesTree.find(c => c._id === selectedCategoryId)?.name || "Category"}
                </h2>
                <span className="text-[10px] text-green-600 font-bold uppercase tracking-widest">{headerCategories.find(h => h._id === selectedHeaderId)?.name}</span>
              </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Sidebar for Subcategories */}
              <div className="w-1/4 max-w-[100px] md:max-w-[120px] bg-neutral-50 border-r border-neutral-100 overflow-y-auto scrollbar-hide py-2">
                {subcategories.length > 0 ? (
                  subcategories.map(sub => (
                    <button
                      key={sub._id}
                      onClick={() => setSelectedSubcategoryId(sub._id)}
                      className={`w-full px-2 py-4 mb-1 text-center transition-all relative ${
                        selectedSubcategoryId === sub._id
                          ? "bg-white text-green-700 font-black shadow-sm"
                          : "text-neutral-500 hover:bg-neutral-100"
                      }`}
                    >
                      {selectedSubcategoryId === sub._id && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-600 rounded-r-full" />
                      )}
                      <div className={`w-12 h-12 mx-auto mb-2 rounded-2xl overflow-hidden bg-white shadow-sm flex items-center justify-center transition-transform ${selectedSubcategoryId === sub._id ? 'scale-110 ring-2 ring-green-100' : ''}`}>
                        {sub.image ? (
                          <img src={sub.image} alt={sub.name} className="w-full h-full object-contain p-1" />
                        ) : (
                          <span className="text-xl">{sub.icon || "📦"}</span>
                        )}
                      </div>
                      <span className="text-[10px] md:text-xs leading-tight font-bold block truncate px-0.5">{sub.name}</span>
                    </button>
                  ))
                ) : (
                  <div className="p-4 text-center text-[10px] font-bold text-neutral-300">NO SUB-CATEGORIES</div>
                )}
              </div>

              {/* Product Grid Area */}
              <div className="flex-1 overflow-y-auto bg-white relative">
                <AnimatePresence mode="wait">
                  {productsLoading ? (
                    <motion.div
                      key="loading-p"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center justify-center h-full gap-2 p-12"
                    >
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
                      <span className="text-[10px] font-bold text-neutral-300 tracking-tighter">LOADING PRODUCTS</span>
                    </motion.div>
                  ) : products.length > 0 ? (
                    <motion.div
                      key={selectedSubcategoryId}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 grid grid-cols-2 gap-3 pb-24"
                    >
                      {products.map(product => (
                        <ProductCard key={product._id} product={product} categoryStyle={true} compact={true} />
                      ))}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="empty-p"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center justify-center h-full text-center p-8"
                    >
                      <div className="w-20 h-20 bg-neutral-50 rounded-3xl flex items-center justify-center mb-6">
                        <svg className="w-8 h-8 text-neutral-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 11V7a4 4 0 118 0m-4 8v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </div>
                      <h4 className="text-neutral-900 font-black mb-1">STAY TUNED!</h4>
                      <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest leading-loose">We are stocking new items</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
