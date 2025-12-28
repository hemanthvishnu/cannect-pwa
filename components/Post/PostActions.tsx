/**
 * PostActions - Unified action buttons with built-in optimistic mutations
 * 
 * Single source of truth for ALL post interactions:
 * - Like/Unlike (with optimistic updates)
 * - Repost/Unrepost (with menu for quote option)
 * - Quote Post (navigate to compose)
 * - Reply (navigate to compose)
 * - Share (platform-aware)
 * - Options menu callback
 * 
 * Built-in:
 * - RepostMenu integrated (no external state needed)
 * - Optimistic updates via mutation hooks
 * - Toggle logic (like → unlike, repost → unrepost)
 * - Visual feedback for active states
 * - Haptic feedback on native
 */

import { View, Text, Pressable, Share as RNShare, Platform, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Heart,
  MessageCircle,
  Repeat2,
  Share,
  MoreHorizontal,
  Quote,
} from 'lucide-react-native';
import { memo, useCallback, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { useLikePost, useUnlikePost, useRepost, useDeleteRepost } from '../../lib/hooks';
import type { AppBskyFeedDefs } from '@atproto/api';

type PostView = AppBskyFeedDefs.PostView;

interface PostActionsProps {
  /** The post to show actions for */
  post: PostView;
  /** Visual variant: compact for feed, expanded for thread detail */
  variant?: 'compact' | 'expanded';
  /** Called when options button is pressed (for delete, report, etc.) */
  onOptionsPress?: () => void;
  /** Hide reply count (for some layouts) */
  hideReplyCounts?: boolean;
}

// Haptic helper
const triggerHaptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(style);
  }
};

