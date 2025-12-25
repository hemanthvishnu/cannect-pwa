/**
 * Phase 2: Posts Migration (Full Run)
 * 
 * Creates posts on PDS with original timestamps and images
 */

import { MongoClient } from 'mongodb';
import { BskyAgent, RichText } from '@atproto/api';
import fs from 'fs';

// Config
const MONGO_URI = 'mongodb+srv://cannect_pro_admin:uwscFFdGZ3cfpgcf@cannect-prod-cluster.jykrcf.mongodb.net/?appName=cannect-prod-cluster';
const DB_NAME = 'cannect-database';
const PDS_URL = 'https://cannect.space';
const TEST_LIMIT = 0; // 0 = no limit, migrate all
const USERS_FILE = 'scripts/migration-users.json';
const OUTPUT_FILE = 'scripts/migration-posts.json';

// Load previous results (to skip already migrated)
let previousSuccess = [];
try {
  const prevData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
  previousSuccess = prevData.success || [];
  console.log(`📋 Found ${previousSuccess.length} previously migrated posts\n`);
} catch (e) {
  console.log(`📋 No previous migration found, starting fresh\n`);
}
const alreadyMigrated = new Set(previousSuccess.map(p => p.mongoPostId));

// Load user mapping
const usersData = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
const userMap = new Map();
usersData.success.forEach(u => {
  userMap.set(u.mongoId, {
    did: u.did,
    handle: u.handle,
    tempPassword: u.tempPassword,
  });
});

console.log(`📋 Loaded ${userMap.size} user mappings\n`);

// Delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Download image and return as Uint8Array
async function downloadImage(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    return { 
      data: new Uint8Array(buffer), 
      mimeType: contentType 
    };
  } catch (err) {
    console.log(`   ⚠️  Image download failed: ${err.message}`);
    return null;
  }
}

async function migratePosts() {
  const mongoClient = new MongoClient(MONGO_URI);
  const results = {
    success: [...previousSuccess], // Include previous migrations
    failed: [],
    skipped: [],
  };
  
  // Cache for logged-in agents (avoid re-login for same user)
  const agentCache = new Map();
  
  try {
    await mongoClient.connect();
    console.log('✅ Connected to MongoDB\n');
    
    const db = mongoClient.db(DB_NAME);
    const postsCollection = db.collection('posts');
    
    // Get posts sorted by createdAt (oldest first to maintain order)
    const query = TEST_LIMIT > 0 
      ? postsCollection.find().sort({ createdAt: 1 }).limit(TEST_LIMIT)
      : postsCollection.find().sort({ createdAt: 1 });
    const posts = await query.toArray();
    
    console.log(`📊 Found ${posts.length} total posts in MongoDB\n`);
    console.log('='.repeat(60) + '\n');
    
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const mongoPostId = post._id.toString();
      const mongoUserId = post.userId;
      
      // Skip already migrated
      if (alreadyMigrated.has(mongoPostId)) {
        console.log(`[${i + 1}/${posts.length}] ⏭️  Already migrated: "${post.content?.substring(0, 30)}..."`);
        continue;
      }
      
      console.log(`[${i + 1}/${posts.length}] Post: "${post.content?.substring(0, 50)}..."`);
      console.log(`   Created: ${post.createdAt}`);
      console.log(`   Has image: ${!!post.imageUrl}`);
      
      // Find user mapping
      const user = userMap.get(mongoUserId);
      if (!user) {
        console.log(`   ⏭️  Skipping: User not migrated (mongoId: ${mongoUserId})`);
        results.skipped.push({
          mongoPostId,
          mongoUserId,
          reason: 'User not migrated',
        });
        console.log('');
        continue;
      }
      
      console.log(`   User: ${user.handle}`);
      
      try {
        // Get or create agent for this user
        let agent = agentCache.get(user.did);
        if (!agent) {
          agent = new BskyAgent({ service: PDS_URL });
          await agent.login({
            identifier: user.handle,
            password: user.tempPassword,
          });
          agentCache.set(user.did, agent);
          console.log(`   🔑 Logged in as ${user.handle}`);
        }
        
        // Prepare embed (image if exists)
        let embed = undefined;
        let imageStatus = 'no image';
        if (post.imageUrl) {
          console.log(`   📷 Downloading image...`);
          const image = await downloadImage(post.imageUrl);
          
          if (image) {
            console.log(`   📤 Uploading to PDS (${(image.data.length / 1024).toFixed(1)} KB)...`);
            const uploadResult = await agent.uploadBlob(image.data, {
              encoding: image.mimeType,
            });
            
            embed = {
              $type: 'app.bsky.embed.images',
              images: [{
                alt: '', // No alt text in legacy data
                image: uploadResult.data.blob,
              }],
            };
            console.log(`   ✅ Image uploaded`);
            imageStatus = 'with image';
          } else {
            console.log(`   ⚠️  Posting text only (image unavailable)`);
            imageStatus = 'text only (image failed)';
          }
        }
        
        // Parse rich text (hashtags, mentions, links)
        const rt = new RichText({ text: post.content || '' });
        await rt.detectFacets(agent);
        
        // Create post record with original timestamp
        const record = {
          $type: 'app.bsky.feed.post',
          text: rt.text,
          facets: rt.facets,
          createdAt: post.createdAt.toISOString ? post.createdAt.toISOString() : post.createdAt,
          langs: ['en'],
        };
        
        if (embed) {
          record.embed = embed;
        }
        
        // Create the post
        const result = await agent.post(record);
        
        console.log(`   ✅ Created! URI: ${result.uri}`);
        
        results.success.push({
          mongoPostId,
          mongoUserId,
          authorDid: user.did,
          uri: result.uri,
          cid: result.cid,
          originalCreatedAt: post.createdAt,
          hasImage: !!post.imageUrl,
        });
        
      } catch (err) {
        console.log(`   ❌ Failed: ${err.message}`);
        results.failed.push({
          mongoPostId,
          mongoUserId,
          error: err.message,
        });
      }
      
      console.log('');
      
      // Rate limit: 1 second between posts
      if (i < posts.length - 1) {
        await delay(1000);
      }
    }
    
    // Summary
    console.log('='.repeat(60));
    console.log('\n📊 MIGRATION SUMMARY\n');
    console.log(`   ✅ Success: ${results.success.length}`);
    console.log(`   ⏭️  Skipped: ${results.skipped.length}`);
    console.log(`   ❌ Failed:  ${results.failed.length}`);
    
    // Save results
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to: ${OUTPUT_FILE}`);
    
  } catch (err) {
    console.error('❌ Fatal error:', err.message);
  } finally {
    await mongoClient.close();
    console.log('\n✅ Done');
  }
}

migratePosts();
