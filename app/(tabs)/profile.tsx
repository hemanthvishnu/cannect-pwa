/**
 * Profile Screen - Pure AT Protocol
 * Tabs: Posts, Reposts, Replies, Likes
 */

import { useState, useMemo, useCallback } from "react";
import { View, Text, Image, Pressable, RefreshControl, ActivityIndicator, Platform, Share as RNShare } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { LogOut, RefreshCw, Edit3, Heart, MessageCircle, Repeat2, Share, MoreHorizontal } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useMyProfile, useAuthorFeed, useActorLikes, useLogout, useLikePost, useUnlikePost, useRepost, useDeleteRepost, useDeletePost } from "@/lib/hooks";
import { useAuthStore } from "@/lib/stores";
import { RepostMenu } from "@/components/social/RepostMenu";
import { PostOptionsMenu } from "@/components/social/PostOptionsMenu";
import type { AppBskyFeedDefs, AppBskyFeedPost } from '@atproto/api';

type FeedViewPost = AppBskyFeedDefs.FeedViewPost;
type PostView = AppBskyFeedDefs.PostView;
type ProfileTab = "posts" | "reposts" | "replies" | "likes";

function formatNumber(num: number | undefined): string {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}

function ProfilePost({ 
  item, 
  showAuthor = false,
  onLike,
  onRepost,
  onReply,
  onShare,
  onOptionsPress,
}: { 
  item: FeedViewPost; 
  showAuthor?: boolean;
  onLike: () => void;
  onRepost: () => void;
  onReply: () => void;
  onShare: () => void;
  onOptionsPress: () => void;
}) {
  const post = item.post;
  const record = post.record as AppBskyFeedPost.Record;
  const author = post.author;
  const router = useRouter();
  const isRepost = !!item.reason && item.reason.$type === 'app.bsky.feed.defs#reasonRepost';
  const repostBy = isRepost ? (item.reason as any).by : null;

  // Get embed images if present
  const embedImages = post.embed?.$type === 'app.bsky.embed.images#view' 
    ? (post.embed as any).images 
    : [];

  const handlePress = () => {
    const uriParts = post.uri.split('/');
    const rkey = uriParts[uriParts.length - 1];
    router.push(`/post/${post.author.did}/${rkey}`);
  };

  const handleAuthorPress = () => {
    router.push(`/user/${author.handle}`);
  };

  return (
    <Pressable 
      onPress={handlePress}
      className="px-4 py-3 border-b border-border active:bg-surface-elevated"
    >
      {/* Repost indicator */}
      {isRepost && repostBy && (
        <View className="flex-row items-center mb-2 pl-10">
          <Repeat2 size={14} color="#6B7280" />
          <Text className="text-text-muted text-xs ml-1">
            Reposted by {repostBy.displayName || repostBy.handle}
          </Text>
        </View>
      )}

      <View className="flex-row">
        {/* Avatar */}
        <Pressable onPress={handleAuthorPress}>
          {author.avatar ? (
            <Image 
              source={{ uri: author.avatar }} 
              className="w-10 h-10 rounded-full bg-surface-elevated"
            />
          ) : (
            <View className="w-10 h-10 rounded-full bg-surface-elevated items-center justify-center">
              <Text className="text-text-muted text-lg">{author.handle[0].toUpperCase()}</Text>
            </View>
          )}
        </Pressable>

        {/* Content */}
        <View className="flex-1 ml-3">
          {/* Header - Row 1: Name and Time */}
          <View className="flex-row items-center">
            <Text className="font-semibold text-text-primary flex-shrink" numberOfLines={1}>
              {author.displayName || author.handle}
            </Text>
            <Text className="text-text-muted mx-1">·</Text>
            <Text className="text-text-muted flex-shrink-0">
              {formatTime(record.createdAt)}
            </Text>
          </View>
          {/* Header - Row 2: Handle */}
          <Text className="text-text-muted text-sm" numberOfLines={1}>
            @{author.handle}
          </Text>

          {/* Post text */}
          <Text className="text-text-primary mt-1 leading-5">
            {record.text}
          </Text>

          {/* Images */}
          {embedImages.length > 0 && (
            <View className="mt-2 rounded-xl overflow-hidden">
              {embedImages.length === 1 ? (
                <Image 
                  source={{ uri: embedImages[0].thumb }} 
                  className="w-full h-48 rounded-xl"
                  resizeMode="cover"
                />
              ) : (
                <View className="flex-row flex-wrap gap-1">
                  {embedImages.slice(0, 4).map((img: any, idx: number) => (
                    <Image 
                      key={idx}
                      source={{ uri: img.thumb }} 
                      className="w-[48%] h-32 rounded-lg"
                      resizeMode="cover"
                    />
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Actions */}
          <View className="flex-row items-center justify-between mt-3 pr-4">
            {/* Reply */}
            <Pressable 
              onPress={onReply}
              className="flex-row items-center py-1"
            >
              <MessageCircle size={18} color="#6B7280" />
              <Text className="text-text-muted text-sm ml-1.5">
                {post.replyCount || ''}
              </Text>
            </Pressable>

            {/* Repost */}
            <Pressable 
              onPress={onRepost}
              className="flex-row items-center py-1"
            >
              <Repeat2 
                size={18} 
                color={post.viewer?.repost ? "#10B981" : "#6B7280"} 
              />
              <Text className={`text-sm ml-1.5 ${post.viewer?.repost ? 'text-primary' : 'text-text-muted'}`}>
                {post.repostCount || ''}
              </Text>
            </Pressable>

            {/* Like */}
            <Pressable 
              onPress={onLike}
              className="flex-row items-center py-1"
            >
              <Heart 
                size={18} 
                color={post.viewer?.like ? "#EF4444" : "#6B7280"}
                fill={post.viewer?.like ? "#EF4444" : "none"}
              />
              <Text className={`text-sm ml-1.5 ${post.viewer?.like ? 'text-red-500' : 'text-text-muted'}`}>
                {post.likeCount || ''}
              </Text>
            </Pressable>

            {/* Share */}
            <Pressable onPress={onShare} className="flex-row items-center py-1">
              <Share size={18} color="#6B7280" />
            </Pressable>

            {/* Options */}
            <Pressable onPress={onOptionsPress} className="flex-row items-center py-1">
              <MoreHorizontal size={18} color="#6B7280" />
            </Pressable>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { did, handle } = useAuthStore();
  const logoutMutation = useLogout();
  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
  const [repostMenuVisible, setRepostMenuVisible] = useState(false);
  const [optionsMenuVisible, setOptionsMenuVisible] = useState(false);
  const [selectedPost, setSelectedPost] = useState<PostView | null>(null);
  
  const profileQuery = useMyProfile();
  
  // Mutations
  const likeMutation = useLikePost();
  const unlikeMutation = useUnlikePost();
  const repostMutation = useRepost();
  const deleteRepostMutation = useDeleteRepost();
  const deletePostMutation = useDeletePost();
  
  // Different feeds based on active tab
  const postsQuery = useAuthorFeed(did || undefined, 'posts_no_replies');
  const repliesQuery = useAuthorFeed(did || undefined, 'posts_with_replies');
  const likesQuery = useActorLikes(did || undefined);

  // Get posts data based on active tab
  const posts = useMemo(() => {
    if (activeTab === "posts") {
      return postsQuery.data?.pages?.flatMap(page => page.feed) || [];
    } else if (activeTab === "reposts") {
      // Filter for reposts only
      const allPosts = postsQuery.data?.pages?.flatMap(page => page.feed) || [];
      return allPosts.filter(item => item.reason?.$type === 'app.bsky.feed.defs#reasonRepost');
    } else if (activeTab === "replies") {
      // Get posts with replies then filter for actual replies
      const allPosts = repliesQuery.data?.pages?.flatMap(page => page.feed) || [];
      return allPosts.filter(item => {
        const record = item.post.record as any;
        return record?.reply; // Has reply reference = it's a reply
      });
    } else if (activeTab === "likes") {
      return likesQuery.data?.pages?.flatMap(page => page.feed) || [];
    }
    return [];
  }, [activeTab, postsQuery.data, repliesQuery.data, likesQuery.data]);

  const currentQuery = activeTab === "likes" ? likesQuery : 
                       activeTab === "replies" ? repliesQuery : postsQuery;

  const handleRefresh = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    profileQuery.refetch();
    currentQuery.refetch();
  }, [profileQuery, currentQuery]);

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    router.replace("/(auth)/welcome");
  };

  const handleEditProfile = () => {
    router.push("/settings/edit-profile" as any);
  };

  // Post action handlers
  const handleLike = useCallback((post: PostView) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (post.viewer?.like) {
      unlikeMutation.mutate({ likeUri: post.viewer.like, postUri: post.uri });
    } else {
      likeMutation.mutate({ uri: post.uri, cid: post.cid });
    }
  }, [likeMutation, unlikeMutation]);

  const handleRepost = useCallback((post: PostView) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedPost(post);
    setRepostMenuVisible(true);
  }, []);

  const handleReply = useCallback((post: PostView) => {
    const uriParts = post.uri.split('/');
    const rkey = uriParts[uriParts.length - 1];
    router.push(`/post/${post.author.did}/${rkey}?reply=true`);
  }, [router]);

  const handleShare = useCallback(async (post: PostView) => {
    const bskyUrl = `https://bsky.app/profile/${post.author.handle}/post/${post.uri.split('/').pop()}`;
    try {
      await RNShare.share({ url: bskyUrl, message: bskyUrl });
    } catch (e) {
      // ignore
    }
  }, []);

  const handleRepostAction = useCallback(() => {
    if (!selectedPost) return;
    if (selectedPost.viewer?.repost) {
      deleteRepostMutation.mutate({ repostUri: selectedPost.viewer.repost, postUri: selectedPost.uri });
    } else {
      repostMutation.mutate({ uri: selectedPost.uri, cid: selectedPost.cid });
    }
    setRepostMenuVisible(false);
    setSelectedPost(null);
  }, [selectedPost, repostMutation, deleteRepostMutation]);

  const handleQuote = useCallback(() => {
    if (!selectedPost) return;
    router.push({
      pathname: '/compose',
      params: { quoteUri: selectedPost.uri, quoteCid: selectedPost.cid }
    } as any);
    setRepostMenuVisible(false);
    setSelectedPost(null);
  }, [selectedPost, router]);

  const handleOptionsPress = useCallback((post: PostView) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSelectedPost(post);
    setOptionsMenuVisible(true);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!selectedPost) return;
    try {
      await deletePostMutation.mutateAsync(selectedPost.uri);
      setOptionsMenuVisible(false);
      setSelectedPost(null);
    } catch (e) {
      console.error('Delete error:', e);
    }
  }, [selectedPost, deletePostMutation]);

  const profileData = profileQuery.data;

  if (profileQuery.isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#10B981" />
      </SafeAreaView>
    );
  }

  if (profileQuery.isError) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center px-6">
        <RefreshCw size={48} color="#6B7280" />
        <Text className="text-text-primary text-lg font-semibold mt-4">Failed to load profile</Text>
        <Pressable onPress={() => profileQuery.refetch()} className="bg-primary px-6 py-3 rounded-full mt-4">
          <Text className="text-white font-semibold">Retry</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const tabs: { key: ProfileTab; label: string }[] = [
    { key: "posts", label: "Posts" },
    { key: "reposts", label: "Reposts" },
    { key: "replies", label: "Replies" },
    { key: "likes", label: "Likes" },
  ];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <FlashList
        data={posts}
        keyExtractor={(item, index) => `${item.post.uri}-${index}`}
        estimatedItemSize={100}
        ListHeaderComponent={
          <View>
            {/* Banner */}
            {profileData?.banner ? (
              <Image source={{ uri: profileData.banner }} className="w-full h-32" resizeMode="cover" />
            ) : (
              <View className="w-full h-32 bg-primary/20" />
            )}

            {/* Profile Info */}
            <View className="px-4 -mt-12">
              {/* Avatar */}
              {profileData?.avatar ? (
                <Image 
                  source={{ uri: profileData.avatar }} 
                  className="w-24 h-24 rounded-full border-4 border-background"
                />
              ) : (
                <View className="w-24 h-24 rounded-full border-4 border-background bg-surface-elevated items-center justify-center">
                  <Text className="text-text-muted text-3xl">
                    {(profileData?.handle || handle || '?')[0].toUpperCase()}
                  </Text>
                </View>
              )}

              {/* Actions - Edit Profile + Sign Out */}
              <View className="absolute right-4 top-14 flex-row gap-2">
                <Pressable 
                  onPress={handleEditProfile}
                  className="bg-surface-elevated border border-border px-4 py-2 rounded-full flex-row items-center"
                >
                  <Edit3 size={16} color="#FAFAFA" />
                  <Text className="text-text-primary font-semibold ml-2">Edit Profile</Text>
                </Pressable>
                <Pressable 
                  onPress={handleLogout}
                  className="bg-surface-elevated border border-border p-2 rounded-full items-center justify-center"
                >
                  <LogOut size={18} color="#EF4444" />
                </Pressable>
              </View>

              {/* Name & Handle */}
              <Text className="text-xl font-bold text-text-primary mt-3">
                {profileData?.displayName || handle}
              </Text>
              <Text className="text-text-muted">@{profileData?.handle || handle}</Text>

              {/* Bio */}
              {profileData?.description && (
                <Text className="text-text-primary mt-2">{profileData.description}</Text>
              )}

              {/* Stats */}
              <View className="flex-row gap-4 mt-3">
                <Pressable 
                  className="flex-row items-center active:opacity-70"
                  onPress={() => router.push(`/user/${profileData?.handle}/followers` as any)}
                >
                  <Text className="font-bold text-text-primary">
                    {formatNumber(profileData?.followersCount)}
                  </Text>
                  <Text className="text-text-muted ml-1">followers</Text>
                </Pressable>
                <Pressable 
                  className="flex-row items-center active:opacity-70"
                  onPress={() => router.push(`/user/${profileData?.handle}/following` as any)}
                >
                  <Text className="font-bold text-text-primary">
                    {formatNumber(profileData?.followsCount)}
                  </Text>
                  <Text className="text-text-muted ml-1">following</Text>
                </Pressable>
                <View className="flex-row items-center">
                  <Text className="font-bold text-text-primary">
                    {formatNumber(profileData?.postsCount)}
                  </Text>
                  <Text className="text-text-muted ml-1">posts</Text>
                </View>
              </View>
            </View>

            {/* Tabs */}
            <View className="flex-row border-b border-border mt-4">
              {tabs.map((tab) => (
                <Pressable
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  className={`flex-1 py-3 items-center ${activeTab === tab.key ? "border-b-2 border-primary" : ""}`}
                >
                  <Text className={activeTab === tab.key ? "text-primary font-semibold" : "text-text-muted"}>
                    {tab.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <ProfilePost 
            item={item} 
            showAuthor={activeTab === "likes"} 
            onLike={() => handleLike(item.post)}
            onRepost={() => handleRepost(item.post)}
            onReply={() => handleReply(item.post)}
            onShare={() => handleShare(item.post)}
            onOptionsPress={() => handleOptionsPress(item.post)}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={profileQuery.isRefetching || currentQuery.isRefetching}
            onRefresh={handleRefresh}
            tintColor="#10B981"
          />
        }
        onEndReached={() => {
          if (currentQuery.hasNextPage && !currentQuery.isFetchingNextPage) {
            currentQuery.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={
          currentQuery.isLoading ? (
            <View className="py-10 items-center">
              <ActivityIndicator color="#10B981" />
            </View>
          ) : (
            <View className="py-20 items-center">
              <Text className="text-text-muted">
                {activeTab === "posts" && "No posts yet"}
                {activeTab === "reposts" && "No reposts yet"}
                {activeTab === "replies" && "No replies yet"}
                {activeTab === "likes" && "No likes yet"}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          currentQuery.isFetchingNextPage ? (
            <View className="py-4 items-center">
              <ActivityIndicator size="small" color="#10B981" />
            </View>
          ) : null
        }
      />

      {/* Repost Menu */}
      <RepostMenu
        isVisible={repostMenuVisible}
        onClose={() => {
          setRepostMenuVisible(false);
          setSelectedPost(null);
        }}
        onRepost={handleRepostAction}
        onQuotePost={handleQuote}
        isReposted={!!selectedPost?.viewer?.repost}
      />

      {/* Post Options Menu */}
      <PostOptionsMenu
        isVisible={optionsMenuVisible}
        onClose={() => {
          setOptionsMenuVisible(false);
          setSelectedPost(null);
        }}
        postUri={selectedPost?.uri || ''}
        postAuthorDid={selectedPost?.author.did || ''}
        postAuthorHandle={selectedPost?.author.handle || ''}
        currentUserDid={did || ''}
        onDelete={handleDelete}
        isDeleting={deletePostMutation.isPending}
      />
    </SafeAreaView>
  );
}