export const PostActions = memo(function PostActions({
  post,
  variant = 'compact',
  onOptionsPress,
  hideReplyCounts = false,
}: PostActionsProps) {
  const router = useRouter();
  
  // Mutation hooks with optimistic updates
  const likeMutation = useLikePost();
  const unlikeMutation = useUnlikePost();
  const repostMutation = useRepost();
  const unrepostMutation = useDeleteRepost();

  // Local state
  const [isLikeLoading, setIsLikeLoading] = useState(false);
  const [isRepostLoading, setIsRepostLoading] = useState(false);
  const [repostMenuVisible, setRepostMenuVisible] = useState(false);

  // Derived state
  const isLiked = !!post.viewer?.like;
  const isReposted = !!post.viewer?.repost;
  const likeCount = post.likeCount || 0;
  const repostCount = post.repostCount || 0;
  const replyCount = post.replyCount || 0;

  // Handle like toggle
  const handleLike = useCallback(async () => {
    if (isLikeLoading) return;
    triggerHaptic();
    setIsLikeLoading(true);
    
    try {
      if (isLiked && post.viewer?.like) {
        await unlikeMutation.mutateAsync({
          likeUri: post.viewer.like,
          postUri: post.uri,
        });
      } else {
        await likeMutation.mutateAsync({
          uri: post.uri,
          cid: post.cid,
        });
      }
    } catch (error) {
      console.error('Like action failed:', error);
    } finally {
      setIsLikeLoading(false);
    }
  }, [isLiked, isLikeLoading, post, likeMutation, unlikeMutation]);

  // Open repost menu
  const handleRepostPress = useCallback(() => {
    triggerHaptic();
    setRepostMenuVisible(true);
  }, []);

  // Perform repost/unrepost action
  const handleRepost = useCallback(async () => {
    if (isRepostLoading) return;
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    setIsRepostLoading(true);
    setRepostMenuVisible(false);
    
    try {
      if (isReposted && post.viewer?.repost) {
        await unrepostMutation.mutateAsync({
          repostUri: post.viewer.repost,
          postUri: post.uri,
        });
      } else {
        await repostMutation.mutateAsync({
          uri: post.uri,
          cid: post.cid,
        });
      }
    } catch (error) {
      console.error('Repost action failed:', error);
    } finally {
      setIsRepostLoading(false);
    }
  }, [isReposted, isRepostLoading, post, repostMutation, unrepostMutation]);

  // Handle quote post - navigate to compose
  const handleQuotePost = useCallback(() => {
    triggerHaptic();
    setRepostMenuVisible(false);
    
    router.push({
      pathname: '/compose',
      params: {
        quoteUri: post.uri,
        quoteCid: post.cid,
      },
    } as any);
  }, [post, router]);

  // Handle reply - navigate to compose with reply context
  const handleReply = useCallback(() => {
    triggerHaptic();
    // Extract DID and rkey from post URI
    const parts = post.uri.split('/');
    const did = parts[2];
    const rkey = parts[4];
    
    router.push({
      pathname: '/compose',
      params: { 
        replyTo: post.uri,
        replyToDid: did,
        replyToRkey: rkey,
      },
    } as any);
  }, [post.uri, router]);

  // Handle share
  const handleShare = useCallback(async () => {
    triggerHaptic();
    const parts = post.uri.split('/');
    const rkey = parts[4];
    const handle = post.author.handle;
    const url = `https://bsky.app/profile/${handle}/post/${rkey}`;
    
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(url);
        // Could show a toast here
      } else {
        await RNShare.share({
          message: url,
          url: url,
        });
      }
    } catch (error) {
      console.error('Share failed:', error);
    }
  }, [post]);

  // Icon sizes based on variant
  const iconSize = variant === 'compact' ? 18 : 22;
  const mutedColor = '#6B7280';
  const likeColor = isLiked ? '#EF4444' : mutedColor;
  const repostColor = isReposted ? '#10B981' : mutedColor;

  // Action buttons JSX
  const actionButtons = variant === 'compact' ? (
    <View className="flex-row items-center justify-between mt-3 pr-4">
      {/* Reply */}
      <Pressable 
        onPress={(e) => { e.stopPropagation(); handleReply(); }}
        className="flex-row items-center py-1"
        hitSlop={8}
      >
        <MessageCircle size={iconSize} color={mutedColor} />
        {!hideReplyCounts && replyCount > 0 && (
          <Text className="text-text-muted text-sm ml-1.5">
            {replyCount}
          </Text>
        )}
      </Pressable>

      {/* Repost */}
      <Pressable 
        onPress={(e) => { e.stopPropagation(); handleRepostPress(); }}
        className="flex-row items-center py-1"
        disabled={isRepostLoading}
        hitSlop={8}
      >
        <Repeat2 size={iconSize} color={repostColor} />
        {repostCount > 0 && (
          <Text className={`text-sm ml-1.5 ${isReposted ? 'text-green-500' : 'text-text-muted'}`}>
            {repostCount}
          </Text>
        )}
      </Pressable>

      {/* Like */}
      <Pressable 
        onPress={(e) => { e.stopPropagation(); handleLike(); }}
        className="flex-row items-center py-1"
        disabled={isLikeLoading}
        hitSlop={8}
      >
        <Heart 
          size={iconSize} 
          color={likeColor}
          fill={isLiked ? '#EF4444' : 'none'}
        />
        {likeCount > 0 && (
          <Text className={`text-sm ml-1.5 ${isLiked ? 'text-red-500' : 'text-text-muted'}`}>
            {likeCount}
          </Text>
        )}
      </Pressable>

      {/* Share */}
      <Pressable 
        onPress={(e) => { e.stopPropagation(); handleShare(); }}
        className="flex-row items-center py-1"
        hitSlop={8}
      >
        <Share size={iconSize} color={mutedColor} />
      </Pressable>

      {/* More Options */}
      {onOptionsPress && (
        <Pressable 
          onPress={(e) => { e.stopPropagation(); onOptionsPress(); }}
          className="flex-row items-center py-1"
          hitSlop={8}
        >
          <MoreHorizontal size={iconSize} color={mutedColor} />
        </Pressable>
      )}
    </View>
  ) : (
    // Expanded layout (for ThreadPost detail view)
    <View className="flex-row justify-around py-2 border-b border-border mb-4">
      {/* Reply */}
      <Pressable 
        onPress={handleReply}
        className="flex-row items-center p-2"
        hitSlop={8}
      >
        <MessageCircle size={iconSize} color={mutedColor} />
      </Pressable>

      {/* Repost */}
      <Pressable 
        onPress={handleRepostPress}
        className="flex-row items-center p-2"
        disabled={isRepostLoading}
        hitSlop={8}
      >
        <Repeat2 size={iconSize} color={repostColor} />
      </Pressable>

      {/* Like */}
      <Pressable 
        onPress={handleLike}
        className="flex-row items-center p-2"
        disabled={isLikeLoading}
        hitSlop={8}
      >
        <Heart 
          size={iconSize} 
          color={likeColor}
          fill={isLiked ? '#EF4444' : 'transparent'}
        />
      </Pressable>

      {/* Share */}
      <Pressable 
        onPress={handleShare}
        className="flex-row items-center p-2"
        hitSlop={8}
      >
        <Share size={iconSize} color={mutedColor} />
      </Pressable>
    </View>
  );

  return (
    <>
      {actionButtons}

      {/* Repost Menu Modal - integrated, no external state needed */}
      <Modal 
        visible={repostMenuVisible} 
        animationType="slide" 
        transparent
        statusBarTranslucent
        onRequestClose={() => setRepostMenuVisible(false)}
      >
        {/* Backdrop */}
        <Pressable 
          className="flex-1 bg-black/50" 
          onPress={() => setRepostMenuVisible(false)}
        />
        
        {/* Bottom Sheet */}
        <View className="bg-surface-elevated rounded-t-3xl pb-8 pt-2">
          {/* Handle Bar */}
          <View className="items-center py-3">
            <View className="w-10 h-1 bg-zinc-600 rounded-full" />
          </View>

          {/* Menu Options */}
          <View className="px-4 pb-4">
            {/* Repost Option */}
            <Pressable
              onPress={handleRepost}
              className="flex-row items-center gap-4 py-4 px-4 rounded-xl active:bg-zinc-800/50"
            >
              <View className={`w-11 h-11 rounded-full items-center justify-center ${isReposted ? 'bg-primary/20' : 'bg-zinc-800'}`}>
                <Repeat2 size={22} color={isReposted ? "#10B981" : "#FAFAFA"} />
              </View>
              <View className="flex-1">
                <Text className={`text-lg font-semibold ${isReposted ? 'text-primary' : 'text-text-primary'}`}>
                  {isReposted ? "Undo Repost" : "Repost"}
                </Text>
                <Text className="text-text-muted text-sm">
                  {isReposted ? "Remove from your profile" : "Share to your followers instantly"}
                </Text>
              </View>
            </Pressable>

            {/* Quote Post Option - only show if not already reposted */}
            {!isReposted && (
              <Pressable
                onPress={handleQuotePost}
                className="flex-row items-center gap-4 py-4 px-4 rounded-xl active:bg-zinc-800/50"
              >
                <View className="w-11 h-11 rounded-full bg-zinc-800 items-center justify-center">
                  <Quote size={22} color="#FAFAFA" />
                </View>
                <View className="flex-1">
                  <Text className="text-text-primary text-lg font-semibold">
                    Quote Post
                  </Text>
                  <Text className="text-text-muted text-sm">
                    Add your thoughts with the original post
                  </Text>
                </View>
              </Pressable>
            )}
          </View>

          {/* Cancel Button */}
          <View className="px-4">
            <Pressable
              onPress={() => setRepostMenuVisible(false)}
              className="py-4 rounded-xl bg-zinc-800 items-center active:bg-zinc-700"
            >
              <Text className="text-text-primary font-semibold text-base">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
});
