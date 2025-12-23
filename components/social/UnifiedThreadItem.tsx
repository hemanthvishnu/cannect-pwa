/**
 * UnifiedThreadItem - Thread post component matching Bluesky's official layout
 * 
 * Reference: bluesky-social/social-app
 * - ThreadItemPost.tsx (linear replies)
 * - ThreadItemAnchor.tsx (focused/anchor post)
 * - ThreadItemTreePost.tsx (tree view replies)
 * 
 * Layout follows Bluesky exactly:
 * - Parent reply line (12px height, centered in avatar column)
 * - Avatar (42px linear / 24px tree) with optional child line
 * - Content: name, handle, time, text, media, actions
 * - Anchor posts have expanded layout with stats row
 */

import React, { memo, useCallback, useMemo, useRef } from "react";
import { 
  View, 
  Text, 
  Pressable, 
  StyleSheet, 
  Platform, 
  Animated,
  type ViewStyle,
  type StyleProp 
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { 
  Heart, 
  MessageCircle, 
  Repeat2, 
  Share, 
  MoreHorizontal,
  Globe2,
  BadgeCheck,
} from "lucide-react-native";

import { THREAD_DESIGN } from "@/lib/types/thread";
import { formatDistanceToNow, formatDateTime } from "@/lib/utils/date";
import { BLURHASH_PLACEHOLDERS } from "@/lib/utils/assets";
import type { PostWithAuthor } from "@/lib/types/database";
import { PostCarousel } from "./PostCarousel";
import { VideoPlayer } from "@/components/ui/VideoPlayer";

// =====================================================
// Types
// =====================================================

/**
 * Thread item UI state - computed from position in thread
 * Matches Bluesky's ThreadItem.ui structure
 */
interface ThreadItemUI {
  /** Whether this is the anchor (focused) post */
  isAnchor: boolean;
  /** Show vertical line connecting from parent above */
  showParentReplyLine: boolean;
  /** Show vertical line connecting to child below */
  showChildReplyLine: boolean;
  /** Indent level (for tree view, 0 for linear) */
  indent: number;
  /** Is this the last child in its branch */
  isLastChild: boolean;
}

interface UnifiedThreadItemProps {
  post: PostWithAuthor;
  ui: ThreadItemUI;
  /** "Replying to @username" label */
  replyingTo?: string;
  /** Current view mode */
  viewMode?: "linear" | "tree";
  
  // Actions
  onPress?: () => void;
  onLike?: () => void;
  onReply?: () => void;
  onRepost?: () => void;
  onShare?: () => void;
  onProfilePress?: () => void;
  onMore?: () => void;
  
  // Style overrides
  style?: StyleProp<ViewStyle>;
  hideTopBorder?: boolean;
}

// =====================================================
// Helper Components
// =====================================================

/**
 * Parent reply line - vertical line above the post
 * Matches Bluesky's ThreadItemPostParentReplyLine
 */
const ParentReplyLine = memo(function ParentReplyLine({ 
  show,
  avatarWidth,
}: { 
  show: boolean;
  avatarWidth: number;
}) {
  if (!show) return null;
  
  return (
    <View style={[styles.parentLineContainer, { width: avatarWidth }]}>
      <View style={styles.parentLine} />
    </View>
  );
});

/**
 * Child reply line - vertical line below the avatar
 * Matches Bluesky's pattern for connecting to replies
 */
const ChildReplyLine = memo(function ChildReplyLine({ 
  show 
}: { 
  show: boolean 
}) {
  if (!show) return null;
  
  return <View style={styles.childLine} />;
});

/**
 * Action button with haptic feedback
 */
const ActionButton = memo(function ActionButton({
  icon: Icon,
  count,
  active,
  activeColor = "#EF4444",
  onPress,
  fill = false,
  size = 18,
}: {
  icon: React.ComponentType<any>;
  count?: number;
  active?: boolean;
  activeColor?: string;
  onPress?: () => void;
  fill?: boolean;
  size?: number;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1.2,
        friction: 4,
        tension: 200,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        useNativeDriver: true,
      }),
    ]).start();

    onPress?.();
  }, [onPress, scaleAnim]);

  return (
    <Pressable onPress={handlePress} style={styles.actionButton}>
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Icon
          size={size}
          color={active ? activeColor : "#6B7280"}
          strokeWidth={2}
          fill={fill && active ? activeColor : "transparent"}
        />
      </Animated.View>
      {count !== undefined && count > 0 && (
        <Text style={[styles.actionCount, active && { color: activeColor }]}>
          {count}
        </Text>
      )}
    </Pressable>
  );
});

// =====================================================
// Main Component
// =====================================================

