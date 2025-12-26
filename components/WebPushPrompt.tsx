/**
 * WebPushPrompt - Prompts users to enable push notifications
 * 
 * iOS Safari 16.4+ Requirements:
 * - PWA must be installed (added to home screen)
 * - User must interact with a button to trigger permission request
 * - Cannot auto-prompt on iOS
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import Animated, { 
  FadeInUp, 
  FadeOutDown,
} from 'react-native-reanimated';
import { Bell, X, Smartphone } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWebPush } from '@/lib/hooks/use-web-push';
import { useAuthStore } from '@/lib/stores';

const DISMISS_KEY = 'cannect_push_prompt_dismissed';
const SHOW_DELAY = 10000; // Show after 10 seconds

/**
 * WebPushPrompt - Smart notification permission prompt
 * 
 * Behavior:
 * - Desktop/Android: Shows standard push prompt
 * - iOS PWA: Shows iOS-specific instructions
 * - iOS Safari (not installed): Hidden (IOSInstallPrompt handles this)
 */
export function WebPushPrompt() {
  const [isMounted, setIsMounted] = useState(false);
  const [show, setShow] = useState(false);
  const { isAuthenticated } = useAuthStore();
  const { 
    isSupported, 
    isSubscribed, 
    isIOSPWA,
    permission,
    isLoading,
    subscribe,
  } = useWebPush();

  // Mount check for hydration safety
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!isMounted) return;
    if (!isAuthenticated) return;
    if (!isSupported) return;
    if (isSubscribed) return;
    if (permission === 'denied') return;
    if (permission === 'granted') return;

    const checkAndShow = async () => {
      try {
        const dismissed = await AsyncStorage.getItem(DISMISS_KEY);
        
        // Don't show if dismissed in last 3 days
        if (dismissed) {
          const dismissedAt = parseInt(dismissed, 10);
          const threeDays = 3 * 24 * 60 * 60 * 1000;
          if (Date.now() - dismissedAt < threeDays) return;
        }

        // Show after delay
        setTimeout(() => {
          setShow(true);
        }, SHOW_DELAY);
        
      } catch (error) {
        console.error('[WebPushPrompt] Error:', error);
      }
    };

    checkAndShow();
  }, [isMounted, isAuthenticated, isSupported, isSubscribed, permission]);

  const handleDismiss = useCallback(async () => {
    setShow(false);
    try {
      await AsyncStorage.setItem(DISMISS_KEY, Date.now().toString());
    } catch (error) {
      console.error('[WebPushPrompt] Error saving dismiss:', error);
    }
  }, []);

  const handleEnable = useCallback(async () => {
    const success = await subscribe();
    if (success) {
      setShow(false);
    }
  }, [subscribe]);

  // Don't render during SSR or if not applicable
  if (!isMounted) return null;
  if (!show) return null;

  return (
    <Animated.View
      entering={FadeInUp.springify().damping(15)}
      exiting={FadeOutDown.springify().damping(15)}
      style={styles.container}
    >
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.iconContainer}>
              <Bell size={24} color="white" />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>Enable Notifications</Text>
              <Text style={styles.subtitle}>
                {isIOSPWA 
                  ? 'Stay updated on your iOS device'
                  : 'Get notified of likes, replies & follows'}
              </Text>
            </View>
          </View>
          
          <Pressable 
            onPress={handleDismiss}
            hitSlop={12}
            style={styles.closeButton}
          >
            <X size={20} color="#71717A" />
          </Pressable>
        </View>

        {/* iOS PWA specific message */}
        {isIOSPWA && (
          <View style={styles.iosNote}>
            <Smartphone size={16} color="#10B981" />
            <Text style={styles.iosNoteText}>
              iOS 16.4+ supports push notifications for installed web apps!
            </Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actions}>
          <Pressable 
            onPress={handleDismiss}
            style={styles.laterButton}
          >
            <Text style={styles.laterText}>Maybe Later</Text>
          </Pressable>
          
          <Pressable 
            onPress={handleEnable}
            disabled={isLoading}
            style={[styles.enableButton, isLoading && styles.enableButtonDisabled]}
          >
            <Text style={styles.enableText}>
              {isLoading ? 'Enabling...' : 'Enable'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    zIndex: 9997,
  },
  card: {
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 16,
    padding: 16,
    // @ts-ignore - boxShadow for web
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: '#FAFAFA',
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    color: '#71717A',
    fontSize: 13,
    marginTop: 2,
  },
  closeButton: {
    padding: 4,
  },
  iosNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981/10',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    gap: 8,
  },
  iosNoteText: {
    color: '#A7F3D0',
    fontSize: 12,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    gap: 12,
  },
  laterButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  laterText: {
    color: '#71717A',
    fontSize: 14,
    fontWeight: '600',
  },
  enableButton: {
    backgroundColor: '#10B981',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  enableButtonDisabled: {
    opacity: 0.6,
  },
  enableText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default WebPushPrompt;
