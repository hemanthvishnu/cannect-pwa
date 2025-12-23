/**
 * Bluesky Federation Service
 * Fetches public posts from Bluesky via Supabase Edge Function proxy.
 * This avoids CORS issues when running in the browser.
 */

import { supabase } from "@/lib/supabase";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

// Common headers for edge function calls
const getProxyHeaders = () => ({
  "Content-Type": "application/json",
  "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
  "apikey": SUPABASE_ANON_KEY,
});

/**
 * Generic Bluesky API fetcher via proxy
 * Use this for any Bluesky XRPC endpoint
 */
export async function fetchBluesky(
  endpoint: string,
  params: Record<string, string | number> = {}
) {
  const searchParams = new URLSearchParams();
  searchParams.set("action", "xrpc");
  searchParams.set("endpoint", endpoint);
  
  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, String(value));
  }

  const proxyUrl = `${SUPABASE_URL}/functions/v1/bluesky-proxy?${searchParams.toString()}`;

  const response = await fetch(proxyUrl, {
    headers: getProxyHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Bluesky API error: ${response.status}`);
  }

  return response.json();
}

export interface FederatedPost {
  id: string;
  uri: string;
  cid: string;
  user_id: string;
  content: string;
  created_at: string;
  media_urls: string[];
  likes_count: number;
  reposts_count: number;
  replies_count: number;
  is_federated: true;
  type: 'post';
  author: {
    id: string;
    did: string;
    handle: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    is_verified: boolean;
  };
}

export async function getFederatedPosts(limit = 25): Promise<FederatedPost[]> {
  try {
    // Use Supabase Edge Function proxy to avoid CORS
    const proxyUrl = `${SUPABASE_URL}/functions/v1/bluesky-proxy?action=feed&limit=${limit}`;
    
    const response = await fetch(proxyUrl, {
      headers: getProxyHeaders(),
    });
    
    if (!response.ok) {
      throw new Error(`Proxy error: ${response.status}`);
    }
    
    const data = await response.json();
    const posts = data.feed || [];

    return posts.map((item: any) => {
      const bskyPost = item.post;
      return {
        id: bskyPost.cid, // Keep cid as id for backward compat
        uri: bskyPost.uri, // Add URI for AT Protocol interactions
        cid: bskyPost.cid,
        user_id: bskyPost.author.did,
        content: bskyPost.record?.text || "",
        created_at: bskyPost.record?.createdAt || bskyPost.indexedAt,
        // Use thumb for feed performance, fullsize available if needed
        media_urls: bskyPost.embed?.images?.map((img: any) => img.thumb || img.fullsize) || [],
        likes_count: bskyPost.likeCount || 0,
        reposts_count: bskyPost.repostCount || 0,
        replies_count: bskyPost.replyCount || 0,
        is_federated: true as const,
        type: 'post' as const,
        author: {
          id: bskyPost.author.did,
          did: bskyPost.author.did,
          handle: bskyPost.author.handle,
          username: bskyPost.author.handle,
          display_name: bskyPost.author.displayName || bskyPost.author.handle,
          avatar_url: bskyPost.author.avatar || null,
          is_verified: false,
        },
      };
    });
  } catch (error) {
    console.error("Bluesky fetch failed:", error);
    return [];
  }
}

/**
 * Search Bluesky posts by query
 */
export async function searchFederatedPosts(query: string, limit = 25) {
  try {
    const proxyUrl = `${SUPABASE_URL}/functions/v1/bluesky-proxy?action=search&q=${encodeURIComponent(query)}&limit=${limit}`;
    
    const response = await fetch(proxyUrl, {
      headers: getProxyHeaders(),
    });
    
    if (!response.ok) {
      throw new Error(`Proxy error: ${response.status}`);
    }
    
    const data = await response.json();
    const posts = data.posts || [];

    return posts.map((bskyPost: any) => ({
      id: bskyPost.cid,
      user_id: bskyPost.author.did,
      content: bskyPost.record?.text || "",
      created_at: bskyPost.record?.createdAt || bskyPost.indexedAt,
      // Use thumb for feed performance, fullsize available if needed
      media_urls: bskyPost.embed?.images?.map((img: any) => img.thumb || img.fullsize) || [],
      likes_count: bskyPost.likeCount || 0,
      reposts_count: bskyPost.repostCount || 0,
      replies_count: bskyPost.replyCount || 0,
      is_federated: true,
      type: 'post',
      author: {
        id: bskyPost.author.did,
        username: bskyPost.author.handle,
        display_name: bskyPost.author.displayName || bskyPost.author.handle,
        avatar_url: bskyPost.author.avatar,
        is_verified: false,
      },
    }));
  } catch (error) {
    console.error("Bluesky search failed:", error);
    return [];
  }
}

/**
 * Fetch a single post with its thread (replies)
 */
export interface BlueskyThread {
  post: FederatedPost;
  replies: FederatedPost[];
  parent?: FederatedPost;
}

function parseBlueskyPost(bskyPost: any): FederatedPost {
  return {
    id: bskyPost.cid,
    uri: bskyPost.uri,
    cid: bskyPost.cid,
    user_id: bskyPost.author.did,
    content: bskyPost.record?.text || "",
    created_at: bskyPost.record?.createdAt || bskyPost.indexedAt,
    // Use thumb for feed performance, fullsize available if needed
    media_urls: bskyPost.embed?.images?.map((img: any) => img.thumb || img.fullsize) || [],
    likes_count: bskyPost.likeCount || 0,
    reposts_count: bskyPost.repostCount || 0,
    replies_count: bskyPost.replyCount || 0,
    is_federated: true as const,
    type: 'post' as const,
    author: {
      id: bskyPost.author.did,
      did: bskyPost.author.did,
      handle: bskyPost.author.handle,
      username: bskyPost.author.handle,
      display_name: bskyPost.author.displayName || bskyPost.author.handle,
      avatar_url: bskyPost.author.avatar || null,
      is_verified: false,
    },
  };
}

/**
 * Lazy sync: Update local post counts from Bluesky
 * Called when viewing post details to keep counts fresh
 * Fails silently - doesn't block the UI if update fails
 */
async function syncPostCounts(post: FederatedPost): Promise<void> {
  try {
    const { error } = await supabase
      .from('posts')
      .update({
        likes_count: post.likes_count,
        reposts_count: post.reposts_count,
        replies_count: post.replies_count,
      })
      .eq('at_uri', post.uri);
    
    if (error) {
      // Silently fail - this is just an optimization
      console.debug('[syncPostCounts] Update failed (post may not exist locally):', error.message);
    }
  } catch (err) {
    // Silently fail
    console.debug('[syncPostCounts] Error:', err);
  }
}

export async function getBlueskyPostThread(uri: string): Promise<BlueskyThread | null> {
  try {
    const data = await fetchBluesky("app.bsky.feed.getPostThread", {
      uri,
      depth: 6,
      parentHeight: 1,
    });

    if (!data.thread || data.thread.$type !== "app.bsky.feed.defs#threadViewPost") {
      return null;
    }

    const thread = data.thread;
    const mainPost = parseBlueskyPost(thread.post);
    
    // Lazy sync: Update local DB with fresh counts from Bluesky
    // Fire and forget - don't await, don't block the UI
    syncPostCounts(mainPost);
    
    // Parse only direct replies (depth 1), not nested replies
    const replies: FederatedPost[] = [];
    if (thread.replies) {
      for (const reply of thread.replies) {
        if (reply.$type === "app.bsky.feed.defs#threadViewPost" && reply.post) {
          replies.push(parseBlueskyPost(reply.post));
        }
      }
    }
    
    // Parse parent if exists
    let parent: FederatedPost | undefined;
    if (thread.parent && thread.parent.$type === "app.bsky.feed.defs#threadViewPost") {
      parent = parseBlueskyPost(thread.parent.post);
    }

    return { post: mainPost, replies, parent };
  } catch (error) {
    console.error("Failed to fetch Bluesky thread:", error);
    return null;
  }
}
