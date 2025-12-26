/**
 * AT Protocol Feed & Posts Hooks
 * 
 * Pure AT Protocol - no Supabase.
 * All data comes directly from the PDS.
 */

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import * as atproto from '@/lib/atproto/agent';
import { useAuthStore } from '@/lib/stores/auth-store-atp';
import type { 
  AppBskyFeedDefs, 
  AppBskyFeedPost,
  AppBskyFeedGetTimeline,
  AppBskyFeedGetAuthorFeed,
  AppBskyFeedGetPostThread,
} from '@atproto/api';

// Re-export types for convenience
export type FeedViewPost = AppBskyFeedDefs.FeedViewPost;
export type PostView = AppBskyFeedDefs.PostView;
export type ThreadViewPost = AppBskyFeedDefs.ThreadViewPost;

/**
 * Get home timeline feed (Following) with infinite scroll
 */
export function useTimeline() {
  const { isAuthenticated } = useAuthStore();

  return useInfiniteQuery({
    queryKey: ['timeline'],
    queryFn: async ({ pageParam }) => {
      const result = await atproto.getTimeline(pageParam, 30);
      return result.data;
    },
    getNextPageParam: (lastPage) => lastPage.cursor,
    initialPageParam: undefined as string | undefined,
    enabled: isAuthenticated,
    staleTime: 1000 * 60, // 1 minute
  });
}

/**
 * Top cannabis feeds on Bluesky - aggregated for Global feed
 * Multiple feeds combined for diverse, high-quality content
 */
const CANNABIS_FEEDS = [
  {
    name: 'The Weed Feed',
    uri: 'at://did:plc:kil6rach2ost5soyq4qc3yyj/app.bsky.feed.generator/aaacchngc7ky4',
    likes: 307,
  },
  {
    name: 'WeedMob',
    uri: 'at://did:plc:bz77aitjmyojh2gcrzle55qt/app.bsky.feed.generator/aaajk2dvt3bnu',
    likes: 224,
  },
  {
    name: 'Cannabis Community 420',
    uri: 'at://did:plc:ofa3uzadvnxtusxbpr6yvdck/app.bsky.feed.generator/aaanpawlgfvb6',
    likes: 79,
  },
  {
    name: 'Weedsky',
    uri: 'at://did:plc:icrcghfflckt22o7dhyyuzfl/app.bsky.feed.generator/aaakxsdsjsy64',
    likes: 71,
  },
  {
    name: 'Cannabis',
    uri: 'at://did:plc:lr32wj3jvvt3reue6wexabfh/app.bsky.feed.generator/aaahmzu672jva',
    likes: 51,
  },
];

/**
 * Get Global feed - aggregated cannabis content from multiple Bluesky feeds
 * Fetches from top 5 cannabis feeds, deduplicates, and sorts by recency
 */
