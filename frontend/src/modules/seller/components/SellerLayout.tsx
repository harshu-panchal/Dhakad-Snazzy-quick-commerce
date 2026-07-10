import { ReactNode, useState, useCallback, useEffect, useRef } from 'react';
import SellerHeader from './SellerHeader';
import SellerSidebar from './SellerSidebar';
import { useSellerSocket, SellerNotification } from '../hooks/useSellerSocket';
import SellerNotificationAlert from './SellerNotificationAlert';
import { getPendingOrderAlerts } from '../../../services/api/orderService';

interface SellerLayoutProps {
  children: ReactNode;
}

function mergeUniqueNotifications(
  existing: SellerNotification[],
  incoming: SellerNotification[],
): SellerNotification[] {
  const seen = new Set(existing.map((notification) => notification.orderId));
  const merged = [...existing];

  for (const notification of incoming) {
    if (!seen.has(notification.orderId)) {
      seen.add(notification.orderId);
      merged.push(notification);
    }
  }

  return merged;
}

export default function SellerLayout({ children }: SellerLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeNotification, setActiveNotification] = useState<SellerNotification | null>(null);
  const [notificationQueue, setNotificationQueue] = useState<SellerNotification[]>([]);
  const hasRehydratedRef = useRef(false);

  const showNextNotification = useCallback((queue: SellerNotification[]) => {
    const [next, ...rest] = queue;
    setActiveNotification(next ?? null);
    setNotificationQueue(rest);
  }, []);

  const enqueueNotification = useCallback((notification: SellerNotification) => {
    setActiveNotification((current) => {
      if (!current) {
        return notification;
      }

      setNotificationQueue((queue) => mergeUniqueNotifications(queue, [notification]));
      return current;
    });
  }, []);

  const handleNotificationReceived = useCallback((notification: SellerNotification) => {
    enqueueNotification(notification);
  }, [enqueueNotification]);

  const rehydratePendingAlerts = useCallback(async () => {
    try {
      const response = await getPendingOrderAlerts();
      const alerts = response.data ?? [];

      if (alerts.length === 0) {
        return;
      }

      setActiveNotification((current) => {
        if (current) {
          setNotificationQueue((queue) => mergeUniqueNotifications(queue, alerts));
          return current;
        }

        const [first, ...rest] = alerts;
        setNotificationQueue(rest);
        return first;
      });
    } catch (error) {
      console.error('Failed to rehydrate seller order alerts:', error);
    }
  }, []);

  useSellerSocket(handleNotificationReceived);

  useEffect(() => {
    if (hasRehydratedRef.current) {
      return;
    }
    hasRehydratedRef.current = true;
    rehydratePendingAlerts();
  }, [rehydratePendingAlerts]);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const closeNotification = () => {
    showNextNotification(notificationQueue);
  };

  const handleNotificationResolved = () => {
    setActiveNotification(null);
    showNextNotification(notificationQueue);
    rehydratePendingAlerts();
  };

  return (
    <div className="flex min-h-screen bg-neutral-50">
      {/* Real-time Notification Alert */}
      <SellerNotificationAlert
        notification={activeNotification}
        onClose={closeNotification}
        onResolved={handleNotificationResolved}
      />

      {/* Overlay for mobile */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar - Fixed */}
      <div
        className={`fixed left-0 top-0 h-screen z-50 transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SellerSidebar onClose={() => setIsSidebarOpen(false)} />
      </div>

      {/* Main Content */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 w-full ${
          isSidebarOpen ? 'ml-64' : 'ml-0'
        }`}
      >
        {/* Header */}
        <SellerHeader onMenuClick={toggleSidebar} isSidebarOpen={isSidebarOpen} />

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 bg-neutral-50">{children}</main>
      </div>
    </div>
  );
}
