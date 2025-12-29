/**
 * User Profile Screen - View Any User's Profile
 *
 * Route: /user/[handle]
 * Uses unified ProfileView component
 */

import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useProfile } from '@/lib/hooks';
import { useAuthStore } from '@/lib/stores';
import { ProfileView, ProfileSkeleton } from '@/components/Profile/ProfileView';

export default function UserProfileScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const router = useRouter();
  const { did: myDid } = useAuthStore();

  const profileQuery = useProfile(handle || '');
  const profileData = profileQuery.data;
  const isOwnProfile = profileData?.did === myDid;

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/feed');
    }
  };

  // Loading state - only show skeleton on initial load, not refetch
  if (profileQuery.isLoading && !profileData) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <Stack.Screen
          options={{
            headerShown: true,
            headerTitle: '',
            headerStyle: { backgroundColor: '#0A0A0A' },
            headerTintColor: '#FAFAFA',
            contentStyle: { backgroundColor: '#0A0A0A' },
            headerLeft: () => (
              <Pressable onPress={handleBack} className="p-2 -ml-2 active:opacity-70">
                <ArrowLeft size={24} color="#FAFAFA" />
              </Pressable>
            ),
          }}
        />
        <ProfileSkeleton />
      </SafeAreaView>
    );
  }

  // Error state
  if (profileQuery.error || !profileData) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <Stack.Screen
          options={{
            headerShown: true,
            headerTitle: '',
            headerStyle: { backgroundColor: '#0A0A0A' },
            headerTintColor: '#FAFAFA',
            contentStyle: { backgroundColor: '#0A0A0A' },
            headerLeft: () => (
              <Pressable onPress={handleBack} className="p-2 -ml-2 active:opacity-70">
                <ArrowLeft size={24} color="#FAFAFA" />
              </Pressable>
            ),
          }}
        />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-text-muted text-center text-lg">User not found</Text>
          <Text className="text-text-muted text-center mt-2">@{handle}</Text>
          <Pressable
            onPress={() => profileQuery.refetch()}
            className="mt-4 px-4 py-2 bg-primary rounded-lg"
          >
            <Text className="text-white font-medium">Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: '',
          headerStyle: { backgroundColor: '#0A0A0A' },
          headerTintColor: '#FAFAFA',
          contentStyle: { backgroundColor: '#0A0A0A' },
          headerLeft: () => (
            <Pressable onPress={handleBack} className="p-2 -ml-2 active:opacity-70">
              <ArrowLeft size={24} color="#FAFAFA" />
            </Pressable>
          ),
        }}
      />

      <ProfileView
        profileData={profileData}
        isOwnProfile={isOwnProfile}
        currentUserDid={myDid || undefined}
        isRefreshing={profileQuery.isRefetching}
        onRefresh={() => profileQuery.refetch()}
      />
    </SafeAreaView>
  );
}
