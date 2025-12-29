/**
 * Avatar URL utilities
 *
 * Bluesky CDN supports thumbnail URLs for optimized loading.
 * Instead of loading full-size avatars, we can request smaller versions.
 */

/**
 * Get optimized avatar URL for display size
 *
 * Bluesky CDN patterns:
 * - Full: https://cdn.bsky.app/img/avatar/plain/{did}/{cid}@jpeg
 * - Thumb: https://cdn.bsky.app/img/avatar_thumbnail/plain/{did}/{cid}@jpeg
 *
 * @param avatarUrl - Original avatar URL from API
 * @param size - Display size in pixels (for deciding quality)
 * @returns Optimized URL or original if not a Bluesky CDN URL
 */
export function getAvatarUrl(
  avatarUrl: string | undefined,
  size: 'thumb' | 'full' = 'thumb'
): string | undefined {
  if (!avatarUrl) return undefined;

  // Check if it's a Bluesky CDN URL
  if (avatarUrl.includes('cdn.bsky.app/img/avatar/')) {
    if (size === 'thumb') {
      // Convert to thumbnail URL
      return avatarUrl.replace('/img/avatar/', '/img/avatar_thumbnail/');
    }
  }

  return avatarUrl;
}

/**
 * Get avatar URL based on display size in pixels
 * Uses thumbnail for small sizes, full for large
 *
 * @param avatarUrl - Original avatar URL
 * @param displaySize - Size avatar will be displayed at (in pixels)
 * @returns Optimized URL
 */
export function getOptimizedAvatarUrl(
  avatarUrl: string | undefined,
  displaySize: number
): string | undefined {
  // Use thumbnail for avatars displayed at <= 64px
  // Use full for larger displays (profile headers, etc.)
  const quality = displaySize <= 64 ? 'thumb' : 'full';
  return getAvatarUrl(avatarUrl, quality);
}
