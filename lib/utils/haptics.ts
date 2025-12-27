/**
 * Safe Haptics wrapper
 * Only runs on native platforms, silently no-ops on web
 */
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Trigger notification haptic feedback (success, warning, error)
 * Safe to call on web - will silently no-op
 */
export async function triggerNotification(
  type: 'success' | 'warning' | 'error' = 'success'
): Promise<void> {
  // Only run on native
  if (Platform.OS === 'web') return;
  
  try {
    const feedbackType = {
      success: Haptics.NotificationFeedbackType.Success,
      warning: Haptics.NotificationFeedbackType.Warning,
      error: Haptics.NotificationFeedbackType.Error,
    }[type];
    
    await Haptics.notificationAsync(feedbackType);
  } catch {
    // Silently fail - haptics not critical
  }
}

/**
 * Trigger impact haptic feedback (light, medium, heavy)
 * Safe to call on web - will silently no-op
 */
export async function triggerImpact(
  style: 'light' | 'medium' | 'heavy' = 'medium'
): Promise<void> {
  if (Platform.OS === 'web') return;
  
  try {
    const impactStyle = {
      light: Haptics.ImpactFeedbackStyle.Light,
      medium: Haptics.ImpactFeedbackStyle.Medium,
      heavy: Haptics.ImpactFeedbackStyle.Heavy,
    }[style];
    
    await Haptics.impactAsync(impactStyle);
  } catch {
    // Silently fail
  }
}

/**
 * Trigger selection haptic feedback (lightest feedback)
 * Safe to call on web - will silently no-op
 */
export async function triggerSelection(): Promise<void> {
  if (Platform.OS === 'web') return;
  
  try {
    await Haptics.selectionAsync();
  } catch {
    // Silently fail
  }
}
