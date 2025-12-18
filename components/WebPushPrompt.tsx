import { useState, useEffect } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { Bell, X } from 'lucide-react-native';
import { 
  isWebPushSupported, 
  getWebPushPermission,
  registerWebPushNotifications 
} from '@/lib/services/web-push-notifications';
import { useAuthStore } from '@/lib/stores';

export function WebPushPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuthStore();

  useEffect(() => {
    // Only show on web, if supported, and permission not yet decided
    if (Platform.OS === 'web' && isWebPushSupported()) {
      const permission = getWebPushPermission();
      // Check if user dismissed before
      const dismissed = typeof localStorage !== 'undefined' && localStorage.getItem('webPushPromptDismissed');
      if (permission === 'default' && !dismissed) {
        // Delay showing prompt for better UX
        const timer = setTimeout(() => setShowPrompt(true), 5000);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const handleEnable = async () => {
    if (!user?.id) return;
    
    setIsLoading(true);
    try {
      await registerWebPushNotifications(user.id);
      setShowPrompt(false);
    } catch (error) {
      console.error('Failed to enable notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    // Store in localStorage to not show again
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('webPushPromptDismissed', 'true');
    }
  };

  if (!showPrompt) return null;

  return (
    <View 
      className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-surface-elevated border border-border rounded-xl p-4 z-50"
      style={{ 
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
      }}
    >
      <View className="flex-row items-start">
        <View className="bg-primary/20 p-2 rounded-full mr-3">
          <Bell size={24} color="#10B981" />
        </View>
        <View className="flex-1">
          <Text className="text-text-primary font-semibold text-base mb-1">
            Enable Notifications
          </Text>
          <Text className="text-text-muted text-sm mb-3">
            Get notified when someone likes, comments, or follows you.
          </Text>
          <View className="flex-row gap-2">
            <Pressable
              onPress={handleEnable}
              disabled={isLoading}
              className="bg-primary px-4 py-2 rounded-full active:opacity-80"
            >
              <Text className="text-white font-semibold">
                {isLoading ? 'Enabling...' : 'Enable'}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleDismiss}
              className="px-4 py-2"
            >
              <Text className="text-text-muted">Not now</Text>
            </Pressable>
          </View>
        </View>
        <Pressable onPress={handleDismiss} className="p-1">
          <X size={20} color="#6B7280" />
        </Pressable>
      </View>
    </View>
  );
}
