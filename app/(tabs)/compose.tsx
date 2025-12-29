/**
 * Compose Screen - Pure AT Protocol
 */

import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Image as ImageIcon, Video as VideoIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { RichText } from '@atproto/api';
import { useCreatePost } from '@/lib/hooks';
import { useAuthStore } from '@/lib/stores';
import * as atproto from '@/lib/atproto/agent';

const MAX_LENGTH = 300; // Bluesky character limit

export default function ComposeScreen() {
  const { replyToUri, replyToCid, rootUri, rootCid } = useLocalSearchParams<{
    replyToUri?: string;
    replyToCid?: string;
    rootUri?: string;
    rootCid?: string;
  }>();

  const isReply = !!(replyToUri && replyToCid);

  const [content, setContent] = useState('');
  const [images, setImages] = useState<{ uri: string; mimeType: string }[]>([]);
  const [video, setVideo] = useState<{ uri: string; mimeType: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createPostMutation = useCreatePost();
  const { isAuthenticated, profile, handle } = useAuthStore();

  // Use RichText for accurate grapheme counting (matches AT Protocol's 300 grapheme limit)
  const graphemeLength = useMemo(() => {
    const rt = new RichText({ text: content });
    return rt.graphemeLength;
  }, [content]);

  const remainingChars = MAX_LENGTH - graphemeLength;
  const isOverLimit = remainingChars < 0;
  const canPost =
    content.trim().length > 0 && !isOverLimit && !createPostMutation.isPending && !isUploading;
  const hasMedia = images.length > 0 || video !== null;

  const handlePickImage = async () => {
    if (images.length >= 4 || video) return; // Can't add images if video exists

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 4 - images.length,
      quality: 0.8,
    });

    if (!result.canceled) {
      const newImages = result.assets.map((asset) => ({
        uri: asset.uri,
        mimeType: asset.mimeType || 'image/jpeg',
      }));
      setImages([...images, ...newImages].slice(0, 4));
    }
  };

  const handlePickVideo = async () => {
    if (images.length > 0 || video) return; // Can't add video if images exist or video already selected

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsMultipleSelection: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setVideo({
        uri: asset.uri,
        mimeType: asset.mimeType || 'video/mp4',
      });
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const removeVideo = () => {
    setVideo(null);
  };

  const handlePost = useCallback(async () => {
    if (!canPost) return;
    if (!isAuthenticated) {
      setError('You must be logged in to post');
      return;
    }

    setError(null);
    const mediaCount = video ? 1 : images.length;
    console.log('[Compose] Creating post with', mediaCount, 'media items');

    try {
      let embed;
      setIsUploading(true);

      // Upload video if any (video takes priority, can't have both)
      if (video) {
        // Fetch the video data
        const response = await fetch(video.uri);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // Upload to Bluesky
        const uploadStart = Date.now();
        const uploadResult = await atproto.uploadBlob(uint8Array, video.mimeType);
        console.log('[Compose] Video uploaded in', Date.now() - uploadStart, 'ms');

        embed = {
          $type: 'app.bsky.embed.video',
          video: uploadResult.data.blob,
        };
      }
      // Upload images if any
      else if (images.length > 0) {
        const uploadStart = Date.now();
        const uploadedImages = [];

        for (const image of images) {
          // Fetch the image data
          const response = await fetch(image.uri);
          const blob = await response.blob();
          const arrayBuffer = await blob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);

          // Upload to Bluesky
          const uploadResult = await atproto.uploadBlob(uint8Array, image.mimeType);
          uploadedImages.push({
            alt: '',
            image: uploadResult.data.blob,
          });
        }

        console.log(
          '[Compose]',
          images.length,
          'images uploaded in',
          Date.now() - uploadStart,
          'ms'
        );

        embed = {
          $type: 'app.bsky.embed.images',
          images: uploadedImages,
        };
      }

      setIsUploading(false);

      // Build reply reference if this is a reply
      const reply = isReply
        ? {
            parent: { uri: replyToUri!, cid: replyToCid! },
            root: { uri: rootUri || replyToUri!, cid: rootCid || replyToCid! },
          }
        : undefined;

      const result = await createPostMutation.mutateAsync({
        text: content.trim(),
        reply,
        embed,
      });

      console.log('[Compose] Post created:', result?.uri);

      // Success feedback
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      setContent('');
      setImages([]);
      setVideo(null);
      router.back();
    } catch (err: any) {
      console.error('[Compose] Post creation error:', err.message);
      setError(err.message || 'Failed to create post');
      setIsUploading(false);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }
  }, [
    content,
    images,
    video,
    isAuthenticated,
    isReply,
    replyToUri,
    replyToCid,
    rootUri,
    rootCid,
    createPostMutation,
    canPost,
  ]);

  const handleClose = () => {
    if (content.trim() || images.length > 0 || video) {
      // Could show confirmation dialog here
    }
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
          <Pressable onPress={handleClose} className="w-10 h-10 items-center justify-center">
            <X size={24} color="#FAFAFA" />
          </Pressable>

          <Pressable
            onPress={handlePost}
            disabled={!canPost}
            className={`px-5 py-2 rounded-full ${canPost ? 'bg-primary' : 'bg-surface-elevated'}`}
          >
            {createPostMutation.isPending || isUploading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text className={`font-semibold ${canPost ? 'text-white' : 'text-text-muted'}`}>
                {isReply ? 'Reply' : 'Post'}
              </Text>
            )}
          </Pressable>
        </View>

        {/* Error */}
        {error && (
          <View className="bg-accent-error/20 px-4 py-2">
            <Text className="text-accent-error text-center">{error}</Text>
          </View>
        )}

        {/* Compose Area */}
        <View className="flex-1 px-4 pt-4">
          <View className="flex-row">
            {/* Avatar */}
            {profile?.avatar ? (
              <Image source={{ uri: profile.avatar }} className="w-10 h-10 rounded-full" />
            ) : (
              <View className="w-10 h-10 rounded-full bg-surface-elevated items-center justify-center">
                <Text className="text-text-muted text-lg">
                  {(profile?.handle || handle || 'U')[0].toUpperCase()}
                </Text>
              </View>
            )}

            {/* Text Input */}
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder={isReply ? 'Write your reply...' : "What's happening?"}
              placeholderTextColor="#6B7280"
              multiline
              autoFocus
              className="flex-1 ml-3 text-text-primary text-lg leading-6"
              style={{ textAlignVertical: 'top', minHeight: 100 }}
            />
          </View>

          {/* Images Preview */}
          {images.length > 0 && (
            <View className="flex-row flex-wrap gap-2 mt-4 ml-13">
              {images.map((image, index) => (
                <View key={index} className="relative">
                  <Image
                    source={{ uri: image.uri }}
                    className="w-20 h-20 rounded-lg"
                    resizeMode="cover"
                  />
                  <Pressable
                    onPress={() => removeImage(index)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-black/70 rounded-full items-center justify-center"
                  >
                    <X size={14} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {/* Video Preview */}
          {video && (
            <View className="mt-4 ml-13 relative">
              <View className="w-40 h-24 rounded-lg bg-surface-elevated items-center justify-center border border-border">
                <VideoIcon size={32} color="#10B981" />
                <Text className="text-text-muted text-xs mt-1">Video selected</Text>
              </View>
              <Pressable
                onPress={removeVideo}
                className="absolute -top-2 -right-2 w-6 h-6 bg-black/70 rounded-full items-center justify-center"
              >
                <X size={14} color="#fff" />
              </Pressable>
            </View>
          )}
        </View>

        {/* Bottom Bar */}
        <View className="flex-row items-center justify-between px-4 py-3 border-t border-border">
          {/* Media Buttons */}
          <View className="flex-row gap-4">
            <Pressable
              onPress={handlePickImage}
              disabled={images.length >= 4 || video !== null}
              className={images.length >= 4 || video !== null ? 'opacity-50' : ''}
            >
              <ImageIcon size={24} color="#10B981" />
            </Pressable>
            <Pressable
              onPress={handlePickVideo}
              disabled={images.length > 0 || video !== null}
              className={images.length > 0 || video !== null ? 'opacity-50' : ''}
            >
              <VideoIcon size={24} color="#3B82F6" />
            </Pressable>
          </View>

          {/* Character Count */}
          <Text
            className={`font-medium ${isOverLimit ? 'text-accent-error' : remainingChars < 50 ? 'text-yellow-500' : 'text-text-muted'}`}
          >
            {remainingChars}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
