import { View, Text, FlatList, Pressable, RefreshControl, ActivityIndicator, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Heart, MessageCircle, UserPlus, Repeat, Bell, RefreshCw } from "lucide-react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import * as Haptics from "expo-haptics";
import { useNotifications, useMarkNotificationsRead } from "@/lib/hooks";

const notificationIcons: Record<string, { icon: any; color: string; bgClass: string }> = {
  like: { icon: Heart, color: "#EF4444", bgClass: "bg-accent-error/20" },
  comment: { icon: MessageCircle, color: "#3B82F6", bgClass: "bg-accent-info/20" },
  follow: { icon: UserPlus, color: "#10B981", bgClass: "bg-primary/20" },
  repost: { icon: Repeat, color: "#22C55E", bgClass: "bg-accent-success/20" },
};

function NotificationItem({ notification }: { notification: any }) {
  const router = useRouter();
  const config = notificationIcons[notification.type] || { icon: Heart, color: "#6B6B6B", bgClass: "bg-surface-elevated" };
  const Icon = config.icon;

  const handlePress = () => {
    // Navigate based on notification type
    if (notification.type === "follow") {
      // Go to the actor's profile
      router.push(`/user/${notification.actor?.username}` as any);
    } else if (["like", "comment", "repost"].includes(notification.type)) {
      // Go to the post
      if (notification.post_id) {
        router.push(`/post/${notification.post_id}` as any);
      }
    }
  };

  return (
    <Pressable 
      onPress={handlePress}
      className="flex-row items-center px-5 py-4 border-b border-border active:bg-surface-elevated"
    >
      <View className={`w-11 h-11 rounded-full items-center justify-center ${config.bgClass}`}>
        <Icon size={20} color={config.color} />
      </View>
      <View className="flex-1 ml-3">
        <Text className="text-[15px] text-text-primary leading-5">
          <Text className="font-semibold">{notification.actor?.display_name || "Someone"}</Text>
          {notification.type === "like" && " liked your post"}
          {notification.type === "comment" && " commented on your post"}
          {notification.type === "follow" && " started following you"}
          {notification.type === "repost" && " reposted your post"}
        </Text>
        <Text className="text-sm text-text-muted mt-1">
          {notification.created_at ? new Date(notification.created_at).toLocaleDateString() : ""}
        </Text>
      </View>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const { data: notifications, isLoading, isError, refetch, isRefetching } = useNotifications();
  const markAsRead = useMarkNotificationsRead();
  
  // ✅ Mark all as read when screen is focused (after 2 second delay)
  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => {
        if (notifications && notifications.some(n => !n.is_read)) {
          markAsRead.mutate();
        }
      }, 2000);
      
      return () => clearTimeout(timer);
    }, [notifications])
  );
  
  // ✅ Haptic feedback on pull-to-refresh
  const handleRefresh = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    refetch();
  };

  // ✅ Error state with retry
  if (isError) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <View className="px-5 py-4 border-b border-border">
          <Text className="text-3xl font-bold text-text-primary">Notifications</Text>
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <RefreshCw size={48} color="#6B7280" />
          <Text className="text-text-primary text-lg font-semibold mt-4">Failed to load</Text>
          <Text className="text-text-muted text-center mt-2">Something went wrong. Please try again.</Text>
          <Pressable 
            onPress={handleRefresh} 
            className="bg-primary px-6 py-3 rounded-full mt-4"
          >
            <Text className="text-white font-semibold">Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-5 py-4 border-b border-border">
        <Text className="text-3xl font-bold text-text-primary">Notifications</Text>
      </View>
      <FlatList
        data={notifications || []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <NotificationItem notification={item} />}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor="#10B981" />
        }
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={
          isLoading ? (
            <View className="flex-1 items-center justify-center pt-24">
              <ActivityIndicator size="large" color="#10B981" />
            </View>
          ) : (
            <View className="flex-1 items-center justify-center pt-24 px-10">
              <View className="bg-gray-100 dark:bg-zinc-900 p-6 rounded-full mb-6">
                <Bell size={40} color="#10B981" />
              </View>
              <Text className="text-text-primary text-xl font-bold text-center mb-2">
                No notifications yet
              </Text>
              <Text className="text-text-muted text-center text-base">
                When someone interacts with your posts, you'll see it here.
              </Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}
