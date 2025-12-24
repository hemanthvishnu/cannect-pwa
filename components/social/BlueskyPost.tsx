/**
 * BlueskyPost.tsx - Post component for external Bluesky posts
 * 
 * Similar to SocialPost but designed for posts that don't exist
 * in our local database. Uses AT Protocol URIs for interactions.
 * 
 * @deprecated Consider using UnifiedFeedItem with fromBlueskyPost() adapter instead.
 * This component uses the unified hooks for interactions.
 */

import { View, Text, Pressable } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Heart, MessageCircle, Repeat2, Share } from "lucide-react-native";
import { formatDistanceToNow } from "@/lib/utils/date";
import { 
  useUnifiedHasLiked, 
  useUnifiedLike, 
  useUnifiedUnlike,
  useUnifiedHasReposted,
  useUnifiedRepost,
  useUnifiedUnrepost,
} from "@/lib/hooks/use-posts";
import { cn } from "@/lib/utils";

export interface BlueskyPostData {
  uri: string;      // AT Protocol URI
  cid: string;      // Content ID
  content: string;
  createdAt: string;
  author: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  images?: string[];
  // Quoted post for quote posts
  quotedPost?: {
    uri: string;
    cid: string;
    content: string;
    author: {
      did: string;
      handle: string;
      displayName: string;
      avatar?: string;
    };
  };
}

interface BlueskyPostProps {
  post: BlueskyPostData;
  onPress?: () => void;
  onReply?: () => void;
  onShare?: () => void;
  showInteractions?: boolean;
}

export function BlueskyPost({ 
  post, 
  onPress,
  onReply, 
  onShare,
  showInteractions = true,
}: BlueskyPostProps) {
  const router = useRouter();
  
  // Unified interaction state (works for all posts by subject_uri)
  const { data: isLiked } = useUnifiedHasLiked(post.uri);
  const { data: isReposted } = useUnifiedHasReposted(post.uri);
  
  // Unified mutations (single code path for all posts)
  const likeMutation = useUnifiedLike();
  const unlikeMutation = useUnifiedUnlike();
  const repostMutation = useUnifiedRepost();
  const unrepostMutation = useUnifiedUnrepost();

  const handleLike = () => {
    if (isLiked) {
      unlikeMutation.mutate({ subjectUri: post.uri });
    } else {
      likeMutation.mutate({ subjectUri: post.uri, subjectCid: post.cid });
    }
  };

  const handleRepost = () => {
    if (isReposted) {
      unrepostMutation.mutate({ subjectUri: post.uri });
    } else {
      repostMutation.mutate({ subjectUri: post.uri, subjectCid: post.cid });
    }
  };

  const handleAuthorPress = () => {
    // Use unified profile routing
    router.push(`/user/${post.author.handle}` as any);
  };

  const handleReply = () => {
    // Navigate to compose with reply context
    router.push({
      pathname: "/compose",
      params: {
        replyToUri: post.uri,
        replyToCid: post.cid,
        replyToAuthor: post.author.displayName || post.author.handle,
        replyToHandle: post.author.handle,
        replyToContent: post.content.slice(0, 100),
      }
    } as any);
  };

  const handlePostPress = () => {
    if (onPress) {
      onPress();
    } else {
      // Default: navigate to federated post detail
      router.push({
        pathname: "/federated/post",
        params: { uri: post.uri }
      } as any);
    }
  };

  const timeAgo = formatDistanceToNow(new Date(post.createdAt));
  
  // Generate fallback avatar URL
  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(post.author.displayName || post.author.handle)}&background=3B82F6&color=fff&size=88`;

  return (
    <Pressable onPress={handlePostPress} className="px-4 py-3 border-b border-border">
      {/* Author Row */}
      <Pressable onPress={handleAuthorPress} className="flex-row items-center gap-3 mb-2">
        <Image
          source={{ uri: post.author.avatar || fallbackAvatar }}
          placeholder={fallbackAvatar}
          placeholderContentFit="cover"
          style={{ width: 44, height: 44, borderRadius: 22 }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={post.author.did}
          onError={() => {
            // Fallback handled by placeholder
          }}
        />
        <View className="flex-1">
          <Text className="text-text-primary font-semibold">
            {post.author.displayName || post.author.handle}
          </Text>
          <Text className="text-text-muted text-sm">
            @{post.author.handle} · {timeAgo}
          </Text>
        </View>
      </Pressable>

      {/* Content */}
      <Text className="text-text-primary text-base mb-2 leading-5">
        {post.content}
      </Text>

      {/* Images */}
      {post.images && post.images.length > 0 && (
        <View className="mb-2 rounded-xl overflow-hidden">
          {post.images.length === 1 ? (
            <Image
              source={{ uri: post.images[0] }}
              style={{ width: "100%", height: 200 }}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={post.uri}
              transition={200}
            />
          ) : (
            <View className="flex-row flex-wrap gap-1">
              {post.images.slice(0, 4).map((img, i) => (
                <Image
                  key={i}
                  source={{ uri: img }}
                  style={{ width: "48%", height: 120 }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={`${post.uri}-${i}`}
                  transition={200}
                />
              ))}
            </View>
          )}
        </View>
      )}

      {/* Interactions */}
      {showInteractions && (
        <View className="flex-row items-center justify-between mt-2 pt-2">
          {/* Reply */}
          <Pressable 
            onPress={onReply || handleReply}
            className="flex-row items-center gap-1.5"
          >
            <MessageCircle size={18} color="#6B7280" />
            <Text className="text-text-muted text-sm">
              {post.replyCount || 0}
            </Text>
          </Pressable>

          {/* Repost */}
          <Pressable 
            onPress={handleRepost}
            disabled={repostMutation.isPending || unrepostMutation.isPending}
            className="flex-row items-center gap-1.5"
          >
            <Repeat2 
              size={18} 
              color={isReposted ? "#10B981" : "#6B7280"} 
            />
            <Text className={cn(
              "text-sm",
              isReposted ? "text-primary font-medium" : "text-text-muted"
            )}>
              {(post.repostCount || 0) + (isReposted ? 1 : 0)}
            </Text>
          </Pressable>

          {/* Like */}
          <Pressable 
            onPress={handleLike}
            disabled={likeMutation.isPending || unlikeMutation.isPending}
            className="flex-row items-center gap-1.5"
          >
            <Heart 
              size={18} 
              color={isLiked ? "#EF4444" : "#6B7280"} 
              fill={isLiked ? "#EF4444" : "transparent"}
            />
            <Text className={cn(
              "text-sm",
              isLiked ? "text-red-500 font-medium" : "text-text-muted"
            )}>
              {(post.likeCount || 0) + (isLiked ? 1 : 0)}
            </Text>
          </Pressable>

          {/* Share */}
          <Pressable 
            onPress={onShare}
            className="flex-row items-center gap-1.5"
          >
            <Share size={18} color="#6B7280" />
          </Pressable>
        </View>
      )}
    </Pressable>
  );
}
