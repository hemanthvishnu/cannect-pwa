/**
 * Unified Post Types - Single interface for all post sources
 * 
 * Follows Bluesky's PostView pattern to create a unified post model
 * that works for both local Cannect posts and external Bluesky posts.
 */

import type { PostWithAuthor, FederatedPost } from "./database";
import type { BlueskyPostData } from "@/components/social/BlueskyPost";

// =====================================================
// UnifiedPost - The single source of truth
// =====================================================

/** Author info normalized across all sources */
export interface UnifiedAuthor {
  /** Unique identifier (user id for local, DID for external) */
  id: string;
  /** Username/handle without @ */
  handle: string;
  /** Display name (fallback to handle) */
  displayName: string;
  /** Avatar URL (with fallback support) */
  avatarUrl: string;
  /** Whether user is verified (Cannect-only feature) */
  isVerified?: boolean;
  /** AT Protocol DID (for external users) */
  did?: string;
}

/** Quoted post structure */
export interface UnifiedQuote {
  uri: string;
  cid?: string;
  content: string;
  author: UnifiedAuthor;
  images?: string[];
  isExternal: boolean;
}

/** Embed types */
export interface UnifiedEmbed {
  type: "images" | "video" | "quote" | "external";
  images?: string[];
  videoUrl?: string;
  videoThumbnail?: string;
  quote?: UnifiedQuote;
  externalUrl?: string;
  externalTitle?: string;
  externalDescription?: string;
  externalThumb?: string;
}

/** Repost attribution */
export interface RepostInfo {
  id: string;
  handle: string;
  displayName: string;
  isOwnRepost: boolean;
}

/** Parent post context for replies */
export interface ParentInfo {
  handle: string;
  displayName?: string;
  uri?: string;
}

/** Viewer state (current user's interaction state) */
export interface UnifiedViewer {
  isLiked: boolean;
  isReposted: boolean;
  isQuoted?: boolean;
  likeUri?: string;
  repostUri?: string;
}

/** 
 * UnifiedPost - Normalized post structure
 * 
 * Follows Bluesky's PostView pattern:
 * - uri: Unique identifier (AT URI for external, local URI for Cannect)
 * - cid: Content hash (AT Protocol)
 * - record: The actual post content
 * - author: Who created it
 * - embed: Attached media/quotes
 * - replyCount, repostCount, likeCount: Stats
 * - viewer: Current user's interaction state
 */
export interface UnifiedPost {
  // === Identity ===
  /** Unique URI (at:// for external, cannect:// for local) */
  uri: string;
  /** Content ID (AT Protocol) */
  cid?: string;
  /** Local database ID (if exists) */
  localId?: string;

  // === Content ===
  /** Post text content */
  content: string;
  /** When created (ISO string) */
  createdAt: string;
  /** When indexed (ISO string) */
  indexedAt: string;
  
  // === Author ===
  author: UnifiedAuthor;
  
  // === Embeds ===
  embed?: UnifiedEmbed;
  
  // === Stats ===
  replyCount: number;
  repostCount: number;
  quoteCount: number;
  likeCount: number;
  
  // === Viewer State ===
  viewer: UnifiedViewer;
  
  // === Context ===
  /** If this post was shown because of a repost */
  repostedBy?: RepostInfo;
  /** If this is a reply, info about parent */
  parent?: ParentInfo;
  
  // === Source ===
  /** Whether this post is from external network */
  isExternal: boolean;
  /** Source network name */
  source: "cannect" | "bluesky";
  
  // === Post Type ===
  type: "post" | "reply" | "quote";
}

// =====================================================
// Adapter Functions
// =====================================================

