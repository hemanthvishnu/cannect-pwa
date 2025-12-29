import { useState, useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * useNetworkStatus - Track online/offline state on web
 *
 * Returns true if the device is online, false if offline.
 * On native platforms, always returns true (native handles this differently).
 *
 * Use cases:
 * - Show offline indicator in compose screen
 * - Queue actions when offline
 * - Disable certain features when offline
 */
export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Only track on web
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      console.log('[Network] Online');
      setIsOnline(true);
    };

    const handleOffline = () => {
      console.log('[Network] Offline');
      setIsOnline(false);
    };

    // Set initial state
    setIsOnline(navigator.onLine);

    // Listen for changes
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

/**
 * useConnectionQuality - Get detailed connection information
 *
 * Returns connection type, effective bandwidth, and RTT.
 * Useful for deciding whether to load high-res images or videos.
 */
interface ConnectionQuality {
  isOnline: boolean;
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g';
  downlink?: number; // Mbps
  rtt?: number; // Round-trip time in ms
  saveData?: boolean;
}

export function useConnectionQuality(): ConnectionQuality {
  const [quality, setQuality] = useState<ConnectionQuality>({ isOnline: true });

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof navigator === 'undefined') return;

    const updateQuality = () => {
      const connection =
        (navigator as any).connection ||
        (navigator as any).mozConnection ||
        (navigator as any).webkitConnection;

      const newQuality: ConnectionQuality = {
        isOnline: navigator.onLine,
      };

      if (connection) {
        newQuality.effectiveType = connection.effectiveType;
        newQuality.downlink = connection.downlink;
        newQuality.rtt = connection.rtt;
        newQuality.saveData = connection.saveData;
      }

      setQuality(newQuality);
    };

    // Initial check
    updateQuality();

    // Listen for connection changes
    const connection = (navigator as any).connection;
    if (connection) {
      connection.addEventListener('change', updateQuality);
    }
    window.addEventListener('online', updateQuality);
    window.addEventListener('offline', updateQuality);

    return () => {
      if (connection) {
        connection.removeEventListener('change', updateQuality);
      }
      window.removeEventListener('online', updateQuality);
      window.removeEventListener('offline', updateQuality);
    };
  }, []);

  return quality;
}

export default useNetworkStatus;
