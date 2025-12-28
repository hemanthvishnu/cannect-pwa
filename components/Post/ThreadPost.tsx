/**
 * ThreadPost - Expanded view for the main post in thread detail
 * 
 * Shows:
 * - Larger avatar
 * - Full timestamp
 * - Stats row (likes, reposts, replies count)
 * - Full action bar
 */

import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { PostEmbeds } from './PostEmbeds';
import { PostActions } from './PostActions';
import { RichText } from './RichText';
import { getOptimizedAvatarUrl } from '../../lib/utils/avatar';
import type { AppBskyFeedDefs, AppBskyFeedPost } from '@atproto/api';

type PostView = AppBskyFeedDefs.PostView;

interface ThreadPostProps {
  post: PostView;
  onImagePress?: (images: string[], index: number) => void;
}

export function ThreadPost({
  post,
  onImagePress,
}: ThreadPostProps) {
  const router = useRouter();
  const record = post.record as AppBskyFeedPost.Record;
  const author = post.author;

  const handleAuthorPress = () => {
    router.push(`/user/${author.handle}`);
  };

  // Format full date
  const formattedDate = record.createdAt 
    ? new Date(record.createdAt).toLocaleString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  return (
    <View className="px-4">
      {/* Author info - larger for thread view */}
      <Pressable 
        onPress={handleAuthorPress}
        className="flex-row items-center mb-4"
      >
        {author.avatar ? (
          <Image
            source={{ uri: getOptimizedAvatarUrl(author.avatar, 48) }}
            style={{ width: 48, height: 48, borderRadius: 24 }}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
            recyclingKey={author.avatar}
          />
        ) : (
          <View 
            style={{ width: 48, height: 48, borderRadius: 24 }}
            className="bg-surface-elevated items-center justify-center"
          >
            <Text className="text-text-muted text-xl">
              {author.handle[0].toUpperCase()}
            </Text>
          </View>
        )}
        <View className="ml-3 flex-1">
          <Text className="text-text-primary font-semibold text-base">
            {author.displayName || author.handle}
          </Text>
          <Text className="text-text-muted text-sm">@{author.handle}</Text>
        </View>
      </Pressable>

      {/* Post content - larger text with facets */}
      <RichText
        text={record.text}
        facets={record.facets}
        className="text-lg leading-6 mb-4"
      />

      {/* Embeds */}
      <PostEmbeds 
        embed={post.embed} 
        onImagePress={onImagePress}
      />

      {/* Timestamp */}
      <Text className="text-text-muted text-sm mt-4 mb-4">
        {formattedDate}
      </Text>

      {/* Stats row */}
      <View className="flex-row border-t border-b border-border py-3 mb-4">
        <Text className="text-text-secondary mr-4">
          <Text className="text-text-primary font-semibold">
            {post.repostCount || 0}
          </Text> Reposts
        </Text>
        <Text className="text-text-secondary mr-4">
          <Text className="text-text-primary font-semibold">
            {post.likeCount || 0}
          </Text> Likes
        </Text>
        <Text className="text-text-secondary">
          <Text className="text-text-primary font-semibold">
            {post.replyCount || 0}
          </Text> Replies
        </Text>
      </View>

      {/* Action buttons with built-in optimistic mutations */}
      <PostActions post={post} variant="expanded" />
    </View>
  );
}

/**
 * ThreadPostSkeleton - Loading state for thread main post
 */
export function ThreadPostSkeleton() {
  return (
    <View className="px-4">
      {/* Author skeleton */}
      <View className="flex-row items-center mb-4">
        <View className="w-12 h-12 rounded-full bg-surface-elevated" />
        <View className="ml-3 flex-1">
          <View className="h-4 w-32 bg-surface-elevated rounded mb-1" />
          <View className="h-3 w-24 bg-surface-elevated rounded" />
        </View>
      </View>
      
      {/* Content skeleton */}
      <View className="h-5 w-full bg-surface-elevated rounded mb-2" />
      <View className="h-5 w-full bg-surface-elevated rounded mb-2" />
      <View className="h-5 w-3/4 bg-surface-elevated rounded mb-4" />
      
      {/* Image skeleton */}
      <View className="h-48 w-full bg-surface-elevated rounded-xl mb-4" />
      
      {/* Timestamp skeleton */}
      <View className="h-3 w-40 bg-surface-elevated rounded mb-4" />
      
      {/* Stats skeleton */}
      <View className="flex-row border-t border-b border-border py-3 mb-4">
        <View className="h-4 w-20 bg-surface-elevated rounded mr-4" />
        <View className="h-4 w-16 bg-surface-elevated rounded mr-4" />
        <View className="h-4 w-16 bg-surface-elevated rounded" />
      </View>
      
      {/* Actions skeleton */}
      <View className="flex-row justify-around py-2 border-b border-border mb-4">
        <View className="w-6 h-6 bg-surface-elevated rounded" />
        <View className="w-6 h-6 bg-surface-elevated rounded" />
        <View className="w-6 h-6 bg-surface-elevated rounded" />
        <View className="w-6 h-6 bg-surface-elevated rounded" />
      </View>
    </View>
  );
}
