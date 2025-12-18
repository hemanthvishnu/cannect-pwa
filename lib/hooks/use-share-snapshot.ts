import { useRef, useCallback, useState } from 'react';
import { Platform, Alert } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';

/**
 * useShareSnapshot - Hook for capturing and sharing post cards as images
 * 
 * This hook provides:
 * 1. A ref to attach to the hidden share card component
 * 2. A function to capture the card and open the native share sheet
 * 3. Loading state for UI feedback during capture
 * 4. A flag to control lazy rendering of the share card
 * 
 * Usage:
 * ```tsx
 * const { shareRef, captureAndShare, isCapturing, shouldRenderCard } = useShareSnapshot();
 * 
 * // In render - lazy render only when needed:
 * {shouldRenderCard && (
 *   <View ref={shareRef} collapsable={false}>
 *     <PostShareCard post={post} />
 *   </View>
 * )}
 * 
 * // On share button press:
 * <Button onPress={() => captureAndShare(postId, username, content)} disabled={isCapturing} />
 * ```
 */
export function useShareSnapshot() {
  const shareRef = useRef<any>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [shouldRenderCard, setShouldRenderCard] = useState(false);

  const captureAndShare = useCallback(async (
    postId?: string,
    username?: string,
    content?: string
  ) => {
    // Web: Use Web Share API or clipboard fallback
    if (Platform.OS === 'web') {
      try {
        const shareUrl = postId ? `https://cannect.app/post/${postId}` : 'https://cannect.app';
        const shareText = content ? content.substring(0, 200) : 'Check out this post on Cannect!';
        const shareTitle = username ? `Post by @${username}` : 'Cannect Post';

        // Try Web Share API first (mobile browsers, some desktop)
        if (typeof navigator !== 'undefined' && navigator.share) {
          await navigator.share({
            title: shareTitle,
            text: shareText,
            url: shareUrl,
          });
          return;
        }

        // Fallback: Copy link to clipboard
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          await navigator.clipboard.writeText(shareUrl);
          Alert.alert('Link Copied!', 'Post link copied to clipboard.');
          return;
        }

        // Last resort fallback
        Alert.alert('Share', `Copy this link: ${shareUrl}`);
      } catch (error: any) {
        // User cancelled share or error
        if (error?.name !== 'AbortError') {
          console.error('Web share failed:', error);
        }
      }
      return;
    }

    // Native: Capture and share as image
    setIsCapturing(true);
    setShouldRenderCard(true);

    try {
      // 1. Tactile feedback for the start of the process
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // 2. Wait for card to render and images to load
      await new Promise(resolve => setTimeout(resolve, 200));

      // 3. Ensure ref is available
      if (!shareRef.current) {
        console.warn('Share ref not available');
        return;
      }

      // 4. Capture the hidden component as PNG
      const uri = await captureRef(shareRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });

      // 5. Check if sharing is available on this device
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Sharing Unavailable', 'Sharing is not available on this device.');
        return;
      }

      // 6. Open Native Share Sheet
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share to Stories',
        UTI: 'public.png',
      });

      // 7. Success haptic
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    } catch (error) {
      console.error('Snapshot failed:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Share Failed', 'Unable to create share image. Please try again.');
    } finally {
      setIsCapturing(false);
      // Keep card rendered briefly to avoid flicker on re-share
      setTimeout(() => setShouldRenderCard(false), 500);
    }
  }, []);

  return { shareRef, captureAndShare, isCapturing, shouldRenderCard };
}
