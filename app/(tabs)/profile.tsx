/**
 * Profile Screen - Own Profile (Tab)
 * 
 * Uses unified ProfileView component
 */

import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { RefreshCw } from "lucide-react-native";
import { useMyProfile, useLogout } from "@/lib/hooks";
import { useAuthStore } from "@/lib/stores";
import { ProfileView, ProfileSkeleton } from "@/components/Profile/ProfileView";

export default function ProfileScreen() {
  const router = useRouter();
  const { did } = useAuthStore();
  const logoutMutation = useLogout();
  
  const profileQuery = useMyProfile();

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    router.replace("/(auth)/welcome");
  };

  const handleEditProfile = () => {
    router.push("/settings/edit-profile" as any);
  };

  if (profileQuery.isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <ProfileSkeleton />
      </SafeAreaView>
    );
  }

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center px-6" edges={["top"]}>
        <RefreshCw size={48} color="#6B7280" />
        <Text className="text-text-primary text-lg font-semibold mt-4">Failed to load profile</Text>
        <Pressable onPress={() => profileQuery.refetch()} className="bg-primary px-6 py-3 rounded-full mt-4">
          <Text className="text-white font-semibold">Retry</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ProfileView
        profileData={profileQuery.data}
        isOwnProfile={true}
        currentUserDid={did || undefined}
        isRefreshing={profileQuery.isRefetching}
        onRefresh={() => profileQuery.refetch()}
        onEditProfile={handleEditProfile}
        onLogout={handleLogout}
      />
    </SafeAreaView>
  );
}