/** Generate fallback avatar URL */
function getFallbackAvatar(name: string, source: "cannect" | "bluesky"): string {
  const bg = source === "cannect" ? "10B981" : "3B82F6";
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${bg}&color=fff&size=88`;
}

/**
 * Convert local Cannect post to UnifiedPost
 */
export function fromLocalPost(
  post: PostWithAuthor,
  currentUserId?: string
): UnifiedPost {
  const author = post.author;
  const isFederated = !!(post as any).at_uri && !(post as any).at_uri?.includes("cannect.space");
  
  // Build author
  const unifiedAuthor: UnifiedAuthor = {
    id: author?.id || "",
    handle: author?.username || "user",
    displayName: author?.display_name || author?.username || "User",
    avatarUrl: author?.avatar_url || getFallbackAvatar(author?.username || "U", isFederated ? "bluesky" : "cannect"),
    isVerified: author?.is_verified,
    did: isFederated ? (post as any).external_metadata?.author?.did : undefined,
  };

  // Build embed
  let embed: UnifiedEmbed | undefined;
  
  // Check for quoted post
  if (post.type === "quote" && post.quoted_post?.id) {
    const quoted = post.quoted_post;
    const quotedIsFederated = !!(quoted as any).at_uri && !(quoted as any).at_uri?.includes("cannect.space");
    
    embed = {
      type: "quote",
      quote: {
        uri: (quoted as any).at_uri || `cannect://post/${quoted.id}`,
        content: quoted.content || "",
        author: {
          id: quoted.author?.id || "",
          handle: quoted.author?.username || "user",
          displayName: quoted.author?.display_name || quoted.author?.username || "User",
          avatarUrl: quoted.author?.avatar_url || getFallbackAvatar(quoted.author?.username || "U", quotedIsFederated ? "bluesky" : "cannect"),
        },
        images: quoted.media_urls || undefined,
        isExternal: quotedIsFederated,
      },
    };
  } else if (post.media_urls && post.media_urls.length > 0) {
    embed = {
      type: "images",
      images: post.media_urls,
    };
  } else if (post.video_url) {
    embed = {
      type: "video",
      videoUrl: post.video_url,
      videoThumbnail: post.video_thumbnail_url || undefined,
    };
  }

  // Build repost info
  let repostedBy: RepostInfo | undefined;
  if ((post as any).reposted_by) {
    const reposter = (post as any).reposted_by;
    repostedBy = {
      id: reposter.id,
      handle: reposter.username,
      displayName: reposter.display_name || reposter.username,
      isOwnRepost: reposter.id === currentUserId,
    };
  }

  // Build parent info
  let parent: ParentInfo | undefined;
  if (post.is_reply && post.parent_post?.author) {
    parent = {
      handle: post.parent_post.author.username || "user",
      displayName: post.parent_post.author.display_name,
    };
  }

  // Determine post type
  let type: "post" | "reply" | "quote" = "post";
  if (post.type === "quote") type = "quote";
  else if (post.is_reply) type = "reply";

  return {
    // Identity
    uri: (post as any).at_uri || `cannect://post/${post.id}`,
    cid: (post as any).at_cid || undefined,
    localId: post.id,
    
    // Content
    content: post.content || "",
    createdAt: post.created_at,
    indexedAt: post.created_at,
    
    // Author
    author: unifiedAuthor,
    
    // Embed
    embed,
    
    // Stats
    replyCount: post.replies_count || 0,
    repostCount: post.reposts_count || 0,
    quoteCount: (post as any).quotes_count || 0,
    likeCount: post.likes_count || 0,
    
    // Viewer
    viewer: {
      isLiked: post.is_liked || false,
      isReposted: post.is_reposted_by_me || false,
      isQuoted: (post as any).is_quoted_by_me || false,
    },
    
    // Context
    repostedBy,
    parent,
    
    // Source
    isExternal: isFederated,
    source: isFederated ? "bluesky" : "cannect",
    type,
  };
}

/**
 * Convert BlueskyPostData (from API) to UnifiedPost
 */
export function fromBlueskyPost(
  post: BlueskyPostData,
  viewerState?: { isLiked?: boolean; isReposted?: boolean }
): UnifiedPost {
  const author: UnifiedAuthor = {
    id: post.author.did,
    handle: post.author.handle,
    displayName: post.author.displayName || post.author.handle,
    avatarUrl: post.author.avatar || getFallbackAvatar(post.author.handle, "bluesky"),
    did: post.author.did,
  };

  // Build embed for images
  let embed: UnifiedEmbed | undefined;
  if (post.images && post.images.length > 0) {
    embed = {
      type: "images",
      images: post.images,
    };
  }

  return {
    // Identity
    uri: post.uri,
    cid: post.cid,
    localId: undefined,
    
    // Content
    content: post.content,
    createdAt: post.createdAt,
    indexedAt: post.createdAt,
    
    // Author
    author,
    
    // Embed
    embed,
    
    // Stats (note: these may not include viewer's own actions)
    replyCount: post.replyCount || 0,
    repostCount: post.repostCount || 0,
    quoteCount: 0,
    likeCount: post.likeCount || 0,
    
    // Viewer
    viewer: {
      isLiked: viewerState?.isLiked || false,
      isReposted: viewerState?.isReposted || false,
    },
    
    // Context
    repostedBy: undefined,
    parent: undefined,
    
    // Source
    isExternal: true,
    source: "bluesky",
    type: "post",
  };
}

/**
 * Convert Bluesky API FeedViewPost to UnifiedPost
 */
