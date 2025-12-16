import { View, Text, Pressable } from "react-native";
import { Image } from "expo-image";
import { Heart, MessageCircle, MoreHorizontal, ChevronRight } from "lucide-react-native";
import { useRouter } from "expo-router";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "@/lib/utils/date";

interface Author {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  author: Author;
  likes_count?: number;
  replies_count?: number;
  is_liked?: boolean;
}

interface ThreadCommentProps {
  comment: Comment;
  isLast?: boolean;
  isReply?: boolean;
  onReplyPress?: () => void;
  onLikePress?: () => void;
  onProfilePress?: () => void;
  onPivot?: () => void; // Navigate to make this comment the main post
}

export function ThreadComment({ 
  comment, 
  isLast = false, 
  isReply = false,
  onReplyPress,
  onLikePress,
  onProfilePress,
  onPivot
}: ThreadCommentProps) {
  const router = useRouter();
  const avatarUrl = comment.author?.avatar_url || 
    `https://ui-avatars.com/api/?name=${comment.author?.username || "U"}&background=10B981&color=fff`;

  // Pivot: Navigate to this comment as the "main post" of a new thread view
  const handlePivot = () => {
    if (onPivot) {
      onPivot();
    } else {
      router.push(`/post/${comment.id}` as any);
    }
  };

  return (
    <Pressable 
      onPress={handlePivot}
      className={cn("flex-row px-4 bg-background active:bg-surface/50", isReply && "pl-8")}
    >
      {/* Left Column: Avatar + Connector Line */}
      <View className="items-center mr-3">
        <Pressable onPress={onProfilePress}>
          <Image
            source={{ uri: avatarUrl }}
            style={{ width: 36, height: 36, borderRadius: 18 }}
            contentFit="cover"
          />
        </Pressable>
        
        {/* The Connector Line - shows thread connection */}
        {!isLast && (
          <View className="flex-1 w-[2px] bg-border my-2 rounded-full" />
        )}
      </View>

      {/* Right Column: Content */}
      <View className={cn("flex-1 pb-4", !isLast && "border-b border-border/30")}>
        {/* Header */}
        <View className="flex-row justify-between items-center mb-1">
          <View className="flex-row items-center gap-2 flex-1">
            <Pressable onPress={onProfilePress}>
              <Text className="font-bold text-text-primary text-sm">
                {comment.author?.display_name || comment.author?.username || "Unknown"}
              </Text>
            </Pressable>
            <Text className="text-text-muted text-xs">
              @{comment.author?.username || "user"}
            </Text>
            <Text className="text-text-muted text-xs">
              · {formatDistanceToNow(new Date(comment.created_at))}
            </Text>
          </View>
          <Pressable className="p-1 active:opacity-70">
            <MoreHorizontal size={16} color="#6B7280" />
          </Pressable>
        </View>

        {/* Body */}
        <Text className="text-text-primary text-base leading-5 mb-3">
          {comment.content}
        </Text>

        {/* Actions */}
        <View className="flex-row gap-6">
          <Pressable 
            onPress={(e) => { e.stopPropagation(); onReplyPress?.(); }}
            className="flex-row items-center gap-1.5 active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel="Reply"
          >
            <MessageCircle size={16} color="#6B7280" />
            {/* Show count next to reply icon */}
            {(comment.replies_count ?? 0) > 0 && (
              <Text className="text-xs font-medium text-text-muted">
                {comment.replies_count}
              </Text>
            )}
          </Pressable>

          <Pressable 
            onPress={(e) => { e.stopPropagation(); onLikePress?.(); }}
            className="flex-row items-center gap-1.5 active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel="Like"
          >
            <Heart 
              size={16} 
              color={comment.is_liked ? "#EF4444" : "#6B7280"}
              fill={comment.is_liked ? "#EF4444" : "transparent"}
            />
            {(comment.likes_count ?? 0) > 0 && (
              <Text className={cn(
                "text-xs font-medium",
                comment.is_liked ? "text-red-500" : "text-text-muted"
              )}>
                {comment.likes_count}
              </Text>
            )}
          </Pressable>

          {/* Pivot indicator - "View Thread" badge shows there are deeper replies */}
          {(comment.replies_count ?? 0) > 0 && (
            <View className="flex-1 items-end">
              <View className="flex-row items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10">
                <Text className="text-[10px] font-bold text-primary uppercase">View Thread</Text>
                <ChevronRight size={12} color="#10B981" />
              </View>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

// Connector line component for between main post and comments
export function ThreadConnector() {
  return (
    <View className="px-4 py-2">
      <View className="ml-[18px] w-[2px] h-4 bg-border rounded-full" />
    </View>
  );
}
