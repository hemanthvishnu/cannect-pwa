/**
 * Following List Screen - Pure AT Protocol
 *
 * Route: /user/[handle]/following
 */

import { View, Text, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { Image } from 'expo-image';
import { useMemo, useCallback } from 'react';
import { useProfile, useFollowing } from '@/lib/hooks';
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
      className="flex-row items-center px-4 py-3 border-b border-border active:bg-surface-elevated"
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

export default function FollowingScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const router = useRouter();

  const profileQuery = useProfile(handle || '');
  const followingQuery = useFollowing(profileQuery.data?.did);

  const following = useMemo(() => {
    return followingQuery.data?.pages?.flatMap((page) => page.follows) || [];
  }, [followingQuery.data]);

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
    followingQuery.refetch();
  }, [followingQuery]);

  const followingCount = profileQuery.data?.followsCount || 0;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Following',
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
          {formatNumber(followingCount)} Following
        </Text>
        <Text className="text-text-muted">@{handle}</Text>
      </View>

      {profileQuery.isLoading || followingQuery.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      ) : (
        <FlashList
          data={following}
          keyExtractor={(item, index) => `${item.did}-${index}`}
          estimatedItemSize={80}
          renderItem={({ item }) => <UserRow user={item} onPress={() => handleUserPress(item)} />}
          refreshControl={
            <RefreshControl
              refreshing={followingQuery.isRefetching}
              onRefresh={handleRefresh}
              tintColor="#10B981"
            />
          }
          onEndReached={() => {
            if (followingQuery.hasNextPage && !followingQuery.isFetchingNextPage) {
              followingQuery.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.5}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <View className="py-20 items-center">
              <Text className="text-text-muted">Not following anyone</Text>
            </View>
          }
          ListFooterComponent={
            followingQuery.isFetchingNextPage ? (
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
