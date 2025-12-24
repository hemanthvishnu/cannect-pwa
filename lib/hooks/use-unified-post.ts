/**
 * use-unified-post.ts - Unified hooks for post interactions
 * 
 * Provides a single hook interface that works for ALL posts (Cannect and cached).
 * Uses unified hooks that route through a single code path.
 * 
 * Version 2.1: Eliminated isCached/isExternal branching
 */

import { useCallback } from "react";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/lib/stores";
import type { UnifiedPost } from "@/lib/types/unified-post";
import {
  useUnifiedLike,
  useUnifiedUnlike,
  useUnifiedRepost,
  useUnifiedUnrepost,
  useUnifiedHasLiked,
  useUnifiedHasReposted,
} from "./use-posts";

/** Return type for unified interaction hook */
export interface UnifiedPostActions {
  /** Like the post */
  like: () => void;
  /** Unlike the post */
  unlike: () => void;
  /** Toggle like state */
  toggleLike: () => void;
  /** Repost the post */
  repost: () => void;
  /** Un-repost the post */
  unrepost: () => void;
  /** Toggle repost state */
  toggleRepost: () => void;
  /** Navigate to reply composer */
  reply: () => void;
  /** Navigate to post detail */
  viewPost: () => void;
  /** Navigate to author profile */
  viewAuthor: () => void;
  /** Loading states */
  isLikeLoading: boolean;
  isRepostLoading: boolean;
  /** Current viewer state (may be stale for external) */
  isLiked: boolean;
  isReposted: boolean;
}

/**
 * Hook that provides unified interactions for any post type
 * 
 * Version 2.1: Single code path for ALL posts (Cannect and cached).
 * No more isCached/isExternal branching - uses unified hooks that
 * route by subjectUri (AT URI), which is the universal identifier.
 */
export function useUnifiedPostActions(post: UnifiedPost): UnifiedPostActions {
  const router = useRouter();
  const { user } = useAuthStore();
  
  // Unified mutations - single code path for all posts
  const likeMutation = useUnifiedLike();
  const unlikeMutation = useUnifiedUnlike();
  const repostMutation = useUnifiedRepost();
  const unrepostMutation = useUnifiedUnrepost();
  
  // Unified state queries - works for all posts by subject_uri
  const { data: likeState } = useUnifiedHasLiked(post.uri);
  const { data: repostState } = useUnifiedHasReposted(post.uri);
  
  // Use query state if available, otherwise fall back to post viewer state
  const isLiked = likeState ?? post.viewer.isLiked;
  const isReposted = repostState ?? post.viewer.isReposted;

  // Like action - single path for all posts
  const like = useCallback(() => {
    if (!user || !post.uri) return;
    
    likeMutation.mutate({
      subjectUri: post.uri,
      subjectCid: post.cid,
      postId: post.localId, // undefined for cached posts
    });
  }, [user, post.uri, post.cid, post.localId, likeMutation]);

  // Unlike action - single path for all posts
  const unlike = useCallback(() => {
    if (!user || !post.uri) return;
    
    unlikeMutation.mutate({
      subjectUri: post.uri,
      postId: post.localId,
    });
  }, [user, post.uri, post.localId, unlikeMutation]);

  // Toggle like
  const toggleLike = useCallback(() => {
    if (isLiked) {
      unlike();
    } else {
      like();
    }
  }, [isLiked, like, unlike]);

  // Repost action - single path for all posts
  const repost = useCallback(() => {
    if (!user || !post.uri || !post.cid) return;
    
    repostMutation.mutate({
      subjectUri: post.uri,
      subjectCid: post.cid,
      postId: post.localId,
    });
  }, [user, post.uri, post.cid, post.localId, repostMutation]);

  // Un-repost action - single path for all posts
  const unrepost = useCallback(() => {
    if (!user || !post.uri) return;
    
    unrepostMutation.mutate({
      subjectUri: post.uri,
      postId: post.localId,
    });
  }, [user, post.uri, post.localId, unrepostMutation]);

  // Toggle repost
  const toggleRepost = useCallback(() => {
    if (isReposted) {
      unrepost();
    } else {
      repost();
    }
  }, [isReposted, repost, unrepost]);

  // Reply navigation - uses URI params for all posts
  const reply = useCallback(() => {
    if (!post.uri) return;
    
    router.push({
      pathname: "/compose",
      params: {
        replyToUri: post.uri,
        replyToCid: post.cid,
        replyToId: post.localId, // Will be undefined for cached posts
        replyToAuthor: post.author.displayName,
        replyToHandle: post.author.handle,
        replyToContent: post.content.slice(0, 100),
      }
    } as any);
  }, [router, post]);

  // View post navigation
  // Use federated view for ANY post with an AT URI to ensure lazy sync with Bluesky
  const viewPost = useCallback(() => {
    const hasAtUri = post.uri.startsWith("at://");
    
    if (hasAtUri) {
      // Federated view fetches fresh data from Bluesky and syncs to Supabase
      router.push({
        pathname: "/federated/post",
        params: { uri: post.uri }
      } as any);
    } else if (post.localId) {
      // Local-only posts (no AT URI) use the local view
      router.push(`/post/${post.localId}` as any);
    }
  }, [router, post]);

  // View author navigation
  const viewAuthor = useCallback(() => {
    router.push(`/user/${post.author.handle}` as any);
  }, [router, post.author.handle]);

  // Loading states - unified
  const isLikeLoading = likeMutation.isPending || unlikeMutation.isPending;
  const isRepostLoading = repostMutation.isPending || unrepostMutation.isPending;

  return {
    like,
    unlike,
    toggleLike,
    repost,
    unrepost,
    toggleRepost,
    reply,
    viewPost,
    viewAuthor,
    isLikeLoading,
    isRepostLoading,
    isLiked,
    isReposted,
  };
}

/**
 * Creates a unified post with up-to-date viewer state
 * 
 * Uses unified queries that check likes/reposts tables by actor_did + subject_uri.
 * Works for ALL posts (Cannect and cached).
 */
export function useUnifiedPostWithState(post: UnifiedPost): UnifiedPost {
  const uri = post.uri || "";
  
  const { data: likeState } = useUnifiedHasLiked(uri);
  const { data: repostState } = useUnifiedHasReposted(uri);
  
  // If no URI, return as-is
  if (!uri) {
    return post;
  }
  
  // Merge fresh state
  return {
    ...post,
    viewer: {
      ...post.viewer,
      isLiked: likeState ?? post.viewer.isLiked,
      isReposted: repostState ?? post.viewer.isReposted,
    },
  };
}

/**
 * Wrapper that enriches a post with viewer state
 * Use this in post detail views to get correct like/repost state.
 * 
 * Uses unified queries - works for ALL posts (Cannect and cached).
 */
export function useEnrichedPost(post: UnifiedPost | null | undefined): UnifiedPost | null {
  const uri = post?.uri || "";
  
  const { data: isLiked } = useUnifiedHasLiked(uri);
  const { data: isReposted } = useUnifiedHasReposted(uri);
  
  if (!post) return null;
  
  // If no URI, return as-is
  if (!uri) return post;
  
  return {
    ...post,
    viewer: {
      ...post.viewer,
      isLiked: isLiked ?? post.viewer.isLiked,
      isReposted: isReposted ?? post.viewer.isReposted,
    },
  };
}
