/**
 * Phase 5b: Migrate Likes → AT Protocol Like Records
 * 
 * Strategy:
 * 1. For each post with likedBy array
 * 2. For each user who liked the post
 * 3. Login as that user and create a like record
 */

import { MongoClient } from 'mongodb';
import { BskyAgent } from '@atproto/api';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// CONFIGURATION
// ============================================================

const MONGO_URI = 'mongodb+srv://cannect_pro_admin:uwscFFdGZ3cfpgcf@cannect-prod-cluster.jykrcf.mongodb.net/';
const DB_NAME = 'cannect-database';
const PDS_URL = 'https://cannect.space';

// Set to 0 for full migration, or a number for testing
const TEST_LIMIT = 0;

// ============================================================
// LOAD MAPPINGS
// ============================================================

// User mappings
const userMappingsPath = path.join(__dirname, 'migration-users.json');
const userMappingsData = JSON.parse(fs.readFileSync(userMappingsPath, 'utf-8'));
const userMappings = userMappingsData.success || [];

const userByMongoId = new Map();
userMappings.forEach(u => userByMongoId.set(u.mongoId, u));
console.log(`📋 Loaded ${userMappings.length} user mappings`);

// Post mappings
const postMappingsPath = path.join(__dirname, 'migration-posts.json');
const postMappingsData = JSON.parse(fs.readFileSync(postMappingsPath, 'utf-8'));
const postMappings = postMappingsData.success || [];

const postByMongoId = new Map();
postMappings.forEach(p => postByMongoId.set(p.mongoPostId, p));
console.log(`📋 Loaded ${postMappings.length} post mappings`);

// Long posts mapping
const longPostsPath = path.join(__dirname, 'migration-long-posts.json');
if (fs.existsSync(longPostsPath)) {
  const longPostMappings = JSON.parse(fs.readFileSync(longPostsPath, 'utf-8'));
  longPostMappings.forEach(p => {
    if (p.success && p.mongoPostId) {
      postByMongoId.set(p.mongoPostId, {
        mongoPostId: p.mongoPostId,
        uri: p.mainUri,
        cid: p.mainCid
      });
    }
  });
  console.log(`📋 Loaded long post mappings`);
}

console.log('');

// ============================================================
// MAIN MIGRATION
// ============================================================

async function migrateLikes() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');
    
    const db = client.db(DB_NAME);
    const postsCollection = db.collection('posts');
    
    // Get all posts with likes
    const postsWithLikes = await postsCollection.find({
      likedBy: { $exists: true, $ne: [] }
    }).toArray();
    
    console.log(`📊 Found ${postsWithLikes.length} posts with likes\n`);
    
    // Flatten to individual like operations
    const likeOperations = [];
    for (const post of postsWithLikes) {
      const postMapping = postByMongoId.get(post._id.toString());
      if (!postMapping) continue;
      
      for (const likerId of (post.likedBy || [])) {
        const userMapping = userByMongoId.get(likerId.toString());
        if (!userMapping) continue;
        
        likeOperations.push({
          postId: post._id.toString(),
          postUri: postMapping.uri,
          postCid: postMapping.cid,
          userId: likerId.toString(),
          userHandle: userMapping.handle,
          userDid: userMapping.did,
          tempPassword: userMapping.tempPassword
        });
      }
    }
    
    console.log(`📝 ${likeOperations.length} like operations to migrate\n`);
    console.log('='.repeat(60) + '\n');
    
    const results = {
      success: [],
      skipped: [],
      failed: []
    };
    
    const agents = new Map(); // Cache logged-in agents
    const likedPairs = new Set(); // Track already liked
    
    // Helper to get or create agent
    async function getAgent(handle, password) {
      if (agents.has(handle)) {
        return agents.get(handle);
      }
      const agent = new BskyAgent({ service: PDS_URL });
      await agent.login({
        identifier: handle,
        password: password
      });
      agents.set(handle, agent);
      return agent;
    }
    
    const toProcess = TEST_LIMIT > 0 ? likeOperations.slice(0, TEST_LIMIT) : likeOperations;
    
    for (let i = 0; i < toProcess.length; i++) {
      const op = toProcess[i];
      
      // Progress indicator
      if ((i + 1) % 100 === 0 || i === 0 || i === toProcess.length - 1) {
        console.log(`[${i + 1}/${toProcess.length}] Processing likes...`);
      }
      
      // Check for duplicate
      const pairKey = `${op.userDid}:${op.postUri}`;
      if (likedPairs.has(pairKey)) {
        results.skipped.push({ reason: 'Duplicate' });
        continue;
      }
      
      try {
        const agent = await getAgent(op.userHandle, op.tempPassword);
        
        // Create like record
        await agent.like(op.postUri, op.postCid);
        
        likedPairs.add(pairKey);
        
        results.success.push({
          userHandle: op.userHandle,
          postUri: op.postUri
        });
        
      } catch (error) {
        // Handle "already liked" gracefully
        if (error.message?.includes('duplicate') || 
            error.message?.includes('already')) {
          results.skipped.push({ reason: 'Already liked' });
          likedPairs.add(pairKey);
        } else {
          results.failed.push({
            userHandle: op.userHandle,
            postUri: op.postUri,
            error: error.message
          });
        }
      }
    }
    
    // ========================================
    // SUMMARY
    // ========================================
    console.log('\n' + '='.repeat(60));
    console.log('📊 LIKES MIGRATION SUMMARY');
    console.log('='.repeat(60) + '\n');
    
    console.log(`   ✅ Success: ${results.success.length}`);
    console.log(`   ⏭️  Skipped: ${results.skipped.length}`);
    console.log(`   ❌ Failed:  ${results.failed.length}`);
    
    if (results.skipped.length > 0) {
      const reasons = {};
      results.skipped.forEach(s => {
        reasons[s.reason] = (reasons[s.reason] || 0) + 1;
      });
      console.log('\n   Skipped breakdown:');
      Object.entries(reasons).forEach(([reason, count]) => {
        console.log(`      - ${reason}: ${count}`);
      });
    }
    
    // Save results
    const outputPath = path.join(__dirname, 'migration-likes.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to: ${outputPath}`);
    
  } finally {
    await client.close();
    console.log('\n✅ Done');
  }
}

migrateLikes().catch(console.error);
