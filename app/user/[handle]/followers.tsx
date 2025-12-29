/**
 * Followers List Screen - Pure AT Protocol
 *
 * Route: /user/[handle]/followers
 */

import { View, Text, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { Image } from 'expo-image';
import { useMemo, useCallback } from 'react';
import { useProfile, useFollowers } from '@/lib/hooks';
import { UserListSkeleton } from '@/components/skeletons';
import type { AppBskyActorDefs } from '@atproto/api';

type ProfileView = AppBskyActorDefs.ProfileView;

function formatNumber(num: number | undefined): string {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function UserRow({ user, onPress }: { user: ProfileView; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ minHeight: 80 }}
      className="flex-row items-center px-4 py-3 min-h-[80px] border-b border-border active:bg-surface-elevated"
    >
      {user.avatar ? (
        <Image
          source={{ uri: user.avatar }}
          className="w-12 h-12 rounded-full"
          contentFit="cover"
        />
      ) : (
        <View className="w-12 h-12 rounded-full bg-surface-elevated items-center justify-center">
          <Text className="text-text-muted text-lg">{user.handle[0].toUpperCase()}</Text>
        </View>
      )}
      <View className="flex-1 ml-3">
        <Text className="font-semibold text-text-primary">{user.displayName || user.handle}</Text>
        <Text className="text-text-muted">@{user.handle}</Text>
        {user.description && (
          <Text className="text-text-secondary text-sm mt-1" numberOfLines={2}>
            {user.description}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export default function FollowersScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const router = useRouter();

  const profileQuery = useProfile(handle || '');
  const followersQuery = useFollowers(profileQuery.data?.did);

  const followers = useMemo(() => {
    return followersQuery.data?.pages?.flatMap((page) => page.followers) || [];
  }, [followersQuery.data]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(`/user/${handle}`);
    }
  };

  const handleUserPress = (user: ProfileView) => {
    router.push(`/user/${user.handle}`);
  };

  const handleRefresh = useCallback(() => {
    followersQuery.refetch();
  }, [followersQuery]);

  const followerCount = profileQuery.data?.followersCount || 0;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Followers',
          headerStyle: { backgroundColor: '#0A0A0A' },
          headerTintColor: '#FAFAFA',
          headerLeft: () => (
            <Pressable onPress={handleBack} className="p-2 -ml-2 active:opacity-70">
              <ArrowLeft size={24} color="#FAFAFA" />
            </Pressable>
          ),
        }}
      />

      {/* Header with count */}
      <View className="px-4 py-3 border-b border-border">
        <Text className="text-text-primary font-semibold text-lg">
          {formatNumber(followerCount)} Followers
        </Text>
        <Text className="text-text-muted">@{handle}</Text>
      </View>

      {(profileQuery.isLoading || followersQuery.isLoading) && followers.length === 0 ? (
        <UserListSkeleton count={10} />
      ) : (
        <FlashList
          data={followers}
          keyExtractor={(item, index) => `${item.did}-${index}`}
          estimatedItemSize={80}
          overrideItemLayout={(layout) => {
            layout.size = 80;
          }}
          renderItem={({ item }) => <UserRow user={item} onPress={() => handleUserPress(item)} />}
          refreshControl={
            <RefreshControl
              refreshing={followersQuery.isRefetching}
              onRefresh={handleRefresh}
              tintColor="#10B981"
            />
          }
          onEndReached={() => {
            if (followersQuery.hasNextPage && !followersQuery.isFetchingNextPage) {
              followersQuery.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.5}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <View className="py-20 items-center">
              <Text className="text-text-muted">No followers yet</Text>
            </View>
          }
          ListFooterComponent={
            followersQuery.isFetchingNextPage ? (
              <View className="py-4 items-center">
                <ActivityIndicator size="small" color="#10B981" />
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}
