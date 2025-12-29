/**
 * AT Protocol Auth Store
 *
 * Pure AT Protocol auth state management using Zustand.
 * No Supabase dependency.
 */

import { create } from 'zustand';
import type { AtpSessionData } from '@atproto/api';

export interface AtpProfile {
  did: string;
  handle: string;
  displayName?: string;
  description?: string;
  avatar?: string;
  banner?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
}

interface AuthState {
  // Session state
  session: AtpSessionData | null;
  profile: AtpProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Convenience getters
  did: string | null;
  handle: string | null;

  // Actions
  setSession: (session: AtpSessionData | null) => void;
  setProfile: (profile: AtpProfile | null) => void;
  setLoading: (loading: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  profile: null,
  isLoading: true,
  isAuthenticated: false,
  did: null,
  handle: null,

  setSession: (session) =>
    set({
      session,
      isAuthenticated: !!session,
      isLoading: false,
      did: session?.did ?? null,
      handle: session?.handle ?? null,
    }),

  setProfile: (profile) => set({ profile }),

  setLoading: (isLoading) => set({ isLoading }),

  clear: () =>
    set({
      session: null,
      profile: null,
      isAuthenticated: false,
      isLoading: false,
      did: null,
      handle: null,
    }),
}));
