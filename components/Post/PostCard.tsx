/**
 * PostCard - Universal post component for all list views
 * 
 * Uses expo-image for fast cached images
 * Handles all embed types via PostEmbeds
 * 
 * Used in:
 * - Feed tabs (Global, Local, Following)
 * - Profile tabs (Posts, Reposts, Replies, Likes)
 * - Search results
 * - Thread replies
 */

import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
  Heart,
  MessageCircle,
  Repeat2,
  Share,
  MoreHorizontal,
} from 'lucide-react-native';
import { PostEmbeds } from './PostEmbeds';
import { RichText } from './RichText';
import type { AppBskyFeedDefs, AppBskyFeedPost } from '@atproto/api';

type FeedViewPost = AppBskyFeedDefs.FeedViewPost;
type PostView = AppBskyFeedDefs.PostView;

interface PostCardProps {
  /** The feed item (includes reason for reposts) - preferred */
  item?: FeedViewPost;
  /** Raw post view for thread replies and other simple cases */
  post?: PostView;
  /** Called when the post card is tapped */
  onPress?: () => void;
  /** Called when like button is pressed */
  onLike?: () => void;
  /** Called when repost button is pressed */
  onRepost?: () => void;
  /** Called when reply button is pressed */
  onReply?: () => void;
  /** Called when share button is pressed */
  onShare?: () => void;
  /** Called when more options button is pressed */
  onOptionsPress?: () => void;
  /** Called when an image is pressed for fullscreen viewing */
  onImagePress?: (images: string[], index: number) => void;
  /** Show border at bottom (default: true) */
  showBorder?: boolean;
}

// Format relative time
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

export function PostCard({
  item,
  post: rawPost,
  onPress,
  onLike,
  onRepost,
  onReply,
  onShare,
  onOptionsPress,
  onImagePress,
  showBorder = true,
}: PostCardProps) {
  const router = useRouter();
  
  // Support both FeedViewPost (item) and raw PostView (post)
  const post = item?.post ?? rawPost;
  
  // Guard: must have either item or post
  if (!post) {
    console.warn('PostCard: Neither item nor post provided');
    return null;
  }
  
  const record = post.record as AppBskyFeedPost.Record;
  const author = post.author;

  // Check if this is a repost (only possible with FeedViewPost)
  const isRepost = !!item?.reason && item.reason.$type === 'app.bsky.feed.defs#reasonRepost';
  const repostBy = isRepost ? (item!.reason as any).by : null;

  // Default navigation handler
  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      // Default: navigate to post detail
      const uriParts = post.uri.split('/');
      const rkey = uriParts[uriParts.length - 1];
      router.push(`/post/${post.author.did}/${rkey}`);
    }
  };

  // Navigate to author profile
  const handleAuthorPress = () => {
    router.push(`/user/${author.handle}`);
  };

  return (
    <Pressable 
      onPress={handlePress}
      className={`px-4 py-3 active:bg-surface-elevated/50 ${showBorder ? 'border-b border-border' : ''}`}
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
        {/* Avatar - using expo-image for caching */}
        <Pressable onPress={(e) => { e.stopPropagation(); handleAuthorPress(); }}>
          {author.avatar ? (
            <Image 
              source={{ uri: author.avatar }}
              className="w-10 h-10 rounded-full bg-surface-elevated"
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
              recyclingKey={author.avatar}
            />
          ) : (
            <View className="w-10 h-10 rounded-full bg-surface-elevated items-center justify-center">
              <Text className="text-text-muted text-lg">
                {author.handle[0].toUpperCase()}
              </Text>
            </View>
          )}
        </Pressable>

        {/* Content */}
        <View className="flex-1 ml-3">
          {/* Header - Row 1: Name and Time */}
          <Pressable 
            onPress={(e) => { e.stopPropagation(); handleAuthorPress(); }}
            className="flex-row items-center flex-wrap self-start"
          >
            <Text className="font-semibold text-text-primary flex-shrink" numberOfLines={1}>
              {author.displayName || author.handle}
            </Text>
            <Text className="text-text-muted mx-1">·</Text>
            <Text className="text-text-muted flex-shrink-0">
              {formatTime(record.createdAt)}
            </Text>
          </Pressable>

          {/* Header - Row 2: Handle */}
          <Pressable 
            onPress={(e) => { e.stopPropagation(); handleAuthorPress(); }}
            className="self-start"
          >
            <Text className="text-text-muted text-sm" numberOfLines={1}>
              @{author.handle}
            </Text>
          </Pressable>

          {/* Post text with facets (mentions, links, hashtags) */}
          <RichText
            text={record.text}
            facets={record.facets}
            className="mt-1"
          />

          {/* Embeds (images, video, link preview, quote) */}
          <PostEmbeds 
            embed={post.embed} 
            onImagePress={onImagePress}
          />

          {/* Actions */}
          <View className="flex-row items-center justify-between mt-3 pr-4">
            {/* Reply */}
            <Pressable 
              onPress={(e) => { e.stopPropagation(); onReply?.(); }}
              className="flex-row items-center py-1"
            >
              <MessageCircle size={18} color="#6B7280" />
              <Text className="text-text-muted text-sm ml-1.5">
                {post.replyCount || ''}
              </Text>
            </Pressable>

            {/* Repost */}
            <Pressable 
              onPress={(e) => { e.stopPropagation(); onRepost?.(); }}
              className="flex-row items-center py-1"
            >
              <Repeat2 
                size={18} 
                color={post.viewer?.repost ? '#10B981' : '#6B7280'} 
              />
              <Text className={`text-sm ml-1.5 ${post.viewer?.repost ? 'text-primary' : 'text-text-muted'}`}>
                {post.repostCount || ''}
              </Text>
            </Pressable>

            {/* Like */}
            <Pressable 
              onPress={(e) => { e.stopPropagation(); onLike?.(); }}
              className="flex-row items-center py-1"
            >
              <Heart 
                size={18} 
                color={post.viewer?.like ? '#EF4444' : '#6B7280'}
                fill={post.viewer?.like ? '#EF4444' : 'none'}
              />
              <Text className={`text-sm ml-1.5 ${post.viewer?.like ? 'text-red-500' : 'text-text-muted'}`}>
                {post.likeCount || ''}
              </Text>
            </Pressable>

            {/* Share */}
            <Pressable 
              onPress={(e) => { e.stopPropagation(); onShare?.(); }}
              className="flex-row items-center py-1"
            >
              <Share size={18} color="#6B7280" />
            </Pressable>

            {/* More Options */}
            <Pressable 
              onPress={(e) => { e.stopPropagation(); onOptionsPress?.(); }}
              className="flex-row items-center py-1"
            >
              <MoreHorizontal size={18} color="#6B7280" />
            </Pressable>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * PostSkeleton - Loading placeholder matching PostCard layout
 */
export function PostSkeleton() {
  return (
    <View className="px-4 py-3 border-b border-border">
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
          {/* Action bar skeleton */}
          <View className="flex-row justify-between pr-8 mt-1">
            <View className="h-5 w-10 bg-surface-elevated rounded" />
            <View className="h-5 w-10 bg-surface-elevated rounded" />
            <View className="h-5 w-10 bg-surface-elevated rounded" />
            <View className="h-5 w-5 bg-surface-elevated rounded" />
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * FeedSkeleton - Multiple PostSkeletons for initial feed loading
 */
export function FeedSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <PostSkeleton key={i} />
      ))}
    </View>
  );
}