export function useGlobalFeed() {
  const { isAuthenticated } = useAuthStore();

  return useInfiniteQuery({
    queryKey: ['globalFeed'],
    queryFn: async ({ pageParam }) => {
      // Parse cursors for each feed (stored as JSON)
      const cursors: Record<string, string | undefined> = pageParam 
        ? JSON.parse(pageParam) 
        : {};
      
      // Fetch from all feeds in parallel
      const feedResults = await Promise.allSettled(
        CANNABIS_FEEDS.map(async (feed) => {
          try {
            const result = await atproto.getExternalFeed(
              feed.uri, 
              cursors[feed.uri], 
              10  // Get 10 from each feed
            );
            return { 
              feedUri: feed.uri, 
              data: result.data,
              name: feed.name 
            };
          } catch (error) {
            console.warn(`Failed to fetch ${feed.name}:`, error);
            return null;
          }
        })
      );

      // Collect posts and new cursors
      const allPosts: FeedViewPost[] = [];
      const newCursors: Record<string, string | undefined> = {};
      const seenUris = new Set<string>();

      for (const result of feedResults) {
        if (result.status === 'fulfilled' && result.value) {
          const { feedUri, data } = result.value;
          newCursors[feedUri] = data.cursor;
          
          // Deduplicate by post URI
          for (const item of data.feed) {
            if (!seenUris.has(item.post.uri)) {
              seenUris.add(item.post.uri);
              allPosts.push(item);
            }
          }
        }
      }

      // Sort by recency
      const sorted = allPosts.sort((a, b) => 
        new Date(b.post.indexedAt).getTime() - new Date(a.post.indexedAt).getTime()
      );

      // Check if any feed has more content
      const hasMore = Object.values(newCursors).some(c => c !== undefined);

      return {
        feed: sorted,
        cursor: hasMore ? JSON.stringify(newCursors) : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.cursor,
    initialPageParam: undefined as string | undefined,
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

/**
 * Get Cannect feed - posts from Cannect PDS users
 * Fetches directly from Cannect users' author feeds (bypasses search API issues)
 */
export function useCannectFeed() {
  const { isAuthenticated } = useAuthStore();

  return useInfiniteQuery({
    queryKey: ['cannectFeed'],
    queryFn: async ({ pageParam }) => {
      // Get all Cannect user DIDs from PDS
      const dids = await atproto.listPdsRepos(100);
      if (dids.length === 0) {
        return { feed: [], cursor: undefined };
      }
      
      // Parse cursor to get offset
      const offset = pageParam ? parseInt(pageParam, 10) : 0;
      const pageSize = 20;
      
      // Get posts from multiple users
      const userSlice = dids.slice(offset, offset + 10);
      
      const results = await Promise.all(
        userSlice.map(async (did) => {
          try {
            const feed = await atproto.getAuthorFeed(did, undefined, 5, 'posts_no_replies');
            return feed.data.feed.map(item => item);
          } catch {
            return [];
          }
        })
      );
      
      // Flatten and sort by date
      const allPosts = results.flat();
      const sorted = allPosts.sort((a, b) => 
        new Date(b.post.indexedAt).getTime() - new Date(a.post.indexedAt).getTime()
      );
      
      // Calculate next cursor
      const nextOffset = offset + 10;
      const hasMore = nextOffset < dids.length;
      
      return {
        feed: sorted.slice(0, pageSize),
        cursor: hasMore ? String(nextOffset) : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.cursor,
    initialPageParam: undefined as string | undefined,
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

/**
 * Get a specific user's feed with optional filter
 * Uses Bluesky's official API
 */
export function useAuthorFeed(
  actor: string | undefined, 
  filter?: 'posts_with_replies' | 'posts_no_replies' | 'posts_with_media' | 'posts_and_author_threads'
) {
  return useInfiniteQuery({
    queryKey: ['authorFeed', actor, filter],
    queryFn: async ({ pageParam }) => {
      if (!actor) throw new Error('Actor required');
      const result = await atproto.getAuthorFeed(actor, pageParam, 30, filter);
      return result.data;
    },
    getNextPageParam: (lastPage) => lastPage.cursor,
    initialPageParam: undefined as string | undefined,
    enabled: !!actor,
    staleTime: 1000 * 60,
  });
}

/**
 * Get a user's liked posts
 */
export function useActorLikes(actor: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['actorLikes', actor],
    queryFn: async ({ pageParam }) => {
      if (!actor) throw new Error('Actor required');
      const result = await atproto.getActorLikes(actor, pageParam, 30);
      return result.data;
    },
    getNextPageParam: (lastPage) => lastPage.cursor,
    initialPageParam: undefined as string | undefined,
    enabled: !!actor,
    staleTime: 1000 * 60,
  });
}

/**
 * Get a post thread with ancestors and replies
 */
export function usePostThread(uri: string | undefined) {
  return useQuery({
    queryKey: ['thread', uri],
    queryFn: async () => {
      if (!uri) throw new Error('URI required');
      const result = await atproto.getPostThread(uri);
      // Return the thread object directly, which contains post, parent, replies
      return result.data.thread as ThreadViewPost;
    },
    enabled: !!uri,
    staleTime: 1000 * 30,
  });
}

/**
 * Create a new post
 */
export function useCreatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      text, 
      reply,
      embed,
    }: { 
      text: string; 
      reply?: {
        parent: { uri: string; cid: string };
        root: { uri: string; cid: string };
      };
      embed?: any;
    }) => {
      return atproto.createPost(text, { reply, embed });
    },
    onSuccess: (_, variables) => {
      // Invalidate all feeds so new post appears immediately
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
      queryClient.invalidateQueries({ queryKey: ['cannectFeed'] });
      queryClient.invalidateQueries({ queryKey: ['authorFeed'] });
      if (variables.reply) {
        queryClient.invalidateQueries({ queryKey: ['thread', variables.reply.root.uri] });
      }
    },
  });
}

/**
 * Delete a post
 */
export function useDeletePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (uri: string) => {
      await atproto.deletePost(uri);
      return uri;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
}

/**
 * Like a post with optimistic update
 */
export function useLikePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ uri, cid }: { uri: string; cid: string }) => {
      return atproto.likePost(uri, cid);
    },
    onMutate: async ({ uri }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['timeline'] });
      await queryClient.cancelQueries({ queryKey: ['cannectFeed'] });
      await queryClient.cancelQueries({ queryKey: ['globalFeed'] });
      await queryClient.cancelQueries({ queryKey: ['authorFeed'] });
      await queryClient.cancelQueries({ queryKey: ['thread'] });

      // Snapshot previous values for rollback
      const previousTimeline = queryClient.getQueryData(['timeline']);
      const previousCannectFeed = queryClient.getQueryData(['cannectFeed']);
      const previousglobalFeed = queryClient.getQueryData(['globalFeed']);

      // Helper to update post in feed data
      const updatePostInFeed = (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            feed: page.feed.map((item: FeedViewPost) => {
              if (item.post.uri === uri) {
                return {
                  ...item,
                  post: {
                    ...item.post,
                    likeCount: (item.post.likeCount || 0) + 1,
                    viewer: { ...item.post.viewer, like: 'pending' },
                  },
                };
              }
              return item;
            }),
          })),
        };
      };

      // Optimistically update all feeds (use partial key match for authorFeed)
      queryClient.setQueryData(['timeline'], updatePostInFeed);
      queryClient.setQueryData(['cannectFeed'], updatePostInFeed);
      queryClient.setQueryData(['globalFeed'], updatePostInFeed);
      // Update all authorFeed queries
      queryClient.setQueriesData({ queryKey: ['authorFeed'] }, updatePostInFeed);

      return { previousTimeline, previousCannectFeed, previousglobalFeed };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousTimeline) {
        queryClient.setQueryData(['timeline'], context.previousTimeline);
      }
      if (context?.previousCannectFeed) {
        queryClient.setQueryData(['cannectFeed'], context.previousCannectFeed);
      }
      if (context?.previousglobalFeed) {
        queryClient.setQueryData(['globalFeed'], context.previousglobalFeed);
      }
      // Note: authorFeed rollback handled by invalidation
    },
    onSettled: () => {
      // Refetch to sync with server
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
      queryClient.invalidateQueries({ queryKey: ['cannectFeed'] });
      queryClient.invalidateQueries({ queryKey: ['globalFeed'] });
      queryClient.invalidateQueries({ queryKey: ['authorFeed'] });
      queryClient.invalidateQueries({ queryKey: ['actorLikes'] });
      queryClient.invalidateQueries({ queryKey: ['thread'] });
    },
  });
}

