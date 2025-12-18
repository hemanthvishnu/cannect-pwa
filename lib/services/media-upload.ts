import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

// =====================================================
// Types
// =====================================================

export interface UploadResult {
  id: string;
  url: string;
  type: 'image' | 'video';
  thumbnailUrl?: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

type ProgressCallback = (progress: UploadProgress) => void;

// =====================================================
// Configuration
// =====================================================

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const MAX_IMAGE_WIDTH = 1920;
const JPEG_QUALITY = 0.85;

// =====================================================
// Image Picker
// =====================================================

/**
 * Request media library permissions
 */
export async function requestMediaPermissions(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === 'granted';
}

/**
 * Pick images from device library
 */
export async function pickImages(options?: {
  maxImages?: number;
}): Promise<ImagePicker.ImagePickerAsset[]> {
  const hasPermission = await requestMediaPermissions();
  if (!hasPermission) {
    throw new Error('Media library permission required');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: options?.maxImages ?? 4,
    quality: 1, // We'll compress later
    exif: false,
  });

  if (result.canceled) return [];
  return result.assets;
}

/**
 * Pick video from device library
 */
export async function pickVideo(): Promise<ImagePicker.ImagePickerAsset | null> {
  const hasPermission = await requestMediaPermissions();
  if (!hasPermission) {
    throw new Error('Media library permission required');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    allowsEditing: Platform.OS === 'ios', // iOS supports video trimming
    videoMaxDuration: 60, // 60 seconds max
    quality: 1,
  });

  if (result.canceled) return null;
  return result.assets[0];
}

// =====================================================
// Image Compression (Local Processing)
// =====================================================

/**
 * Compress and resize image before upload
 * This reduces upload time and bandwidth significantly
 */
export async function compressImage(uri: string): Promise<{ uri: string; width: number; height: number }> {
  // Resize to max width and compress
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_IMAGE_WIDTH } }],
    { 
      compress: JPEG_QUALITY, 
      format: ImageManipulator.SaveFormat.JPEG 
    }
  );
  
  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
  };
}

// =====================================================
// Pre-Sign Handshake (Edge Function)
// =====================================================

interface ImageUploadCredentials {
  uploadURL: string;
  id: string;
  deliveryBaseUrl: string;
}

interface VideoUploadCredentials {
  uploadURL: string;
  mediaId: string;
  playbackBaseUrl: string;
}

/**
 * Get direct upload URL from Edge Function
 */
async function getImageUploadUrl(filename: string): Promise<ImageUploadCredentials> {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.access_token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/get-upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.session.access_token}`,
    },
    body: JSON.stringify({ type: 'image', filename }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get upload URL');
  }

  return response.json();
}

/**
 * Get TUS upload URL for video
 */
async function getVideoUploadUrl(filename: string, fileSize: number): Promise<VideoUploadCredentials> {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.access_token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/get-upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.session.access_token}`,
      'Upload-Length': fileSize.toString(),
    },
    body: JSON.stringify({ type: 'video', filename }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get video upload URL');
  }

  return response.json();
}

// =====================================================
// Upload Functions
// =====================================================

/**
 * Upload a single image to Cloudflare Images
 */
