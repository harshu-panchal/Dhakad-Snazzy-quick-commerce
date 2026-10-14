import { ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DeliveryBottomNav from './DeliveryBottomNav';
import { DeliveryStatusProvider, useDeliveryStatus } from '../context/DeliveryStatusContext';
import { DeliveryUserProvider, useDeliveryUser } from '../context/DeliveryUserContext';
import { getDeliveryProfile, updateProfile } from '../../../services/api/delivery/deliveryService';
import { useDeliveryOrderNotifications } from '../../../hooks/useDeliveryOrderNotifications';
import OrderNotificationCard from './OrderNotificationCard';
import { AnimatePresence } from 'framer-motion';
import { registerFCMToken } from '../../../services/pushNotificationService';

const PUSH_PROMPT_DISMISSED_KEY = 'delivery_push_prompt_dismissed';
const CITY_MISMATCH_DISMISSED_AT_KEY = 'delivery_city_mismatch_dismissed_at';
const CITY_MISMATCH_SNOOZE_MS = 24 * 60 * 60 * 1000; // 24 hours

function citiesMatch(cityA?: string | null, cityB?: string | null): boolean {
  if (!cityA || !cityB) return false;
  const a = cityA.trim().toLowerCase();
  const b = cityB.trim().toLowerCase();
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

interface DeliveryLayoutContentProps {
  children: ReactNode;
}

function DeliveryLayoutContent({ children }: DeliveryLayoutContentProps) {
  const navigate = useNavigate();
  const { isOnline } = useDeliveryStatus();
  const { setUserName } = useDeliveryUser();
  const {
    currentNotification,
    acceptOrder,
    rejectOrder,
  } = useDeliveryOrderNotifications();
  const [showPushBanner, setShowPushBanner] = useState(false);
  const [pushEnabling, setPushEnabling] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | null>(null);

  const [cityPopup, setCityPopup] = useState<{ reason: 'missing' | 'mismatch'; detectedCity: string | null } | null>(null);
  const [cityInput, setCityInput] = useState('');
  const [cityUpdating, setCityUpdating] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const profile = await getDeliveryProfile();
        if (profile?.name) {
          setUserName(profile.name);
        }
        checkCityAccuracy(profile?.city);
      } catch (error) {
        console.error('Failed to fetch profile in layout:', error);
      }
    };

    fetchProfile();
  }, [setUserName]);

  const checkCityAccuracy = (savedCity?: string) => {
    if (!savedCity || !savedCity.trim()) {
      setCityPopup({ reason: 'missing', detectedCity: null });
      setCityInput('');
      return;
    }

    if (typeof window === 'undefined' || !navigator.geolocation) return;

    const snoozedAt = Number(localStorage.getItem(CITY_MISMATCH_DISMISSED_AT_KEY) || 0);
    if (snoozedAt && Date.now() - snoozedAt < CITY_MISMATCH_SNOOZE_MS) return;

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`
          );
          const data = await response.json();
          if (data.status !== 'OK') return;

          const addressComponents = data.results[0]?.address_components || [];
          const cityComponent = addressComponents.find((c: any) =>
            c.types.includes('locality') || c.types.includes('administrative_area_level_2')
          );
          const detectedCity = cityComponent?.long_name;
          if (!detectedCity) return;

          if (!citiesMatch(savedCity, detectedCity)) {
            setCityPopup({ reason: 'mismatch', detectedCity });
            setCityInput(detectedCity);
          }
        } catch (e) {
          console.warn('City accuracy check failed:', e);
        }
      },
      () => {
        // Permission denied or unavailable — skip silently, don't nag with false positives
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 }
    );
  };

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const permission = Notification.permission;
    setPushPermission(permission);
    const dismissed = localStorage.getItem(PUSH_PROMPT_DISMISSED_KEY) === '1';
    if (permission !== 'granted' && !dismissed) {
      setShowPushBanner(true);
    } else {
      setShowPushBanner(false);
    }
  }, []);

  const handleEnablePush = async () => {
    if (pushPermission === 'denied') {
      alert(
        'Notifications are blocked for this app in your browser. To get order alerts when the app is closed:\n\n' +
        '1. Tap the lock/info icon next to the website address\n' +
        '2. Open "Site settings" or "Permissions"\n' +
        '3. Set Notifications to "Allow"\n' +
        '4. Reload the app'
      );
      return;
    }
    setPushEnabling(true);
    try {
      await registerFCMToken(true);
      const updatedPermission = ('Notification' in window) ? Notification.permission : null;
      setPushPermission(updatedPermission);
      setShowPushBanner(updatedPermission !== 'granted');
    } catch (e) {
      console.warn('Push registration failed:', e);
    } finally {
      setPushEnabling(false);
    }
  };

  const handleDismissPushBanner = () => {
    localStorage.setItem(PUSH_PROMPT_DISMISSED_KEY, '1');
    setShowPushBanner(false);
  };

  const handleSaveCity = async () => {
    if (!cityInput.trim()) return;
    setCityUpdating(true);
    try {
      await updateProfile({ city: cityInput.trim() });
      setCityPopup(null);
    } catch (e) {
      console.warn('Failed to update city:', e);
      alert('Failed to update city. Please try again from your Profile page.');
    } finally {
      setCityUpdating(false);
    }
  };

  const handleSnoozeCityPopup = () => {
    localStorage.setItem(CITY_MISMATCH_DISMISSED_AT_KEY, String(Date.now()));
    setCityPopup(null);
  };

  return (
    <div className={`flex flex-col min-h-screen bg-neutral-100 transition-all duration-300 ${!isOnline ? 'grayscale' : ''}`}>
      {showPushBanner && (
        <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 flex items-center justify-between gap-2 shrink-0">
          <p className="text-sm text-amber-900 flex-1 min-w-0">
            {pushPermission === 'denied'
              ? 'Notifications are blocked. Tap to see how to enable them.'
              : 'Get order alerts when the app is closed.'}
          </p>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleEnablePush}
              disabled={pushEnabling}
              className="px-3 py-1.5 text-sm font-medium bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-60"
            >
              {pushPermission === 'denied' ? 'How to enable' : (pushEnabling ? 'Enabling…' : 'Enable')}
            </button>
            <button
              type="button"
              onClick={handleDismissPushBanner}
              className="px-2 py-1.5 text-sm text-amber-800 hover:bg-amber-100 rounded"
            >
              Later
            </button>
          </div>
        </div>
      )}
      <main className="flex-1 overflow-y-auto scrollbar-hide pb-20">
        {children}
      </main>
      <DeliveryBottomNav />

      {/* City Not Set / Mismatch Popup */}
      {cityPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-5">
            <h3 className="text-neutral-900 font-semibold text-lg mb-2">
              {cityPopup.reason === 'missing' ? 'Set Your City' : 'City Looks Outdated'}
            </h3>
            <p className="text-neutral-600 text-sm mb-4">
              {cityPopup.reason === 'missing'
                ? "Your profile doesn't have a city set, so you may not receive order alerts. Please set it to start getting orders."
                : `Your saved city doesn't match your current location${cityPopup.detectedCity ? ` (looks like you're near "${cityPopup.detectedCity}")` : ''}. Update it so you keep receiving nearby order alerts.`}
            </p>
            <input
              type="text"
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              placeholder="Enter your city"
              className="w-full text-neutral-900 text-sm px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 mb-4"
            />
            <div className="flex gap-2">
              {cityPopup.reason === 'mismatch' && (
                <button
                  type="button"
                  onClick={handleSnoozeCityPopup}
                  className="flex-1 bg-neutral-200 text-neutral-900 rounded-lg py-2.5 text-sm font-medium hover:bg-neutral-300"
                >
                  Not now
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveCity}
                disabled={cityUpdating || !cityInput.trim()}
                className="flex-1 bg-orange-500 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-orange-600 disabled:opacity-60"
              >
                {cityUpdating ? 'Saving…' : 'Update City'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Notification Card */}
      <AnimatePresence>
        {currentNotification && (
          <OrderNotificationCard
            key={currentNotification.orderId}
            notification={currentNotification}
            onAccept={(orderId) => acceptOrder(orderId, navigate)}
            onReject={rejectOrder}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

interface DeliveryLayoutProps {
  children: ReactNode;
}

export default function DeliveryLayout({ children }: DeliveryLayoutProps) {
  return (
    <DeliveryStatusProvider>
      <DeliveryUserProvider>
        <DeliveryLayoutContent>{children}</DeliveryLayoutContent>
      </DeliveryUserProvider>
    </DeliveryStatusProvider>
  );
}