/**
 * Unlike a post with optimistic update
 */
export function useUnlikePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ likeUri, postUri }: { likeUri: string; postUri: string }) => {
      await atproto.unlikePost(likeUri);
    },
    onMutate: async ({ postUri }) => {
      await queryClient.cancelQueries({ queryKey: ['timeline'] });
      await queryClient.cancelQueries({ queryKey: ['cannectFeed'] });
      await queryClient.cancelQueries({ queryKey: ['globalFeed'] });
      await queryClient.cancelQueries({ queryKey: ['authorFeed'] });

      const previousTimeline = queryClient.getQueryData(['timeline']);
      const previousCannectFeed = queryClient.getQueryData(['cannectFeed']);
      const previousglobalFeed = queryClient.getQueryData(['globalFeed']);

      const updatePostInFeed = (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            feed: page.feed.map((item: FeedViewPost) => {
              if (item.post.uri === postUri) {
                return {
                  ...item,
                  post: {
                    ...item.post,
                    likeCount: Math.max((item.post.likeCount || 1) - 1, 0),
                    viewer: { ...item.post.viewer, like: undefined },
                  },
                };
              }
              return item;
            }),
          })),
        };
      };

      queryClient.setQueryData(['timeline'], updatePostInFeed);
      queryClient.setQueryData(['cannectFeed'], updatePostInFeed);
      queryClient.setQueryData(['globalFeed'], updatePostInFeed);
      queryClient.setQueriesData({ queryKey: ['authorFeed'] }, updatePostInFeed);

      return { previousTimeline, previousCannectFeed, previousglobalFeed };
    },
    onError: (err, variables, context) => {
      if (context?.previousTimeline) {
        queryClient.setQueryData(['timeline'], context.previousTimeline);
      }
      if (context?.previousCannectFeed) {
        queryClient.setQueryData(['cannectFeed'], context.previousCannectFeed);
      }
      if (context?.previousglobalFeed) {
        queryClient.setQueryData(['globalFeed'], context.previousglobalFeed);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
      queryClient.invalidateQueries({ queryKey: ['cannectFeed'] });
      queryClient.invalidateQueries({ queryKey: ['globalFeed'] });
      queryClient.invalidateQueries({ queryKey: ['authorFeed'] });
      queryClient.invalidateQueries({ queryKey: ['actorLikes'] });
      queryClient.invalidateQueries({ queryKey: ['thread'] });
    },
  });
}

