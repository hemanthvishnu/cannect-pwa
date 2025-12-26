import Database from 'better-sqlite3'
import { config } from './config.js'

// Initialize database with all tables for AppView
export function createDb(dbPath: string = config.dbPath): Database.Database {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Create tables
  db.exec(`
    -- Profiles table
    CREATE TABLE IF NOT EXISTS profiles (
      did TEXT PRIMARY KEY,
      handle TEXT NOT NULL,
      display_name TEXT,
      description TEXT,
      avatar_cid TEXT,
      banner_cid TEXT,
      followers_count INTEGER DEFAULT 0,
      follows_count INTEGER DEFAULT 0,
      posts_count INTEGER DEFAULT 0,
      indexed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_profiles_handle ON profiles(handle);

    -- Posts table
    CREATE TABLE IF NOT EXISTS posts (
      uri TEXT PRIMARY KEY,
      cid TEXT NOT NULL,
      author_did TEXT NOT NULL,
      text TEXT,
      reply_parent TEXT,
      reply_root TEXT,
      embed_type TEXT,
      embed_data TEXT,
      facets TEXT,
      langs TEXT,
      created_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (author_did) REFERENCES profiles(did)
    );
    CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_did);
    CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_posts_reply_root ON posts(reply_root);
    CREATE INDEX IF NOT EXISTS idx_posts_indexed ON posts(indexed_at DESC);

    -- Follows table
    CREATE TABLE IF NOT EXISTS follows (
      uri TEXT PRIMARY KEY,
      subject_did TEXT NOT NULL,
      author_did TEXT NOT NULL,
      created_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_follows_author ON follows(author_did);
    CREATE INDEX IF NOT EXISTS idx_follows_subject ON follows(subject_did);

    -- Likes table
    CREATE TABLE IF NOT EXISTS likes (
      uri TEXT PRIMARY KEY,
      subject_uri TEXT NOT NULL,
      author_did TEXT NOT NULL,
      created_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_likes_subject ON likes(subject_uri);
    CREATE INDEX IF NOT EXISTS idx_likes_author ON likes(author_did);

    -- Reposts table
    CREATE TABLE IF NOT EXISTS reposts (
      uri TEXT PRIMARY KEY,
      subject_uri TEXT NOT NULL,
      author_did TEXT NOT NULL,
      created_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_reposts_subject ON reposts(subject_uri);
    CREATE INDEX IF NOT EXISTS idx_reposts_author ON reposts(author_did);

    -- Blocks table
    CREATE TABLE IF NOT EXISTS blocks (
      uri TEXT PRIMARY KEY,
      subject_did TEXT NOT NULL,
      author_did TEXT NOT NULL,
      created_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_blocks_author ON blocks(author_did);
    CREATE INDEX IF NOT EXISTS idx_blocks_subject ON blocks(subject_did);

    -- Sync state for tracking firehose cursor
    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      pds_cursor TEXT,
      relay_cursor TEXT,
      last_sync TEXT
    );
    INSERT OR IGNORE INTO sync_state (id) VALUES (1);

    -- Post images (separate for many-to-one relationship)
    CREATE TABLE IF NOT EXISTS post_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_uri TEXT NOT NULL,
      cid TEXT NOT NULL,
      alt TEXT,
      aspect_ratio_width INTEGER,
      aspect_ratio_height INTEGER,
      FOREIGN KEY (post_uri) REFERENCES posts(uri) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_post_images_post ON post_images(post_uri);
  `)

  return db
}

// Types for database records
export interface DbProfile {
  did: string
  handle: string
  display_name: string | null
  description: string | null
  avatar_cid: string | null
  banner_cid: string | null
  followers_count: number
  follows_count: number
  posts_count: number
  indexed_at: string
}

export interface DbPost {
  uri: string
  cid: string
  author_did: string
  text: string | null
  reply_parent: string | null
  reply_root: string | null
  embed_type: string | null
  embed_data: string | null
  facets: string | null
  langs: string | null
  created_at: string
  indexed_at: string
}

export interface DbFollow {
  uri: string
  subject_did: string
  author_did: string
  created_at: string
  indexed_at: string
}

export interface DbLike {
  uri: string
  subject_uri: string
  author_did: string
  created_at: string
  indexed_at: string
}

export interface DbRepost {
  uri: string
  subject_uri: string
  author_did: string
  created_at: string
  indexed_at: string
}

export type AppViewDb = ReturnType<typeof createDb>
