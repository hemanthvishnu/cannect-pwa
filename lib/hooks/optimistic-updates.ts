/**
 * Optimistic Updates - Unified utilities for React Query mutations
 *
 * Provides reusable helpers for:
 * - Canceling queries before mutation
 * - Snapshotting state for rollback
 * - Updating posts in all feeds
 * - Removing posts from feeds
 * - Restoring state on error
 * - Invalidating queries after mutation
 */

import { QueryClient } from '@tanstack/react-query';
import type { AppBskyFeedDefs } from '@atproto/api';

type FeedViewPost = AppBskyFeedDefs.FeedViewPost;
type PostView = AppBskyFeedDefs.PostView;

// All feed-related query keys
export const FEED_KEYS = {
  timeline: 'timeline',
  cannectFeed: 'cannectFeed',
  globalFeed: 'globalFeed',
  authorFeed: 'authorFeed',
  actorLikes: 'actorLikes',
  thread: 'thread',
} as const;

// Keys that use setQueriesData (multiple queries with same prefix)
const MULTI_QUERY_KEYS = ['authorFeed', 'actorLikes', 'thread'];

// Keys that use setQueryData (single query)
const SINGLE_QUERY_KEYS = ['timeline', 'cannectFeed', 'globalFeed'];

/**
 * Cancel all outgoing queries to prevent race conditions
 */
export async function cancelFeedQueries(
  queryClient: QueryClient,
  keys: string[] = [...SINGLE_QUERY_KEYS, ...MULTI_QUERY_KEYS]
) {
  await Promise.all(keys.map((key) => queryClient.cancelQueries({ queryKey: [key] })));
}

/**
 * Snapshot current feed state for potential rollback
 */
export function snapshotFeedState(
  queryClient: QueryClient,
  keys: string[] = [...SINGLE_QUERY_KEYS, ...MULTI_QUERY_KEYS]
): Record<string, any> {
  const snapshots: Record<string, any> = {};

  keys.forEach((key) => {
    if (MULTI_QUERY_KEYS.includes(key)) {
      // Get all queries matching the prefix
      snapshots[key] = queryClient.getQueriesData({ queryKey: [key] });
    } else {
      snapshots[key] = queryClient.getQueryData([key]);
    }
  });

  return snapshots;
}

/**
 * Restore feed state from snapshot (on error)
 */
export function restoreFeedState(queryClient: QueryClient, snapshots: Record<string, any>) {
  Object.entries(snapshots).forEach(([key, data]) => {
    if (MULTI_QUERY_KEYS.includes(key) && Array.isArray(data)) {
      // Restore multi-query data
      data.forEach(([queryKey, queryData]: [any, any]) => {
        queryClient.setQueryData(queryKey, queryData);
      });
    } else if (data) {
      queryClient.setQueryData([key], data);
    }
  });
}

/**
 * Update a post in all feeds with a custom updater function
 */
export function updatePostInFeeds(
  queryClient: QueryClient,
  postUri: string,
  updater: (post: PostView) => PostView,
  options?: {
    removeFromLikes?: boolean;
    skipKeys?: string[];
  }
) {
  const { removeFromLikes = false, skipKeys = [] } = options || {};

  // Generic feed updater
  const updateFeed = (old: any) => {
    if (!old?.pages) return old;
    return {
      ...old,
      pages: old.pages.map((page: any) => ({
        ...page,
        feed: page.feed.map((item: FeedViewPost) => {
          if (item.post.uri === postUri) {
            return { ...item, post: updater(item.post) };
          }
          return item;
        }),
      })),
    };
  };

  // Update single-query feeds
  SINGLE_QUERY_KEYS.filter((key) => !skipKeys.includes(key)).forEach((key) => {
    queryClient.setQueryData([key], updateFeed);
  });

  // Update authorFeed (all user profile feeds)
  if (!skipKeys.includes('authorFeed')) {
    queryClient.setQueriesData({ queryKey: ['authorFeed'] }, updateFeed);
  }

  // Handle actorLikes - either update or remove
  if (!skipKeys.includes('actorLikes')) {
    if (removeFromLikes) {
      queryClient.setQueriesData({ queryKey: ['actorLikes'] }, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            feed: page.feed.filter((item: FeedViewPost) => item.post.uri !== postUri),
          })),
        };
      });
    } else {
      queryClient.setQueriesData({ queryKey: ['actorLikes'] }, updateFeed);
    }
  }

  // Update thread views
  if (!skipKeys.includes('thread')) {
    queryClient.setQueriesData({ queryKey: ['thread'] }, (old: any) => {
      if (!old?.thread?.post) return old;
      if (old.thread.post.uri === postUri) {
        return {
          ...old,
          thread: { ...old.thread, post: updater(old.thread.post) },
        };
      }
      return old;
    });
  }
}

