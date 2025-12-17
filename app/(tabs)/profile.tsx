import { View, Text, ActivityIndicator, Pressable } from "react-native";
import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";

import { useAuthStore } from "@/lib/stores";
import { useProfile, useUserPosts, useSignOut, ProfileTab } from "@/lib/hooks";
import { ProfileHeader } from "@/components/social";
import { SocialPost } from "@/components/social";
import { MediaGridItem } from "@/components/Profile";
import { Button } from "@/components/ui/Button";

const TABS: { id: ProfileTab; label: string }[] = [
  { id: 'posts', label: 'Posts' },
  { id: 'replies', label: 'Replies' },
  { id: 'media', label: 'Media' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const signOut = useSignOut();
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');

  // Fetch Profile & Posts with tab filtering
  const { data: profile, isLoading: isProfileLoading } = useProfile(user?.id ?? "");
  const { 
    data: postsData, 
    isLoading: isPostsLoading, 
    fetchNextPage, 
    hasNextPage,
    isFetchingNextPage
  } = useUserPosts(user?.id ?? "", activeTab);

  const posts = postsData?.pages?.flat() || [];

  const handleSignOut = async () => {
    await signOut.mutateAsync();
    router.replace("/(auth)/welcome");
  };

  const handleEditProfile = () => {
    router.push("/settings/edit-profile" as any);
  };

  // Render header with sticky tab bar
  const renderHeader = () => (
    <View>
      <ProfileHeader 
        profile={profile!} 
        isCurrentUser={true}
        onEditPress={handleEditProfile}
      />
      
      {/* Gold Standard Tab Bar */}
      <View className="flex-row border-b border-border bg-background">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              className={`flex-1 items-center py-4 border-b-2 ${
                isActive ? "border-primary" : "border-transparent"
              }`}
            >
              <Text className={`text-sm font-bold ${
                isActive ? "text-text" : "text-text-muted"
              }`}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  // Render item based on active tab
  const renderItem = ({ item }: { item: any }) => {
    if (activeTab === 'media') {
      return <MediaGridItem item={item} />;
    }
    
    return (
      <SocialPost 
        post={item}
        onPress={() => router.push(`/post/${item.id}` as any)}
        onProfilePress={() => {}} // Already on profile
        showThreadContext={activeTab === 'replies'}
      />
    );
  };

  if (isProfileLoading || !profile) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View style={{ flex: 1, minHeight: 2 }}>
        <FlashList
          key={activeTab === 'media' ? 'grid' : 'list'}
          data={posts}
          keyExtractor={(item) => item.id}
          numColumns={activeTab === 'media' ? 3 : 1}
          estimatedItemSize={activeTab === 'media' ? 120 : 200}
          ListHeaderComponent={renderHeader}
          renderItem={renderItem}

          // Empty State
          ListEmptyComponent={
            <View className="py-20 items-center gap-4">
              <Text className="text-text-muted text-lg">
                {activeTab === 'posts' && "No posts yet"}
                {activeTab === 'replies' && "No replies yet"}
                {activeTab === 'media' && "No media yet"}
              </Text>
              {activeTab === 'posts' && (
                <Text className="text-text-secondary text-sm">
                  Share your first thought with the community!
                </Text>
              )}
              <View className="mt-8">
                <Button variant="ghost" onPress={handleSignOut}>
                  <Text className="text-accent-error">Sign Out</Text>
                </Button>
              </View>
            </View>
          }

          ListFooterComponent={
            isFetchingNextPage ? (
              <View className="py-4 items-center">
                <ActivityIndicator size="small" color="#10B981" />
              </View>
            ) : null
          }

          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) {
              fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.5}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      </View>
    </SafeAreaView>
  );
}
