import { useEffect, useCallback, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// =====================================================
// Storage Keys
// =====================================================
const STORAGE_KEYS = {
  COMPOSE_DRAFT: 'cannect_compose_draft',
  COMPOSE_MEDIA: 'cannect_compose_media',
  INSTALL_DISMISSED: 'cannect_install_dismissed',
  PERSISTENCE_REQUESTED: 'cannect_persistence_requested',
} as const;

// =====================================================
// Types
// =====================================================
interface DraftData {
  content: string;
  replyToId?: string;
  quotePostId?: string;
  savedAt: number;
}

interface StorageEstimate {
  quota?: number;
  usage?: number;
  usageDetails?: {
    caches?: number;
    indexedDB?: number;
    serviceWorkerRegistrations?: number;
  };
}

interface UsePWAPersistenceReturn {
  // Draft Management
  saveDraft: (content: string, options?: { replyToId?: string; quotePostId?: string }) => Promise<void>;
  getDraft: () => Promise<DraftData | null>;
  clearDraft: () => Promise<void>;
  
  // Storage Info
  isPersistent: boolean;
  storageEstimate: StorageEstimate | null;
  
  // Install Prompt
  isInstallDismissed: boolean;
  dismissInstallPrompt: () => Promise<void>;
}

// =====================================================
// Hook: PWA Persistence
// =====================================================
export function usePWAPersistence(): UsePWAPersistenceReturn {
  const [isPersistent, setIsPersistent] = useState(false);
  const [storageEstimate, setStorageEstimate] = useState<StorageEstimate | null>(null);
  const [isInstallDismissed, setIsInstallDismissed] = useState(false);

  // =====================================================
  // Request Persistent Storage (Diamond Feature)
  // =====================================================
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;

    const requestPersistence = async () => {
      try {
        if (navigator.storage && navigator.storage.persist) {
          // Check current persistence state
          const alreadyPersisted = await navigator.storage.persisted();
          
          if (alreadyPersisted) {
            console.log('[PWA] Storage is already persistent ✅');
            setIsPersistent(true);
            return;
          }
          
          // Request persistence (browser may prompt user or auto-grant)
          const granted = await navigator.storage.persist();
          setIsPersistent(granted);
          
          if (granted) {
            console.log('[PWA] 💎 Diamond Persistence granted - data will NOT be evicted');
            await AsyncStorage.setItem(STORAGE_KEYS.PERSISTENCE_REQUESTED, 'true');
          } else {
            console.log('[PWA] Persistence request denied - data may be evicted under pressure');
          }
        }
      } catch (error) {
        console.error('[PWA] Error requesting persistence:', error);
      }
    };

    // Get storage estimate
    const getStorageEstimate = async () => {
      try {
        if (navigator.storage && navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          setStorageEstimate(estimate);
          
          const usedMB = ((estimate.usage || 0) / 1024 / 1024).toFixed(2);
          const quotaMB = ((estimate.quota || 0) / 1024 / 1024).toFixed(2);
          console.log(`[PWA] Storage: ${usedMB}MB / ${quotaMB}MB`);
        }
      } catch (error) {
        console.error('[PWA] Error getting storage estimate:', error);
      }
    };

    // Check install dismissed state
    const checkInstallDismissed = async () => {
      try {
        const dismissed = await AsyncStorage.getItem(STORAGE_KEYS.INSTALL_DISMISSED);
        setIsInstallDismissed(dismissed === 'true');
      } catch (error) {
        console.error('[PWA] Error checking install dismissed:', error);
      }
    };

    requestPersistence();
    getStorageEstimate();
    checkInstallDismissed();
  }, []);

  // =====================================================
  // Draft Management
  // =====================================================
  const saveDraft = useCallback(async (
    content: string, 
    options?: { replyToId?: string; quotePostId?: string }
  ) => {
    if (!content.trim()) return;
    
    try {
      const draftData: DraftData = {
        content,
        replyToId: options?.replyToId,
        quotePostId: options?.quotePostId,
        savedAt: Date.now(),
      };
      
      await AsyncStorage.setItem(STORAGE_KEYS.COMPOSE_DRAFT, JSON.stringify(draftData));
    } catch (error) {
      console.error('[PWA] Error saving draft:', error);
    }
  }, []);

  const getDraft = useCallback(async (): Promise<DraftData | null> => {
    try {
      const draftJson = await AsyncStorage.getItem(STORAGE_KEYS.COMPOSE_DRAFT);
      
      if (!draftJson) return null;
      
      const draft: DraftData = JSON.parse(draftJson);
      
      // Expire drafts older than 7 days
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - draft.savedAt > sevenDaysMs) {
        await AsyncStorage.removeItem(STORAGE_KEYS.COMPOSE_DRAFT);
        return null;
      }
      
      return draft;
    } catch (error) {
      console.error('[PWA] Error getting draft:', error);
      return null;
    }
  }, []);

  const clearDraft = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.COMPOSE_DRAFT);
      await AsyncStorage.removeItem(STORAGE_KEYS.COMPOSE_MEDIA);
    } catch (error) {
      console.error('[PWA] Error clearing draft:', error);
    }
  }, []);

  // =====================================================
  // Install Prompt
  // =====================================================
  const dismissInstallPrompt = useCallback(async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.INSTALL_DISMISSED, 'true');
      setIsInstallDismissed(true);
    } catch (error) {
      console.error('[PWA] Error dismissing install prompt:', error);
    }
  }, []);

  return {
    saveDraft,
    getDraft,
    clearDraft,
    isPersistent,
    storageEstimate,
    isInstallDismissed,
    dismissInstallPrompt,
  };
}

// =====================================================
// Utility: Check if running as installed PWA
// =====================================================
export function isInstalledPWA(): boolean {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined') return false;
  
  // Check display-mode media query
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  
  // Check iOS standalone mode
  if ((window.navigator as any).standalone === true) return true;
  
  // Check if launched from home screen (Android)
  if (document.referrer.includes('android-app://')) return true;
  
  return false;
}

// =====================================================
// Utility: Check if iOS Safari
// =====================================================
export function isIOSSafari(): boolean {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined') return false;
  
  const ua = window.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isWebkit = /WebKit/.test(ua);
  const isChrome = /CriOS/.test(ua);
  const isFirefox = /FxiOS/.test(ua);
  
  return isIOS && isWebkit && !isChrome && !isFirefox;
}
