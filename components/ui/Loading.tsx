import { View, ActivityIndicator, Text } from 'react-native';

interface LoadingProps {
  message?: string;
  size?: 'small' | 'large';
}

export function Loading({ message, size = 'large' }: LoadingProps) {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator size={size} color="#10B981" />
      {message && <Text className="text-text-secondary mt-3">{message}</Text>}
    </View>
  );
}
