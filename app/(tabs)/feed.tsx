import { View, Text, RefreshControl, ActivityIndicator, Platform, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { Leaf, Globe2 } from "lucide-react-native";
import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useFeed, useFollowingFeed, useDeletePost, useToggleRepost, useProfile } from "@/lib/hooks";
import { useAuthStore } from "@/lib/stores";
import { RepostMenu, PostOptionsMenu, UnifiedFeedItem } from "@/components/social";
import { EmptyFeedState } from "@/components/social/EmptyFeedState";
import { DiscoveryModal, useDiscoveryModal } from "@/components/social/DiscoveryModal";
import { getFederatedPosts } from "@/lib/services/bluesky";
import { OfflineBanner } from "@/components/OfflineBanner";
import { FeedSkeleton } from "@/components/Skeleton";
import type { PostWithAuthor } from "@/lib/types/database";
import { 
  fromLocalPost, 
  fromServiceFederatedPost, 
  type UnifiedPost,
  type ServiceFederatedPost,
} from "@/lib/types/unified-post";

type FeedTab = "for-you" | "following" | "federated";

const TABS: { id: FeedTab; label: string }[] = [
  { id: "for-you", label: "Cannect" },
  { id: "following", label: "Following" },
  { id: "federated", label: "Global" },
];

