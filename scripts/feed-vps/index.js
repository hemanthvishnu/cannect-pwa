/**
 * Cannect Feed Generator
 *
 * A Bluesky Feed Generator for the cannabis community.
 *
 * Includes:
 * - All posts from cannect.space users
 * - Posts containing cannabis keywords from anywhere on Bluesky
 *
 * Architecture:
 * - Jetstream WebSocket for real-time post ingestion
 * - SQLite for post storage
 * - Express for AT Protocol feed endpoints
 */

require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const db = require('./db');
const { shouldIncludePost, getPostText } = require('./feed-logic');

// =============================================================================
// Configuration
// =============================================================================

const PORT = process.env.FEEDGEN_PORT || 3000;
const HOSTNAME = process.env.FEEDGEN_HOSTNAME || 'feed.cannect.space';
const PUBLISHER_DID = process.env.FEEDGEN_PUBLISHER_DID;

// Feed URI - this is what the app uses
const FEED_URI = `at://${PUBLISHER_DID}/app.bsky.feed.generator/cannect`;

// Jetstream endpoint
const JETSTREAM_URL =
  'wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post';

// =============================================================================
// Express Server - AT Protocol Endpoints
// =============================================================================

const app = express();

// Health check
app.get('/health', (req, res) => {
  const count = db.getCount();
  res.json({
    status: 'ok',
    posts: count,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// DID document for feed generator
app.get('/.well-known/did.json', (req, res) => {
  res.json({
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: `did:web:${HOSTNAME}`,
    service: [
      {
        id: '#bsky_fg',
        type: 'BskyFeedGenerator',
        serviceEndpoint: `https://${HOSTNAME}`,
      },
    ],
  });
});

// Describe feed generator
app.get('/xrpc/app.bsky.feed.describeFeedGenerator', (req, res) => {
  res.json({
    did: `did:web:${HOSTNAME}`,
    feeds: [
      {
        uri: FEED_URI,
      },
    ],
  });
});

// Get feed skeleton - THE MAIN ENDPOINT
app.get('/xrpc/app.bsky.feed.getFeedSkeleton', (req, res) => {
  try {
    const feed = req.query.feed;
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const cursor = req.query.cursor;

    // Parse cursor (format: "timestamp:offset")
    let offset = 0;
    if (cursor) {
      const parts = cursor.split(':');
      offset = parseInt(parts[1]) || 0;
    }

    // Get posts from database
    const posts = db.getPosts(limit, offset);

    // Build response
    const response = {
      feed: posts.map((uri) => ({ post: uri })),
    };

    // Add cursor if there are more posts
    if (posts.length === limit) {
      response.cursor = `${Date.now()}:${offset + limit}`;
    }

    console.log(`[Feed] Served ${posts.length} posts (offset: ${offset})`);
    res.json(response);
  } catch (err) {
    console.error('[Feed] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================================================
// Jetstream - Real-time Post Ingestion
// =============================================================================

let ws = null;
let reconnectAttempts = 0;
let stats = { processed: 0, indexed: 0, deleted: 0 };

function connectJetstream() {
  console.log('[Jetstream] Connecting...');

  ws = new WebSocket(JETSTREAM_URL);

  ws.on('open', () => {
    console.log('[Jetstream] Connected!');
    reconnectAttempts = 0;
  });

  ws.on('message', (data) => {
    try {
      const event = JSON.parse(data.toString());
      handleJetstreamEvent(event);
    } catch (err) {
      // Ignore parse errors
    }
  });

  ws.on('close', () => {
    console.log('[Jetstream] Connection closed, reconnecting...');
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error('[Jetstream] Error:', err.message);
  });
}

function scheduleReconnect() {
  reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
  console.log(`[Jetstream] Reconnecting in ${delay}ms...`);
  setTimeout(connectJetstream, delay);
}

function handleJetstreamEvent(event) {
  // Only handle commits
  if (event.kind !== 'commit') return;

  const { commit, did } = event;
  if (!commit) return;

  stats.processed++;

  // Handle post creation
  if (commit.operation === 'create' && commit.collection === 'app.bsky.feed.post') {
    handleNewPost(did, commit);
  }

  // Handle post deletion
  if (commit.operation === 'delete' && commit.collection === 'app.bsky.feed.post') {
    const uri = `at://${did}/${commit.collection}/${commit.rkey}`;
    db.removePost(uri);
    stats.deleted++;
  }
}

function handleNewPost(did, commit) {
  const record = commit.record;
  if (!record) return;

  // Get post text
  const text = getPostText(record);

  // Get author handle (may not be in event, default to DID check)
  // For cannect.space detection, we'll check the DID format or handle if available
  const handle = record.$handle || '';

  // Check if post should be included
  // Note: We can't reliably get handle from Jetstream, so we check if DID
  // belongs to cannect.space by making a resolution call (cached)
  const result = shouldIncludePost(handle, text);

  if (result.include) {
    const uri = `at://${did}/${commit.collection}/${commit.rkey}`;
    const cid = commit.cid;
    const indexedAt = record.createdAt || new Date().toISOString();

    db.addPost(uri, cid, did, handle, indexedAt);
    stats.indexed++;

    if (stats.indexed % 100 === 0) {
      console.log(`[Indexer] Stats: ${stats.indexed} indexed, ${stats.processed} processed`);
    }
  }
}

// =============================================================================
// Maintenance - Cleanup old posts
// =============================================================================

function runCleanup() {
  const deleted = db.cleanup(7 * 24 * 60 * 60); // 7 days
  if (deleted > 0) {
    console.log(`[Cleanup] Removed ${deleted} old posts`);
  }
}

// Run cleanup every hour
setInterval(runCleanup, 60 * 60 * 1000);

// =============================================================================
// Stats logging
// =============================================================================

setInterval(() => {
  const count = db.getCount();
  console.log(
    `[Stats] Posts in DB: ${count} | Indexed: ${stats.indexed} | Processed: ${stats.processed}`
  );
}, 60 * 1000); // Every minute

// =============================================================================
// Start Server
// =============================================================================

app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('Cannect Feed Generator');
  console.log('='.repeat(60));
  console.log(`Server:    http://localhost:${PORT}`);
  console.log(`Hostname:  ${HOSTNAME}`);
  console.log(`Feed URI:  ${FEED_URI}`);
  console.log(`Posts:     ${db.getCount()}`);
  console.log('='.repeat(60));

  // Connect to Jetstream
  connectJetstream();

  // Initial cleanup
  runCleanup();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] Shutting down...');
  if (ws) ws.close();
  db.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Server] Shutting down...');
  if (ws) ws.close();
  db.close();
  process.exit(0);
});
