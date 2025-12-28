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

import { View, Text, RefreshControl, ActivityIndicator, Platform, Pressable, Share as RNShare, Linking, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { Leaf, Heart, MessageCircle, Repeat2, Share, ExternalLink, ImageOff, MoreHorizontal } from "lucide-react-native";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import * as Haptics from "expo-haptics";
import { useTimeline, useLikePost, useUnlikePost, useRepost, useDeleteRepost, useDeletePost } from "@/lib/hooks";
import { useAuthStore } from "@/lib/stores";
import { OfflineBanner } from "@/components/OfflineBanner";
import { RepostMenu } from "@/components/social/RepostMenu";
import { PostOptionsMenu } from "@/components/social/PostOptionsMenu";
import { MediaViewer } from "@/components/ui/MediaViewer";
import { VideoPlayer } from "@/components/ui/VideoPlayer";
import { logger } from "@/lib/utils";
import type { AppBskyFeedDefs, AppBskyFeedPost } from '@atproto/api';

type FeedType = 'global' | 'local' | 'following';
type FeedViewPost = AppBskyFeedDefs.FeedViewPost;
type PostView = AppBskyFeedDefs.PostView;

const FEED_SERVICE_URL = 'https://feed.cannect.space';

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}

function FeedItem({ 
  item, 
  onPress,
  onLike,
  onRepost,
  onReply,
  onAuthorPress,
  onShare,
  onImagePress,
  onOptionsPress,
}: { 
  item: FeedViewPost;
  onPress: () => void;
  onLike: () => void;
  onRepost: () => void;
  onReply: () => void;
  onAuthorPress: () => void;
  onShare: () => void;
  onImagePress: (images: string[], index: number) => void;
  onOptionsPress: () => void;
}) {
  const post = item.post;
  const record = post.record as AppBskyFeedPost.Record;
  const author = post.author;
  const isRepost = !!item.reason && item.reason.$type === 'app.bsky.feed.defs#reasonRepost';
  const repostBy = isRepost ? (item.reason as any).by : null;

  // Get embed content
  const embed = post.embed;
  const embedType = embed?.$type;
  
  // Images embed
  const embedImages = embedType === 'app.bsky.embed.images#view' 
    ? (embed as any).images 
    : [];
  
  // Link preview embed
  const linkPreview = embedType === 'app.bsky.embed.external#view'
    ? (embed as any).external
    : null;
  
  // Quote post embed
  const quotedPost = embedType === 'app.bsky.embed.record#view'
    ? (embed as any).record
    : null;
  
  // Record with media (quote + images)
  const recordWithMedia = embedType === 'app.bsky.embed.recordWithMedia#view'
    ? embed as any
    : null;
  
  // Video embed
  const videoEmbed = embedType === 'app.bsky.embed.video#view'
    ? embed as any
    : null;
  
  // Extract media from recordWithMedia
  const recordWithMediaImages = recordWithMedia?.media?.$type === 'app.bsky.embed.images#view'
    ? recordWithMedia.media.images
    : [];
  const recordWithMediaVideo = recordWithMedia?.media?.$type === 'app.bsky.embed.video#view'
    ? recordWithMedia.media
    : null;
  const recordWithMediaQuote = recordWithMedia?.record?.record;

  return (
    <Pressable 
      onPress={onPress}
      className="px-4 py-3 border-b border-border active:bg-surface-elevated/50"
    >
      {/* Repost indicator */}
      {isRepost && repostBy && (
        <View className="flex-row items-center mb-2 pl-10">
          <Repeat2 size={14} color="#6B7280" />
          <Text className="text-text-muted text-xs ml-1">
            Reposted by {repostBy.displayName || repostBy.handle}
          </Text>
        </View>
      )}

      <View className="flex-row">
        {/* Avatar */}
        <Pressable onPress={(e) => { e.stopPropagation(); onAuthorPress(); }}>
          {author.avatar ? (
            <Image 
              source={{ uri: author.avatar }} 
              className="w-10 h-10 rounded-full bg-surface-elevated"
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View className="w-10 h-10 rounded-full bg-surface-elevated items-center justify-center">
              <Text className="text-text-muted text-lg">{author.handle[0].toUpperCase()}</Text>
            </View>
          )}
        </Pressable>

        {/* Content */}
        <View className="flex-1 ml-3">
          {/* Header - Author info (clickable to profile) */}
          <Pressable onPress={(e) => { e.stopPropagation(); onAuthorPress(); }} className="flex-row items-center flex-wrap self-start">
            <Text className="font-semibold text-text-primary flex-shrink" numberOfLines={1}>
              {author.displayName || author.handle}
            </Text>
            <Text className="text-text-muted mx-1">·</Text>
            <Text className="text-text-muted flex-shrink-0">
              {formatTime(record.createdAt)}
            </Text>
          </Pressable>
          {/* Handle (clickable to profile) */}
          <Pressable onPress={(e) => { e.stopPropagation(); onAuthorPress(); }} className="self-start">
            <Text className="text-text-muted text-sm" numberOfLines={1}>
              @{author.handle}
            </Text>
          </Pressable>

          {/* Post text */}
          <Text className="text-text-primary mt-1 leading-5">
            {record.text}
          </Text>

          {/* Images - tap to view full size */}
          {embedImages.length > 0 && (
            <View className="mt-2 rounded-xl overflow-hidden">
              {embedImages.length === 1 ? (
                <Pressable 
                  onPress={(e) => { e.stopPropagation(); onImagePress([embedImages[0].fullsize || embedImages[0].thumb], 0); }}
                >
                  <Image 
                    source={{ uri: embedImages[0].thumb }} 
                    className="w-full h-48 rounded-xl bg-surface-elevated"
                    contentFit="cover"
                    transition={200}
                  />
                </Pressable>
              ) : (
                <View className="flex-row flex-wrap gap-1">
                  {embedImages.slice(0, 4).map((img: any, idx: number) => (
                    <Pressable 
                      key={idx}
                      onPress={(e) => { e.stopPropagation(); onImagePress(
                        embedImages.map((i: any) => i.fullsize || i.thumb), 
                        idx
                      ); }}
                      className="w-[48%]"
                    >
                      <Image 
                        source={{ uri: img.thumb }} 
                        className="w-full h-32 rounded-lg bg-surface-elevated"
                        contentFit="cover"
                        transition={200}
                      />
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}
          
          {/* Link Preview Card */}
          {linkPreview && (
            <Pressable 
              onPress={(e) => { e.stopPropagation(); Linking.openURL(linkPreview.uri); }}
              className="mt-2 border border-border rounded-xl overflow-hidden"
            >
              {linkPreview.thumb && (
                <Image 
                  source={{ uri: linkPreview.thumb }}
                  className="w-full h-32 bg-surface-elevated"
                  contentFit="cover"
                  transition={200}
                />
              )}
              <View className="p-3">
                <Text className="text-text-primary font-medium" numberOfLines={2}>
                  {linkPreview.title}
                </Text>
                {linkPreview.description && (
                  <Text className="text-text-muted text-sm mt-1" numberOfLines={2}>
                    {linkPreview.description}
                  </Text>
                )}
                <View className="flex-row items-center mt-2">
                  <ExternalLink size={12} color="#6B7280" />
                  <Text className="text-text-muted text-xs ml-1">
                    {new URL(linkPreview.uri).hostname}
                  </Text>
                </View>
              </View>
            </Pressable>
          )}
          
          {/* Quote Post */}
          {quotedPost && quotedPost.$type === 'app.bsky.embed.record#viewRecord' && (
            <View className="mt-2 border border-border rounded-xl p-3">
              <View className="flex-row items-center mb-1">
                {quotedPost.author?.avatar && (
                  <Image 
                    source={{ uri: quotedPost.author.avatar }}
                    className="w-5 h-5 rounded-full mr-2 bg-surface-elevated"
                    contentFit="cover"
                    transition={150}
                  />
                )}
                <Text className="text-text-primary font-medium text-sm">
                  {quotedPost.author?.displayName || quotedPost.author?.handle}
                </Text>
                <Text className="text-text-muted text-sm ml-1">
                  @{quotedPost.author?.handle}
                </Text>
              </View>
              <Text className="text-text-primary text-sm" numberOfLines={3}>
                {(quotedPost.value as any)?.text}
              </Text>
            </View>
          )}
          
          {/* Video Embed */}
          {videoEmbed && (
            <View className="mt-2 rounded-xl overflow-hidden">
              <VideoPlayer
                url={videoEmbed.playlist}
                thumbnailUrl={videoEmbed.thumbnail}
                aspectRatio={videoEmbed.aspectRatio?.width && videoEmbed.aspectRatio?.height 
                  ? videoEmbed.aspectRatio.width / videoEmbed.aspectRatio.height 
                  : 16 / 9}
                muted={true}
                loop={true}
              />
            </View>
          )}
          
          {/* Record with Media (Quote + Images/Video) */}
          {recordWithMedia && (
            <>
              {/* Images from recordWithMedia */}
              {recordWithMediaImages.length > 0 && (
                <View className="mt-2 rounded-xl overflow-hidden">
                  {recordWithMediaImages.length === 1 ? (
                    <Pressable 
                      onPress={(e) => { e.stopPropagation(); onImagePress([recordWithMediaImages[0].fullsize || recordWithMediaImages[0].thumb], 0); }}
                    >
                      <Image 
                        source={{ uri: recordWithMediaImages[0].thumb }} 
                        className="w-full h-48 rounded-xl bg-surface-elevated"
                        contentFit="cover"
                        transition={200}
                      />
                    </Pressable>
                  ) : (
                    <View className="flex-row flex-wrap gap-1">
                      {recordWithMediaImages.slice(0, 4).map((img: any, idx: number) => (
                        <Pressable 
                          key={idx}
                          onPress={(e) => { e.stopPropagation(); onImagePress(
                            recordWithMediaImages.map((i: any) => i.fullsize || i.thumb), 
                            idx
                          ); }}
                          className="w-[48%]"
                        >
                          <Image 
                            source={{ uri: img.thumb }} 
                            className="w-full h-32 rounded-lg bg-surface-elevated"
                            contentFit="cover"
                            transition={200}
                          />
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              )}
              
              {/* Video from recordWithMedia */}
              {recordWithMediaVideo && (
                <View className="mt-2 rounded-xl overflow-hidden">
                  <VideoPlayer
                    url={recordWithMediaVideo.playlist}
                    thumbnailUrl={recordWithMediaVideo.thumbnail}
                    aspectRatio={recordWithMediaVideo.aspectRatio?.width && recordWithMediaVideo.aspectRatio?.height 
                      ? recordWithMediaVideo.aspectRatio.width / recordWithMediaVideo.aspectRatio.height 
                      : 16 / 9}
                    muted={true}
                    loop={true}
                  />
                </View>
              )}
              
              {/* Quoted record from recordWithMedia */}
              {recordWithMediaQuote && recordWithMediaQuote.$type === 'app.bsky.embed.record#viewRecord' && (
                <View className="mt-2 border border-border rounded-xl p-3">
                  <View className="flex-row items-center mb-1">
                    {recordWithMediaQuote.author?.avatar && (
                      <Image 
                        source={{ uri: recordWithMediaQuote.author.avatar }}
                        className="w-5 h-5 rounded-full mr-2 bg-surface-elevated"
                        contentFit="cover"
                        transition={150}
                      />
                    )}
                    <Text className="text-text-primary font-medium text-sm">
                      {recordWithMediaQuote.author?.displayName || recordWithMediaQuote.author?.handle}
                    </Text>
                    <Text className="text-text-muted text-sm ml-1">
                      @{recordWithMediaQuote.author?.handle}
                    </Text>
                  </View>
                  <Text className="text-text-primary text-sm" numberOfLines={3}>
                    {(recordWithMediaQuote.value as any)?.text}
                  </Text>
                </View>
              )}
            </>
          )}

          {/* Actions */}
          <View className="flex-row items-center justify-between mt-3 pr-4">
            {/* Reply */}
            <Pressable 
              onPress={(e) => { e.stopPropagation(); onReply(); }}
              className="flex-row items-center py-1"
            >
              <MessageCircle size={18} color="#6B7280" />
              <Text className="text-text-muted text-sm ml-1.5">
                {post.replyCount || ''}
              </Text>
            </Pressable>

            {/* Repost */}
            <Pressable 
              onPress={(e) => { e.stopPropagation(); onRepost(); }}
              className="flex-row items-center py-1"
            >
              <Repeat2 
                size={18} 
                color={post.viewer?.repost ? "#10B981" : "#6B7280"} 
              />
              <Text className={`text-sm ml-1.5 ${post.viewer?.repost ? 'text-primary' : 'text-text-muted'}`}>
                {post.repostCount || ''}
              </Text>
            </Pressable>

            {/* Like */}
            <Pressable 
              onPress={(e) => { e.stopPropagation(); onLike(); }}
              className="flex-row items-center py-1"
            >
              <Heart 
                size={18} 
                color={post.viewer?.like ? "#EF4444" : "#6B7280"}
                fill={post.viewer?.like ? "#EF4444" : "none"}
              />
              <Text className={`text-sm ml-1.5 ${post.viewer?.like ? 'text-red-500' : 'text-text-muted'}`}>
                {post.likeCount || ''}
              </Text>
            </Pressable>

            {/* Share */}
            <Pressable onPress={(e) => { e.stopPropagation(); onShare(); }} className="flex-row items-center py-1">
              <Share size={18} color="#6B7280" />
            </Pressable>

            {/* More Options */}
            <Pressable onPress={(e) => { e.stopPropagation(); onOptionsPress(); }} className="flex-row items-center py-1">
              <MoreHorizontal size={18} color="#6B7280" />
            </Pressable>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function FeedSkeleton() {
  return (
    <View className="px-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} className="py-3 border-b border-border">
          <View className="flex-row">
            {/* Avatar skeleton */}
            <View className="w-10 h-10 rounded-full bg-surface-elevated" />
            <View className="flex-1 ml-3">
              {/* Header skeleton - name + time */}
              <View className="flex-row items-center mb-1">
                <View className="h-4 w-24 bg-surface-elevated rounded" />
                <View className="h-3 w-3 bg-surface-elevated rounded-full mx-2" />
                <View className="h-3 w-8 bg-surface-elevated rounded" />
              </View>
              {/* Handle skeleton */}
              <View className="h-3 w-32 bg-surface-elevated rounded mb-2" />
              {/* Text content skeleton - 2-3 lines */}
              <View className="h-4 w-full bg-surface-elevated rounded mb-1" />
              <View className="h-4 w-11/12 bg-surface-elevated rounded mb-1" />
              <View className="h-4 w-3/4 bg-surface-elevated rounded mb-3" />
              {/* Image placeholder (every other item) */}
              {i % 2 === 0 && (
                <View className="h-48 w-full bg-surface-elevated rounded-xl mb-3" />
              )}
              {/* Action bar skeleton */}
              <View className="flex-row justify-between pr-8 mt-1">
                <View className="h-5 w-12 bg-surface-elevated rounded" />
                <View className="h-5 w-12 bg-surface-elevated rounded" />
                <View className="h-5 w-12 bg-surface-elevated rounded" />
                <View className="h-5 w-8 bg-surface-elevated rounded" />
              </View>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function FeedScreen() {
  const router = useRouter();
  const { did, isAuthenticated } = useAuthStore();
  const { height } = useWindowDimensions();
  const [activeFeed, setActiveFeed] = useState<FeedType>('global');
  const renderStart = useRef(performance.now());
  
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
  
  // Repost menu state
  const [repostMenuVisible, setRepostMenuVisible] = useState(false);
  const [selectedPost, setSelectedPost] = useState<PostView | null>(null);
  
  // Options menu state
  const [optionsMenuVisible, setOptionsMenuVisible] = useState(false);
  
  // Media viewer state
  const [mediaViewerVisible, setMediaViewerVisible] = useState(false);
  const [mediaViewerImages, setMediaViewerImages] = useState<string[]>([]);
  const [mediaViewerIndex, setMediaViewerIndex] = useState(0);
  
  // Web refresh indicator
  const [showRefreshHint, setShowRefreshHint] = useState(false);
  
  // Mutations
  const likeMutation = useLikePost();
  const unlikeMutation = useUnlikePost();
  const repostMutation = useRepost();
  const unrepostMutation = useDeleteRepost();
  const deletePostMutation = useDeletePost();

  const handleLike = useCallback(async (post: PostView) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    if (post.viewer?.like) {
      await unlikeMutation.mutateAsync({ likeUri: post.viewer.like, postUri: post.uri });
    } else {
      await likeMutation.mutateAsync({ uri: post.uri, cid: post.cid });
    }
  }, [likeMutation, unlikeMutation]);

  // Open repost menu
  const handleRepostPress = useCallback((post: PostView) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedPost(post);
    setRepostMenuVisible(true);
  }, []);

  // Open image viewer
  const handleImagePress = useCallback((images: string[], index: number) => {
    setMediaViewerImages(images);
    setMediaViewerIndex(index);
    setMediaViewerVisible(true);
  }, []);

  // Handle actual repost from menu
  const handleRepost = useCallback(async () => {
    if (!selectedPost) return;
    
    if (selectedPost.viewer?.repost) {
      await unrepostMutation.mutateAsync({ repostUri: selectedPost.viewer.repost, postUri: selectedPost.uri });
    } else {
      await repostMutation.mutateAsync({ uri: selectedPost.uri, cid: selectedPost.cid });
    }
  }, [selectedPost, repostMutation, unrepostMutation]);

  // Handle quote post from menu
  const handleQuotePost = useCallback(() => {
    if (!selectedPost) return;
    
    router.push({
      pathname: '/compose',
      params: {
        quoteUri: selectedPost.uri,
        quoteCid: selectedPost.cid,
      }
    });
  }, [selectedPost, router]);

  // Share post
  const handleShare = useCallback(async (post: PostView) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    const uriParts = post.uri.split('/');
    const rkey = uriParts[uriParts.length - 1];
    const shareUrl = `https://bsky.app/profile/${post.author.handle}/post/${rkey}`;
    
    try {
      await RNShare.share({
        message: `Check out this post on Cannect: ${shareUrl}`,
        url: shareUrl,
      });
    } catch (err) {
      console.log('Share cancelled or failed');
    }
  }, []);

  const handlePostPress = useCallback((post: PostView) => {
    // Navigate to thread view using DID and rkey
    const uriParts = post.uri.split('/');
    const rkey = uriParts[uriParts.length - 1];
    router.push(`/post/${post.author.did}/${rkey}`);
  }, [router]);

  const handleAuthorPress = useCallback((post: PostView) => {
    router.push(`/user/${post.author.handle}`);
  }, [router]);

  const handleReply = useCallback((post: PostView) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    // Navigate to thread view - user can reply from there
    const uriParts = post.uri.split('/');
    const rkey = uriParts[uriParts.length - 1];
    router.push(`/post/${post.author.did}/${rkey}`);
  }, [router]);

  // Open options menu
  const handleOptionsPress = useCallback((post: PostView) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedPost(post);
    setOptionsMenuVisible(true);
  }, []);

  // Delete post handler
  const handleDelete = useCallback(async () => {
    if (!selectedPost) return;
    
    try {
      await deletePostMutation.mutateAsync(selectedPost.uri);
      setOptionsMenuVisible(false);
      setSelectedPost(null);
    } catch (error) {
      console.error('Failed to delete post:', error);
    }
  }, [selectedPost, deletePostMutation]);

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
            data={posts}
            keyExtractor={(item, index) => `${activeFeed}-${item.post.uri}-${index}`}
            renderItem={({ item }) => (
              <FeedItem
                item={item}
                onPress={() => handlePostPress(item.post)}
                onLike={() => handleLike(item.post)}
                onRepost={() => handleRepostPress(item.post)}
                onReply={() => handleReply(item.post)}
                onAuthorPress={() => handleAuthorPress(item.post)}
                onShare={() => handleShare(item.post)}
                onImagePress={handleImagePress}
                onOptionsPress={() => handleOptionsPress(item.post)}
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

      {/* Repost Menu */}
      <RepostMenu
        isVisible={repostMenuVisible}
        onClose={() => setRepostMenuVisible(false)}
        onRepost={handleRepost}
        onQuotePost={handleQuotePost}
        isReposted={!!selectedPost?.viewer?.repost}
      />
      
      {/* Post Options Menu */}
      <PostOptionsMenu
        isVisible={optionsMenuVisible}
        onClose={() => {
          setOptionsMenuVisible(false);
          setSelectedPost(null);
        }}
        onDelete={handleDelete}
        isOwnPost={selectedPost?.author.did === did}
        postUrl={selectedPost ? `https://bsky.app/profile/${selectedPost.author.handle}/post/${selectedPost.uri.split('/').pop()}` : undefined}
        postText={(selectedPost?.record as any)?.text}
        authorHandle={selectedPost?.author.handle}
        postUri={selectedPost?.uri}
        postCid={selectedPost?.cid}
      />
      
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
