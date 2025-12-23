/**
 * UnifiedFeedItem - Wrapper that connects UnifiedPostCard with hooks
 * 
 * This component bridges the UnifiedPost model with the interaction hooks,
 * providing a complete self-contained feed item.
 */

import React, { memo, useCallback } from "react";
import { Share, Platform } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { UnifiedPostCard } from "./UnifiedPostCard";
import { useUnifiedPostActions, useUnifiedPostWithState } from "@/lib/hooks/use-unified-post";
import type { UnifiedPost } from "@/lib/types/unified-post";
import { useAuthStore } from "@/lib/stores";

export interface UnifiedFeedItemProps {
  post: UnifiedPost;
  /** Called when user taps repost to show menu instead of instant action */
  onRepostMenu?: (post: UnifiedPost) => void;
  /** Called when user taps more button */
  onMoreMenu?: (post: UnifiedPost) => void;
}

export const UnifiedFeedItem = memo(function UnifiedFeedItem({
  post: initialPost,
  onRepostMenu,
  onMoreMenu,
}: UnifiedFeedItemProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  
  // Get post with fresh viewer state (for external posts)
  const post = useUnifiedPostWithState(initialPost);
  
  // Get all action handlers
  const actions = useUnifiedPostActions(post);

  // Handle like with auth check
  const handleLike = useCallback(() => {
    if (!user) {
      router.push("/auth/login" as any);
      return;
    }
    actions.toggleLike();
  }, [user, actions, router]);

  // Handle repost - show menu if handler provided, otherwise toggle
  const handleRepost = useCallback(() => {
    if (!user) {
      router.push("/auth/login" as any);
      return;
    }
    if (onRepostMenu) {
      onRepostMenu(post);
    } else {
      actions.toggleRepost();
    }
  }, [user, post, actions, onRepostMenu, router]);

  // Handle reply
  const handleReply = useCallback(() => {
    if (!user) {
      router.push("/auth/login" as any);
      return;
    }
    actions.reply();
  }, [user, actions, router]);

  // Handle share
  const handleShare = useCallback(async () => {
    try {
      const url = post.isExternal
        ? `https://bsky.app/profile/${post.author.handle}/post/${post.uri.split('/').pop()}`
        : `https://cannect.app/post/${post.localId}`;
        
      await Share.share({
        message: `Check out this post by @${post.author.handle}: ${post.content.slice(0, 100)}${post.content.length > 100 ? '...' : ''}\n\n${url}`,
      });
    } catch (error) {
      // User cancelled or error
    }
  }, [post]);

  // Handle more menu
  const handleMore = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (onMoreMenu) {
      onMoreMenu(post);
    }
  }, [post, onMoreMenu]);

  // Handle author press
  const handleAuthorPress = useCallback(() => {
    router.push(`/user/${post.author.handle}` as any);
  }, [router, post.author.handle]);

  // Handle post press
  const handlePostPress = useCallback(() => {
    actions.viewPost();
  }, [actions]);

  // Handle quote press
  const handleQuotePress = useCallback((quoteUri: string) => {
    // Check if it's an external quote
    if (quoteUri.startsWith("at://")) {
      router.push({
        pathname: "/federated/post",
        params: { uri: quoteUri }
      } as any);
    } else {
      const localId = quoteUri.replace("cannect://post/", "");
      router.push(`/post/${localId}` as any);
    }
  }, [router]);

  // Handle reposted by press
  const handleRepostedByPress = useCallback((handle: string) => {
    router.push(`/user/${handle}` as any);
  }, [router]);

  return (
    <UnifiedPostCard
      post={post}
      onPress={handlePostPress}
      onAuthorPress={handleAuthorPress}
      onReply={handleReply}
      onRepost={handleRepost}
      onLike={handleLike}
      onShare={handleShare}
      onMore={handleMore}
      onQuotePress={handleQuotePress}
      onRepostedByPress={handleRepostedByPress}
      isLikeLoading={actions.isLikeLoading}
      isRepostLoading={actions.isRepostLoading}
    />
  );
}, (prevProps, nextProps) => {
  // Shallow compare for memoization
  return (
    prevProps.post.uri === nextProps.post.uri &&
    prevProps.post.viewer.isLiked === nextProps.post.viewer.isLiked &&
    prevProps.post.viewer.isReposted === nextProps.post.viewer.isReposted &&
    prevProps.post.likeCount === nextProps.post.likeCount &&
    prevProps.post.repostCount === nextProps.post.repostCount
  );
});
