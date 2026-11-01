import { CartItem } from './cart';

export type OrderStatus = 'Received' | 'Accepted' | 'On the way' | 'Delivered' | 'Pending';

export interface OrderAddress {
  name: string;
  phone: string;
  flat: string;
  street: string;
  address?: string; // Add address field for backend compat
  city: string;
  state?: string;
  pincode: string;
  landmark?: string;
  latitude?: number;
  longitude?: number;
  id?: string;
  _id?: string;
}

export interface OrderFees {
  platformFee?: number;
  deliveryFee?: number;
}

export interface Order {
  id: string;
  items: CartItem[];
  totalItems: number;
  subtotal: number;
  fees: OrderFees;
  totalAmount: number;
  address: OrderAddress;
  status: OrderStatus;
  paymentMethod?: string;
  createdAt: string;
  tipAmount?: number;
  donationAmount?: number;
  gstin?: string;
  couponCode?: string;
  giftPackaging?: boolean;
  deliveryOption?: 'Instant' | 'Standard';
  deliveryProvider?: 'Personal' | 'Shiprocket';
  deliveryPartner?: { name?: string; phone?: string; profileImage?: string; vehicleNumber?: string };
  deliveryOtp?: string;
  deliveryAddress?: OrderAddress;
  shipment?: {
    provider: 'Personal' | 'Shiprocket';
    status: string;
    awb?: string;
    courierName?: string;
    estimatedDeliveryDays?: string;
    estimatedDeliveryDate?: string;
    trackingUrl?: string;
    shiprocketStatus?: string;
    lastSyncedAt?: string;
    trackingEvents?: Array<{
      status?: string;
      activity?: string;
      location?: string;
      eventAt?: string;
    }>;
  } | null;
}


