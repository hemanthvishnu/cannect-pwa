import { useState, useCallback, useEffect, useRef } from "react";
import { 
  View, 
  Text, 
  TextInput, 
  Pressable, 
  ActivityIndicator, 
  KeyboardAvoidingView, 
  Platform, 
  ScrollView,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { 
  X, 
  Image as ImageIcon, 
  Video, 
  Trash2, 
  Play,
  AlertCircle,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import Animated, { 
  FadeIn, 
  FadeOut, 
  useAnimatedStyle, 
  withSpring,
  useSharedValue,
} from "react-native-reanimated";

import { useCreatePost, useMediaUpload, usePWAPersistence } from "@/lib/hooks";
import { useAuthStore } from "@/lib/stores";
import { router } from "expo-router";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_GAP = 8;

export default function ComposeScreen() {
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const createPost = useCreatePost();
  const { user, profile, isAuthenticated } = useAuthStore();
  const media = useMediaUpload(4);
  
  // 💎 Draft persistence
  const { saveDraft, getDraft, clearDraft } = usePWAPersistence();
  const draftLoadedRef = useRef(false);

  // Progress bar animation
  const progressWidth = useSharedValue(0);
  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  // Update progress animation
  if (media.isUploading) {
    progressWidth.value = withSpring(media.uploadProgress, { damping: 15 });
  }

  // 💎 Restore Draft on Mount
  useEffect(() => {
    if (draftLoadedRef.current) return;
    
    getDraft().then((draft) => {
      if (draft && !content) {
        setContent(draft.content);
        draftLoadedRef.current = true;
        
        // Subtle haptic to indicate draft restored
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        console.log('[Compose] Draft restored from', new Date(draft.savedAt).toLocaleString());
      }
    });
  }, []);

  // 💎 Auto-save Draft (debounced - 1 second after typing stops)
  useEffect(() => {
    if (!content.trim()) return;
    
    const timeoutId = setTimeout(() => {
      saveDraft(content);
    }, 1000);
    
    return () => clearTimeout(timeoutId);
  }, [content, saveDraft]);

  // =====================================================
  // Handle Post
  // =====================================================
  const handlePost = useCallback(async () => {
    if (!content.trim() && !media.hasMedia) return;
    
    if (!isAuthenticated || !user) {
      setError("You must be logged in to post");
      return;
    }
    
    setError(null);
    
    try {
      // 1. Upload media first (if any)
      let mediaUrls: string[] | undefined;
      let videoUrl: string | undefined;
      let videoThumbnailUrl: string | undefined;

      if (media.hasMedia) {
        const results = await media.uploadAll();
        
        if (media.isVideo && results[0]) {
          videoUrl = results[0].url;
          videoThumbnailUrl = results[0].thumbnailUrl;
        } else {
          mediaUrls = results.map(r => r.url);
        }
      }

      // 2. Create post with media URLs
      await createPost.mutateAsync({ 
        content: content.trim(), 
        mediaUrls,
        videoUrl,
        videoThumbnailUrl,
      });

      // 3. 💎 Clear draft only on success (if post fails, draft stays!)
      await clearDraft();

      // 4. Success feedback
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      setContent("");
      media.reset();
      router.back();

    } catch (err: any) {
      console.error("Failed to create post:", err);
      setError(err.message || "Failed to create post");
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }
  }, [content, media, user, isAuthenticated, createPost]);

  // =====================================================
  // Media Grid Layout Calculator
  // =====================================================
  const getMediaGridStyle = (index: number, total: number) => {
    const containerWidth = SCREEN_WIDTH - 32 - 44 - 12; // padding - avatar - gap
    
    if (total === 1) {
      return { width: containerWidth, aspectRatio: media.isVideo ? 16/9 : 4/3 };
    }
    if (total === 2) {
      const itemWidth = (containerWidth - GRID_GAP) / 2;
      return { width: itemWidth, aspectRatio: 1 };
    }
    if (total === 3) {
      if (index === 0) {
        return { width: containerWidth, aspectRatio: 16/9 };
      }
      const itemWidth = (containerWidth - GRID_GAP) / 2;
      return { width: itemWidth, aspectRatio: 1 };
    }
    // 4 items: 2x2 grid
    const itemWidth = (containerWidth - GRID_GAP) / 2;
    return { width: itemWidth, aspectRatio: 1 };
  };

  // =====================================================
  // Validation
  // =====================================================
  const charCount = content.length;
  const maxChars = 280;
  const isOverLimit = charCount > maxChars;
  const canPost = (content.trim() || media.hasMedia) && !isOverLimit && !media.isUploading && !createPost.isPending;

  // =====================================================
  // Render
  // =====================================================
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        className="flex-1"
      >
        {/* ========================================
            Header
        ======================================== */}
        <View className="flex-row justify-between items-center px-4 py-3 border-b border-border">
          <Pressable 
            onPress={() => router.back()} 
            className="p-2 -ml-2"
            hitSlop={8}
          >
            <X size={24} color="#FAFAFA" />
          </Pressable>

          <Pressable
            onPress={handlePost}
            disabled={!canPost}
            className={`bg-primary px-5 py-2.5 rounded-full ${!canPost ? 'opacity-50' : ''}`}
          >
            {createPost.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text className="text-white font-semibold text-base">Post</Text>
            )}
          </Pressable>
        </View>

        {/* ========================================
            Error Banner
        ======================================== */}
        {(error || media.error) && (
          <Animated.View 
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            className="flex-row items-center bg-accent-error/20 border border-accent-error/50 mx-4 mt-4 p-3 rounded-xl"
          >
            <AlertCircle size={18} color="#EF4444" />
            <Text className="text-accent-error flex-1 ml-2">{error || media.error}</Text>
            <Pressable onPress={() => setError(null)}>
              <X size={16} color="#EF4444" />
            </Pressable>
          </Animated.View>
        )}

        {/* ========================================
            Upload Progress Bar
        ======================================== */}
        {media.isUploading && (
          <Animated.View 
            entering={FadeIn.duration(200)}
            className="mx-4 mt-4"
          >
            <View className="h-2 bg-surface rounded-full overflow-hidden">
              <Animated.View 
                className="h-full bg-primary rounded-full"
                style={progressStyle}
              />
            </View>
            <Text className="text-text-muted text-xs text-center mt-2">
              {media.isVideo ? 'Uploading video' : `Uploading image ${Math.min(media.assets.length, Math.floor(media.uploadProgress / (100 / media.assets.length)) + 1)} of ${media.assets.length}`}
              ... {Math.round(media.uploadProgress)}%
            </Text>
          </Animated.View>
        )}

        {/* ========================================
            Content Area
        ======================================== */}
        <ScrollView 
          className="flex-1" 
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-row px-4 pt-4">
            {/* Avatar */}
            <View className="w-11 h-11 rounded-full bg-primary items-center justify-center overflow-hidden">
              {profile?.avatar_url ? (
                <Image 
                  source={{ uri: profile.avatar_url }} 
                  style={{ width: 44, height: 44 }}
                  contentFit="cover"
                />
              ) : (
                <Text className="text-white text-lg font-semibold">
                  {user?.email?.[0]?.toUpperCase() || "U"}
                </Text>
              )}
            </View>

            {/* Text Input */}
            <TextInput
              placeholder="What's happening?"
              placeholderTextColor="#6B6B6B"
              value={content}
              onChangeText={setContent}
              multiline
              className="flex-1 ml-3 text-lg text-text-primary"
              style={{ textAlignVertical: "top", minHeight: 100 }}
              autoFocus
              editable={!media.isUploading && !createPost.isPending}
            />
          </View>

          {/* ========================================
              Media Preview Grid
          ======================================== */}
          {media.hasMedia && (
            <Animated.View 
              entering={FadeIn.duration(300)}
              className="px-4 mt-4 ml-14"
            >
              <View className="flex-row flex-wrap" style={{ gap: GRID_GAP }}>
                {media.assets.map((asset, index) => {
                  const gridStyle = getMediaGridStyle(index, media.assets.length);
                  
                  return (
                    <Animated.View 
                      key={`${asset.uri}-${index}`}
                      entering={FadeIn.delay(index * 100).duration(200)}
                      className="relative"
                      style={gridStyle}
                    >
                      <Image
                        source={{ uri: asset.uri }}
                        className="rounded-xl bg-surface w-full h-full"
                        contentFit="cover"
                        transition={200}
                      />

                      {/* Video Overlay */}
                      {asset.type === 'video' && (
                        <View className="absolute inset-0 items-center justify-center">
                          <View className="bg-black/60 rounded-full p-4">
                            <Play size={32} color="white" fill="white" />
                          </View>
                          {asset.duration && (
                            <View className="absolute bottom-2 right-2 bg-black/70 px-2 py-0.5 rounded">
                              <Text className="text-white text-xs font-medium">
                                {Math.floor(asset.duration / 60)}:{String(Math.floor(asset.duration % 60)).padStart(2, '0')}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      {/* Remove Button */}
                      <Pressable
                        onPress={() => media.removeAsset(index)}
                        disabled={media.isUploading}
                        className="absolute top-2 right-2 bg-black/70 rounded-full p-1.5"
                        hitSlop={8}
                      >
                        <Trash2 size={14} color="white" />
                      </Pressable>

                      {/* Upload Progress Overlay */}
                      {media.isUploading && (
                        <View className="absolute inset-0 bg-black/40 rounded-xl items-center justify-center">
                          <ActivityIndicator color="white" />
                        </View>
                      )}
                    </Animated.View>
                  );
                })}
              </View>
            </Animated.View>
          )}

          {/* Spacer for keyboard */}
          <View className="h-20" />
        </ScrollView>

        {/* ========================================
            Bottom Toolbar
        ======================================== */}
        <View className="flex-row justify-between items-center px-4 py-3 border-t border-border bg-background">
          <View className="flex-row gap-5">
            {/* Image Picker */}
            <Pressable 
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                media.selectImages();
              }}
              disabled={!media.canAddMore || media.isUploading}
              className={!media.canAddMore || media.isUploading ? 'opacity-30' : ''}
              hitSlop={8}
            >
              <ImageIcon size={24} color="#10B981" />
            </Pressable>

            {/* Video Picker */}
            <Pressable 
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                media.selectVideo();
              }}
              disabled={media.hasMedia || media.isUploading}
              className={media.hasMedia || media.isUploading ? 'opacity-30' : ''}
              hitSlop={8}
            >
              <Video size={24} color="#3B82F6" />
            </Pressable>
          </View>

          {/* Character Count */}
          <Text className={`text-sm font-medium ${
            isOverLimit 
              ? 'text-accent-error' 
              : charCount > maxChars * 0.9 
                ? 'text-yellow-500' 
                : 'text-text-muted'
          }`}>
            {charCount}/{maxChars}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