export async function uploadImage(
  asset: ImagePicker.ImagePickerAsset,
  onProgress?: ProgressCallback
): Promise<UploadResult> {
  // 1. Compress locally first
  onProgress?.({ loaded: 0, total: 100, percentage: 5 });
  const compressed = await compressImage(asset.uri);
  onProgress?.({ loaded: 10, total: 100, percentage: 10 });

  // 2. Get direct upload URL (Pre-Sign Handshake)
  const filename = asset.fileName || `image_${Date.now()}.jpg`;
  const credentials = await getImageUploadUrl(filename);
  onProgress?.({ loaded: 15, total: 100, percentage: 15 });

  // 3. Prepare FormData
  const formData = new FormData();
  
  if (Platform.OS === 'web') {
    // Web: Fetch as blob and append properly
    const response = await fetch(compressed.uri);
    const blob = await response.blob();
    // Create a File object with proper MIME type
    const file = new File([blob], filename, { type: 'image/jpeg' });
    formData.append('file', file);
  } else {
    // Native: Use file URI with RN-style object
    formData.append('file', {
      uri: compressed.uri,
      type: 'image/jpeg',
      name: filename,
    } as any);
  }

  // 4. Upload directly to Cloudflare (don't set Content-Type - let browser set it with boundary)
  const uploadResponse = await fetch(credentials.uploadURL, {
    method: 'POST',
    body: formData,
    // Important: Do NOT set Content-Type header - browser will set it with multipart boundary
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    console.error('Cloudflare upload error:', errorText);
    throw new Error('Failed to upload image');
  }

  onProgress?.({ loaded: 100, total: 100, percentage: 100 });

  // 5. Return delivery URL
  return {
    id: credentials.id,
    url: `${credentials.deliveryBaseUrl}/${credentials.id}/public`,
    type: 'image',
  };
}

/**
 * Upload multiple images with progress tracking
 */
export async function uploadImages(
  assets: ImagePicker.ImagePickerAsset[],
  onProgress?: (index: number, progress: UploadProgress) => void
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];

  for (let i = 0; i < assets.length; i++) {
    const result = await uploadImage(assets[i], (progress) => {
      onProgress?.(i, progress);
    });
    results.push(result);
  }

  return results;
}

/**
 * Upload video to Cloudflare Stream with TUS resumable protocol
 */
export async function uploadVideo(
  asset: ImagePicker.ImagePickerAsset,
  onProgress?: ProgressCallback
): Promise<UploadResult> {
  // 1. Get file as blob to determine size
  const response = await fetch(asset.uri);
  const blob = await response.blob();
  const fileSize = blob.size;

  onProgress?.({ loaded: 0, total: fileSize, percentage: 5 });

  // 2. Get TUS upload URL
  const filename = asset.fileName || `video_${Date.now()}.mp4`;
  const credentials = await getVideoUploadUrl(filename, fileSize);

  onProgress?.({ loaded: 0, total: fileSize, percentage: 10 });

  // 3. TUS Upload (simplified - for production use tus-js-client for chunked uploads)
  const uploadResponse = await fetch(credentials.uploadURL, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/offset+octet-stream',
      'Upload-Offset': '0',
      'Tus-Resumable': '1.0.0',
    },
    body: blob,
  });

  if (!uploadResponse.ok) {
    throw new Error('Failed to upload video');
  }

  onProgress?.({ loaded: fileSize, total: fileSize, percentage: 100 });

  // 4. Return playback URLs
  return {
    id: credentials.mediaId,
    url: `${credentials.playbackBaseUrl}/${credentials.mediaId}/manifest/video.m3u8`,
    thumbnailUrl: `${credentials.playbackBaseUrl}/${credentials.mediaId}/thumbnails/thumbnail.jpg`,
    type: 'video',
  };
}

// =====================================================
// Cloudflare Image Variants (On-the-Fly Resizing)
// =====================================================

export type ImageVariant = 'public' | 'thumbnail' | 'avatar' | 'blur';

/**
 * Get Cloudflare Images variant URL
 * Instead of storing multiple sizes, request the variant you need
 */
export function getImageVariant(imageUrl: string, variant: ImageVariant = 'public'): string {
  // URL format: https://imagedelivery.net/{account_hash}/{image_id}/{variant}
  // Replace the variant portion
  return imageUrl.replace(/\/[^\/]+$/, `/${variant}`);
}

/**
 * Get optimized thumbnail URL for feed display
 */
export function getThumbnailUrl(imageUrl: string): string {
  return getImageVariant(imageUrl, 'thumbnail');
}

/**
 * Get blur placeholder URL for loading states
 */
export function getBlurUrl(imageUrl: string): string {
  return getImageVariant(imageUrl, 'blur');
}