/**
 * Remove a post from all feeds (for delete operations)
 */
export function removePostFromFeeds(
  queryClient: QueryClient,
  postUri: string,
  skipKeys: string[] = []
) {
  const removeFromFeed = (old: any) => {
    if (!old?.pages) return old;
    return {
      ...old,
      pages: old.pages.map((page: any) => ({
        ...page,
        feed: page.feed.filter((item: FeedViewPost) => item.post.uri !== postUri),
      })),
    };
  };

  // Remove from single-query feeds
  SINGLE_QUERY_KEYS.filter((key) => !skipKeys.includes(key)).forEach((key) => {
    queryClient.setQueryData([key], removeFromFeed);
  });

  // Remove from all authorFeed queries
  if (!skipKeys.includes('authorFeed')) {
    queryClient.setQueriesData({ queryKey: ['authorFeed'] }, removeFromFeed);
  }

  // Remove from actorLikes
  if (!skipKeys.includes('actorLikes')) {
    queryClient.setQueriesData({ queryKey: ['actorLikes'] }, removeFromFeed);
  }
}

/**
 * Invalidate feed queries after mutation completes
 * Use exclude to skip certain feeds (e.g., don't refetch actorLikes after unlike)
 */
export function invalidateFeeds(
  queryClient: QueryClient,
  options?: {
    exclude?: string[];
    only?: string[];
  }
) {
  const { exclude = [], only } = options || {};

  const keysToInvalidate = only || [...SINGLE_QUERY_KEYS, 'authorFeed', 'thread'];

  keysToInvalidate
    .filter((key) => !exclude.includes(key))
    .forEach((key) => {
      queryClient.invalidateQueries({ queryKey: [key] });
    });
}

/**
 * Post updater helpers - common transformations
 */
export const postUpdaters = {
  like: (post: PostView): PostView => ({
    ...post,
    likeCount: (post.likeCount || 0) + 1,
    viewer: { ...post.viewer, like: 'pending' },
  }),

  unlike: (post: PostView): PostView => ({
    ...post,
    likeCount: Math.max((post.likeCount || 1) - 1, 0),
    viewer: { ...post.viewer, like: undefined },
  }),

  repost: (post: PostView): PostView => ({
    ...post,
    repostCount: (post.repostCount || 0) + 1,
    viewer: { ...post.viewer, repost: 'pending' },
  }),

  unrepost: (post: PostView): PostView => ({
    ...post,
    repostCount: Math.max((post.repostCount || 1) - 1, 0),
    viewer: { ...post.viewer, repost: undefined },
  }),

  /** Update like URI after server confirms */
  confirmLike:
    (likeUri: string) =>
    (post: PostView): PostView => ({
      ...post,
      viewer: { ...post.viewer, like: likeUri },
    }),

  /** Update repost URI after server confirms */
  confirmRepost:
    (repostUri: string) =>
    (post: PostView): PostView => ({
      ...post,
      viewer: { ...post.viewer, repost: repostUri },
    }),
};

/**
 * Create a standard optimistic mutation context
 * Returns cancel, snapshot, and restore functions bound to the query client
 */
export function createOptimisticContext(queryClient: QueryClient) {
  return {
    cancel: (keys?: string[]) => cancelFeedQueries(queryClient, keys),
    snapshot: (keys?: string[]) => snapshotFeedState(queryClient, keys),
    restore: (snapshots: Record<string, any>) => restoreFeedState(queryClient, snapshots),
    updatePost: (
      uri: string,
      updater: (post: PostView) => PostView,
      options?: Parameters<typeof updatePostInFeeds>[3]
    ) => updatePostInFeeds(queryClient, uri, updater, options),
    removePost: (uri: string, skipKeys?: string[]) =>
      removePostFromFeeds(queryClient, uri, skipKeys),
    invalidate: (options?: Parameters<typeof invalidateFeeds>[1]) =>
      invalidateFeeds(queryClient, options),
  };
}
