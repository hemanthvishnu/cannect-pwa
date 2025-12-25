/**
 * Phase 3: Migrate Comments → AT Protocol Replies
 * 
 * Strategy:
 * 1. Load user mappings (mongoUserId → did, handle, tempPassword)
 * 2. Load post mappings (mongoPostId → uri, cid)
 * 3. Migrate top-level comments first (parentId = null)
 * 4. Then migrate nested comments (parentId ≠ null)
 * 5. Skip orphaned comments (post not migrated, user not migrated)
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

const MAX_GRAPHEMES = 300;

// Set to 0 for full migration, or a number for testing
const TEST_LIMIT = 0;

// ============================================================
// LOAD MAPPINGS
// ============================================================

// User mappings: mongoId → { did, handle, tempPassword }
const userMappingsPath = path.join(__dirname, 'migration-users.json');
const userMappingsData = JSON.parse(fs.readFileSync(userMappingsPath, 'utf-8'));
const userMappings = userMappingsData.success || [];

const userByMongoId = new Map();
userMappings.forEach(u => userByMongoId.set(u.mongoId, u));
console.log(`📋 Loaded ${userMappings.length} user mappings`);

// Post mappings: mongoPostId → { uri, cid }
const postMappingsPath = path.join(__dirname, 'migration-posts.json');
const postMappingsData = JSON.parse(fs.readFileSync(postMappingsPath, 'utf-8'));
const postMappings = postMappingsData.success || [];

const postByMongoId = new Map();
postMappings.forEach(p => postByMongoId.set(p.mongoPostId, p));
console.log(`📋 Loaded ${postMappings.length} post mappings`);

// Long posts mapping (they have different URIs)
const longPostsPath = path.join(__dirname, 'migration-long-posts.json');
let longPostMappings = [];
if (fs.existsSync(longPostsPath)) {
  longPostMappings = JSON.parse(fs.readFileSync(longPostsPath, 'utf-8'));
  // These are stored as array with mainUri
  longPostMappings.forEach(p => {
    if (p.success && p.mongoPostId) {
      postByMongoId.set(p.mongoPostId, {
        mongoPostId: p.mongoPostId,
        uri: p.mainUri,
        cid: p.mainCid
      });
    }
  });
  console.log(`📋 Loaded ${longPostMappings.filter(p => p.success).length} long post mappings`);
}

// Track migrated comments for nested replies
const commentByMongoId = new Map();

// ============================================================
// HELPERS
// ============================================================

function truncateText(text, max = MAX_GRAPHEMES) {
  if (!text || text.length <= max) return text;
  // Find word boundary near limit
  let truncateAt = max - 1;
  while (truncateAt > 0 && text[truncateAt] !== ' ') {
    truncateAt--;
  }
  if (truncateAt === 0) truncateAt = max - 1;
  return text.substring(0, truncateAt).trim() + '…';
}

// ============================================================
// MAIN MIGRATION
// ============================================================

async function migrateComments() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('\n✅ Connected to MongoDB\n');
    
    const db = client.db(DB_NAME);
    const commentsCollection = db.collection('comments');
    
    // Get all comments sorted by createdAt
    const allComments = await commentsCollection.find({}).sort({ createdAt: 1 }).toArray();
    console.log(`📊 Found ${allComments.length} total comments`);
    
    // Separate top-level and nested
    const topLevel = allComments.filter(c => !c.parentId);
    const nested = allComments.filter(c => c.parentId);
    
    console.log(`   └─ ${topLevel.length} top-level (replies to posts)`);
    console.log(`   └─ ${nested.length} nested (replies to comments)\n`);
    
    const results = {
      success: [],
      skipped: [],
      failed: []
    };
    
    const agents = new Map(); // Cache logged-in agents
    
    // Helper to get or create agent
    async function getAgent(userMapping) {
      if (agents.has(userMapping.handle)) {
        return agents.get(userMapping.handle);
      }
      const agent = new BskyAgent({ service: PDS_URL });
      await agent.login({
        identifier: userMapping.handle,
        password: userMapping.tempPassword
      });
      agents.set(userMapping.handle, agent);
      return agent;
    }
    
    // ========================================
    // PHASE 3a: Top-level comments
    // ========================================
    console.log('='.repeat(60));
    console.log('PHASE 3a: Top-level comments (replies to posts)');
    console.log('='.repeat(60) + '\n');
    
    const topLevelToProcess = TEST_LIMIT > 0 ? topLevel.slice(0, TEST_LIMIT) : topLevel;
    
    for (let i = 0; i < topLevelToProcess.length; i++) {
      const comment = topLevelToProcess[i];
      const preview = (comment.content || '').substring(0, 40);
      console.log(`[${i + 1}/${topLevelToProcess.length}] "${preview}..."`);
      
      // Get post mapping
      const postId = comment.postId?.toString();
      const postMapping = postByMongoId.get(postId);
      
      if (!postMapping) {
        console.log(`   ⏭️  Skipped: Post not migrated (${postId})\n`);
        results.skipped.push({
          mongoCommentId: comment._id.toString(),
          reason: 'Post not migrated',
          postId
        });
        continue;
      }
      
      // Get user mapping
      const userId = comment.userId?.toString();
      const userMapping = userByMongoId.get(userId);
      
      if (!userMapping) {
        console.log(`   ⏭️  Skipped: User not migrated (${userId})\n`);
        results.skipped.push({
          mongoCommentId: comment._id.toString(),
          reason: 'User not migrated',
          userId
        });
        continue;
      }
      
      try {
        const agent = await getAgent(userMapping);
        
        // Truncate if too long
        const text = truncateText(comment.content || '(no content)');
        if (text !== comment.content) {
          console.log(`   ⚠️  Truncated: ${comment.content.length} → ${text.length} chars`);
        }
        
        // Create reply to post
        const replyRecord = {
          $type: 'app.bsky.feed.post',
          text: text,
          createdAt: comment.createdAt?.toISOString() || new Date().toISOString(),
          reply: {
            root: { uri: postMapping.uri, cid: postMapping.cid },
            parent: { uri: postMapping.uri, cid: postMapping.cid }
          }
        };
        
        const result = await agent.post(replyRecord);
        
        // Store for nested replies
        commentByMongoId.set(comment._id.toString(), {
          uri: result.uri,
          cid: result.cid,
          rootUri: postMapping.uri,
          rootCid: postMapping.cid
        });
        
        console.log(`   ✅ Created: ${result.uri}\n`);
        
        results.success.push({
          mongoCommentId: comment._id.toString(),
          mongoPostId: postId,
          mongoUserId: userId,
          uri: result.uri,
          cid: result.cid,
          isTopLevel: true,
          originalCreatedAt: comment.createdAt
        });
        
      } catch (error) {
        console.log(`   ❌ Failed: ${error.message}\n`);
        results.failed.push({
          mongoCommentId: comment._id.toString(),
          error: error.message
        });
      }
    }
    
    // ========================================
    // PHASE 3b: Nested comments
    // ========================================
    console.log('\n' + '='.repeat(60));
    console.log('PHASE 3b: Nested comments (replies to comments)');
    console.log('='.repeat(60) + '\n');
    
    const nestedToProcess = TEST_LIMIT > 0 ? nested.slice(0, TEST_LIMIT) : nested;
    
    for (let i = 0; i < nestedToProcess.length; i++) {
      const comment = nestedToProcess[i];
      const preview = (comment.content || '').substring(0, 40);
      console.log(`[${i + 1}/${nestedToProcess.length}] "${preview}..."`);
      
      // Get parent comment mapping
      const parentId = comment.parentId?.toString();
      const parentMapping = commentByMongoId.get(parentId);
      
      if (!parentMapping) {
        console.log(`   ⏭️  Skipped: Parent comment not migrated (${parentId})\n`);
        results.skipped.push({
          mongoCommentId: comment._id.toString(),
          reason: 'Parent comment not migrated',
          parentId
        });
        continue;
      }
      
      // Get user mapping
      const userId = comment.userId?.toString();
      const userMapping = userByMongoId.get(userId);
      
      if (!userMapping) {
        console.log(`   ⏭️  Skipped: User not migrated (${userId})\n`);
        results.skipped.push({
          mongoCommentId: comment._id.toString(),
          reason: 'User not migrated',
          userId
        });
        continue;
      }
      
      try {
        const agent = await getAgent(userMapping);
        
        // Truncate if too long
        const text = truncateText(comment.content || '(no content)');
        if (text !== comment.content) {
          console.log(`   ⚠️  Truncated: ${comment.content.length} → ${text.length} chars`);
        }
        
        // Create reply to comment (parent is the comment, root is the original post)
        const replyRecord = {
          $type: 'app.bsky.feed.post',
          text: text,
          createdAt: comment.createdAt?.toISOString() || new Date().toISOString(),
          reply: {
            root: { uri: parentMapping.rootUri, cid: parentMapping.rootCid },
            parent: { uri: parentMapping.uri, cid: parentMapping.cid }
          }
        };
        
        const result = await agent.post(replyRecord);
        
        // Store in case there are deeper nested replies
        commentByMongoId.set(comment._id.toString(), {
          uri: result.uri,
          cid: result.cid,
          rootUri: parentMapping.rootUri,
          rootCid: parentMapping.rootCid
        });
        
        console.log(`   ✅ Created: ${result.uri}\n`);
        
        results.success.push({
          mongoCommentId: comment._id.toString(),
          mongoParentId: parentId,
          mongoUserId: userId,
          uri: result.uri,
          cid: result.cid,
          isTopLevel: false,
          originalCreatedAt: comment.createdAt
        });
        
      } catch (error) {
        console.log(`   ❌ Failed: ${error.message}\n`);
        results.failed.push({
          mongoCommentId: comment._id.toString(),
          error: error.message
        });
      }
    }
    
    // ========================================
    // SUMMARY
    // ========================================
    console.log('\n' + '='.repeat(60));
    console.log('📊 PHASE 3 MIGRATION SUMMARY');
    console.log('='.repeat(60) + '\n');
    
    console.log(`   ✅ Success: ${results.success.length}`);
    console.log(`   ⏭️  Skipped: ${results.skipped.length}`);
    console.log(`   ❌ Failed:  ${results.failed.length}`);
    
    // Breakdown
    const topLevelSuccess = results.success.filter(r => r.isTopLevel).length;
    const nestedSuccess = results.success.filter(r => !r.isTopLevel).length;
    console.log(`\n   Top-level replies: ${topLevelSuccess}`);
    console.log(`   Nested replies:    ${nestedSuccess}`);
    
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
    const outputPath = path.join(__dirname, 'migration-comments.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to: ${outputPath}`);
    
  } finally {
    await client.close();
    console.log('\n✅ Done');
  }
}

migrateComments().catch(console.error);
