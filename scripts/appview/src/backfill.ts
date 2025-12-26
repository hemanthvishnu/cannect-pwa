import { createDb, AppViewDb } from './db.js'
import { config } from './config.js'

const BSKY_API = config.bskyApi

interface RepoInfo {
  did: string
  head: string
  rev: string
  active: boolean
}

interface Profile {
  did: string
  handle: string
  displayName?: string
  description?: string
  avatar?: string
  banner?: string
  followersCount?: number
  followsCount?: number
  postsCount?: number
}

interface Post {
  uri: string
  cid: string
  author: { did: string }
  record: {
    $type: string
    text?: string
    createdAt: string
    reply?: {
      parent: { uri: string }
      root: { uri: string }
    }
    embed?: unknown
    facets?: unknown[]
    langs?: string[]
  }
}

interface Follow {
  uri: string
  subject: { did: string }
  createdAt: string
}

export async function backfillFromPds(db: AppViewDb) {
  console.log('[Backfill] Starting backfill from Cannect PDS...')

  // Step 1: Get all repos (users) from PDS
  const repos = await getAllRepos()
  console.log(`[Backfill] Found ${repos.length} repos to backfill`)

  // Step 2: Resolve handles and profiles via Bluesky API
  await backfillProfiles(db, repos)

  // Step 3: Backfill posts for each user
  await backfillPosts(db, repos)

  // Step 4: Backfill follows
  await backfillFollows(db, repos)

  // Step 5: Backfill likes and reposts (optional - can be slow)
  // await backfillLikes(db, repos)
  // await backfillReposts(db, repos)

  console.log('[Backfill] Backfill complete!')
  printStats(db)
}

async function getAllRepos(): Promise<RepoInfo[]> {
  const repos: RepoInfo[] = []
  let cursor: string | undefined

  do {
    const url = cursor
      ? `${config.cannectPds}/xrpc/com.atproto.sync.listRepos?limit=1000&cursor=${cursor}`
      : `${config.cannectPds}/xrpc/com.atproto.sync.listRepos?limit=1000`

    const response = await fetch(url)
    if (!response.ok) {
      console.error(`[Backfill] Failed to list repos: ${response.status}`)
      break
    }

    const data = await response.json() as { repos: RepoInfo[]; cursor?: string }
    repos.push(...data.repos)
    cursor = data.cursor
  } while (cursor)

  return repos
}

async function backfillProfiles(db: AppViewDb, repos: RepoInfo[]) {
  console.log('[Backfill] Fetching profiles...')

  // Batch DIDs for getProfiles call (max 25 at a time)
  const batchSize = 25
  let processed = 0

  for (let i = 0; i < repos.length; i += batchSize) {
    const batch = repos.slice(i, i + batchSize)
    const dids = batch.map(r => r.did)

    try {
      const params = new URLSearchParams()
      dids.forEach(did => params.append('actors', did))

      const response = await fetch(`${BSKY_API}/xrpc/app.bsky.actor.getProfiles?${params}`)
      if (!response.ok) {
        console.error(`[Backfill] Failed to get profiles: ${response.status}`)
        continue
      }

      const data = await response.json() as { profiles: Profile[] }

      for (const profile of data.profiles) {
        db.prepare(`
          INSERT INTO profiles (did, handle, display_name, description, avatar_cid, banner_cid, followers_count, follows_count, posts_count)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(did) DO UPDATE SET
            handle = excluded.handle,
            display_name = excluded.display_name,
            description = excluded.description,
            followers_count = excluded.followers_count,
            follows_count = excluded.follows_count,
            posts_count = excluded.posts_count,
            indexed_at = datetime('now')
        `).run(
          profile.did,
          profile.handle,
          profile.displayName || null,
          profile.description || null,
          profile.avatar || null,
          profile.banner || null,
          profile.followersCount || 0,
          profile.followsCount || 0,
          profile.postsCount || 0
        )
      }

      processed += data.profiles.length
      process.stdout.write(`\r[Backfill] Profiles: ${processed}/${repos.length}`)

      // Small delay to be nice to the API
      await sleep(100)
    } catch (err) {
      console.error(`[Backfill] Error fetching profiles batch:`, err)
    }
  }

  console.log() // newline
}