/**
 * Repost a post with optimistic update
 */
export function useRepost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ uri, cid }: { uri: string; cid: string }) => {
      return atproto.repost(uri, cid);
    },
    onMutate: async ({ uri }) => {
      await queryClient.cancelQueries({ queryKey: ['timeline'] });
      await queryClient.cancelQueries({ queryKey: ['cannectFeed'] });
      await queryClient.cancelQueries({ queryKey: ['globalFeed'] });
      await queryClient.cancelQueries({ queryKey: ['authorFeed'] });

      const previousTimeline = queryClient.getQueryData(['timeline']);
      const previousCannectFeed = queryClient.getQueryData(['cannectFeed']);
      const previousglobalFeed = queryClient.getQueryData(['globalFeed']);

      const updatePostInFeed = (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            feed: page.feed.map((item: FeedViewPost) => {
              if (item.post.uri === uri) {
                return {
                  ...item,
                  post: {
                    ...item.post,
                    repostCount: (item.post.repostCount || 0) + 1,
                    viewer: { ...item.post.viewer, repost: 'pending' },
                  },
                };
              }
              return item;
            }),
          })),
        };
      };

      queryClient.setQueryData(['timeline'], updatePostInFeed);
      queryClient.setQueryData(['cannectFeed'], updatePostInFeed);
      queryClient.setQueryData(['globalFeed'], updatePostInFeed);
      queryClient.setQueriesData({ queryKey: ['authorFeed'] }, updatePostInFeed);

      return { previousTimeline, previousCannectFeed, previousglobalFeed };
    },
    onError: (err, variables, context) => {
      if (context?.previousTimeline) {
        queryClient.setQueryData(['timeline'], context.previousTimeline);
      }
      if (context?.previousCannectFeed) {
        queryClient.setQueryData(['cannectFeed'], context.previousCannectFeed);
      }
      if (context?.previousglobalFeed) {
        queryClient.setQueryData(['globalFeed'], context.previousglobalFeed);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
      queryClient.invalidateQueries({ queryKey: ['cannectFeed'] });
      queryClient.invalidateQueries({ queryKey: ['globalFeed'] });
      queryClient.invalidateQueries({ queryKey: ['authorFeed'] });
    },
  });
}

/**
 * Delete a repost with optimistic update
 */
