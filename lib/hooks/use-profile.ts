import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/query-client";
import { useAuthStore } from "@/lib/stores/auth-store";
import type { Profile } from "@/lib/types/database";

// Fetch profile by ID
export function useProfile(userId: string) {
  return useQuery({
    queryKey: queryKeys.profiles.detail(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) throw error;
      return data as Profile;
    },
    enabled: !!userId,
  });
}

// Update profile
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Profile> }) => {
      const { error } = await (supabase
        .from("profiles") as any)
        .update(updates)
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.profiles.detail(variables.id) 
      });
    },
  });
}

// Fetch profile by username
export function useProfileByUsername(username: string) {
  return useQuery({
    queryKey: queryKeys.profiles.byUsername(username),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("username", username)
        .single();

      if (error) throw error;
      return data as Profile;
    },
    enabled: !!username,
  });
}

// Check if current user follows target user
export function useIsFollowing(targetUserId: string) {
  return useQuery({
    queryKey: queryKeys.follows.isFollowing("current", targetUserId),
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return false;
      const user = session.user;

      const { data, error } = await supabase
        .from("follows")
        .select("id")
        .eq("follower_id", user.id)
        .eq("following_id", targetUserId)
        .maybeSingle();

      if (error) throw error;
      return !!data;
    },
    enabled: !!targetUserId,
  });
}

// Follow a user
export function useFollowUser() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore(); // Optimization: use store instead of getSession

  return useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("follows").insert({
        follower_id: user.id,
        following_id: targetUserId,
      } as any);
      if (error) throw error;
      return targetUserId;
    },
    onSettled: (targetUserId) => { // Use onSettled to ensure UI reflects server state
      queryClient.invalidateQueries({ queryKey: queryKeys.follows.isFollowing("current", targetUserId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.profiles.detail(targetUserId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.profiles.detail(user?.id!) });
    },
  });
}

// Unfollow a user
export function useUnfollowUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (targetUserId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error("Not authenticated");
      const user = session.user;

      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("following_id", targetUserId);

      if (error) throw error;
      return targetUserId;
    },
    onSuccess: (targetUserId) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.follows.isFollowing("current", targetUserId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.profiles.detail(targetUserId),
      });
    },
  });
}

// Get followers
export function useFollowers(userId: string) {
  return useQuery({
    queryKey: queryKeys.follows.followers(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("follows")
        .select(`
          *,
          follower:profiles!follower_id(*)
        `)
        .eq("following_id", userId);

      if (error) throw error;
      return (data as any[]).map((f) => f.follower) as Profile[];
    },
    enabled: !!userId,
  });
}

// Get following
export function useFollowing(userId: string) {
  return useQuery({
    queryKey: queryKeys.follows.following(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("follows")
        .select(`
          *,
          following:profiles!following_id(*)
        `)
        .eq("follower_id", userId);

      if (error) throw error;
      return (data as any[]).map((f) => f.following) as Profile[];
    },
    enabled: !!userId,
  });
}

// Search users by name or username
export function useSearchUsers(query: string) {
  return useQuery({
    queryKey: queryKeys.search.users(query), // Use factory key
    queryFn: async () => {
      // Logic handled by 'enabled' property to prevent empty calls
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .limit(20);

      if (error) throw error;
      return data as Profile[];
    },
    enabled: query.trim().length >= 2, // Threshold check
    staleTime: 1000 * 60, // Search results can stay fresh for 1 minute
  });
}

// ✅ Diamond Standard: Infinite scrolling social graph discovery
export function useUserRelationships(userId: string, type: 'followers' | 'following') {
  const { user: currentUser } = useAuthStore();

  return useInfiniteQuery({
    queryKey: ['user-relationships', userId, type],
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * 20;
      const to = from + 19;

      const matchColumn = type === 'followers' ? 'following_id' : 'follower_id';
      const selectColumn = type === 'followers' 
        ? 'follower:profiles!follower_id(*)' 
        : 'following:profiles!following_id(*)';

      const { data, error } = await supabase
        .from('follows')
        .select(`id, ${selectColumn}`)
        .eq(matchColumn, userId)
        .range(from, to);

      if (error) throw error;

      // Extract the profile objects from the join
      const profiles = data.map((item: any) => 
        type === 'followers' ? item.follower : item.following
      );
      
      // Enrich with "is_following" status for the current viewer
      if (currentUser?.id && profiles.length > 0) {
        const profileIds = profiles.map((p: any) => p.id);
        const { data: myFollows } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', currentUser.id)
          .in('following_id', profileIds);
          
        const followSet = new Set((myFollows as any[])?.map(f => f.following_id) || []);
        return profiles.map((p: any) => ({
          ...p,
          is_following: followSet.has(p.id)
        }));
      }

      return profiles;
    },
    getNextPageParam: (lastPage, allPages) => 
      lastPage.length === 20 ? allPages.length : undefined,
    initialPageParam: 0,
    enabled: !!userId,
  });
}
