export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string | null;
          avatar_url: string | null;
          cover_url: string | null;
          bio: string | null;
          website: string | null;
          followers_count: number;
          following_count: number;
          posts_count: number;
          is_verified: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          display_name?: string | null;
          avatar_url?: string | null;
          cover_url?: string | null;
          bio?: string | null;
          website?: string | null;
          followers_count?: number;
          following_count?: number;
          posts_count?: number;
          is_verified?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          cover_url?: string | null;
          bio?: string | null;
          website?: string | null;
          followers_count?: number;
          following_count?: number;
          posts_count?: number;
          is_verified?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      posts: {
        Row: {
          id: string;
          user_id: string;
          content: string;
          media_urls: string[] | null;
          video_url: string | null;
          video_thumbnail_url: string | null;
          likes_count: number;
          comments_count: number;
          reposts_count: number;
          is_reply: boolean;
          reply_to_id: string | null;
          is_repost: boolean;
          repost_of_id: string | null;
          type: 'post' | 'repost' | 'quote';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          content: string;
          media_urls?: string[] | null;
          video_url?: string | null;
          video_thumbnail_url?: string | null;
          likes_count?: number;
          comments_count?: number;
          reposts_count?: number;
          is_reply?: boolean;
          reply_to_id?: string | null;
          is_repost?: boolean;
          repost_of_id?: string | null;
          type?: 'post' | 'repost' | 'quote';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          content?: string;
          media_urls?: string[] | null;
          video_url?: string | null;
          video_thumbnail_url?: string | null;
          likes_count?: number;
          comments_count?: number;
          reposts_count?: number;
          is_reply?: boolean;
          reply_to_id?: string | null;
          is_repost?: boolean;
          repost_of_id?: string | null;
          type?: 'post' | 'repost' | 'quote';
          created_at?: string;
          updated_at?: string;
        };
      };
      likes: {
        Row: {
          id: string;
          user_id: string;
          post_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          post_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          post_id?: string;
          created_at?: string;
        };
      };
      follows: {
        Row: {
          id: string;
          follower_id: string;
          following_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          follower_id: string;
          following_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          follower_id?: string;
          following_id?: string;
          created_at?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          actor_id: string;
          type: "like" | "follow" | "comment" | "repost" | "mention";
          post_id: string | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          actor_id: string;
          type: "like" | "follow" | "comment" | "repost" | "mention";
          post_id?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          actor_id?: string;
          type?: "like" | "follow" | "comment" | "repost" | "mention";
          post_id?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
}

// Helper types
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Post = Database["public"]["Tables"]["posts"]["Row"];
export type Like = Database["public"]["Tables"]["likes"]["Row"];
export type Follow = Database["public"]["Tables"]["follows"]["Row"];
export type Notification = Database["public"]["Tables"]["notifications"]["Row"];

// =====================================================
// Extended types with relations
// =====================================================

/** Metadata for externally sourced (federated) content */
export interface ExternalMetadata {
  content?: string;
  author?: {
    id?: string;
    username?: string;
    display_name?: string;
    avatar_url?: string;
    handle?: string;
  };
  media_urls?: string[];
  created_at?: string;
  likes_count?: number;
  reposts_count?: number;
  comments_count?: number;
}

/** Parent post context for thread display */
export interface ParentPostContext {
  author?: {
    username?: string;
    display_name?: string;
  };
}

/** Base post with author relation */
export interface BasePostWithAuthor extends Post {
  author: Profile;
  is_liked?: boolean;
  is_reposted_by_me?: boolean;
  quoted_post?: (Post & { 
    author: Profile;
    quoted_post_id?: string | null;
  }) | null;
  parent_post?: ParentPostContext | null;
}

/** Local Cannect post (native content) */
export interface LocalPost extends BasePostWithAuthor {
  is_federated?: false;
  external_id?: undefined;
  external_source?: undefined;
  external_metadata?: undefined;
}

/** Federated post from external source (e.g., Bluesky) */
export interface FederatedPost extends BasePostWithAuthor {
  is_federated: true;
  external_id: string;
  external_source: "bluesky" | string;
  external_metadata: ExternalMetadata;
}

/** Discriminated union for all post types */
export type PostWithAuthor = LocalPost | FederatedPost;

/** Type guard for federated posts */
export function isFederatedPost(post: PostWithAuthor): post is FederatedPost {
  return 'is_federated' in post && post.is_federated === true;
}

/** Type guard for posts with external metadata (shadow reposts) */
export function hasExternalMetadata(post: PostWithAuthor): post is FederatedPost {
  return 'external_id' in post && 'external_metadata' in post && !!post.external_metadata;
}

export type NotificationWithActor = Notification & {
  actor: Profile;
  post?: Post;
};
