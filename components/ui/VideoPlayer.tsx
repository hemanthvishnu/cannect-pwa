import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, Pressable, Text, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus, Audio } from 'expo-av';
import { Play, Pause, Volume2, VolumeX, Maximize2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { 
  FadeIn, 
  FadeOut, 
  useAnimatedStyle, 
  useSharedValue, 
  withTiming,
} from 'react-native-reanimated';

interface VideoPlayerProps {
  url: string;
  thumbnailUrl?: string;
  aspectRatio?: number;
  shouldPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  onFullscreen?: () => void;
}

export function VideoPlayer({
  url,
  thumbnailUrl,
  aspectRatio = 16 / 9,
  shouldPlay = false,
  muted: initialMuted = true,
  loop = true,
  onFullscreen,
}: VideoPlayerProps) {
  const videoRef = useRef<Video>(null);
  const [status, setStatus] = useState<AVPlaybackStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isMuted, setIsMuted] = useState(initialMuted);

  // Derived state
  const isPlaying = status?.isLoaded && status.isPlaying;
  const progress = status?.isLoaded ? (status.positionMillis / (status.durationMillis || 1)) * 100 : 0;
  const duration = status?.isLoaded ? status.durationMillis || 0 : 0;
  const position = status?.isLoaded ? status.positionMillis || 0 : 0;

  // Progress bar animation
  const progressWidth = useSharedValue(0);
  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  // Enable audio in silent mode (standard social media behavior)
  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
  }, []);

  useEffect(() => {
    progressWidth.value = withTiming(progress, { duration: 100 });
  }, [progress]);

  // Auto-hide controls after 3 seconds of playing
  useEffect(() => {
    if (isPlaying && showControls) {
      const timer = setTimeout(() => setShowControls(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isPlaying, showControls]);

  // =====================================================
  // Handlers
  // =====================================================
  
  const handlePlayPause = useCallback(async () => {
    if (!videoRef.current) return;

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
  }, [isPlaying]);

  const handleMuteToggle = useCallback(async () => {
    if (!videoRef.current) return;

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const newMuted = !isMuted;
    setIsMuted(newMuted);
    await videoRef.current.setIsMutedAsync(newMuted);
  }, [isMuted]);

  const handlePress = useCallback(() => {
    setShowControls(prev => !prev);
  }, []);

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // =====================================================
  // Render
  // =====================================================

  if (hasError) {
    return (
      <View 
        className="bg-surface items-center justify-center rounded-xl"
        style={{ aspectRatio }}
      >
        <Text className="text-text-muted">Failed to load video</Text>
      </View>
    );
  }

  return (
    <Pressable 
      onPress={handlePress}
      className="relative rounded-xl overflow-hidden bg-black"
      style={{ aspectRatio }}
    >
      {/* Video */}
      <Video
        ref={videoRef}
        source={{ uri: url }}
        posterSource={thumbnailUrl ? { uri: thumbnailUrl } : undefined}
        usePoster={!!thumbnailUrl}
        posterStyle={{ resizeMode: 'cover' }}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay={shouldPlay}
        isMuted={isMuted}
        isLooping={loop}
        onPlaybackStatusUpdate={(s) => {
          setStatus(s);
          if (s.isLoaded) setIsLoading(false);
        }}
        onError={(error) => {
          console.error('Video error:', error);
          setHasError(true);
        }}
      />

      {/* Loading Spinner */}
      {isLoading && (
        <View className="absolute inset-0 items-center justify-center bg-black/20">
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      )}

      {/* Controls Overlay */}
      {showControls && !isLoading && (
        <Animated.View 
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
          className="absolute inset-0"
        >
          {/* Gradient overlay */}
          <View className="absolute inset-0 bg-black/20" />

          {/* Center Play/Pause */}
          <Pressable 
            onPress={handlePlayPause}
            className="absolute inset-0 items-center justify-center"
          >
            <View className="bg-black/60 rounded-full p-4">
              {isPlaying ? (
                <Pause size={32} color="white" fill="white" />
              ) : (
                <Play size={32} color="white" fill="white" />
              )}
            </View>
          </Pressable>

          {/* Bottom Controls */}
          <View className="absolute bottom-0 left-0 right-0 px-3 pb-3">
            {/* Progress Bar */}
            <View className="h-1 bg-white/30 rounded-full mb-2 overflow-hidden">
              <Animated.View 
                className="h-full bg-primary rounded-full"
                style={progressStyle}
              />
            </View>

            {/* Controls Row */}
            <View className="flex-row items-center justify-between">
              {/* Time */}
              <Text className="text-white text-xs font-medium">
                {formatTime(position)} / {formatTime(duration)}
              </Text>

              {/* Right Controls */}
              <View className="flex-row items-center gap-3">
                {/* Mute Toggle */}
                <Pressable onPress={handleMuteToggle} hitSlop={8}>
                  {isMuted ? (
                    <VolumeX size={18} color="white" />
                  ) : (
                    <Volume2 size={18} color="white" />
                  )}
                </Pressable>

                {/* Fullscreen */}
                {onFullscreen && (
                  <Pressable onPress={onFullscreen} hitSlop={8}>
                    <Maximize2 size={18} color="white" />
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        </Animated.View>
      )}
    </Pressable>
  );
}