export function useDeleteRepost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ repostUri, postUri }: { repostUri: string; postUri: string }) => {
      await atproto.deleteRepost(repostUri);
    },
    onMutate: async ({ postUri }) => {
      await queryClient.cancelQueries({ queryKey: ['timeline'] });
      await queryClient.cancelQueries({ queryKey: ['cannectFeed'] });
      await queryClient.cancelQueries({ queryKey: ['globalFeed'] });
      await queryClient.cancelQueries({ queryKey: ['authorFeed'] });

      const previousTimeline = queryClient.getQueryData(['timeline']);
      const previousCannectFeed = queryClient.getQueryData(['cannectFeed']);
      const previousglobalFeed = queryClient.getQueryData(['globalFeed']);

      const updatePostInFeed = (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            feed: page.feed.map((item: FeedViewPost) => {
              if (item.post.uri === postUri) {
                return {
                  ...item,
                  post: {
                    ...item.post,
                    repostCount: Math.max((item.post.repostCount || 1) - 1, 0),
                    viewer: { ...item.post.viewer, repost: undefined },
                  },
                };
              }
              return item;
            }),
          })),
        };
      };

      queryClient.setQueryData(['timeline'], updatePostInFeed);
      queryClient.setQueryData(['cannectFeed'], updatePostInFeed);
      queryClient.setQueryData(['globalFeed'], updatePostInFeed);
      queryClient.setQueriesData({ queryKey: ['authorFeed'] }, updatePostInFeed);

      return { previousTimeline, previousCannectFeed, previousglobalFeed };
    },
    onError: (err, variables, context) => {
      if (context?.previousTimeline) {
        queryClient.setQueryData(['timeline'], context.previousTimeline);
      }
      if (context?.previousCannectFeed) {
        queryClient.setQueryData(['cannectFeed'], context.previousCannectFeed);
      }
      if (context?.previousglobalFeed) {
        queryClient.setQueryData(['globalFeed'], context.previousglobalFeed);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
      queryClient.invalidateQueries({ queryKey: ['cannectFeed'] });
      queryClient.invalidateQueries({ queryKey: ['globalFeed'] });
      queryClient.invalidateQueries({ queryKey: ['authorFeed'] });
    },
  });
}

/**
 * Combined like/unlike hook for convenience
 */
export function useToggleLike() {
  const likeMutation = useLikePost();
  const unlikeMutation = useUnlikePost();

  return {
    like: likeMutation.mutateAsync,
    unlike: unlikeMutation.mutateAsync,
    isLiking: likeMutation.isPending,
    isUnliking: unlikeMutation.isPending,
    isPending: likeMutation.isPending || unlikeMutation.isPending,
  };
}

/**
 * Combined repost/unrepost hook for convenience
 */
export function useToggleRepost() {
  const repostMutation = useRepost();
  const unrepostMutation = useDeleteRepost();

  return {
    repost: repostMutation.mutateAsync,
    unrepost: unrepostMutation.mutateAsync,
    isReposting: repostMutation.isPending,
    isUnreposting: unrepostMutation.isPending,
    isPending: repostMutation.isPending || unrepostMutation.isPending,
  };
}

/**
 * Search posts
 */
export function useSearchPosts(query: string) {
  return useInfiniteQuery({
    queryKey: ['searchPosts', query],
    queryFn: async ({ pageParam }) => {
      const result = await atproto.searchPosts(query, pageParam, 25);
      return result.data;
    },
    getNextPageParam: (lastPage) => lastPage.cursor,
    initialPageParam: undefined as string | undefined,
    enabled: query.length > 0,
    staleTime: 1000 * 60,
  });
}

/**
 * Get suggested posts from Cannect users
 * Fetches recent posts directly from Cannect PDS users
 */
export function useSuggestedPosts() {
  const { isAuthenticated } = useAuthStore();
  
  return useQuery({
    queryKey: ['suggestedPosts', 'cannect'],
    queryFn: async () => {
      // Get recent posts directly from Cannect PDS users
      const posts = await atproto.getCannectPosts(30);
      return posts;
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