export function fromBlueskyFeedPost(feedPost: any): UnifiedPost {
  const post = feedPost.post;
  const record = post.record;
  
  const author: UnifiedAuthor = {
    id: post.author.did,
    handle: post.author.handle,
    displayName: post.author.displayName || post.author.handle,
    avatarUrl: post.author.avatar || getFallbackAvatar(post.author.handle, "bluesky"),
    did: post.author.did,
  };

  // Build embed
  let embed: UnifiedEmbed | undefined;
  if (post.embed) {
    if (post.embed.$type === "app.bsky.embed.images#view") {
      embed = {
        type: "images",
        images: post.embed.images?.map((img: any) => img.fullsize || img.thumb) || [],
      };
    } else if (post.embed.$type === "app.bsky.embed.video#view") {
      embed = {
        type: "video",
        videoUrl: post.embed.playlist,
        videoThumbnail: post.embed.thumbnail,
      };
    } else if (post.embed.$type === "app.bsky.embed.record#view") {
      const quotedRecord = post.embed.record;
      if (quotedRecord.value) {
        embed = {
          type: "quote",
          quote: {
            uri: quotedRecord.uri,
            cid: quotedRecord.cid,
            content: quotedRecord.value.text || "",
            author: {
              id: quotedRecord.author?.did || "",
              handle: quotedRecord.author?.handle || "user",
              displayName: quotedRecord.author?.displayName || quotedRecord.author?.handle || "User",
              avatarUrl: quotedRecord.author?.avatar || getFallbackAvatar(quotedRecord.author?.handle || "U", "bluesky"),
              did: quotedRecord.author?.did,
            },
            isExternal: true,
          },
        };
      }
    } else if (post.embed.$type === "app.bsky.embed.external#view") {
      const external = post.embed.external;
      embed = {
        type: "external",
        externalUrl: external.uri,
        externalTitle: external.title,
        externalDescription: external.description,
        externalThumb: external.thumb,
      };
    }
  }

  // Handle repost reason
  let repostedBy: RepostInfo | undefined;
  if (feedPost.reason?.$type === "app.bsky.feed.defs#reasonRepost") {
    const by = feedPost.reason.by;
    repostedBy = {
      id: by.did,
      handle: by.handle,
      displayName: by.displayName || by.handle,
      isOwnRepost: false, // Will be determined by caller
    };
  }

  // Handle reply parent
  let parent: ParentInfo | undefined;
  if (record.reply?.parent) {
    // Note: We might need to resolve the parent author from the thread
    parent = {
      handle: "", // Will be resolved separately if needed
      uri: record.reply.parent.uri,
    };
  }

  return {
    // Identity
    uri: post.uri,
    cid: post.cid,
    localId: undefined,
    
    // Content
    content: record.text || "",
    createdAt: record.createdAt,
    indexedAt: post.indexedAt,
    
    // Author
    author,
    
    // Embed
    embed,
    
    // Stats
    replyCount: post.replyCount || 0,
    repostCount: post.repostCount || 0,
    quoteCount: post.quoteCount || 0,
    likeCount: post.likeCount || 0,
    
    // Viewer
    viewer: {
      isLiked: !!post.viewer?.like,
      isReposted: !!post.viewer?.repost,
    },
    
    // Context
    repostedBy,
    parent,
    
    // Source
    isExternal: true,
    source: "bluesky",
    type: record.reply ? "reply" : "post",
  };
}

/**
 * Convert FederatedPost from bluesky service to UnifiedPost
 * This is the type returned by getFederatedPosts()
 */
export interface ServiceFederatedPost {
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

export function fromServiceFederatedPost(
  post: ServiceFederatedPost,
  viewerState?: { isLiked?: boolean; isReposted?: boolean }
): UnifiedPost {
  const author: UnifiedAuthor = {
    id: post.author.id,
    handle: post.author.handle || post.author.username,
    displayName: post.author.display_name || post.author.handle || post.author.username,
    avatarUrl: post.author.avatar_url || getFallbackAvatar(post.author.handle, "bluesky"),
    isVerified: post.author.is_verified,
    did: post.author.did,
  };

  // Build embed for images
  let embed: UnifiedEmbed | undefined;
  if (post.media_urls && post.media_urls.length > 0) {
    embed = {
      type: "images",
      images: post.media_urls,
    };
  }

  return {
    // Identity
    uri: post.uri,
    cid: post.cid,
    localId: post.id,
    
    // Content
    content: post.content || "",
    createdAt: post.created_at,
    indexedAt: post.created_at,
    
    // Author
    author,
    
    // Embed
    embed,
    
    // Stats
    replyCount: post.replies_count || 0,
    repostCount: post.reposts_count || 0,
    quoteCount: 0,
    likeCount: post.likes_count || 0,
    
    // Viewer
    viewer: {
      isLiked: viewerState?.isLiked || false,
      isReposted: viewerState?.isReposted || false,
    },
    
    // Context
    repostedBy: undefined,
    parent: undefined,
    
    // Source
    isExternal: true,
    source: "bluesky",
    type: post.type === "post" ? "post" : "post",
  };
}

// =====================================================
// Type Guards
// =====================================================

export function isExternalPost(post: UnifiedPost): boolean {
  return post.isExternal;
}

export function hasImages(post: UnifiedPost): post is UnifiedPost & { embed: { type: "images"; images: string[] } } {
  return post.embed?.type === "images" && !!post.embed.images?.length;
}

export function hasVideo(post: UnifiedPost): post is UnifiedPost & { embed: { type: "video"; videoUrl: string } } {
  return post.embed?.type === "video" && !!post.embed.videoUrl;
}

export function hasQuote(post: UnifiedPost): post is UnifiedPost & { embed: { type: "quote"; quote: UnifiedQuote } } {
  return post.embed?.type === "quote" && !!post.embed.quote;
}

export function hasExternalLink(post: UnifiedPost): post is UnifiedPost & { embed: { type: "external" } } {
  return post.embed?.type === "external";
}
