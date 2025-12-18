import { useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import {
  pickImages,
  pickVideo,
  uploadImages,
  uploadVideo,
  UploadResult,
  UploadProgress,
} from '@/lib/services/media-upload';

// =====================================================
// Types
// =====================================================

interface MediaAsset extends ImagePicker.ImagePickerAsset {
  uploadedUrl?: string;
  uploadedId?: string;
}

interface MediaState {
  assets: MediaAsset[];
  isUploading: boolean;
  uploadProgress: number;
  currentUploadIndex: number;
  error: string | null;
}

interface UseMediaUploadReturn {
  // State
  assets: MediaAsset[];
  isUploading: boolean;
  uploadProgress: number;
  error: string | null;
  hasMedia: boolean;
  isVideo: boolean;
  canAddMore: boolean;

  // Actions
  selectImages: () => Promise<void>;
  selectVideo: () => Promise<void>;
  removeAsset: (index: number) => void;
  uploadAll: () => Promise<UploadResult[]>;
  reset: () => void;
}

// =====================================================
// Hook
// =====================================================

export function useMediaUpload(maxImages = 4): UseMediaUploadReturn {
  const [state, setState] = useState<MediaState>({
    assets: [],
    isUploading: false,
    uploadProgress: 0,
    currentUploadIndex: 0,
    error: null,
  });

  // Track if upload was cancelled
  const isCancelledRef = useRef(false);

  // =====================================================
  // Select Images
  // =====================================================
  const selectImages = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, error: null }));

      const remainingSlots = maxImages - state.assets.length;
      if (remainingSlots <= 0) return;

      const newAssets = await pickImages({ maxImages: remainingSlots });

      if (newAssets.length > 0) {
        // Haptic feedback on selection
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }

        setState(prev => ({
          ...prev,
          assets: [...prev.assets, ...newAssets].slice(0, maxImages),
          error: null,
        }));
      }
    } catch (error: any) {
      console.error('Image selection error:', error);
      setState(prev => ({ 
        ...prev, 
        error: error.message || 'Failed to select images' 
      }));
    }
  }, [state.assets.length, maxImages]);

  // =====================================================
  // Select Video
  // =====================================================
  const selectVideo = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, error: null }));

      const video = await pickVideo();

      if (video) {
        // Haptic feedback
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }

        // Video replaces all images (can't mix)
        setState({
          assets: [video],
          isUploading: false,
          uploadProgress: 0,
          currentUploadIndex: 0,
          error: null,
        });
      }
    } catch (error: any) {
      console.error('Video selection error:', error);
      setState(prev => ({ 
        ...prev, 
        error: error.message || 'Failed to select video' 
      }));
    }
  }, []);

  // =====================================================
  // Remove Asset
  // =====================================================
  const removeAsset = useCallback((index: number) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    setState(prev => ({
      ...prev,
      assets: prev.assets.filter((_, i) => i !== index),
    }));
  }, []);

  // =====================================================
  // Upload All
  // =====================================================
  const uploadAll = useCallback(async (): Promise<UploadResult[]> => {
    if (state.assets.length === 0) return [];

    isCancelledRef.current = false;
    setState(prev => ({ 
      ...prev, 
      isUploading: true, 
      uploadProgress: 0,
      currentUploadIndex: 0,
      error: null,
    }));

    try {
      const isVideo = state.assets[0].type === 'video';
      let results: UploadResult[];

      if (isVideo) {
        // Single video upload
        const result = await uploadVideo(state.assets[0], (progress) => {
          if (isCancelledRef.current) return;
          setState(prev => ({ ...prev, uploadProgress: progress.percentage }));
        });
        results = [result];
      } else {
        // Multiple image uploads
        results = await uploadImages(state.assets, (index, progress) => {
          if (isCancelledRef.current) return;
          
          // Calculate overall progress across all images
          const baseProgress = (index / state.assets.length) * 100;
          const imageProgress = (progress.percentage / state.assets.length);
          const overallProgress = baseProgress + imageProgress;
          
          setState(prev => ({ 
            ...prev, 
            uploadProgress: Math.min(overallProgress, 99),
            currentUploadIndex: index,
          }));
        });
      }

      // Success haptic
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      setState(prev => ({
        ...prev,
        isUploading: false,
        uploadProgress: 100,
        // Update assets with uploaded URLs
        assets: prev.assets.map((asset, i) => ({
          ...asset,
          uploadedUrl: results[i]?.url,
          uploadedId: results[i]?.id,
        })),
      }));

      return results;

    } catch (error: any) {
      console.error('Upload error:', error);

      // Error haptic
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }

      setState(prev => ({
        ...prev,
        isUploading: false,
        error: error.message || 'Upload failed',
      }));

      throw error;
    }
  }, [state.assets]);

  // =====================================================
  // Reset
  // =====================================================
  const reset = useCallback(() => {
    isCancelledRef.current = true;
    setState({
      assets: [],
      isUploading: false,
      uploadProgress: 0,
      currentUploadIndex: 0,
      error: null,
    });
  }, []);

  // =====================================================
  // Return
  // =====================================================
  return {
    // State
    assets: state.assets,
    isUploading: state.isUploading,
    uploadProgress: state.uploadProgress,
    error: state.error,
    hasMedia: state.assets.length > 0,
    isVideo: state.assets.length > 0 && state.assets[0].type === 'video',
    canAddMore: state.assets.length < maxImages && !state.assets.some(a => a.type === 'video'),

    // Actions
    selectImages,
    selectVideo,
    removeAsset,
    uploadAll,
    reset,
  };
}
