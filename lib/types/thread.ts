/**
 * Thread Types - Bluesky Flat Style
 * 
 * Based on Bluesky's thread model:
 * - Full ancestor chain (root → parent → focused)
 * - FLAT replies list with "Replying to @user" labels
 * - No inline nesting - tap a reply to see its thread
 */

import type { PostWithAuthor } from './database';

/**
 * A reply in the flat thread list
 * Includes parent info for "Replying to @user" display
 */
export interface ThreadReply {
  /** The reply post */
  post: PostWithAuthor;
  /** Username being replied to (for "Replying to @user" label) */
  replyingTo?: string;
}

/**
 * Complete thread view structure - Bluesky Flat Style
 */
export interface ThreadView {
  /** The post being focused on */
  focusedPost: PostWithAuthor;
  
  /** 
   * Ancestor chain from root to parent
   * Order: [root, ..., grandparent, parent]
   * Empty if focused post is a root post
   */
  ancestors: PostWithAuthor[];
  
  /** 
   * FLAT list of all replies in the thread
   * Sorted by created_at, includes "Replying to" info
   */
  replies: ThreadReply[];
  
  /** Total number of replies in thread */
  totalReplies: number;
  
  /** Whether there are more replies to load */
  hasMoreReplies: boolean;
}

/**
 * Thread item UI state - computed from position in thread
 * Matches Bluesky's ThreadItem.ui structure from types.ts
 */
export interface ThreadItemUI {
  /** Whether this is the anchor (focused) post */
  isAnchor: boolean;
  /** Show vertical line connecting from parent above */
  showParentReplyLine: boolean;
  /** Show vertical line connecting to child below */
  showChildReplyLine: boolean;
  /** Indent level (for tree view, 0 for linear) */
  indent: number;
  /** Is this the last child in its branch */
  isLastChild: boolean;
}

/**
 * Flattened item for FlashList rendering
 * Simple linear view - tap any reply to see its own thread
 */
export type ThreadListItem = 
  | { type: 'ancestor'; post: PostWithAuthor; ui: ThreadItemUI }
  | { type: 'focused'; post: PostWithAuthor; ui: ThreadItemUI }
  | { type: 'reply'; reply: ThreadReply; ui: ThreadItemUI }
  | { type: 'reply-divider'; count: number }
  | { type: 'load-more'; count: number };

/**
 * Thread configuration constants
 */
export const THREAD_CONFIG = {
  /** Number of ancestors to show before "show more" */
  ANCESTOR_PREVIEW_COUNT: 5,
  /** Number of replies per page */
  REPLIES_PER_PAGE: 20,
  /** Parent chunk size for pagination (Bluesky uses 5) */
  PARENT_CHUNK_SIZE: 5,
  /** Children chunk size for pagination (Bluesky uses 50) */
  CHILDREN_CHUNK_SIZE: 50,
} as const;

/**
 * Thread design tokens - Matches Bluesky's official layout
 * Reference: bluesky-social/social-app/src/screens/PostThread/const.ts
 * 
 * From Bluesky's const.ts:
 * - TREE_INDENT = tokens.space.lg (16px)
 * - TREE_AVI_WIDTH = 24
 * - LINEAR_AVI_WIDTH = 42
 * - REPLY_LINE_WIDTH = 2
 * - OUTER_SPACE = tokens.space.lg (16px)
 */
export const THREAD_DESIGN = {
  // Linear view (default)
  /** Avatar size in linear view (Bluesky: 42px) */
  LINEAR_AVI_WIDTH: 42,
  
  // Tree view
  /** Avatar size in tree view (Bluesky: 24px) */
  TREE_AVI_WIDTH: 24,
  /** Indent for each tree level (Bluesky: 16px) */
  TREE_INDENT: 16,
  
  // Common
  /** Thread connector line width */
  REPLY_LINE_WIDTH: 2,
  /** Outer space/padding */
  OUTER_SPACE: 16,
  /** Gap between avatar and content */
  AVATAR_GAP: 12,
  /** Horizontal padding for container */
  HORIZONTAL_PADDING: 16,
  
  // Anchor (focused) post
  /** Anchor post avatar (larger) */
  ANCHOR_AVI_WIDTH: 48,
  
  // Legacy aliases for backwards compatibility
  AVATAR_SIZE: 42,
  LINE_WIDTH: 2,
  LEFT_COLUMN_WIDTH: 48,
  AVATAR_SIZES: {
    ancestor: 42,
    focused: 48,
    reply: 42,
  },
} as const;

/**
 * Compute thread item UI state based on position in thread
 * Matches Bluesky's getThreadPostUI utility
 */
function computeThreadItemUI(
  type: 'ancestor' | 'focused' | 'reply',
  index: number,
  totalAncestors: number,
  hasReplies: boolean,
): ThreadItemUI {
  switch (type) {
    case 'ancestor':
      // Ancestors show child line to next post (except last flows into focused)
      // First ancestor doesn't show parent line
      return {
        isAnchor: false,
        showParentReplyLine: index > 0,
        showChildReplyLine: true, // Always connect to next post
        indent: 0,
        isLastChild: false,
      };
    
    case 'focused':
      // Focused post shows parent line if there are ancestors
      // No child line (replies section is separate)
      return {
        isAnchor: true,
        showParentReplyLine: totalAncestors > 0,
        showChildReplyLine: false,
        indent: 0,
        isLastChild: false,
      };
    
    case 'reply':
      // Replies don't show thread lines in flat view
      return {
        isAnchor: false,
        showParentReplyLine: false,
        showChildReplyLine: false,
        indent: 0,
        isLastChild: true,
      };
  }
}

/**
 * Flatten a ThreadView into a list of renderable items with UI state
 * Simple linear view - each post is tappable to see its own thread
 * Includes pre-computed UI state for each item (Bluesky pattern)
 */
export function flattenThreadToList(thread: ThreadView): ThreadListItem[] {
  const items: ThreadListItem[] = [];
  const hasReplies = thread.replies.length > 0;
  
  // 1. Add ancestors with UI state
  thread.ancestors.forEach((post, index) => {
    items.push({ 
      type: 'ancestor', 
      post,
      ui: computeThreadItemUI('ancestor', index, thread.ancestors.length, hasReplies),
    });
  });
  
  // 2. Add focused post with UI state
  items.push({ 
    type: 'focused', 
    post: thread.focusedPost,
    ui: computeThreadItemUI('focused', 0, thread.ancestors.length, hasReplies),
  });
  
  // 3. Add reply divider if there are replies
  if (thread.replies.length > 0) {
    items.push({
      type: 'reply-divider',
      count: thread.totalReplies,
    });
  }
  
  // 4. Add all replies flat with UI state
  thread.replies.forEach((reply, index) => {
    items.push({ 
      type: 'reply', 
      reply,
      ui: computeThreadItemUI('reply', index, thread.ancestors.length, hasReplies),
    });
  });
  
  // 5. Add load more if there are more replies
  if (thread.hasMoreReplies) {
    items.push({
      type: 'load-more',
      count: thread.totalReplies - thread.replies.length,
    });
  }
  
  return items;
}
