import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';
import { Sparkles, X } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 💎 Update these on each release
const CURRENT_VERSION = '1.1.0';
const RELEASE_TITLE = 'The Diamond Update';

// Features to highlight in this update
const WHATS_NEW_FEATURES = [
  {
    emoji: '💎',
    title: 'Diamond Persistence',
    description: 'Your drafts and sessions are now protected against browser restarts.',
  },
  {
    emoji: '⚡',
    title: 'Instant Loading',
    description: 'New skeleton screens make the feed feel faster than ever.',
  },
  {
    emoji: '📶',
    title: 'Offline Resilience',
    description: 'Improved handling for patchy connections and weak signals.',
  },
  {
    emoji: '🔄',
    title: 'Atomic Updates',
    description: 'Updates are now seamless with zero cache conflicts.',
  },
];

const STORAGE_KEY = 'cannect_whats_new_version';

/**
 * WhatsNewToast - Shows after an app update with new features
 *
 * Features:
 * - Only shows once per version
 * - Delays slightly to not conflict with other toasts
 * - Premium card design with feature list
 */
export function WhatsNewToast() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;

    const checkVersion = async () => {
      try {
        const lastSeenVersion = await AsyncStorage.getItem(STORAGE_KEY);

        if (lastSeenVersion && lastSeenVersion !== CURRENT_VERSION) {
          // User has updated! Show what's new
          // Delay slightly so it doesn't conflict with PWAUpdater
          setTimeout(() => setShow(true), 2500);
          await AsyncStorage.setItem(STORAGE_KEY, CURRENT_VERSION);
        } else if (!lastSeenVersion) {
          // First time user - just save version, don't show
          await AsyncStorage.setItem(STORAGE_KEY, CURRENT_VERSION);
        }
      } catch (error) {
        console.error('[WhatsNew] Error checking version:', error);
      }
    };

    checkVersion();
  }, []);

  const handleDismiss = useCallback(() => {
    setShow(false);
  }, []);

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
            <View style={styles.badgeContainer}>
              <Sparkles size={14} color="#10B981" />
            </View>
            <Text style={styles.releaseTitle}>{RELEASE_TITLE}</Text>
          </View>
          <Pressable onPress={handleDismiss} hitSlop={12}>
            <X size={20} color="#71717A" />
          </Pressable>
        </View>

        {/* Title */}
        <Text style={styles.title}>What's New</Text>

        {/* Features */}
        <View style={styles.featureList}>
          {WHATS_NEW_FEATURES.map((feature, i) => (
            <View key={i} style={styles.featureItem}>
              <Text style={styles.featureEmoji}>{feature.emoji}</Text>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDescription}>{feature.description}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* CTA Button */}
        <Pressable onPress={handleDismiss} style={styles.ctaButton}>
          <Text style={styles.ctaButtonText}>Let's Go!</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    zIndex: 9998, // Below PWAUpdater
  },
  card: {
    backgroundColor: '#18181B',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)', // Emerald border
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgeContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  releaseTitle: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: '#FAFAFA',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 16,
  },
  featureList: {
    gap: 12,
    marginBottom: 20,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  featureEmoji: {
    fontSize: 18,
    marginRight: 12,
    marginTop: 2,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    color: '#FAFAFA',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  featureDescription: {
    color: '#A1A1AA',
    fontSize: 13,
    lineHeight: 18,
  },
  ctaButton: {
    backgroundColor: '#10B981',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default WhatsNewToast;
