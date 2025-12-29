/**
 * AT Protocol Utilities
 *
 * Provides utilities for generating AT Protocol compliant identifiers,
 * parsing rich text into facets, and building AT URIs.
 */

// Base32-sortable alphabet used by AT Protocol
const TID_CHARS = '234567abcdefghijklmnopqrstuvwxyz';

/**
 * Generate a TID (Timestamp Identifier) for AT Protocol rkey
 * TIDs are base32-sortable timestamps with microsecond precision
 * Format: 13 characters, lexicographically sortable by time
 */
export function generateTID(): string {
  // TID = timestamp in microseconds since Unix epoch
  const now = BigInt(Date.now()) * 1000n; // Convert to microseconds
  const clockId = BigInt(Math.floor(Math.random() * 1024)); // 10-bit clock ID for uniqueness
  const tid = (now << 10n) | clockId;

  // Encode as base32-sortable
  let encoded = '';
  let remaining = tid;

  for (let i = 0; i < 13; i++) {
    encoded = TID_CHARS[Number(remaining & 31n)] + encoded;
    remaining = remaining >> 5n;
  }

  return encoded;
}

/**
 * Build an AT URI for a record
 * Format: at://did/collection/rkey
 */
export function buildAtUri(did: string, collection: string, rkey: string): string {
  return `at://${did}/${collection}/${rkey}`;
}

/**
 * Parse an AT URI into its components
 */
export function parseAtUri(uri: string): { did: string; collection: string; rkey: string } | null {
  const match = uri.match(/^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (!match) return null;

  return {
    did: match[1],
    collection: match[2],
    rkey: match[3],
  };
}

// AT Protocol facet types
export interface FacetFeature {
  $type: string;
  did?: string;
  uri?: string;
  tag?: string;
}

export interface Facet {
  index: {
    byteStart: number;
    byteEnd: number;
  };
  features: FacetFeature[];
}

export interface UnresolvedFacet extends Facet {
  _unresolvedHandle?: string;
}

/**
 * Parse text content into AT Protocol facets (mentions, links, hashtags)
 * Note: Mentions will have _unresolvedHandle that needs DID resolution
 */
export function parseTextToFacets(text: string): {
  text: string;
  facets: UnresolvedFacet[];
} {
  const facets: UnresolvedFacet[] = [];
  const encoder = new TextEncoder();

  // Regex patterns (from Bluesky's official regex patterns)
  // Mentions: @handle.domain.tld
  const mentionRegex =
    /@([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?/g;

  // URLs: http(s)://...
  const urlRegex =
    /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)/g;

  // Hashtags: #word
  const hashtagRegex = /#[a-zA-Z][a-zA-Z0-9_]*/g;

  // Find mentions
  let match: RegExpExecArray | null;

  // Reset regex lastIndex
  mentionRegex.lastIndex = 0;
  while ((match = mentionRegex.exec(text)) !== null) {
    const byteStart = encoder.encode(text.slice(0, match.index)).length;
    const byteEnd = byteStart + encoder.encode(match[0]).length;

    facets.push({
      index: { byteStart, byteEnd },
      features: [
        {
          $type: 'app.bsky.richtext.facet#mention',
          did: '', // Will be resolved later by the server
        },
      ],
      _unresolvedHandle: match[0].slice(1), // Remove @ prefix
    });
  }

  // Find URLs
  urlRegex.lastIndex = 0;
  while ((match = urlRegex.exec(text)) !== null) {
    const byteStart = encoder.encode(text.slice(0, match.index)).length;
    const byteEnd = byteStart + encoder.encode(match[0]).length;

    facets.push({
      index: { byteStart, byteEnd },
      features: [
        {
          $type: 'app.bsky.richtext.facet#link',
          uri: match[0],
        },
      ],
    });
  }

  // Find hashtags
  hashtagRegex.lastIndex = 0;
  while ((match = hashtagRegex.exec(text)) !== null) {
    const byteStart = encoder.encode(text.slice(0, match.index)).length;
    const byteEnd = byteStart + encoder.encode(match[0]).length;

    facets.push({
      index: { byteStart, byteEnd },
      features: [
        {
          $type: 'app.bsky.richtext.facet#tag',
          tag: match[0].slice(1), // Remove # prefix
        },
      ],
    });
  }

  // Sort facets by byte position
  facets.sort((a, b) => a.index.byteStart - b.index.byteStart);

  return { text, facets };
}

/**
 * Build an AT Protocol post record
 */
export function buildPostRecord(params: {
  text: string;
  facets?: Facet[];
  createdAt?: Date;
  langs?: string[];
  reply?: {
    root: { uri: string; cid: string };
    parent: { uri: string; cid: string };
  };
  embed?: {
    $type: string;
    [key: string]: any;
  };
}): Record<string, any> {
  const record: Record<string, any> = {
    $type: 'app.bsky.feed.post',
    text: params.text,
    createdAt: (params.createdAt || new Date()).toISOString(),
    langs: params.langs || ['en'],
  };

  // Add facets if present (filter out unresolved mention facets)
  if (params.facets && params.facets.length > 0) {
    const resolvedFacets = params.facets.filter((f) => {
      // Filter out mention facets without DIDs
      const mentionFeature = f.features.find(
        (feat) => feat.$type === 'app.bsky.richtext.facet#mention'
      );
      if (mentionFeature && !mentionFeature.did) {
        return false;
      }
      return true;
    });

    if (resolvedFacets.length > 0) {
      record.facets = resolvedFacets;
    }
  }

  // Add reply reference
  if (params.reply) {
    record.reply = params.reply;
  }

  // Add embed (images, external link, quote, etc.)
  if (params.embed) {
    record.embed = params.embed;
  }

  return record;
}

/**
 * AT Protocol collection names
 */
export const AT_COLLECTIONS = {
  POST: 'app.bsky.feed.post',
  LIKE: 'app.bsky.feed.like',
  REPOST: 'app.bsky.feed.repost',
  FOLLOW: 'app.bsky.graph.follow',
  BLOCK: 'app.bsky.graph.block',
  PROFILE: 'app.bsky.actor.profile',
} as const;

/**
 * Check if a string is a valid DID
 */
export function isValidDid(did: string): boolean {
  return /^did:[a-z]+:[a-zA-Z0-9._:%-]+$/.test(did);
}

/**
 * Check if a string is a valid AT handle
 */
export function isValidHandle(handle: string): boolean {
  // Handles are domain-like: segment.segment.tld
  return /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(
    handle
  );
}

/**
 * Get grapheme length of text (for Bluesky's 300 grapheme limit)
 */
export function getGraphemeLength(text: string): number {
  // Use Intl.Segmenter if available (modern browsers)
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    return [...segmenter.segment(text)].length;
  }

  // Fallback: count code points (less accurate for emoji)
  return [...text].length;
}
