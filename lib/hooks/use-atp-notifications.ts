/**
 * AT Protocol Notifications Hook
 *
 * Pure AT Protocol - no Supabase.
 */

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import * as atproto from '@/lib/atproto/agent';
import { useAuthStore } from '@/lib/stores/auth-store-atp';
import type { AppBskyNotificationListNotifications } from '@atproto/api';

export type Notification = AppBskyNotificationListNotifications.Notification;

/**
 * Get notifications with infinite scroll
 */
export function useNotifications() {
  const { isAuthenticated } = useAuthStore();

  return useInfiniteQuery({
    queryKey: ['notifications'],
    queryFn: async ({ pageParam }) => {
      const result = await atproto.getNotifications(pageParam, 50);
      return result.data;
    },
    getNextPageParam: (lastPage) => lastPage.cursor,
    initialPageParam: undefined as string | undefined,
    enabled: isAuthenticated,
    staleTime: 1000 * 30, // 30 seconds
    refetchInterval: 1000 * 60, // Refetch every minute
  });
}

/**
 * Get unread notification count
 */
export function useUnreadNotificationCount() {
  const { isAuthenticated } = useAuthStore();

  return useQuery({
    queryKey: ['notificationCount'],
    queryFn: async () => {
      const result = await atproto.getUnreadCount();
      return result.data.count;
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60,
  });
}

/**
 * Mark notifications as read
 */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await atproto.markNotificationsRead();
    },
    onSuccess: () => {
      queryClient.setQueryData(['notificationCount'], 0);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
