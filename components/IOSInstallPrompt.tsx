import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, Platform, Dimensions, StyleSheet } from 'react-native';
import Animated, { 
  FadeInUp, 
  FadeOutDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Share2, X, ChevronDown } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isIOSSafari, isInstalledPWA } from '@/lib/hooks/use-pwa-persistence';

const DISMISS_KEY = 'cannect_ios_install_dismissed';
const SHOW_DELAY = 5000; // Show after 5 seconds on page

/**
 * IOSInstallPrompt - Guides iOS Safari users to install the PWA
 * 
 * iOS Safari never shows an automatic install banner, so users don't know
 * they can add the app to their home screen. This component detects iOS Safari
 * users who haven't installed the PWA yet and shows a helpful guide.
 * 
 * Features:
 * - Only shows on iOS Safari (not Chrome/Firefox on iOS)
 * - Doesn't show if already installed as PWA
 * - Respects user dismissal (doesn't show again for 7 days)
 * - Animated arrow pointing to Safari's share button
 */
export function IOSInstallPrompt() {
  const [show, setShow] = useState(false);
  
  // Bounce animation for the arrow
  const bounceY = useSharedValue(0);
  
  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounceY.value }],
  }));

  useEffect(() => {
    // Only show on iOS Safari when not installed
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;
    if (!isIOSSafari()) return;
    if (isInstalledPWA()) return;

    const checkAndShow = async () => {
      try {
        const dismissed = await AsyncStorage.getItem(DISMISS_KEY);
        
        // Don't show if dismissed in last 7 days
        if (dismissed) {
          const dismissedAt = parseInt(dismissed, 10);
          const sevenDays = 7 * 24 * 60 * 60 * 1000;
          if (Date.now() - dismissedAt < sevenDays) return;
        }

        // Show after delay to not interrupt initial experience
        setTimeout(() => {
          setShow(true);
          
          // Start bounce animation
          bounceY.value = withRepeat(
            withSequence(
              withTiming(8, { duration: 500 }),
              withTiming(0, { duration: 500 })
            ),
            -1,
            true
          );
        }, SHOW_DELAY);
        
      } catch (error) {
        console.error('[IOSInstall] Error:', error);
      }
    };

    checkAndShow();
  }, [bounceY]);

  const handleDismiss = useCallback(async () => {
    setShow(false);
    try {
      await AsyncStorage.setItem(DISMISS_KEY, Date.now().toString());
    } catch (error) {
      console.error('[IOSInstall] Error saving dismiss:', error);
    }
  }, []);

  if (!show) return null;

  return (
    <Animated.View
      entering={FadeInUp.springify().damping(15)}
      exiting={FadeOutDown.springify().damping(15)}
      style={styles.container}
    >
      {/* Main Card */}
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.iconContainer}>
              <Text style={styles.iconEmoji}>🌿</Text>
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>Install Cannect</Text>
              <Text style={styles.subtitle}>Add to your home screen</Text>
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

        {/* Instructions */}
        <View style={styles.instructions}>
          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <Text style={styles.stepText}>
              Tap the{' '}
              <View style={styles.inlineIcon}>
                <Share2 size={14} color="#10B981" />
              </View>
              {' '}Share button below
            </Text>
          </View>
          
          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <Text style={styles.stepText}>
              Select "<Text style={styles.bold}>Add to Home Screen</Text>"
            </Text>
          </View>
        </View>

        {/* Benefits */}
        <View style={styles.benefits}>
          {['Faster loading', 'Works offline', 'Push notifications'].map((benefit) => (
            <View key={benefit} style={styles.benefitBadge}>
              <Text style={styles.benefitText}>✓ {benefit}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Arrow pointing to Safari share button */}
      <Animated.View style={[arrowStyle, styles.arrowContainer]}>
        <ChevronDown size={28} color="#10B981" />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  card: {
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
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
  iconEmoji: {
    fontSize: 24,
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: '#FAFAFA',
    fontSize: 17,
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
  instructions: {
    backgroundColor: '#09090B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  stepNumberText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  stepText: {
    color: '#FAFAFA',
    fontSize: 15,
    flex: 1,
  },
  inlineIcon: {
    marginHorizontal: 2,
  },
  bold: {
    fontWeight: '700',
  },
  benefits: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  benefitBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  benefitText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  arrowContainer: {
    alignSelf: 'center',
    marginTop: 8,
  },
});

export default IOSInstallPrompt;
