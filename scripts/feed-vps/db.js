/**
 * SQLite Database for Feed Generator
 *
 * Stores post URIs for the feed. Simple and reliable.
 * Auto-cleans posts older than 7 days.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'posts.db'));

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    uri TEXT PRIMARY KEY,
    cid TEXT NOT NULL,
    author_did TEXT NOT NULL,
    author_handle TEXT,
    indexed_at TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_indexed_at ON posts(indexed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_author ON posts(author_did);
  CREATE INDEX IF NOT EXISTS idx_created ON posts(created_at);
`);

// Prepared statements for performance
const insertPost = db.prepare(`
  INSERT OR REPLACE INTO posts (uri, cid, author_did, author_handle, indexed_at)
  VALUES (?, ?, ?, ?, ?)
`);

const deletePost = db.prepare(`DELETE FROM posts WHERE uri = ?`);

const getFeed = db.prepare(`
  SELECT uri FROM posts
  ORDER BY indexed_at DESC
  LIMIT ? OFFSET ?
`);

const getPostCount = db.prepare(`SELECT COUNT(*) as count FROM posts`);

const cleanOldPosts = db.prepare(`
  DELETE FROM posts WHERE created_at < unixepoch() - ?
`);

/**
 * Add a post to the feed
 */
function addPost(uri, cid, authorDid, authorHandle, indexedAt) {
  try {
    insertPost.run(uri, cid, authorDid, authorHandle, indexedAt);
    return true;
  } catch (err) {
    console.error('[DB] Insert error:', err.message);
    return false;
  }
}

/**
 * Remove a post from the feed
 */
function removePost(uri) {
  try {
    deletePost.run(uri);
    return true;
  } catch (err) {
    console.error('[DB] Delete error:', err.message);
    return false;
  }
}

/**
 * Get posts for feed (paginated)
 */
function getPosts(limit = 30, offset = 0) {
  return getFeed.all(limit, offset).map((row) => row.uri);
}

/**
 * Get total post count
 */
function getCount() {
  return getPostCount.get().count;
}

/**
 * Clean posts older than X seconds (default 7 days)
 */
function cleanup(maxAgeSeconds = 7 * 24 * 60 * 60) {
  const result = cleanOldPosts.run(maxAgeSeconds);
  return result.changes;
}

/**
 * Close database connection
 */
function close() {
  db.close();
}

module.exports = {
  addPost,
  removePost,
  getPosts,
  getCount,
  cleanup,
  close,
};