async function backfillPosts(db: AppViewDb, repos: RepoInfo[]) {
  console.log('[Backfill] Fetching posts...')

  let totalPosts = 0

  for (const repo of repos) {
    try {
      // Use listRecords to get posts directly from PDS (our own data!)
      let cursor: string | undefined
      let userPosts = 0

      do {
        const url = cursor
          ? `${config.cannectPds}/xrpc/com.atproto.repo.listRecords?repo=${repo.did}&collection=app.bsky.feed.post&limit=100&cursor=${cursor}`
          : `${config.cannectPds}/xrpc/com.atproto.repo.listRecords?repo=${repo.did}&collection=app.bsky.feed.post&limit=100`

        const response = await fetch(url)
        if (!response.ok) break

        const data = await response.json() as { records: Array<{ uri: string; cid: string; value: Record<string, unknown> }>; cursor?: string }

        for (const record of data.records) {
          const post = record.value

          // Parse reply
          let replyParent: string | null = null
          let replyRoot: string | null = null
          if (post.reply) {
            const reply = post.reply as { parent?: { uri: string }; root?: { uri: string } }
            replyParent = reply.parent?.uri || null
            replyRoot = reply.root?.uri || null
          }

          // Parse embed
          let embedType: string | null = null
          let embedData: string | null = null
          if (post.embed) {
            const embed = post.embed as { $type: string }
            embedType = embed.$type?.split('.').pop() || null
            embedData = JSON.stringify(post.embed)
          }

          db.prepare(`
            INSERT OR REPLACE INTO posts (uri, cid, author_did, text, reply_parent, reply_root, embed_type, embed_data, facets, langs, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            record.uri,
            record.cid,
            repo.did,
            post.text as string || '',
            replyParent,
            replyRoot,
            embedType,
            embedData,
            post.facets ? JSON.stringify(post.facets) : null,
            Array.isArray(post.langs) ? JSON.stringify(post.langs) : null,
            post.createdAt as string || new Date().toISOString()
          )

          userPosts++
          totalPosts++
        }

        cursor = data.cursor
      } while (cursor)

      if (userPosts > 0) {
        process.stdout.write(`\r[Backfill] Posts: ${totalPosts} (${repo.did.slice(-8)}: ${userPosts})`)
      }

    } catch (err) {
      console.error(`\n[Backfill] Error fetching posts for ${repo.did}:`, err)
    }
  }

  console.log() // newline
  console.log(`[Backfill] Total posts indexed: ${totalPosts}`)
}

async function backfillFollows(db: AppViewDb, repos: RepoInfo[]) {
  console.log('[Backfill] Fetching follows...')

  let totalFollows = 0

  for (const repo of repos) {
    try {
      let cursor: string | undefined

      do {
        const url = cursor
          ? `${config.cannectPds}/xrpc/com.atproto.repo.listRecords?repo=${repo.did}&collection=app.bsky.graph.follow&limit=100&cursor=${cursor}`
          : `${config.cannectPds}/xrpc/com.atproto.repo.listRecords?repo=${repo.did}&collection=app.bsky.graph.follow&limit=100`

        const response = await fetch(url)
        if (!response.ok) break

        const data = await response.json() as { records: Array<{ uri: string; value: Record<string, unknown> }>; cursor?: string }

        for (const record of data.records) {
          const follow = record.value

          db.prepare(`
            INSERT OR REPLACE INTO follows (uri, subject_did, author_did, created_at)
            VALUES (?, ?, ?, ?)
          `).run(
            record.uri,
            follow.subject as string,
            repo.did,
            follow.createdAt as string || new Date().toISOString()
          )

          totalFollows++
        }

        cursor = data.cursor
      } while (cursor)

    } catch (err) {
      console.error(`\n[Backfill] Error fetching follows for ${repo.did}:`, err)
    }
  }

  console.log(`[Backfill] Total follows indexed: ${totalFollows}`)
}

async function backfillLikes(db: AppViewDb, repos: RepoInfo[]) {
  console.log('[Backfill] Fetching likes...')

  let totalLikes = 0

  for (const repo of repos) {
    try {
      let cursor: string | undefined

      do {
        const url = cursor
          ? `${config.cannectPds}/xrpc/com.atproto.repo.listRecords?repo=${repo.did}&collection=app.bsky.feed.like&limit=100&cursor=${cursor}`
          : `${config.cannectPds}/xrpc/com.atproto.repo.listRecords?repo=${repo.did}&collection=app.bsky.feed.like&limit=100`

        const response = await fetch(url)
        if (!response.ok) break

        const data = await response.json() as { records: Array<{ uri: string; value: Record<string, unknown> }>; cursor?: string }

        for (const record of data.records) {
          const like = record.value
          const subject = like.subject as { uri: string } | undefined
          if (!subject?.uri) continue

          db.prepare(`
            INSERT OR REPLACE INTO likes (uri, subject_uri, author_did, created_at)
            VALUES (?, ?, ?, ?)
          `).run(
            record.uri,
            subject.uri,
            repo.did,
            like.createdAt as string || new Date().toISOString()
          )

          totalLikes++
        }

        cursor = data.cursor
      } while (cursor)

    } catch (err) {
      console.error(`\n[Backfill] Error fetching likes for ${repo.did}:`, err)
    }
  }

  console.log(`[Backfill] Total likes indexed: ${totalLikes}`)
}

function printStats(db: AppViewDb) {
  const stats = {
    profiles: (db.prepare('SELECT COUNT(*) as count FROM profiles').get() as { count: number }).count,
    posts: (db.prepare('SELECT COUNT(*) as count FROM posts').get() as { count: number }).count,
    follows: (db.prepare('SELECT COUNT(*) as count FROM follows').get() as { count: number }).count,
    likes: (db.prepare('SELECT COUNT(*) as count FROM likes').get() as { count: number }).count,
    reposts: (db.prepare('SELECT COUNT(*) as count FROM reposts').get() as { count: number }).count,
  }

  console.log('\n[Backfill] Database Statistics:')
  console.log(`  Profiles: ${stats.profiles}`)
  console.log(`  Posts: ${stats.posts}`)
  console.log(`  Follows: ${stats.follows}`)
  console.log(`  Likes: ${stats.likes}`)
  console.log(`  Reposts: ${stats.reposts}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Run standalone
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('[Backfill] Starting Cannect AppView Backfill')
  const db = createDb()

  backfillFromPds(db).catch(err => {
    console.error('[Backfill] Fatal error:', err)
    process.exit(1)
  })
}

export { backfillLikes }
