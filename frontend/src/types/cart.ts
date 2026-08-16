import { Product } from './domain';

export interface CartItem {
  product: Product;
  quantity: number;
  variant?: any;
}

export interface Cart {
  items: CartItem[];
  totalItemCount?: number;
  itemCount?: number;
  total: number;
  estimatedDeliveryFee?: number;
  platformFee?: number;
  freeDeliveryThreshold?: number;
  minimumOrderValue?: number;
  /** Straight-line distance (km) from the customer to the cart's seller, if known */
  deliveryDistanceKm?: number;
  /** Whether Instant delivery is currently selectable given deliveryDistanceKm and the admin-configured boundary */
  instantDeliveryAllowed?: boolean;
  /** Whether Standard delivery is currently selectable given deliveryDistanceKm and the admin-configured boundary */
  standardDeliveryAllowed?: boolean;
  /** The admin-configured instant delivery radius (km), if set */
  instantDeliveryRadiusKm?: number;
  debug_config?: any;
  backendTotal?: number;
}
