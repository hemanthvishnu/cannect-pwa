/**
 * usePWA - Diamond Standard PWA Hook
 *
 * Provides access to advanced PWA capabilities:
 * - Installation status and prompt
 * - Persistent storage
 * - Background sync queue
 * - App badging
 * - Display mode detection
 */

import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import * as PWA from '@/lib/utils/pwa-apis';

interface PWAState {
  /** Whether app is installed as PWA */
  isInstalled: boolean;
  /** Current display mode */
  displayMode: 'browser' | 'standalone' | 'minimal-ui' | 'fullscreen';
  /** Whether install prompt is available */
  canInstall: boolean;
  /** Whether storage is persistent */
  isPersistent: boolean;
  /** Number of items in sync queue */
  syncQueueCount: number;
  /** Storage usage info */
  storageInfo: {
    usage: number;
    quota: number;
    percent: number;
  } | null;
}

export function usePWA() {
  const [state, setState] = useState<PWAState>({
    isInstalled: false,
    displayMode: 'browser',
    canInstall: false,
    isPersistent: false,
    syncQueueCount: 0,
    storageInfo: null,
  });

  // Initialize PWA state
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const init = async () => {
      // Check installation status
      const isInstalled = PWA.isInstalledPWA();
      const displayMode = PWA.getDisplayMode();

      // Request persistent storage (best effort)
      const { persisted } = await PWA.requestPersistentStorage();

      // Get storage info
      const storageInfo = await PWA.getStorageEstimate();

      // Get sync queue count
      const syncQueueCount = PWA.getSyncQueue().length;

      setState({
        isInstalled,
        displayMode,
        canInstall: PWA.canShowInstallPrompt(),
        isPersistent: persisted,
        syncQueueCount,
        storageInfo,
      });
    };

    // Initialize install prompt capture
    PWA.initInstallPrompt();

    init();

    // Listen for install prompt availability
    const handleBeforeInstall = () => {
      setState((prev) => ({ ...prev, canInstall: true }));
    };

    const handleInstalled = () => {
      setState((prev) => ({
        ...prev,
        isInstalled: true,
        canInstall: false,
        displayMode: 'standalone',
      }));
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  // Update sync queue count when it changes
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'cannect_sync_queue') {
        const count = PWA.getSyncQueue().length;
        setState((prev) => ({ ...prev, syncQueueCount: count }));
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Install prompt handler
  const promptInstall = useCallback(async () => {
    const result = await PWA.showInstallPrompt();
    if (result === 'accepted') {
      setState((prev) => ({ ...prev, canInstall: false }));
    }
    return result;
  }, []);

  // Set badge count
  const setBadge = useCallback((count: number) => {
    return PWA.setAppBadge(count);
  }, []);

  // Clear badge
  const clearBadge = useCallback(() => {
    return PWA.clearAppBadge();
  }, []);

  // Share content
  const share = useCallback((data: PWA.ShareData) => {
    return PWA.share(data);
  }, []);

  // Share a post
  const sharePost = useCallback((post: Parameters<typeof PWA.sharePost>[0]) => {
    return PWA.sharePost(post);
  }, []);

  // Queue an action for sync
  const queueForSync = useCallback((item: Parameters<typeof PWA.queueForSync>[0]) => {
    PWA.queueForSync(item);
    setState((prev) => ({ ...prev, syncQueueCount: prev.syncQueueCount + 1 }));
  }, []);

  // Process sync queue
  const processSyncQueue = useCallback(async () => {
    const queue = PWA.getSyncQueue();
    return queue;
  }, []);

  // Haptic feedback
  const haptic = useCallback((type: keyof typeof PWA.HapticPatterns = 'medium') => {
    return PWA.hapticFeedback(PWA.HapticPatterns[type]);
  }, []);

  return {
    ...state,
    promptInstall,
    setBadge,
    clearBadge,
    share,
    sharePost,
    queueForSync,
    processSyncQueue,
    haptic,
    canShare: PWA.canShare,
  };
}

export default usePWA;
