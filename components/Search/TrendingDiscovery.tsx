import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { TrendingUp, ChevronRight } from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import { fetchBluesky } from "@/lib/services/bluesky";

interface TrendingDiscoveryProps {
  onTopicPress: (topic: string) => void;
}

export function TrendingDiscovery({ onTopicPress }: TrendingDiscoveryProps) {
  const { data: trends, isLoading, error } = useQuery({
    queryKey: ["bluesky", "trendingTopics"],
    queryFn: () => fetchBluesky("/app.bsky.unspecced.getTrendingTopics", { limit: 10 }),
    staleTime: 1000 * 60 * 15, // Cache trends for 15 minutes
    retry: 2,
  });

  if (isLoading) {
    return (
      <View className="mt-12 items-center">
        <ActivityIndicator color="#10B981" size="large" />
      </View>
    );
  }

  if (error || !trends?.topics?.length) {
    return null; // Silently fail - other discovery content will show
  }

  return (
    <View className="px-5 pt-4">
      <View className="flex-row items-center gap-2 mb-4">
        <TrendingUp size={20} color="#10B981" />
        <Text className="text-xl font-bold text-text-primary">Trending Globally</Text>
      </View>

      {trends.topics.map((item: { topic: string; link?: string }, index: number) => (
        <Pressable
          key={item.topic}
          onPress={() => onTopicPress(item.topic)}
          className="flex-row items-center justify-between py-4 border-b border-border/50 active:bg-surface/50"
        >
          <View className="flex-row items-center gap-4">
            <Text className="text-text-muted font-bold text-lg w-6">{index + 1}</Text>
            <View>
              <Text className="text-text-primary font-semibold text-base">#{item.topic}</Text>
              <Text className="text-text-muted text-xs uppercase font-medium">Global Topic</Text>
            </View>
          </View>
          <ChevronRight size={18} color="#6B7280" />
        </Pressable>
      ))}
    </View>
  );
}
