/**
 * User Skeletons
 *
 * Loading placeholders for user lists (followers, following, search).
 */

import { View } from 'react-native';
import { Skeleton, SkeletonAvatar } from './Skeleton';

/**
 * UserRowSkeleton - Loading state for user list items
 */
export function UserRowSkeleton() {
  return (
    <View style={{ minHeight: 80 }} className="flex-row items-center px-4 py-3 min-h-[80px] border-b border-border">
      <SkeletonAvatar size={48} />
      <View className="flex-1 ml-3 gap-2">
        <Skeleton height={16} width="45%" radius="sm" />
        <Skeleton height={14} width="30%" radius="sm" />
        <Skeleton height={12} width="70%" radius="sm" />
      </View>
    </View>
  );
}

/**
 * UserListSkeleton - Multiple UserRowSkeletons for list loading
 */
export function UserListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <UserRowSkeleton key={i} />
      ))}
    </View>
  );
}
