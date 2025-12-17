import { View, Text, Pressable } from "react-native";
import { Image } from "expo-image";
import { Share, Link as LinkIcon, Calendar } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/date";
import type { Profile } from "@/lib/types/database";

interface ProfileHeaderProps {
  profile: Profile;
  isCurrentUser?: boolean;
  isFollowing?: boolean;
  onEditPress?: () => void;
  onFollowPress?: () => void;
  onSharePress?: () => void;
}

export function ProfileHeader({ 
  profile, 
  isCurrentUser,
  isFollowing,
  onEditPress,
  onFollowPress,
  onSharePress 
}: ProfileHeaderProps) {
  const avatarUrl = profile.avatar_url || `https://ui-avatars.com/api/?name=${profile.username}&background=10B981&color=fff`;

  return (
    <View className="bg-background border-b border-border pb-2">
      {/* Cover Image Area */}
      <View className="h-32 bg-surface w-full relative">
        <View className="absolute inset-0 bg-gradient-to-b from-primary/20 to-transparent" />
        <View className="absolute bottom-2 right-4 flex-row gap-2">
          <Pressable 
            className="bg-black/50 p-2 rounded-full"
            onPress={onSharePress}
          >
            <Share size={16} color="white" />
          </Pressable>
        </View>
      </View>

      <View className="px-4">
        {/* Header Row: Avatar + Actions */}
        <View className="flex-row justify-between items-end -mt-10 mb-3">
          <View className="rounded-full border-4 border-background overflow-hidden">
            <Image
              source={{ uri: avatarUrl }}
              style={{ width: 80, height: 80 }}
              contentFit="cover"
            />
          </View>
          
          <View className="flex-row gap-2 pb-1">
            {isCurrentUser ? (
              <Button 
                variant="secondary" 
                size="sm"
                onPress={onEditPress}
              >
                Edit Profile
              </Button>
            ) : (
              <Button 
                variant={isFollowing ? "secondary" : "primary"}
                size="sm"
                onPress={onFollowPress}
              >
                {isFollowing ? "Following" : "Follow"}
              </Button>
            )}
          </View>
        </View>

        {/* Info Section */}
        <View className="gap-1 mb-4">
          <View className="flex-row items-center gap-2">
            <Text className="text-2xl font-bold text-text-primary">
              {profile.display_name || profile.username}
            </Text>
            {profile.is_verified && (
              <View className="bg-primary rounded-full p-0.5">
                <Text className="text-white text-xs">✓</Text>
              </View>
            )}
          </View>
          <Text className="text-text-muted text-base">
            @{profile.username}
          </Text>
        </View>

        {/* Bio */}
        {profile.bio && (
          <Text className="text-text-primary text-base leading-5 mb-4">
            {profile.bio}
          </Text>
        )}

        {/* Metadata Row */}
        <View className="flex-row flex-wrap gap-x-4 gap-y-2 mb-4">
          {profile.website && (
            <View className="flex-row items-center gap-1">
              <LinkIcon size={14} color="#6B7280" />
              <Text className="text-primary text-sm">{profile.website}</Text>
            </View>
          )}
          <View className="flex-row items-center gap-1">
            <Calendar size={14} color="#6B7280" />
            <Text className="text-text-muted text-sm">
              Joined {formatDate(new Date(profile.created_at || Date.now()))}
            </Text>
          </View>
        </View>

        {/* Stats Row */}
        <View className="flex-row gap-5 mb-2">
          <Pressable className="flex-row items-center gap-1">
            <Text className="font-bold text-text-primary">{profile.following_count || 0}</Text>
            <Text className="text-text-muted">Following</Text>
          </Pressable>
          <Pressable className="flex-row items-center gap-1">
            <Text className="font-bold text-text-primary">{profile.followers_count || 0}</Text>
            <Text className="text-text-muted">Followers</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// Tabs Component - Exported for use by parent screens
interface ProfileTabsProps {
  activeTab: "posts" | "replies" | "media";
  onTabChange?: (tab: "posts" | "replies" | "media") => void;
}

function ProfileTabs({ activeTab, onTabChange }: ProfileTabsProps) {
  const tabs = [
    { key: "posts" as const, label: "Posts" },
    { key: "replies" as const, label: "Replies" },
    { key: "media" as const, label: "Media" },
  ];

  return (
    <View className="flex-row border-b border-border bg-background">
      {tabs.map((tab) => (
        <Pressable 
          key={tab.key}
          className={cn(
            "flex-1 items-center py-3",
            activeTab === tab.key && "border-b-2 border-primary"
          )}
          onPress={() => onTabChange?.(tab.key)}
        >
          <Text className={cn(
            "font-medium",
            activeTab === tab.key ? "text-text-primary font-bold" : "text-text-muted"
          )}>
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export { ProfileTabs };
