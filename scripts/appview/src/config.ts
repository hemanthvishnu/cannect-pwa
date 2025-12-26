// Cannect AppView Configuration
export const config = {
  // Server
  port: parseInt(process.env.APPVIEW_PORT || '4000'),
  hostname: process.env.APPVIEW_HOSTNAME || 'appview.cannect.space',

  // Database
  dbPath: process.env.APPVIEW_DB_PATH || './appview.db',

  // Data sources
  cannectPds: process.env.CANNECT_PDS || 'https://cannect.space',

  // Optional: Also subscribe to Bluesky relay for cannabis content
  bskyRelay: process.env.BSKY_RELAY || 'wss://bsky.network',
  subscribeBluesky: process.env.SUBSCRIBE_BLUESKY === 'true',

  // Bluesky API for profile resolution
  bskyApi: 'https://public.api.bsky.app',
}