export const UnifiedThreadItem = memo(function UnifiedThreadItem({
  post,
  ui,
  replyingTo,
  viewMode = "linear",
  onPress,
  onLike,
  onReply,
  onRepost,
  onShare,
  onProfilePress,
  onMore,
  style,
  hideTopBorder,
}: UnifiedThreadItemProps) {
  const router = useRouter();
  
  const isAnchor = ui.isAnchor;
  const isTreeView = viewMode === "tree" && !isAnchor;
  const avatarSize = isAnchor 
    ? THREAD_DESIGN.ANCHOR_AVI_WIDTH 
    : (isTreeView ? THREAD_DESIGN.TREE_AVI_WIDTH : THREAD_DESIGN.LINEAR_AVI_WIDTH);
  
  // Timestamp format depends on anchor status
  const timestamp = useMemo(() => {
    return isAnchor 
      ? formatDateTime(new Date(post.created_at))
      : formatDistanceToNow(new Date(post.created_at));
  }, [post.created_at, isAnchor]);

  // Navigation handlers
  const handleProfilePress = useCallback(() => {
    if (onProfilePress) {
      onProfilePress();
    } else if (post.author?.id) {
      router.push({ pathname: "/user/[id]", params: { id: post.author.id } });
    }
  }, [onProfilePress, post.author?.id, router]);

  const handlePostPress = useCallback(() => {
    if (onPress) {
      onPress();
    } else if (!isAnchor) {
      router.push({ pathname: "/post/[id]", params: { id: post.id } });
    }
  }, [onPress, isAnchor, post.id, router]);

  // Wrapper styles based on position
  const wrapperStyle = useMemo(() => [
    styles.wrapper,
    !ui.showParentReplyLine && !hideTopBorder && styles.topBorder,
    !ui.showChildReplyLine && styles.bottomPadding,
    style,
  ], [ui.showParentReplyLine, ui.showChildReplyLine, hideTopBorder, style]);

  // Content rendering
  const content = (
    <View style={wrapperStyle}>
      {/* Parent reply line (above post) */}
      <ParentReplyLine show={ui.showParentReplyLine} avatarWidth={avatarSize} />
      
      {/* Main content row */}
      <View style={styles.mainRow}>
        {/* Avatar column */}
        <View style={[styles.avatarColumn, { width: avatarSize, marginRight: THREAD_DESIGN.AVATAR_GAP }]}>
          <Pressable onPress={handleProfilePress} style={styles.avatarPressable}>
            <Image
              source={{ uri: post.author?.avatar_url }}
              placeholder={BLURHASH_PLACEHOLDERS.NEUTRAL}
              style={[styles.avatar, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
            />
          </Pressable>
          
          {/* Child reply line (below avatar) */}
          <ChildReplyLine show={ui.showChildReplyLine} />
        </View>

        {/* Content column */}
        <View style={styles.contentColumn}>
          {/* Replying to label */}
          {replyingTo && (
            <Text style={styles.replyingTo}>
              Replying to <Text style={styles.replyingToHandle}>@{replyingTo}</Text>
            </Text>
          )}

          {/* Author row */}
          <View style={styles.authorRow}>
            <View style={styles.authorInfo}>
              <Text style={[styles.displayName, isAnchor && styles.displayNameAnchor]} numberOfLines={1}>
                {post.author?.display_name || post.author?.username}
              </Text>
              <Text style={styles.handle} numberOfLines={1}>
                @{post.author?.username}
              </Text>
              {!isAnchor && (
                <>
                  <Text style={styles.dot}>·</Text>
                  <Text style={styles.time}>{timestamp}</Text>
                </>
              )}
            </View>
            {onMore && (
              <Pressable onPress={onMore} hitSlop={8} style={styles.moreButton}>
                <MoreHorizontal size={18} color="#6B7280" />
              </Pressable>
            )}
          </View>

          {/* Text content */}
          {post.content && (
            <Text style={[styles.text, isAnchor && styles.textAnchor]}>
              {post.content}
            </Text>
          )}

          {/* Media embed */}
          {post.media_urls && post.media_urls.length > 0 && (
            <View style={styles.mediaContainer}>
              <PostCarousel mediaUrls={post.media_urls} />
            </View>
          )}

          {/* Video embed */}
          {(post as any).video_url && (
            <View style={styles.mediaContainer}>
              <VideoPlayer
                url={(post as any).video_url}
                thumbnailUrl={(post as any).thumbnail_url}
              />
            </View>
          )}

          {/* Anchor: Full timestamp */}
          {isAnchor && (
            <Text style={styles.anchorTimestamp}>{timestamp}</Text>
          )}

          {/* Anchor: Stats row */}
          {isAnchor && (post.reposts_count > 0 || post.likes_count > 0) && (
            <View style={styles.statsRow}>
              {post.reposts_count > 0 && (
                <Pressable style={styles.statItem}>
                  <Text style={styles.statCount}>{post.reposts_count}</Text>
                  <Text style={styles.statLabel}>
                    {post.reposts_count === 1 ? "repost" : "reposts"}
                  </Text>
                </Pressable>
              )}
              {post.likes_count > 0 && (
                <Pressable style={styles.statItem}>
                  <Text style={styles.statCount}>{post.likes_count}</Text>
                  <Text style={styles.statLabel}>
                    {post.likes_count === 1 ? "like" : "likes"}
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Action bar */}
          <View style={[styles.actionBar, isAnchor && styles.actionBarAnchor]}>
            <ActionButton
              icon={MessageCircle}
              count={post.replies_count}
              onPress={onReply}
              size={isAnchor ? 22 : 18}
            />
            <ActionButton
              icon={Repeat2}
              count={post.reposts_count}
              active={(post as any).is_reposted_by_me}
              activeColor="#10B981"
              onPress={onRepost}
              size={isAnchor ? 22 : 18}
            />
            <ActionButton
              icon={Heart}
              count={post.likes_count}
              active={post.is_liked}
              activeColor="#EF4444"
              onPress={onLike}
              fill={true}
              size={isAnchor ? 22 : 18}
            />
            {onShare && (
              <ActionButton
                icon={Share}
                onPress={onShare}
                size={isAnchor ? 22 : 18}
              />
            )}
          </View>
        </View>
      </View>
    </View>
  );

  // Wrap non-anchor posts in Pressable
  if (!isAnchor && (onPress || true)) {
    return (
      <Pressable
        onPress={handlePostPress}
        style={({ pressed }) => pressed && styles.pressed}
      >
        {content}
      </Pressable>
    );
  }

  return content;
});

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: "#000",
  },
  topBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#333",
  },
  bottomPadding: {
    paddingBottom: THREAD_DESIGN.OUTER_SPACE / 2,
  },
  pressed: {
    backgroundColor: "#0A0A0A",
  },

  // Parent reply line
  parentLineContainer: {
    height: 12,
    alignItems: "center",
  },
  parentLine: {
    flex: 1,
    width: THREAD_DESIGN.REPLY_LINE_WIDTH,
    backgroundColor: "#333",
    marginBottom: 2,
  },

  // Main row
  mainRow: {
    flexDirection: "row",
    paddingHorizontal: THREAD_DESIGN.OUTER_SPACE,
    paddingVertical: 12,
  },

  // Avatar column
  avatarColumn: {
    alignItems: "center",
  },
  avatarPressable: {
    zIndex: 1,
  },
  avatar: {
    backgroundColor: "#1A1A1A",
  },

  // Child reply line
  childLine: {
    flex: 1,
    width: THREAD_DESIGN.REPLY_LINE_WIDTH,
    backgroundColor: "#333",
    marginTop: 4,
    minHeight: 20,
  },

  // Content column
  contentColumn: {
    flex: 1,
  },

  // Replying to
  replyingTo: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 2,
  },
  replyingToHandle: {
    color: "#10B981",
  },

  // Author row
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  authorInfo: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
    flex: 1,
  },
  displayName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FAFAFA",
    maxWidth: 140,
  },
  displayNameAnchor: {
    fontSize: 17,
    fontWeight: "700",
  },
  handle: {
    fontSize: 14,
    color: "#6B7280",
  },
  dot: {
    fontSize: 14,
    color: "#6B7280",
  },
  time: {
    fontSize: 14,
    color: "#6B7280",
  },
  moreButton: {
    padding: 4,
  },

  // Text content
  text: {
    fontSize: 15,
    color: "#FAFAFA",
    lineHeight: 22,
    marginTop: 4,
  },
  textAnchor: {
    fontSize: 17,
    lineHeight: 24,
  },

  // Media
  mediaContainer: {
    marginTop: 12,
    borderRadius: 12,
    overflow: "hidden",
  },

  // Anchor extras
  anchorTimestamp: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 12,
  },

  // Stats row (anchor only)
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#333",
    marginTop: 12,
    paddingVertical: 12,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statCount: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FAFAFA",
  },
  statLabel: {
    fontSize: 15,
    color: "#6B7280",
  },

  // Action bar
  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 24,
  },
  actionBarAnchor: {
    justifyContent: "space-around",
    gap: 0,
    paddingTop: 8,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 4,
  },
  actionCount: {
    fontSize: 13,
    color: "#6B7280",
  },
});

export default UnifiedThreadItem;
