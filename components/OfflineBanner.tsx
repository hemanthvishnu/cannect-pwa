import React from 'react';
import { View, Text, Platform, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { WifiOff, CloudOff } from 'lucide-react-native';
import { useNetworkStatus } from '@/lib/hooks';

interface OfflineBannerProps {
  /** Show a more prominent banner for content screens */
  prominent?: boolean;
  /** Custom message */
  message?: string;
}

/**
 * OfflineBanner - Shows when user is offline
 *
 * Two modes:
 * - Compact: Small bar at top of screen
 * - Prominent: Larger card explaining cached content
 */
export function OfflineBanner({ prominent = false, message }: OfflineBannerProps) {
  const isOnline = useNetworkStatus();

  // Only show on web and when offline
  if (Platform.OS !== 'web') return null;
  if (isOnline) return null;

  if (prominent) {
    return (
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
        style={styles.prominentContainer}
      >
        <View style={styles.prominentContent}>
          <View style={styles.prominentIcon}>
            <CloudOff size={20} color="#EAB308" />
          </View>
          <View style={styles.prominentText}>
            <Text style={styles.prominentTitle}>You're offline</Text>
            <Text style={styles.prominentDescription}>
              {message || "Showing cached content. Pull to refresh when you're back online."}
            </Text>
          </View>
        </View>
      </Animated.View>
    );
  }

  // Compact banner
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={styles.compactContainer}
    >
      <WifiOff size={14} color="#EAB308" />
      <Text style={styles.compactText}>{message || "You're offline"}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Compact Banner Styles
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  compactText: {
    color: '#EAB308',
    fontSize: 13,
    fontWeight: '500',
  },

  // Prominent Banner Styles
  prominentContainer: {
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: '#18181B',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.3)',
    padding: 16,
  },
  prominentContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  prominentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  prominentText: {
    flex: 1,
    marginLeft: 12,
  },
  prominentTitle: {
    color: '#FAFAFA',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  prominentDescription: {
    color: '#A1A1AA',
    fontSize: 13,
    lineHeight: 18,
  },
});

export default OfflineBanner;
