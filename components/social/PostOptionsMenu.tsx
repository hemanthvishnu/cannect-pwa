import { Modal, View, Text, Pressable, Platform } from "react-native";
import { Trash2, Flag, Share2, Link } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";

interface PostOptionsMenuProps {
  isVisible: boolean;
  onClose: () => void;
  onDelete?: () => void;
  isOwnPost: boolean;
  postUrl?: string;
  isReply?: boolean;
}

export function PostOptionsMenu({ 
  isVisible, 
  onClose, 
  onDelete,
  isOwnPost,
  postUrl,
  isReply = false,
}: PostOptionsMenuProps) {
  
  const handleDelete = () => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    onDelete?.();
    onClose();
  };

  const handleCopyLink = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (postUrl) {
      await Clipboard.setStringAsync(postUrl);
    }
    onClose();
  };

  const handleReport = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    // TODO: Implement report functionality
    onClose();
  };

  return (
    <Modal 
      visible={isVisible} 
      animationType="slide" 
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Pressable 
        className="flex-1 bg-black/50" 
        onPress={onClose}
      />
      
      {/* Bottom Sheet */}
      <View className="bg-surface-elevated rounded-t-3xl pb-8 pt-2">
        {/* Handle Bar */}
        <View className="items-center py-3">
          <View className="w-10 h-1 bg-zinc-600 rounded-full" />
        </View>

        {/* Menu Options */}
        <View className="px-4 pb-4">
          {/* Copy Link Option */}
          {postUrl && (
            <Pressable
              onPress={handleCopyLink}
              className="flex-row items-center gap-4 py-4 px-4 rounded-xl active:bg-zinc-800/50"
            >
              <View className="w-11 h-11 rounded-full bg-zinc-800 items-center justify-center">
                <Link size={22} color="#FAFAFA" />
              </View>
              <View className="flex-1">
                <Text className="text-text-primary text-lg font-semibold">
                  Copy Link
                </Text>
                <Text className="text-text-muted text-sm">
                  Copy {isReply ? "reply" : "post"} link to clipboard
                </Text>
              </View>
            </Pressable>
          )}

          {/* Delete Option - Only for own posts */}
          {isOwnPost && onDelete && (
            <Pressable
              onPress={handleDelete}
              className="flex-row items-center gap-4 py-4 px-4 rounded-xl active:bg-zinc-800/50"
            >
              <View className="w-11 h-11 rounded-full bg-red-500/20 items-center justify-center">
                <Trash2 size={22} color="#EF4444" />
              </View>
              <View className="flex-1">
                <Text className="text-red-500 text-lg font-semibold">
                  {isReply ? "Delete Reply" : "Delete Post"}
                </Text>
                <Text className="text-text-muted text-sm">
                  Permanently remove this {isReply ? "reply" : "post"}
                </Text>
              </View>
            </Pressable>
          )}

          {/* Report Option - Only for other's posts */}
          {!isOwnPost && (
            <Pressable
              onPress={handleReport}
              className="flex-row items-center gap-4 py-4 px-4 rounded-xl active:bg-zinc-800/50"
            >
              <View className="w-11 h-11 rounded-full bg-zinc-800 items-center justify-center">
                <Flag size={22} color="#FAFAFA" />
              </View>
              <View className="flex-1">
                <Text className="text-text-primary text-lg font-semibold">
                  {isReply ? "Report Reply" : "Report Post"}
                </Text>
                <Text className="text-text-muted text-sm">
                  Report inappropriate content
                </Text>
              </View>
            </Pressable>
          )}
        </View>

        {/* Cancel Button */}
        <View className="px-4">
          <Pressable
            onPress={onClose}
            className="py-4 rounded-xl bg-zinc-800 items-center active:bg-zinc-700"
          >
            <Text className="text-text-primary font-semibold text-base">Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
