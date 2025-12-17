import { View, Alert, Text, Platform, ActivityIndicator } from "react-native";
import { useState } from "react";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useProfileByUsername, useUserPosts, useLikePost, useUnlikePost, useToggleRepost, useDeletePost, useFollowUser, useUnfollowUser, useIsFollowing, ProfileTab } from "@/lib/hooks";
import { queryKeys } from "@/lib/query-client";
import { ProfileHeader } from "@/components/social/ProfileHeader";
import { SocialPost } from "@/components/social/SocialPost";
import { MediaGridItem } from "@/components/Profile";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { SkeletonProfile, SkeletonCard } from "@/components/ui/Skeleton";
import { useAuthStore } from "@/lib/stores";

export default function UserProfileScreen() {
  // The route param is named 'id' but it's actually a username
  const { id: username } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  
  // Look up profile by username first
  const { data: profile, isLoading: isProfileLoading } = useProfileByUsername(username!);
  // Then use the profile's actual UUID for posts with tab filtering
  const { data: postsData, fetchNextPage, hasNextPage, isFetchingNextPage } = useUserPosts(profile?.id ?? "", activeTab);
  
  // ✅ Platinum: Follow state and mutations
  const { data: isFollowing } = useIsFollowing(profile?.id ?? "");
  const followMutation = useFollowUser();
  const unfollowMutation = useUnfollowUser();
  
  const likeMutation = useLikePost();
  const unlikeMutation = useUnlikePost();
  const toggleRepostMutation = useToggleRepost();
  const deleteMutation = useDeletePost();

  const posts = postsData?.pages.flat() || [];
  
  // ✅ Platinum: Follow toggle with haptic feedback
  const handleFollowToggle = () => {
    if (!profile || currentUser?.id === profile.id) return;
    
    // Haptic feedback for satisfying "click"
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    
    if (isFollowing) {
      unfollowMutation.mutate(profile.id);
    } else {
      followMutation.mutate(profile.id);
    }
  };

  // ✅ Platinum: Prefetch tab data on touch start for instant switching
  const prefetchTab = (tab: ProfileTab) => {
    if (!profile?.id) return;
    queryClient.prefetchInfiniteQuery({
      queryKey: [...queryKeys.posts.byUser(profile.id), tab],
      initialPageParam: 0,
      queryFn: () => Promise.resolve([]), // Data will be fetched by useUserPosts
      staleTime: 1000 * 60 * 5, // 5 minutes
    });
  };
  
  // Consistent handleLike that targets original post for reposts
  const handleLike = (post: any) => {
    const isSimpleRepostOfInternal = (post.type === 'repost' || post.is_repost) && 
      post.repost_of_id && !post.external_id;
    const targetId = isSimpleRepostOfInternal ? post.repost_of_id : post.id;
    
    if (post.is_liked) {
      unlikeMutation.mutate(targetId);
    } else {
      likeMutation.mutate(targetId);
    }
  };
  
  const handleRepost = (post: any) => {
    const isReposted = post.is_reposted_by_me === true;
    if (isReposted) {
      toggleRepostMutation.mutate({ post, undo: true });
    } else {
      Alert.alert("Repost", "Share with your followers?", [
        { text: "Cancel", style: "cancel" },
        { text: "Repost", onPress: () => toggleRepostMutation.mutate({ post }) }
      ]);
    }
  };

  // Render item based on active tab
  const renderItem = ({ item }: { item: any }) => {
    if (activeTab === 'media') {
      return <MediaGridItem item={item} />;
    }
    
    return (
      <SocialPost 
        post={item}
        onLike={() => handleLike(item)}
        onRepost={() => handleRepost(item)}
        onReply={() => router.push(`/post/${item.id}` as any)}
        onPress={() => router.push(`/post/${item.id}` as any)}
        onProfilePress={() => router.push(`/user/${item.author?.username}` as any)}
        onQuotedPostPress={(quotedPostId) => router.push(`/post/${quotedPostId}` as any)}
        // Show thread context for replies tab
        showThreadContext={activeTab === 'replies'}
        onMore={() => {
          if (currentUser?.id === item.user_id) {
            Alert.alert("Delete Post", "Are you sure?", [
              { text: "Cancel", style: "cancel" },
              { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(item.id) }
            ]);
          }
        }}
      />
    );
  };

  // ✅ Platinum Loading State: Skeleton Shimmer
  if (isProfileLoading || !profile) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <Stack.Screen options={{ title: "Profile", headerBackTitle: "Back" }} />
        <SkeletonProfile />
        <SkeletonCard />
        <SkeletonCard />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <Stack.Screen options={{ title: `@${profile.username}`, headerBackTitle: "Back" }} />
      
      {/* ✅ Platinum: Header stays mounted, only list content changes */}
      <ProfileHeader 
        profile={profile!} 
        isCurrentUser={currentUser?.id === profile!.id}
        isFollowing={isFollowing ?? false}
        onFollowPress={handleFollowToggle}
        onFollowersPress={() => router.push({ 
          pathname: `/user/${username}/relationships` as any,
          params: { type: 'followers' }
        })}
        onFollowingPress={() => router.push({ 
          pathname: `/user/${username}/relationships` as any,
          params: { type: 'following' }
        })}
      />
      
      {/* ✅ Platinum Tab Bar - outside FlashList for stability */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ProfileTab)}>
        <TabsList>
          <TabsTrigger value="posts" onPressIn={() => prefetchTab('posts')}>Posts</TabsTrigger>
          <TabsTrigger value="replies" onPressIn={() => prefetchTab('replies')}>Replies</TabsTrigger>
          <TabsTrigger value="media" onPressIn={() => prefetchTab('media')}>Media</TabsTrigger>
        </TabsList>
      </Tabs>
      
      <View style={{ flex: 1, minHeight: 2 }}>
        <FlashList
          key={activeTab === 'media' ? 'grid' : 'list'}
          data={posts}
          keyExtractor={(item) => item.id}
          numColumns={activeTab === 'media' ? 3 : 1}
          estimatedItemSize={activeTab === 'media' ? 120 : 200}
          renderItem={renderItem}
          onEndReached={() => hasNextPage && fetchNextPage()}
          ListFooterComponent={
            isFetchingNextPage ? (
              <View className="py-4 items-center">
                <ActivityIndicator size="small" color="#10B981" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View className="py-12 items-center">
              <Text className="text-text-muted text-base">
                {activeTab === 'posts' && "No posts yet"}
                {activeTab === 'replies' && "No replies yet"}
                {activeTab === 'media' && "No media yet"}
              </Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}
