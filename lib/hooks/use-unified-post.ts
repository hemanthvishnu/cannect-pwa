/**
 * use-unified-post.ts - Unified hooks for post interactions
 * 
 * Provides a single hook interface that works for both local and external posts.
 * Automatically routes to the correct mutation based on post source.
 */

import { useCallback } from "react";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/lib/stores";
import type { UnifiedPost } from "@/lib/types/unified-post";
import {
  useLikePost,
  useUnlikePost,
  useToggleRepost,
  useLikeBlueskyPost,
  useUnlikeBlueskyPost,
  useRepostBlueskyPost,
  useUnrepostBlueskyPost,
  useHasLikedBlueskyPost,
  useHasRepostedBlueskyPost,
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
 * Automatically routes to correct mutation based on whether post is local or external.
 */
export function useUnifiedPostActions(post: UnifiedPost): UnifiedPostActions {
  const router = useRouter();
  const { user } = useAuthStore();
  
  // Local post mutations
  const localLike = useLikePost();
  const localUnlike = useUnlikePost();
  const localToggleRepost = useToggleRepost();
  
  // External post mutations
  const externalLike = useLikeBlueskyPost();
  const externalUnlike = useUnlikeBlueskyPost();
  const externalRepost = useRepostBlueskyPost();
  const externalUnrepost = useUnrepostBlueskyPost();
  
  // For external posts, we might need to check state from queries
  // (since viewer state might not be in the post data)
  const { data: externalLikeState } = useHasLikedBlueskyPost(post.isExternal ? post.uri : "");
  const { data: externalRepostState } = useHasRepostedBlueskyPost(post.isExternal ? post.uri : "");
  
  // Determine current like/repost state
  const isLiked = post.isExternal 
    ? (externalLikeState ?? post.viewer.isLiked)
    : post.viewer.isLiked;
    
  const isReposted = post.isExternal
    ? (externalRepostState ?? post.viewer.isReposted)
    : post.viewer.isReposted;

  // Like action
  const like = useCallback(() => {
    if (!user) return;
    
    if (post.isExternal) {
      externalLike.mutate({ uri: post.uri, cid: post.cid || "" });
    } else if (post.localId) {
      localLike.mutate({
        postId: post.localId,
        subjectUri: post.uri.startsWith("at://") ? post.uri : null,
        subjectCid: post.cid || null,
      });
    }
  }, [user, post, externalLike, localLike]);

  // Unlike action
  const unlike = useCallback(() => {
    if (!user) return;
    
    if (post.isExternal) {
      externalUnlike.mutate(post.uri);
    } else if (post.localId) {
      localUnlike.mutate({
        postId: post.localId,
        subjectUri: post.uri.startsWith("at://") ? post.uri : null,
      });
    }
  }, [user, post, externalUnlike, localUnlike]);

  // Toggle like
  const toggleLike = useCallback(() => {
    if (isLiked) {
      unlike();
    } else {
      like();
    }
  }, [isLiked, like, unlike]);

  // Repost action
  const repost = useCallback(() => {
    if (!user) return;
    
    if (post.isExternal) {
      externalRepost.mutate({ uri: post.uri, cid: post.cid || "" });
    } else if (post.localId) {
      // Use toggleRepost with undo=false
      localToggleRepost.mutate({
        post: { id: post.localId, is_reposted_by_me: false, at_uri: post.uri, at_cid: post.cid },
        undo: false,
        subjectUri: post.uri.startsWith("at://") ? post.uri : null,
        subjectCid: post.cid || null,
      });
    }
  }, [user, post, externalRepost, localToggleRepost]);

  // Un-repost action
  const unrepost = useCallback(() => {
    if (!user) return;
    
    if (post.isExternal) {
      externalUnrepost.mutate(post.uri);
    } else if (post.localId) {
      // Use toggleRepost with undo=true
      localToggleRepost.mutate({
        post: { id: post.localId, is_reposted_by_me: true, at_uri: post.uri, at_cid: post.cid },
        undo: true,
        subjectUri: post.uri.startsWith("at://") ? post.uri : null,
      });
    }
  }, [user, post, externalUnrepost, localToggleRepost]);

  // Toggle repost
  const toggleRepost = useCallback(() => {
    if (isReposted) {
      unrepost();
    } else {
      repost();
    }
  }, [isReposted, repost, unrepost]);

  // Reply navigation
  const reply = useCallback(() => {
    if (post.isExternal) {
      router.push({
        pathname: "/compose",
        params: {
          replyToUri: post.uri,
          replyToCid: post.cid,
          replyToAuthor: post.author.displayName,
          replyToHandle: post.author.handle,
          replyToContent: post.content.slice(0, 100),
        }
      } as any);
    } else if (post.localId) {
      router.push({
        pathname: "/compose",
        params: {
          replyToId: post.localId,
          replyToAuthor: post.author.displayName,
          replyToContent: post.content.slice(0, 100),
        }
      } as any);
    }
  }, [router, post]);

  // View post navigation
  const viewPost = useCallback(() => {
    if (post.isExternal) {
      router.push({
        pathname: "/federated/post",
        params: { uri: post.uri }
      } as any);
    } else if (post.localId) {
      router.push(`/post/${post.localId}` as any);
    }
  }, [router, post]);

  // View author navigation
  const viewAuthor = useCallback(() => {
    router.push(`/user/${post.author.handle}` as any);
  }, [router, post.author.handle]);

  // Loading states
  const isLikeLoading = post.isExternal
    ? externalLike.isPending || externalUnlike.isPending
    : localLike.isPending || localUnlike.isPending;
    
  const isRepostLoading = post.isExternal
    ? externalRepost.isPending || externalUnrepost.isPending
    : localToggleRepost.isPending;

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
 * For external posts, merges fresh like/repost state from queries
 */
export function useUnifiedPostWithState(post: UnifiedPost): UnifiedPost {
  const { data: externalLikeState } = useHasLikedBlueskyPost(post.isExternal ? post.uri : "");
  const { data: externalRepostState } = useHasRepostedBlueskyPost(post.isExternal ? post.uri : "");
  
  if (!post.isExternal) {
    return post;
  }
  
  // Merge fresh state for external posts
  return {
    ...post,
    viewer: {
      ...post.viewer,
      isLiked: externalLikeState ?? post.viewer.isLiked,
      isReposted: externalRepostState ?? post.viewer.isReposted,
    },
  };
}
