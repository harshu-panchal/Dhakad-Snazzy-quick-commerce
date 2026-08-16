import { createContext, useContext, useState, ReactNode, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { useLocation } from '../hooks/useLocation';
import { Cart, CartItem } from '../types/cart';
import { Product } from '../types/domain';
import {
  getCart,
  addToCart as apiAddToCart,
  updateCartItem as apiUpdateCartItem,
  removeFromCart as apiRemoveFromCart,
  clearCart as apiClearCart
} from '../services/api/customerCartService';
import { calculateProductPrice } from '../utils/priceUtils';
import SellerConflictModal from '../modules/user/components/SellerConflictModal';

const CART_STORAGE_KEY = 'saved_cart';

interface AddToCartEvent {
  product: Product;
  sourcePosition?: { x: number; y: number };
}

// Resolves the seller ObjectId for a product, regardless of whether `seller`
// arrived populated (object), as a raw id string, or via the `sellerId` field.
function getProductSellerId(product: any): string | undefined {
  if (!product) return undefined;
  if (product.seller && typeof product.seller === 'object') {
    return product.seller._id || product.seller.id;
  }
  if (typeof product.seller === 'string' && /^[0-9a-fA-F]{24}$/.test(product.seller)) {
    return product.seller;
  }
  return product.sellerId;
}

function getProductSellerName(product: any): string | undefined {
  if (!product) return undefined;
  if (product.seller && typeof product.seller === 'object') {
    return product.seller.storeName || product.seller.sellerName;
  }
  return product.storeName || product.shopName;
}

interface SellerConflictState {
  product: Product;
  sourceElement?: HTMLElement | null;
  currentSellerName?: string;
  newSellerName?: string;
}

interface CartContextType {
  cart: Cart;
  addToCart: (product: Product, sourceElement?: HTMLElement | null) => Promise<void>;
  removeFromCart: (productId: string) => Promise<void>;
  updateQuantity: (productId: string, quantity: number, variantId?: string, variantTitle?: string) => Promise<void>;
  clearCart: () => Promise<void>;
  refreshCart: (
    latitude?: number,
    longitude?: number,
    deliveryOption?: string,
    options?: { preserveItems?: boolean },
  ) => Promise<void>;
  lastAddEvent: AddToCartEvent | null;
  loading: boolean;
  sellerConflict: { currentSellerName?: string; newSellerName?: string } | null;
  confirmSellerConflict: () => Promise<void>;
  cancelSellerConflict: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

// Extended interface to include Cart Item ID
interface ExtendedCartItem extends CartItem {
  id?: string;
}

export function CartProvider({ children }: { children: ReactNode }) {
  // Initialize state from localStorage for persistence on refresh
  const [items, setItems] = useState<ExtendedCartItem[]>(() => {
    const saved = localStorage.getItem(CART_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Filter out items with null/undefined products (corrupted localStorage data)
        return Array.isArray(parsed) ? parsed.filter((item: any) => item?.product) : [];
      } catch (e) {
        console.error("Failed to parse saved cart", e);
      }
    }
    return [];
  });
  const [lastAddEvent, setLastAddEvent] = useState<AddToCartEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const pendingOperationsRef = useRef<Set<string>>(new Set());
  const hasSyncedRef = useRef(false);
  const saveCartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { isAuthenticated, user } = useAuth();
  const { location } = useLocation();
  const { showToast } = useToast();

  // Helper to map API cart items to internal CartItem structure
  const mapApiItemsToState = useCallback((apiItems: any[]): ExtendedCartItem[] => {
    return apiItems
      .filter((item: any) => item.product) // Safety filter
      .map((item: any) => ({
        id: item._id, // Store CartItem ID
        product: {
          id: item.product._id, // Map _id to id
          name: item.product.productName || item.product.name,
          price: item.product.price,
          mrp: item.product.mrp,
          discPrice: item.product.discPrice,
          variations: item.product.variations,
          imageUrl: item.product.mainImage || item.product.imageUrl,
          pack: item.product.pack || '1 unit',
          categoryId: item.product.category || '',
          description: item.product.description,
          seller: item.product.seller,
          sellerId: typeof item.product.seller === 'string' ? item.product.seller : (item.product.seller?._id || item.product.seller?.id),
          variantId: item.variation // Preserving variation ID/value
        },
        quantity: item.quantity,
        variant: item.variation // Also preserve it here for order placement
      }));
  }, []);

  // Sync to localStorage whenever items change (Debounced to improve UI responsiveness)
  useEffect(() => {
    if (saveCartTimeoutRef.current) {
      clearTimeout(saveCartTimeoutRef.current);
    }
    saveCartTimeoutRef.current = setTimeout(() => {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    }, 500); // 500ms debounce

    return () => {
      if (saveCartTimeoutRef.current) {
        clearTimeout(saveCartTimeoutRef.current);
      }
    };
  }, [items]);

  // Helper to sync cart from API
  const fetchCart = useCallback(async (
    lat?: number,
    lng?: number,
    deliveryOption?: string,
    options?: { preserveItems?: boolean },
  ) => {
    if (!isAuthenticated || user?.userType !== 'Customer') {
      // If we cleared it above but had things in localStorage, we keep them for guests?
      // For now, if logged out, we clear if it was an authenticated session.
      // But if guest, we might want to keep it.
      // Let's only clear if we are transition from logged in to logged out.
      setLoading(false);
      return;
    }

    try {
      // Use provided coordinates or fallback to current location
      const queryLat = lat !== undefined ? lat : location?.latitude;
      const queryLng = lng !== undefined ? lng : location?.longitude;

      const response = await getCart({
        latitude: queryLat,
        longitude: queryLng,
        deliveryOption: deliveryOption
      });
      if (response && response.data && response.data.items) {
        const newItems = mapApiItemsToState(response.data.items);
        // Attach debug info to the new items array
        (newItems as any).debug_config = response.data.debug_config;
        (newItems as any).backendTotal = response.data.backendTotal;

        if (!options?.preserveItems) {
          setItems(newItems);
        }
        setEstimatedFee(response.data.estimatedDeliveryFee);
        setPlatformFee(response.data.platformFee);
        setFreeDeliveryThreshold(response.data.freeDeliveryThreshold);
        setMinimumOrderValue(response.data.minimumOrderValue);
        setDeliveryDistanceKm((response.data as any).distanceKm);
        setInstantDeliveryAllowed((response.data as any).instantAllowed ?? true);
        setStandardDeliveryAllowed((response.data as any).standardAllowed ?? true);
        setInstantDeliveryRadiusKm((response.data as any).instantDeliveryRadiusKm);
      } else if (!options?.preserveItems) {
        setItems([]);
        setEstimatedFee(undefined);
        setPlatformFee(undefined);
        setFreeDeliveryThreshold(undefined);
        setMinimumOrderValue(undefined);
        setDeliveryDistanceKm(undefined);
        setInstantDeliveryAllowed(true);
        setStandardDeliveryAllowed(true);
        setInstantDeliveryRadiusKm(undefined);
      } else {
        setEstimatedFee(undefined);
        setPlatformFee(undefined);
        setFreeDeliveryThreshold(undefined);
        setMinimumOrderValue(undefined);
        setDeliveryDistanceKm(undefined);
        setInstantDeliveryAllowed(true);
        setStandardDeliveryAllowed(true);
        setInstantDeliveryRadiusKm(undefined);
      }
    } catch (error) {
      console.error("Failed to fetch cart:", error);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.userType]);

  // Load cart on auth change
  useEffect(() => {
    if (isAuthenticated && user?.userType === 'Customer') {
      fetchCart();
    } else {
      // Guest cart is already in 'items' from localStorage if it existed
      setLoading(false);
    }
  }, [isAuthenticated, user?.userType, fetchCart]);

  // Sync localStorage items to backend on mount (one-time sync)
  useEffect(() => {
    const syncLocalCartToBackend = async () => {
      if (isAuthenticated && user?.userType === 'Customer' && !hasSyncedRef.current) {
        const localItems = items.filter(item => item?.product);
        
        if (localItems.length > 0) {
          try {
            for (const item of localItems) {
              const productId = item.product.id || item.product._id;
              if (!productId) continue;

              const variation = (item.product as any).variantId ||
                               (item.product as any).selectedVariant?._id ||
                               (item.product as any).variantTitle ||
                               item.variant ||
                               item.product.pack;

              try {
                await apiAddToCart(
                  productId,
                  item.quantity,
                  variation,
                  location?.latitude,
                  location?.longitude
                );
              } catch (err: any) {
                // The account's existing server-side cart belongs to a different
                // seller than this guest cart - the local (guest) cart wins and
                // replaces it, since it reflects what the user just picked.
                if (err.response?.status === 409 && err.response?.data?.sellerConflict) {
                  await apiAddToCart(
                    productId,
                    item.quantity,
                    variation,
                    location?.latitude,
                    location?.longitude,
                    undefined,
                    true
                  );
                } else {
                  throw err;
                }
              }
            }
            hasSyncedRef.current = true;
            // Refresh cart to get updated data from backend
            await fetchCart();
          } catch (error) {
            console.error("Failed to sync local cart to backend:", error);
          }
        } else {
          hasSyncedRef.current = true;
        }
      }
    };
    
    syncLocalCartToBackend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // State for estimate delivery fee
  const [estimatedFee, setEstimatedFee] = useState<number | undefined>(undefined);
  const [platformFee, setPlatformFee] = useState<number | undefined>(undefined);
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState<number | undefined>(undefined);
  const [minimumOrderValue, setMinimumOrderValue] = useState<number | undefined>(undefined);

  // Admin-configured instant/standard delivery boundary - which options the
  // customer's distance from the cart's seller currently allows
  const [deliveryDistanceKm, setDeliveryDistanceKm] = useState<number | undefined>(undefined);
  const [instantDeliveryAllowed, setInstantDeliveryAllowed] = useState<boolean>(true);
  const [standardDeliveryAllowed, setStandardDeliveryAllowed] = useState<boolean>(true);
  const [instantDeliveryRadiusKm, setInstantDeliveryRadiusKm] = useState<number | undefined>(undefined);

  const cart: Cart = useMemo(() => {
    // Filter out any items with null products before computing totals
    const validItems = items.filter(item => item?.product);
    
    // Compute total and item count in a single pass for performance
    const { total, itemCount } = validItems.reduce((acc, item) => {
      const { displayPrice } = calculateProductPrice(item.product, item.variant);
      acc.total += displayPrice * (item.quantity || 0);
      acc.itemCount += (item.quantity || 0);
      return acc;
    }, { total: 0, itemCount: 0 });

    return {
      items: validItems,
      total,
      itemCount,
      estimatedDeliveryFee: estimatedFee,
      platformFee,
      freeDeliveryThreshold,
      minimumOrderValue,
      deliveryDistanceKm,
      instantDeliveryAllowed,
      standardDeliveryAllowed,
      instantDeliveryRadiusKm,
      debug_config: (items as any).debug_config,
      backendTotal: (items as any).backendTotal
    };
  }, [items, estimatedFee, platformFee, freeDeliveryThreshold, minimumOrderValue, deliveryDistanceKm, instantDeliveryAllowed, standardDeliveryAllowed, instantDeliveryRadiusKm]);

  const [sellerConflict, setSellerConflict] = useState<SellerConflictState | null>(null);

  const addToCart = async (product: Product, sourceElement?: HTMLElement | null, skipConflictCheck: boolean = false) => {
    // Get consistent product ID - MongoDB returns _id, frontend expects id
    const productId = product._id || product.id;

    // Prevent concurrent operations on the same product
    if (pendingOperationsRef.current.has(productId)) {
      return;
    }

    // A cart may only contain products from a single seller at a time (like a
    // food-delivery cart). If it already has items from a different seller,
    // pause and ask the customer to confirm before wiping their cart.
    if (!skipConflictCheck) {
      const validItems = items.filter((item) => item?.product);
      if (validItems.length > 0) {
        const newSellerId = getProductSellerId(product);
        const existingSellerId = getProductSellerId(validItems[0].product);
        const isSameProduct = (validItems[0].product.id || validItems[0].product._id) === productId;
        if (!isSameProduct && newSellerId && existingSellerId && newSellerId !== existingSellerId) {
          setSellerConflict({
            product,
            sourceElement,
            currentSellerName: getProductSellerName(validItems[0].product),
            newSellerName: getProductSellerName(product),
          });
          return;
        }
      }
    }

    pendingOperationsRef.current.add(productId);

    // Normalize product to always have 'id' property for consistency
    const normalizedProduct: Product = {
      ...product,
      id: productId,
      name: product.name || product.productName || 'Product',
      imageUrl: product.imageUrl || product.mainImage,
    };

    // Optimistic Update
    // Get source position if element is provided
    let sourcePosition: { x: number; y: number } | undefined;
    if (sourceElement) {
      const rect = sourceElement.getBoundingClientRect();
      sourcePosition = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }
    setLastAddEvent({ product: normalizedProduct, sourcePosition });
    setTimeout(() => setLastAddEvent(null), 800);

    // Optimistically update state
    const previousItems = [...items];
    setItems((prevItems) => {
      // Filter out null products and find existing item.
      // On a confirmed seller-conflict replacement, start from an empty cart
      // instead of merging with items from the previous seller.
      const validItems = skipConflictCheck ? [] : prevItems.filter(item => item?.product);

      // Check for variant ID or variant title if product has variations
      let variantId = (product as any).variantId || (product as any).selectedVariant?._id;
      let variantTitle = (product as any).variantTitle || (product as any).pack;

      // If no explicit variant info but variations exist, default to first variation
      if (!variantId && product.variations && product.variations.length > 0) {
        const firstVar = product.variations[0];
        variantId = (firstVar as any)._id || (firstVar as any).id;
        variantTitle = (firstVar as any).title || (firstVar as any).value || variantTitle;
      }

      // Find existing item - match by product ID and variant (if variant exists)
      const existingItem = validItems.find((item) => {
        const itemProductId = item.product.id || item.product._id;
        const itemVariantId = (item.product as any).variantId || (item.product as any).selectedVariant?._id;
        const itemVariantTitle = (item.product as any).variantTitle || (item.product as any).pack;

        // If both have variants, match by variant ID or title
        if (variantId || (itemVariantId && itemVariantId !== itemProductId)) {
          // Match by ID if both have it
          if (variantId && itemVariantId) {
            return itemProductId === productId && (itemVariantId === variantId || itemVariantTitle === variantTitle);
          }
          // Fallback to title
          return itemProductId === productId && itemVariantTitle === variantTitle;
        }
        // If no variant, match by product ID only
        return itemProductId === productId && !itemVariantId && !itemVariantTitle;
      });

      if (existingItem) {
        return validItems.map((item) => {
          const itemProductId = item.product.id || item.product._id;
          const itemVariantId = (item.product as any).variantId || (item.product as any).selectedVariant?._id;
          const itemVariantTitle = (item.product as any).variantTitle || (item.product as any).pack;

          // Match by product ID and variant
          const isMatch = (variantId || (itemVariantId && itemVariantId !== itemProductId))
            ? itemProductId === productId && (itemVariantId === variantId || itemVariantTitle === variantTitle)
            : itemProductId === productId && !itemVariantId && !itemVariantTitle;

          return isMatch
            ? { ...item, quantity: item.quantity + 1 }
            : item;
        });
      }
      return [...validItems, { product: normalizedProduct, quantity: 1 }];
    });

    // Only sync to API if user is authenticated
    if (isAuthenticated && user?.userType === 'Customer') {
      try {
        // Pass variation info to API if available
        // If product has variations but no variantId/selectedVariant is provided (e.g. from Home page),
        // use the ID of the first variation to ensure consistency with ProductDetail page
        let variation = (product as any).variantId || (product as any).selectedVariant?._id || (product as any).variantTitle;

        if (!variation && product.variations && product.variations.length > 0) {
          const firstVar = product.variations[0];
          variation = (firstVar as any)._id || (firstVar as any).id || (firstVar as any).title || (firstVar as any).value;
        }

        // Final fallback to pack
        if (!variation) {
          variation = product.pack;
        }

        const response = await apiAddToCart(
          productId,
          1,
          variation,
          location?.latitude,
          location?.longitude,
          undefined,
          skipConflictCheck || undefined
        );
        if (response && response.data && response.data.items) {
          // Atomic update from server response
          const mappedItems = mapApiItemsToState(response.data.items);
          setItems(mappedItems);
          setEstimatedFee(response.data.estimatedDeliveryFee);
          setPlatformFee(response.data.platformFee);
          setFreeDeliveryThreshold(response.data.freeDeliveryThreshold);
          setMinimumOrderValue(response.data.minimumOrderValue);
          setDeliveryDistanceKm((response.data as any).distanceKm);
          setInstantDeliveryAllowed((response.data as any).instantAllowed ?? true);
          setStandardDeliveryAllowed((response.data as any).standardAllowed ?? true);
          setInstantDeliveryRadiusKm((response.data as any).instantDeliveryRadiusKm);
        } else {
          console.warn('Response missing data or items:', response);
        }
      } catch (error: any) {
        // Backend is the authority on the single-seller rule; if the client's
        // view of the cart was stale, surface the same confirmation flow here.
        if (error.response?.status === 409 && error.response?.data?.sellerConflict) {
          setItems(previousItems);
          setSellerConflict({
            product,
            sourceElement,
            currentSellerName: error.response.data.data?.currentSellerName,
            newSellerName: error.response.data.data?.newSellerName,
          });
          return;
        }
        console.error("Add to cart failed", error);
        // Show error toast
        showToast(error.response?.data?.message || "Failed to add to cart", 'error');
        // Revert on error
        setItems(previousItems);
      } finally {
        // Remove from pending operations
        pendingOperationsRef.current.delete(productId);
      }
    } else {
      // For unregistered users, the optimistic update is already saved to localStorage
      // Remove from pending operations immediately
      pendingOperationsRef.current.delete(productId);
    }
  };

  const removeFromCart = async (productId: string) => {
    // Prevent concurrent operations on the same product
    if (pendingOperationsRef.current.has(productId)) {
      return;
    }
    pendingOperationsRef.current.add(productId);

    // Find item matching either id or _id
    const itemToRemove = items.find(item => item?.product && (item.product.id === productId || item.product._id === productId));

    const previousItems = [...items];
    setItems((prevItems) => prevItems.filter((item) => item?.product && item.product.id !== productId && item.product._id !== productId));

    // Only sync to API if user is authenticated and item has CartItemID
    if (isAuthenticated && user?.userType === 'Customer' && itemToRemove?.id) {
      try {
        const response = await apiRemoveFromCart(
          itemToRemove.id as string,
          location?.latitude,
          location?.longitude
        );
        if (response && response.data && response.data.items) {
          setItems(mapApiItemsToState(response.data.items));
          setEstimatedFee(response.data.estimatedDeliveryFee);
          setPlatformFee(response.data.platformFee);
          setFreeDeliveryThreshold(response.data.freeDeliveryThreshold);
          setMinimumOrderValue(response.data.minimumOrderValue);
          setDeliveryDistanceKm((response.data as any).distanceKm);
          setInstantDeliveryAllowed((response.data as any).instantAllowed ?? true);
          setStandardDeliveryAllowed((response.data as any).standardAllowed ?? true);
          setInstantDeliveryRadiusKm((response.data as any).instantDeliveryRadiusKm);
        }
      } catch (error) {
        console.error("Remove from cart failed", error);
        setItems(previousItems);
      } finally {
        // Remove from pending operations
        pendingOperationsRef.current.delete(productId);
      }
    } else {
      // For unregistered users, remove from pending operations immediately
      pendingOperationsRef.current.delete(productId);
    }
  };

  const updateQuantity = async (productId: string, quantity: number, variantId?: string, variantTitle?: string) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }

    // Create a unique operation key for this product/variant combination
    const operationKey = variantId ? `${productId}-${variantId}` : (variantTitle ? `${productId}-${variantTitle}` : productId);

    // Prevent concurrent operations on the same product
    if (pendingOperationsRef.current.has(operationKey)) {
      return;
    }
    pendingOperationsRef.current.add(operationKey);

    // Find item matching product ID and variant (if variant info provided)
    const itemToUpdate = items.find(item => {
      if (!item?.product) return false;
      const itemProductId = item.product.id || item.product._id;
      if (itemProductId !== productId) return false;

      // If variant info provided, match by variant
      if (variantId || variantTitle) {
        const itemVariantId = (item.product as any).variantId || (item.product as any).selectedVariant?._id;
        const itemVariantTitle = (item.product as any).variantTitle || (item.product as any).pack;
        return itemVariantId === variantId || itemVariantTitle === variantTitle;
      }

      // If no variant info, match items without variants
      const itemVariantId = (item.product as any).variantId || (item.product as any).selectedVariant?._id;
      const itemVariantTitle = (item.product as any).variantTitle;
      return !itemVariantId && !itemVariantTitle;
    });

    const previousItems = [...items];
    setItems((prevItems) =>
      prevItems.filter(item => item?.product).map((item) => {
        const itemProductId = item.product.id || item.product._id;
        if (itemProductId !== productId) return item;

        // If variant info provided, match by variant
        if (variantId || variantTitle) {
          const itemVariantId = (item.product as any).variantId || (item.product as any).selectedVariant?._id;
          const itemVariantTitle = (item.product as any).variantTitle || (item.product as any).pack;
          if (itemVariantId === variantId || itemVariantTitle === variantTitle) {
            return { ...item, quantity };
          }
        } else {
          // If no variant info, match items without variants
          const itemVariantId = (item.product as any).variantId || (item.product as any).selectedVariant?._id;
          const itemVariantTitle = (item.product as any).variantTitle;
          if (!itemVariantId && !itemVariantTitle) {
            return { ...item, quantity };
          }
        }
        return item;
      })
    );

    // Only sync to API if user is authenticated and item has CartItemID
    if (isAuthenticated && user?.userType === 'Customer' && itemToUpdate?.id) {
      try {
        const response = await apiUpdateCartItem(
          itemToUpdate.id as string,
          quantity,
          location?.latitude,
          location?.longitude
        );
        if (response && response.data && response.data.items) {
          setItems(mapApiItemsToState(response.data.items));
          setEstimatedFee(response.data.estimatedDeliveryFee);
          setPlatformFee(response.data.platformFee);
          setFreeDeliveryThreshold(response.data.freeDeliveryThreshold);
          setMinimumOrderValue(response.data.minimumOrderValue);
          setDeliveryDistanceKm((response.data as any).distanceKm);
          setInstantDeliveryAllowed((response.data as any).instantAllowed ?? true);
          setStandardDeliveryAllowed((response.data as any).standardAllowed ?? true);
          setInstantDeliveryRadiusKm((response.data as any).instantDeliveryRadiusKm);
        }
      } catch (error) {
        console.error("Update quantity failed", error);
        setItems(previousItems);
      } finally {
        // Remove from pending operations
        pendingOperationsRef.current.delete(operationKey);
      }
    } else {
      // For unregistered users, remove from pending operations immediately
      pendingOperationsRef.current.delete(operationKey);
    }
  };


  const clearCart = async () => {
    setItems([]);
    setDeliveryDistanceKm(undefined);
    setInstantDeliveryAllowed(true);
    setStandardDeliveryAllowed(true);
    setInstantDeliveryRadiusKm(undefined);
    try {
      await apiClearCart();
    } catch (error) {
      console.error("Clear cart failed", error);
      await fetchCart();
    }
  };

  const refreshCart = useCallback(async (
    latitude?: number,
    longitude?: number,
    deliveryOption?: string,
    options?: { preserveItems?: boolean },
  ) => {
    await fetchCart(latitude, longitude, deliveryOption, options);
  }, [fetchCart]);

  const confirmSellerConflict = async () => {
    if (!sellerConflict) return;
    const { product, sourceElement } = sellerConflict;
    setSellerConflict(null);
    await addToCart(product, sourceElement, true);
  };

  const cancelSellerConflict = () => setSellerConflict(null);

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        refreshCart,
        lastAddEvent,
        loading,
        sellerConflict: sellerConflict
          ? { currentSellerName: sellerConflict.currentSellerName, newSellerName: sellerConflict.newSellerName }
          : null,
        confirmSellerConflict,
        cancelSellerConflict,
      }}
    >
      {children}
      <SellerConflictModal
        isOpen={!!sellerConflict}
        currentSellerName={sellerConflict?.currentSellerName}
        newSellerName={sellerConflict?.newSellerName}
        onConfirm={confirmSellerConflict}
        onCancel={cancelSellerConflict}
      />
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}


