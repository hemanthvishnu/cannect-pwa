/**
 * Feed Screen - v2.0 Server-Managed Pagination
 * 
 * Displays three feeds:
 * - Global: Cannabis content (server-managed via feed.cannect.space)
 * - Local: Posts from cannect.space users (server-managed via feed.cannect.space)
 * - Following: Posts from users you follow (direct Bluesky API)
 * 
 * v2.0: Simplified client - server handles pagination state
 */

import { View, Text, RefreshControl, ActivityIndicator, Platform, Pressable, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { Leaf } from "lucide-react-native";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import * as Haptics from "expo-haptics";
import { useTimeline } from "@/lib/hooks";
import { useAuthStore } from "@/lib/stores";
import { OfflineBanner } from "@/components/OfflineBanner";
import { MediaViewer } from "@/components/ui/MediaViewer";
import { PostCard, FeedSkeleton } from "@/components/Post";
import { logger } from "@/lib/utils";
import type { AppBskyFeedDefs, AppBskyFeedPost } from '@atproto/api';

type FeedType = 'global' | 'local' | 'following';
type FeedViewPost = AppBskyFeedDefs.FeedViewPost;
type PostView = AppBskyFeedDefs.PostView;

const FEED_SERVICE_URL = 'https://feed.cannect.space';

export default function FeedScreen() {
  const router = useRouter();
  const { did, isAuthenticated } = useAuthStore();
  const { height } = useWindowDimensions();
  const [activeFeed, setActiveFeed] = useState<FeedType>('global');
  const renderStart = useRef(performance.now());
  const listRef = useRef<FlashList<FeedViewPost>>(null);
  
  // === SERVER-MANAGED FEED STATE (Global + Local) ===
  const [globalPosts, setGlobalPosts] = useState<FeedViewPost[]>([]);
  const [globalSession, setGlobalSession] = useState<string | null>(null);
  const [globalHasMore, setGlobalHasMore] = useState(true);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  
  const [localPosts, setLocalPosts] = useState<FeedViewPost[]>([]);
  const [localSession, setLocalSession] = useState<string | null>(null);
  const [localHasMore, setLocalHasMore] = useState(true);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  
  // === FOLLOWING FEED (Direct Bluesky - keep useTimeline for now) ===
  const followingQuery = useTimeline();
  
  // Track render timing
  useEffect(() => {
    const duration = performance.now() - renderStart.current;
    logger.render.screen('FeedScreen', duration);
  }, []);
  
  // === FEED API CALLS ===
  
  // Convert server post format to FeedViewPost
  const convertPost = (p: any): FeedViewPost => ({
    post: {
      uri: p.uri,
      cid: p.cid,
      author: p.author,
      record: p.record,
      embed: p.embed,
      likeCount: p.likeCount || 0,
      repostCount: p.repostCount || 0,
      replyCount: p.replyCount || 0,
      indexedAt: p.indexedAt,
      viewer: {},
      labels: [],
    },
  });
  
  // Load initial global feed
  const loadGlobalFeed = useCallback(async () => {
    if (globalLoading) return;
    setGlobalLoading(true);
    setGlobalError(null);
    
    try {
      const res = await fetch(`${FEED_SERVICE_URL}/feed/global`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      setGlobalPosts(data.posts.map(convertPost));
      setGlobalSession(data.session);
      setGlobalHasMore(data.hasMore);
      logger.info('network', 'feed_fetch', `global: ${data.posts.length} posts`, { postCount: data.posts.length });
    } catch (err: any) {
      setGlobalError(err.message);
      logger.error('network', 'feed_fetch', err.message);
    } finally {
      setGlobalLoading(false);
    }
  }, [globalLoading]);
  
  // Load more global posts
  const loadMoreGlobal = useCallback(async () => {
    if (globalLoading || !globalHasMore || !globalSession) return;
    setGlobalLoading(true);
    
    try {
      const res = await fetch(`${FEED_SERVICE_URL}/feed/global/more`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Session': globalSession 
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      setGlobalPosts(prev => [...prev, ...data.posts.map(convertPost)]);
      setGlobalHasMore(data.hasMore);
      logger.info('network', 'feed_more', `global: +${data.posts.length} posts`, { postCount: data.posts.length });
    } catch (err: any) {
      console.error('[Feed] Load more error:', err);
    } finally {
      setGlobalLoading(false);
    }
  }, [globalLoading, globalHasMore, globalSession]);
  
  // Refresh global feed
  const refreshGlobal = useCallback(async () => {
    setGlobalLoading(true);
    
    try {
      const res = await fetch(`${FEED_SERVICE_URL}/feed/global/refresh`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(globalSession && { 'X-Session': globalSession })
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      setGlobalPosts(data.posts.map(convertPost)); // Replace, not append
      setGlobalSession(data.session);
      setGlobalHasMore(data.hasMore);
    } catch (err: any) {
      console.error('[Feed] Refresh error:', err);
    } finally {
      setGlobalLoading(false);
    }
  }, [globalSession]);
  
  // Load initial local feed
  const loadLocalFeed = useCallback(async () => {
    if (localLoading) return;
    setLocalLoading(true);
    setLocalError(null);
    
    try {
      const res = await fetch(`${FEED_SERVICE_URL}/feed/local`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      setLocalPosts(data.posts.map(convertPost));
      setLocalSession(data.session);
      setLocalHasMore(data.hasMore);
      logger.info('network', 'feed_fetch', `local: ${data.posts.length} posts`, { postCount: data.posts.length });
    } catch (err: any) {
      setLocalError(err.message);
      logger.error('network', 'feed_fetch', err.message);
    } finally {
      setLocalLoading(false);
    }
  }, [localLoading]);
  
  // Load more local posts
  const loadMoreLocal = useCallback(async () => {
    if (localLoading || !localHasMore || !localSession) return;
    setLocalLoading(true);
    
    try {
      const res = await fetch(`${FEED_SERVICE_URL}/feed/local/more`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Session': localSession 
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      setLocalPosts(prev => [...prev, ...data.posts.map(convertPost)]);
      setLocalHasMore(data.hasMore);
      logger.info('network', 'feed_more', `local: +${data.posts.length} posts`, { postCount: data.posts.length });
    } catch (err: any) {
      console.error('[Feed] Load more error:', err);
    } finally {
      setLocalLoading(false);
    }
  }, [localLoading, localHasMore, localSession]);
  
  // Refresh local feed
  const refreshLocal = useCallback(async () => {
    setLocalLoading(true);
    
    try {
      const res = await fetch(`${FEED_SERVICE_URL}/feed/local/refresh`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(localSession && { 'X-Session': localSession })
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      setLocalPosts(data.posts.map(convertPost)); // Replace, not append
      setLocalSession(data.session);
      setLocalHasMore(data.hasMore);
    } catch (err: any) {
      console.error('[Feed] Refresh error:', err);
    } finally {
      setLocalLoading(false);
    }
  }, [localSession]);
  
  // Load initial feeds on mount
  useEffect(() => {
    if (isAuthenticated) {
      loadGlobalFeed();
      loadLocalFeed();
    }
  }, [isAuthenticated]);
  
  // === DERIVED STATE ===
  
  const posts = useMemo(() => {
    if (activeFeed === 'global') return globalPosts;
    if (activeFeed === 'local') return localPosts;
    // Following uses React Query
    return followingQuery.data?.pages?.flatMap(page => page.feed) || [];
  }, [activeFeed, globalPosts, localPosts, followingQuery.data]);
  
  const isLoading = useMemo(() => {
    if (activeFeed === 'global') return globalLoading && globalPosts.length === 0;
    if (activeFeed === 'local') return localLoading && localPosts.length === 0;
    return followingQuery.isLoading;
  }, [activeFeed, globalLoading, globalPosts.length, localLoading, localPosts.length, followingQuery.isLoading]);
  
  const isRefreshing = useMemo(() => {
    if (activeFeed === 'global') return globalLoading && globalPosts.length > 0;
    if (activeFeed === 'local') return localLoading && localPosts.length > 0;
    return followingQuery.isRefetching;
  }, [activeFeed, globalLoading, globalPosts.length, localLoading, localPosts.length, followingQuery.isRefetching]);
  
  const hasMore = useMemo(() => {
    if (activeFeed === 'global') return globalHasMore;
    if (activeFeed === 'local') return localHasMore;
    return followingQuery.hasNextPage;
  }, [activeFeed, globalHasMore, localHasMore, followingQuery.hasNextPage]);
  
  const feedError = useMemo(() => {
    if (activeFeed === 'global') return globalError;
    if (activeFeed === 'local') return localError;
    return followingQuery.isError ? 'Failed to load' : null;
  }, [activeFeed, globalError, localError, followingQuery.isError]);
  
  // === HANDLERS ===
  
  const handleTabChange = useCallback((feed: FeedType) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setActiveFeed(feed);
    // Scroll to top when switching tabs
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);
  
  const handleRefresh = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (activeFeed === 'global') refreshGlobal();
    else if (activeFeed === 'local') refreshLocal();
    else followingQuery.refetch();
  }, [activeFeed, refreshGlobal, refreshLocal, followingQuery]);
  
  const handleLoadMore = useCallback(() => {
    if (activeFeed === 'global') loadMoreGlobal();
    else if (activeFeed === 'local') loadMoreLocal();
    else if (followingQuery.hasNextPage && !followingQuery.isFetchingNextPage) {
      followingQuery.fetchNextPage();
    }
  }, [activeFeed, loadMoreGlobal, loadMoreLocal, followingQuery]);
  
  // Media viewer state
  const [mediaViewerVisible, setMediaViewerVisible] = useState(false);
  const [mediaViewerImages, setMediaViewerImages] = useState<string[]>([]);
  const [mediaViewerIndex, setMediaViewerIndex] = useState(0);
  
  // Web refresh indicator
  const [showRefreshHint, setShowRefreshHint] = useState(false);

  // Open image viewer
  const handleImagePress = useCallback((images: string[], index: number) => {
    setMediaViewerImages(images);
    setMediaViewerIndex(index);
    setMediaViewerVisible(true);
  }, []);

  const handlePostPress = useCallback((post: PostView) => {
    // Navigate to thread view using DID and rkey
    const uriParts = post.uri.split('/');
    const rkey = uriParts[uriParts.length - 1];
    router.push(`/post/${post.author.did}/${rkey}`);
  }, [router]);

  // Error state
  if (feedError) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center px-6">
        <Text className="text-text-primary text-lg font-semibold mb-2">Failed to load feed</Text>
        <Text className="text-text-muted mb-4">{feedError}</Text>
        <Pressable onPress={handleRefresh} className="bg-primary px-6 py-3 rounded-full">
          <Text className="text-white font-bold">Retry</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* Header with Logo */}
      <View className="flex-row items-center justify-center px-5 py-3 border-b border-border">
        <Leaf size={24} color="#10B981" />
        <Text className="text-xl font-bold text-text-primary ml-2">Cannect</Text>
      </View>

      {/* Feed Tabs */}
      <View className="flex-row border-b border-border">
        <Pressable 
          onPress={() => handleTabChange('global')}
          className={`flex-1 py-3 items-center ${activeFeed === 'global' ? 'border-b-2 border-primary' : ''}`}
        >
          <Text className={`font-semibold ${activeFeed === 'global' ? 'text-primary' : 'text-text-muted'}`}>
            Global
          </Text>
        </Pressable>
        <Pressable 
          onPress={() => handleTabChange('local')}
          className={`flex-1 py-3 items-center ${activeFeed === 'local' ? 'border-b-2 border-primary' : ''}`}
        >
          <Text className={`font-semibold ${activeFeed === 'local' ? 'text-primary' : 'text-text-muted'}`}>
            Local
          </Text>
        </Pressable>
        <Pressable 
          onPress={() => handleTabChange('following')}
          className={`flex-1 py-3 items-center ${activeFeed === 'following' ? 'border-b-2 border-primary' : ''}`}
        >
          <Text className={`font-semibold ${activeFeed === 'following' ? 'text-primary' : 'text-text-muted'}`}>
            Following
          </Text>
        </Pressable>
      </View>

      {/* Offline Banner */}
      <OfflineBanner />

      {/* Loading skeleton */}
      {isLoading ? (
        <FeedSkeleton />
      ) : (
        <View style={{ flex: 1, minHeight: Math.max(200, height - 200) }} className="flex-1">
          <FlashList
            ref={listRef}
            data={posts}
            keyExtractor={(item, index) => `${activeFeed}-${item.post.uri}-${index}`}
            renderItem={({ item }) => (
              <PostCard
                item={item}
                onPress={() => handlePostPress(item.post)}
                onImagePress={handleImagePress}
              />
            )}
            estimatedItemSize={280}
            drawDistance={300}
            ListHeaderComponent={
              Platform.OS === 'web' && (showRefreshHint || isRefreshing) ? (
                <Pressable 
                  onPress={handleRefresh}
                  className="py-3 items-center border-b border-border"
                >
                  {isRefreshing ? (
                    <ActivityIndicator size="small" color="#10B981" />
                  ) : (
                    <View className="flex-row items-center">
                      <Text className="text-text-muted text-sm">Tap to refresh</Text>
                    </View>
                  )}
                </Pressable>
              ) : null
            }
            onScroll={(e) => {
              if (Platform.OS === 'web') {
                const y = e.nativeEvent.contentOffset.y;
                setShowRefreshHint(y <= 0);
              }
            }}
            scrollEventThrottle={16}
            refreshControl={
              <RefreshControl 
                refreshing={isRefreshing} 
                onRefresh={handleRefresh} 
                tintColor="#10B981"
                colors={["#10B981"]}
              />
            }
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            contentContainerStyle={{ paddingBottom: 20 }}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center py-20">
                <Text className="text-text-muted text-center">
                  {activeFeed === 'global' 
                    ? 'No cannabis content found.\nCheck back later!' 
                    : activeFeed === 'local'
                      ? 'No posts from Cannect users yet.\nBe the first to post!'
                      : 'Your timeline is empty.\nFollow some people to see their posts!'}
                </Text>
              </View>
            }
            ListFooterComponent={
              hasMore && posts.length > 0 ? (
                <View className="py-4 items-center">
                  <ActivityIndicator size="small" color="#10B981" />
                </View>
              ) : posts.length > 0 ? (
                <View className="py-4 items-center">
                  <Text className="text-text-muted text-sm">You've reached the end!</Text>
                </View>
              ) : null
            }
          />
        </View>
      )}
      
      {/* Media Viewer */}
      <MediaViewer
        isVisible={mediaViewerVisible}
        images={mediaViewerImages}
        initialIndex={mediaViewerIndex}
        onClose={() => setMediaViewerVisible(false)}
      />
    </SafeAreaView>
  );
}
