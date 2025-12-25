/**
 * Compose Screen - Pure AT Protocol
 */

import { useState, useCallback } from "react";
import { 
  View, 
  Text, 
  TextInput, 
  Pressable, 
  ActivityIndicator, 
  KeyboardAvoidingView, 
  Platform, 
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { X, Image as ImageIcon } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from "expo-router";
import { useCreatePost } from "@/lib/hooks";
import { useAuthStore } from "@/lib/stores";
import * as atproto from "@/lib/atproto/agent";

const MAX_LENGTH = 300; // Bluesky character limit

export default function ComposeScreen() {
  const { 
    replyToUri, 
    replyToCid,
    rootUri,
    rootCid,
  } = useLocalSearchParams<{
    replyToUri?: string;
    replyToCid?: string;
    rootUri?: string;
    rootCid?: string;
  }>();
  
  const isReply = !!(replyToUri && replyToCid);
  
  const [content, setContent] = useState("");
  const [images, setImages] = useState<{ uri: string; mimeType: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const createPostMutation = useCreatePost();
  const { isAuthenticated, profile, handle } = useAuthStore();

  const remainingChars = MAX_LENGTH - content.length;
  const isOverLimit = remainingChars < 0;
  const canPost = content.trim().length > 0 && !isOverLimit && !createPostMutation.isPending && !isUploading;

  const handlePickImage = async () => {
    if (images.length >= 4) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 4 - images.length,
      quality: 0.8,
    });

    if (!result.canceled) {
      const newImages = result.assets.map(asset => ({
        uri: asset.uri,
        mimeType: asset.mimeType || 'image/jpeg',
      }));
      setImages([...images, ...newImages].slice(0, 4));
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handlePost = useCallback(async () => {
    if (!canPost) return;
    if (!isAuthenticated) {
      setError("You must be logged in to post");
      return;
    }
    
    setError(null);
    
    try {
      let embed;
      
      // Upload images if any
      if (images.length > 0) {
        setIsUploading(true);
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
        
        setIsUploading(false);
        
        embed = {
          $type: 'app.bsky.embed.images',
          images: uploadedImages,
        };
      }

      // Build reply reference if this is a reply
      const reply = isReply ? {
        parent: { uri: replyToUri!, cid: replyToCid! },
        root: { uri: rootUri || replyToUri!, cid: rootCid || replyToCid! },
      } : undefined;

      await createPostMutation.mutateAsync({
        text: content.trim(),
        reply,
        embed,
      });
      
      // Success feedback
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      
      setContent("");
      setImages([]);
      router.back();
    } catch (err: any) {
      setError(err.message || "Failed to create post");
      setIsUploading(false);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }
  }, [content, images, isAuthenticated, isReply, replyToUri, replyToCid, rootUri, rootCid, createPostMutation, canPost]);

  const handleClose = () => {
    if (content.trim() || images.length > 0) {
      // Could show confirmation dialog here
    }
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
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
              placeholder={isReply ? "Write your reply..." : "What's happening?"}
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
        </View>

        {/* Bottom Bar */}
        <View className="flex-row items-center justify-between px-4 py-3 border-t border-border">
          {/* Media Buttons */}
          <View className="flex-row gap-4">
            <Pressable 
              onPress={handlePickImage}
              disabled={images.length >= 4}
              className={images.length >= 4 ? 'opacity-50' : ''}
            >
              <ImageIcon size={24} color="#10B981" />
            </Pressable>
          </View>

          {/* Character Count */}
          <Text className={`font-medium ${isOverLimit ? 'text-accent-error' : remainingChars < 50 ? 'text-yellow-500' : 'text-text-muted'}`}>
            {remainingChars}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
