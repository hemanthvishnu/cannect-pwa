/**
 * Feed Logic - Determines which posts to include
 *
 * Simple rules:
 * 1. All posts from cannect.space users
 * 2. Posts containing cannabis-related keywords (high confidence)
 */

// High-confidence cannabis keywords
// These are specific enough to avoid false positives
const CANNABIS_KEYWORDS = [
  // Plant & product terms
  'cannabis',
  'marijuana',
  'weed',
  'thc',
  'cbd',
  'sativa',
  'indica',
  'hybrid strain',

  // Consumption
  'dispensary',
  'edible',
  'edibles',
  'joint',
  'blunt',
  'bong',
  'dab',
  'dabbing',
  'dabs',
  'vape cart',
  'vape pen',

  // Culture
  '420',
  '4/20',
  'stoner',
  'stoned',
  'high af',
  'wake and bake',

  // Products
  'kush',
  'strain',
  'strains',
  'terpene',
  'terpenes',
  'terps',
  'concentrates',
  'flower',
  'pre-roll',
  'preroll',
  'live rosin',
  'live resin',
  'hash',
  'hashish',

  // Medical
  'medical marijuana',
  'mmj',
  'medical cannabis',

  // Industry
  'cannabusiness',
  'cannabis industry',
  'grow op',
  'cultivation',
  'grower',
];

// Build regex for efficient matching
// Word boundaries to avoid partial matches
const keywordPatterns = CANNABIS_KEYWORDS.map((kw) => {
  // Escape special regex chars
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped;
});

const CANNABIS_REGEX = new RegExp('\\b(' + keywordPatterns.join('|') + ')\\b', 'i');

/**
 * Check if a post should be included in the feed
 *
 * @param {string} authorHandle - Author's handle (e.g., "user.cannect.space")
 * @param {string} text - Post text content
 * @returns {{ include: boolean, reason: string }}
 */
function shouldIncludePost(authorHandle, text) {
  // Rule 1: Always include cannect.space users
  if (authorHandle && authorHandle.endsWith('.cannect.space')) {
    return { include: true, reason: 'cannect_user' };
  }

  // Rule 2: Check for cannabis keywords
  if (text && CANNABIS_REGEX.test(text)) {
    return { include: true, reason: 'keyword_match' };
  }

  return { include: false, reason: 'no_match' };
}

/**
 * Extract text content from a post record
 */
function getPostText(record) {
  if (!record) return '';

  // Main text
  let text = record.text || '';

  // Also check embeds for quoted posts
  if (record.embed?.record?.value?.text) {
    text += ' ' + record.embed.record.value.text;
  }

  return text;
}

module.exports = {
  shouldIncludePost,
  getPostText,
  CANNABIS_KEYWORDS,
};
