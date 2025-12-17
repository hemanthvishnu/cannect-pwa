import { View, Text, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { Settings } from "lucide-react-native";

import { useAuthStore } from "@/lib/stores";
import { useProfile, useUserPosts, useSignOut } from "@/lib/hooks";
import { ProfileHeader } from "@/components/social";
import { SocialPost } from "@/components/social";
import { Button } from "@/components/ui/Button";

export default function ProfileScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const signOut = useSignOut();

  // Fetch Profile & Posts
  const { data: profile, isLoading: isProfileLoading } = useProfile(user?.id ?? "");
  const { 
    data: postsData, 
    isLoading: isPostsLoading, 
    fetchNextPage, 
    hasNextPage,
    isFetchingNextPage
  } = useUserPosts(user?.id ?? "");

  const posts = postsData?.pages?.flat() || [];

  const handleSignOut = async () => {
    await signOut.mutateAsync();
    router.replace("/(auth)/welcome");
  };

  const handleEditProfile = () => {
    router.push("/settings/edit-profile" as any);
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
          data={posts}
          keyExtractor={(item) => item.id}
          estimatedItemSize={150}
        
        // Render the Profile Header as part of the list for unified scrolling
        ListHeaderComponent={
          <ProfileHeader 
            profile={profile} 
            isCurrentUser={true}
            onEditPress={handleEditProfile}
          />
        }

        renderItem={({ item }) => (
          <SocialPost 
            post={item}
            onPress={() => router.push(`/post/${item.id}` as any)}
            onProfilePress={() => {}} // Already on profile
          />
        )}

        // Empty State (if user has no posts)
        ListEmptyComponent={
          <View className="py-20 items-center gap-4">
            <Text className="text-text-muted text-lg">No posts yet</Text>
            <Text className="text-text-secondary text-sm">
              Share your first thought with the community!
            </Text>
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
