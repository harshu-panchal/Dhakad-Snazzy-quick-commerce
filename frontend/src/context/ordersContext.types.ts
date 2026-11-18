import { createContext } from 'react';
import { Order } from '../types/order';

export interface OrdersContextType {
  orders: Order[];
  addOrder: (order: Order) => Promise<CreatedOrderResult | undefined>;
  getOrderById: (id: string) => Order | undefined;
  fetchOrderById: (id: string) => Promise<Order | undefined>;
  fetchOrders: () => Promise<void>;
  updateOrderStatus: (id: string, status: Order["status"]) => void;
  loading: boolean;
}

export interface CreatedOrderResult {
  id: string;
  totalAmount: number;
  subtotal: number;
  fees: {
    platformFee: number;
    deliveryFee: number;
  };
}

export const OrdersContext = createContext<OrdersContextType | undefined>(undefined);

