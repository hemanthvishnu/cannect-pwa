import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/lib/stores";

interface Notification {
  id: string;
  user_id: string;
  actor_id: string;
  type: "like" | "comment" | "follow" | "repost";
  post_id?: string;
  is_read: boolean;
  created_at: string;
  actor?: {
    id: string;
    display_name: string;
    username: string;
    avatar_url?: string;
  };
}

// Fetch user's notifications
export function useNotifications() {
  const { user } = useAuthStore();
  
  return useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("notifications")
        .select(`
          *,
          actor:profiles!actor_id(id, display_name, username, avatar_url)
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as Notification[];
    },
    enabled: !!user,
  });
}

// Get unread notification count
export function useUnreadNotificationCount() {
  const { user } = useAuthStore();
  
  return useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: async () => {
      if (!user) return 0;

      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!user,
    // Refetch every 30 seconds to keep badge updated
    refetchInterval: 30000,
  });
}

// Mark notifications as read
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: async (notificationIds?: string[]) => {
      if (!user) throw new Error("Not authenticated");

      let query = (supabase
        .from("notifications") as any)
        .update({ is_read: true })
        .eq("user_id", user.id);

      if (notificationIds && notificationIds.length > 0) {
        query = query.in("id", notificationIds);
      }

      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