export default function FeedScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<FeedTab>("for-you");
  
  // Get current user's profile for discovery modal logic
  const { data: myProfile } = useProfile(user?.id ?? "");
  
  // Discovery modal for new users with 0 following
  const { showDiscovery, closeDiscovery } = useDiscoveryModal(myProfile?.following_count);
  
  // Repost menu state - now uses UnifiedPost
  const [repostMenuVisible, setRepostMenuVisible] = useState(false);
  const [repostMenuPost, setRepostMenuPost] = useState<UnifiedPost | null>(null);
  
  // Post options menu state - now uses UnifiedPost
  const [optionsMenuVisible, setOptionsMenuVisible] = useState(false);
  const [optionsMenuPost, setOptionsMenuPost] = useState<UnifiedPost | null>(null);
  
  // Cannect (For You) feed - all posts
  const forYouQuery = useFeed();
  
  // Following feed - only posts from followed users
  const followingQuery = useFollowingFeed();
  
  // Federated feed from Bluesky
  const federatedQuery = useQuery({
    queryKey: ["federated-feed"],
    queryFn: () => getFederatedPosts(50),
    enabled: activeTab === "federated",
    staleTime: 1000 * 60 * 2, // 2 minutes
  });

  const deleteMutation = useDeletePost();
  const toggleRepostMutation = useToggleRepost();
  
  // Select the appropriate query based on active tab
  const getCurrentQuery = () => {
    switch (activeTab) {
      case "for-you":
        return forYouQuery;
      case "following":
        return followingQuery;
      case "federated":
        // Wrap federatedQuery to match infinite query shape
        return {
          data: { pages: [federatedQuery.data || []] },
          isLoading: federatedQuery.isLoading,
          isError: federatedQuery.isError,
          isRefetching: federatedQuery.isRefetching,
          refetch: federatedQuery.refetch,
          fetchNextPage: () => {},
          hasNextPage: false,
          isFetchingNextPage: false,
        };
    }
  };
  
  const currentQuery = getCurrentQuery();
  const rawPosts = currentQuery.data?.pages?.flat() || [];
  
  // Convert all posts to UnifiedPost format
  const unifiedPosts = useMemo(() => {
    return rawPosts.map((item: any) => {
      // Check if it's a federated post from the Global tab
      if (item.is_federated === true && activeTab === "federated") {
        return fromServiceFederatedPost(item as ServiceFederatedPost);
      }
      // Otherwise it's a local Cannect post
      return fromLocalPost(item as PostWithAuthor, user?.id);
    });
  }, [rawPosts, activeTab, user?.id]);
  
  // Loading and error states based on active tab
  const isCurrentLoading = currentQuery.isLoading;
  const isCurrentRefetching = currentQuery.isRefetching;
  const isCurrentError = currentQuery.isError;
  const currentRefetch = currentQuery.refetch;
  const fetchNextPage = 'fetchNextPage' in currentQuery ? currentQuery.fetchNextPage : () => {};
  const hasNextPage = 'hasNextPage' in currentQuery ? currentQuery.hasNextPage : false;
  const isFetchingNextPage = 'isFetchingNextPage' in currentQuery ? currentQuery.isFetchingNextPage : false;
  
  // Haptic feedback on pull-to-refresh
  const handleRefresh = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    currentRefetch();
  };

  if (isCurrentError) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center px-6">
        <Text className="text-text-primary text-lg font-semibold mb-2">Failed to load feed</Text>
        <Pressable onPress={() => currentRefetch()} className="bg-primary px-6 py-3 rounded-full">
          <Text className="text-white font-bold">Retry</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------------------
  // Handlers - Now using UnifiedPost for consistent interface
  // ---------------------------------------------------------------------------

  const handleProfilePress = (identifier: string) => {
    // Unified routing - useResolveProfile handles UUID, handle, or username
    if (identifier) {
      router.push(`/user/${encodeURIComponent(identifier)}` as any);
    }
  };

  const handleOptionsDelete = () => {
    if (optionsMenuPost?.localId) {
      deleteMutation.mutate(optionsMenuPost.localId);
    }
  };
  
  // Handlers for the repost menu - now using UnifiedPost
  const handleDoRepost = useCallback(() => {
    if (!repostMenuPost) return;
    
    const isReposted = repostMenuPost.viewer.isReposted;
    
    // For external posts, use the Bluesky hooks
    if (repostMenuPost.isExternal) {
      // This will be handled by the UnifiedFeedItem component
      // The menu just triggers the action
      return;
    }
    
    // For local posts
    if (repostMenuPost.localId) {
      const fakePost = {
        id: repostMenuPost.localId,
        is_reposted_by_me: isReposted,
        at_uri: repostMenuPost.uri.startsWith("at://") ? repostMenuPost.uri : undefined,
        at_cid: repostMenuPost.cid,
      };
      
      if (isReposted) {
        toggleRepostMutation.mutate({ post: fakePost, undo: true });
      } else {
        toggleRepostMutation.mutate({ 
          post: fakePost, 
          subjectUri: repostMenuPost.uri.startsWith("at://") ? repostMenuPost.uri : null,
          subjectCid: repostMenuPost.cid || null,
        });
      }
    }
  }, [repostMenuPost, toggleRepostMutation]);
  
  const handleDoQuotePost = useCallback(() => {
    if (!repostMenuPost) return;
    
    if (repostMenuPost.isExternal) {
      // For external posts, pass the AT URI
      router.push({
        pathname: "/compose/quote",
        params: { 
          uri: repostMenuPost.uri,
          cid: repostMenuPost.cid,
        }
      } as any);
    } else if (repostMenuPost.localId) {
      router.push(`/compose/quote?postId=${repostMenuPost.localId}` as any);
    }
  }, [repostMenuPost, router]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* Header */}
      <View className="flex-row items-center px-5 py-4 border-b border-border">
        <Leaf size={28} color="#10B981" />
        <Text className="text-2xl font-bold text-text-primary ml-3">Cannect</Text>
      </View>

      {/* Tab Bar */}
      <View className="flex-row border-b border-border">
        {TABS.map((tab) => (
          <Pressable
            key={tab.id}
            onPress={() => setActiveTab(tab.id)}
            className={`flex-1 py-3 items-center ${
              activeTab === tab.id ? "border-b-2 border-primary" : ""
            }`}
          >
            <View className="flex-row items-center gap-1.5">
              {tab.id === "federated" && <Globe2 size={14} color={activeTab === tab.id ? "#10B981" : "#6B7280"} />}
              <Text
                className={`font-semibold ${
                  activeTab === tab.id ? "text-primary" : "text-text-muted"
                }`}
              >
                {tab.label}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>

      {/* Offline Banner */}
      <OfflineBanner />

      {isCurrentLoading ? (
        <FeedSkeleton />
      ) : (
        <View style={{ flex: 1, minHeight: 2 }}>
          <FlashList
            data={unifiedPosts}
            keyExtractor={(item, index) => `${activeTab}-${item.uri}-${index}`}
            renderItem={({ item }) => (
              <UnifiedFeedItem
                post={item}
                onRepostMenu={(post) => {
                  setRepostMenuPost(post);
                  setRepostMenuVisible(true);
                }}
                onMoreMenu={(post) => {
                  if (Platform.OS !== 'web') {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  setOptionsMenuPost(post);
                  setOptionsMenuVisible(true);
                }}
              />
            )}
            estimatedItemSize={200}
            refreshControl={
              <RefreshControl 
                refreshing={isCurrentRefetching} 
                onRefresh={handleRefresh} 
                tintColor="#10B981"
                colors={["#10B981"]}
              />
            }
            onEndReached={() => {
              if (activeTab !== "federated" && hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.5}
            contentContainerStyle={{ paddingBottom: 20 }}
            ListEmptyComponent={
              <EmptyFeedState 
                type={activeTab} 
                isLoading={isCurrentLoading}
                onRetry={handleRefresh}
              />
            }
            ListFooterComponent={
              isFetchingNextPage && activeTab !== "federated" ? (
                <View className="py-4 items-center">
                  <ActivityIndicator size="small" color="#10B981" />
                </View>
              ) : null
            }
          />
        </View>
      )}
      
      {/* Discovery Modal for new users */}
      <DiscoveryModal 
        isVisible={showDiscovery && activeTab === "following"} 
        onClose={closeDiscovery} 
      />
      
      {/* Repost Menu */}
      <RepostMenu
        isVisible={repostMenuVisible}
        onClose={() => setRepostMenuVisible(false)}
        onRepost={handleDoRepost}
        onQuotePost={handleDoQuotePost}
        isReposted={repostMenuPost?.viewer?.isReposted === true}
      />
      
      {/* Post Options Menu */}
      <PostOptionsMenu
        isVisible={optionsMenuVisible}
        onClose={() => setOptionsMenuVisible(false)}
        onDelete={handleOptionsDelete}
        isOwnPost={optionsMenuPost?.author?.id === user?.id}
        postUrl={optionsMenuPost?.localId ? `https://cannect.app/post/${optionsMenuPost.localId}` : undefined}
        isReply={optionsMenuPost?.type === "reply"}
      />
    </SafeAreaView>
  );
}
