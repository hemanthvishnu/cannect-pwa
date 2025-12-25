/**
 * Phase 2b: Migrate Long Posts (>300 chars)
 * Splits them into main post + reply with remaining content
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
const SPLIT_AT = 280; // Leave room for "…"

// The 1 remaining post that had a network error
const LONG_POST_INDICES = [11];

// ============================================================
// LOAD USER MAPPINGS
// ============================================================

const userMappingsPath = path.join(__dirname, 'migration-users.json');
const userMappingsData = JSON.parse(fs.readFileSync(userMappingsPath, 'utf-8'));
const userMappings = userMappingsData.success || []; // Extract successful migrations
console.log(`\n📋 Loaded ${userMappings.length} user mappings\n`);

// Create lookup by mongoId
const userByMongoId = new Map();
userMappings.forEach(u => userByMongoId.set(u.mongoId, u));

// ============================================================
// HELPERS
// ============================================================

function splitTextIntoChunks(text, maxChars = SPLIT_AT) {
  if (text.length <= MAX_GRAPHEMES) {
    return [text];
  }
  
  const chunks = [];
  let remaining = text;
  let isFirst = true;
  
  while (remaining.length > 0) {
    // Account for continuation markers
    const effectiveMax = isFirst ? maxChars : maxChars - 1; // "…" prefix on subsequent chunks
    
    if (remaining.length <= MAX_GRAPHEMES - (isFirst ? 0 : 1)) {
      // Last chunk - add prefix if not first
      chunks.push(isFirst ? remaining : '…' + remaining);
      break;
    }
    
    // Find a good split point (word boundary)
    let splitPoint = effectiveMax;
    while (splitPoint > 0 && remaining[splitPoint] !== ' ') {
      splitPoint--;
    }
    if (splitPoint === 0) splitPoint = effectiveMax;
    
    const chunk = remaining.substring(0, splitPoint).trim();
    chunks.push((isFirst ? '' : '…') + chunk + '…');
    
    remaining = remaining.substring(splitPoint).trim();
    isFirst = false;
  }
  
  return chunks;
}

async function downloadImage(url) {
  try {
    const response = await fetch(url, { timeout: 30000 });
    if (!response.ok) {
      console.log(`   ⚠️  Image download failed: HTTP ${response.status}`);
      return null;
    }
    const buffer = await response.arrayBuffer();
    return {
      data: new Uint8Array(buffer),
      mimeType: response.headers.get('content-type') || 'image/jpeg'
    };
  } catch (error) {
    console.log(`   ⚠️  Image download error: ${error.message}`);
    return null;
  }
}

// ============================================================
// MAIN MIGRATION
// ============================================================

async function migrateLongPosts() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');
    
    const db = client.db(DB_NAME);
    const postsCollection = db.collection('posts');
    
    // Get all posts sorted by createdAt (same order as original migration)
    const allPosts = await postsCollection.find({}).sort({ createdAt: 1 }).toArray();
    console.log(`📊 Found ${allPosts.length} total posts\n`);
    
    // Filter to just the long posts (1-indexed from logs)
    const longPosts = LONG_POST_INDICES.map(idx => ({
      index: idx,
      post: allPosts[idx - 1] // Convert to 0-indexed
    })).filter(p => p.post);
    
    console.log(`📝 Processing ${longPosts.length} long posts\n`);
    console.log('='.repeat(60) + '\n');
    
    const results = [];
    const agents = new Map(); // Cache logged-in agents
    
    for (const { index, post } of longPosts) {
      const preview = post.content?.substring(0, 50) || '(no content)';
      console.log(`[${index}/109] Post: "${preview}..."`);
      console.log(`   Original length: ${post.content?.length || 0} chars`);
      
      // Get user mapping
      const userId = post.userId?.toString() || post.user?.toString();
      const userMapping = userByMongoId.get(userId);
      
      if (!userMapping) {
        console.log(`   ❌ No user mapping found for userId: ${userId}`);
        results.push({ index, success: false, error: 'No user mapping' });
        continue;
      }
      
      console.log(`   User: ${userMapping.handle}`);
      
      // Split the text into chunks
      const chunks = splitTextIntoChunks(post.content || '');
      console.log(`   Split into ${chunks.length} chunks: ${chunks.map(c => c.length).join(' + ')} chars`);
      
      try {
        // Get or create agent for this user
        let agent = agents.get(userMapping.handle);
        if (!agent) {
          agent = new BskyAgent({ service: PDS_URL });
          await agent.login({
            identifier: userMapping.handle,
            password: userMapping.tempPassword
          });
          agents.set(userMapping.handle, agent);
          console.log(`   🔑 Logged in as ${userMapping.handle}`);
        }
        
        // Handle image if present (only for first chunk)
        let embed = undefined;
        const imageUrl = post.image || post.imageUrl;
        if (imageUrl) {
          console.log(`   📷 Downloading image...`);
          const imageData = await downloadImage(imageUrl);
          if (imageData) {
            console.log(`   📤 Uploading to PDS (${(imageData.data.length / 1024).toFixed(1)} KB)...`);
            const uploadResponse = await agent.uploadBlob(imageData.data, {
              encoding: imageData.mimeType
            });
            embed = {
              $type: 'app.bsky.embed.images',
              images: [{
                alt: '',
                image: uploadResponse.data.blob
              }]
            };
            console.log(`   ✅ Image uploaded`);
          }
        }
        
        // Create the main post (first chunk, with image if any)
        const mainPostRecord = {
          $type: 'app.bsky.feed.post',
          text: chunks[0],
          createdAt: post.createdAt?.toISOString() || new Date().toISOString()
        };
        if (embed) {
          mainPostRecord.embed = embed;
        }
        
        const mainResult = await agent.post(mainPostRecord);
        console.log(`   ✅ Main post: ${mainResult.uri}`);
        
        // Store root for all replies
        const rootRef = { uri: mainResult.uri, cid: mainResult.cid };
        let parentRef = rootRef;
        const replyUris = [];
        
        // Create replies for remaining chunks
        for (let i = 1; i < chunks.length; i++) {
          const replyRecord = {
            $type: 'app.bsky.feed.post',
            text: chunks[i],
            createdAt: new Date(new Date(post.createdAt).getTime() + (i * 1000)).toISOString(),
            reply: {
              root: rootRef,
              parent: parentRef
            }
          };
          
          const replyResult = await agent.post(replyRecord);
          console.log(`   ✅ Reply ${i}: ${replyResult.uri}`);
          replyUris.push(replyResult.uri);
          
          // Next reply chains off this one
          parentRef = { uri: replyResult.uri, cid: replyResult.cid };
        }
        
        results.push({
          index,
          mongoPostId: post._id.toString(),
          success: true,
          mainUri: mainResult.uri,
          mainCid: mainResult.cid,
          replyUris,
          originalLength: post.content?.length,
          chunkCount: chunks.length
        });
        
        console.log('');
        
      } catch (error) {
        console.log(`   ❌ Failed: ${error.message}\n`);
        results.push({
          index,
          mongoPostId: post._id.toString(),
          success: false,
          error: error.message
        });
      }
    }
    
    // Summary
    console.log('='.repeat(60));
    console.log('\n📊 LONG POSTS MIGRATION SUMMARY\n');
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    console.log(`   ✅ Success: ${successful.length}`);
    console.log(`   ❌ Failed:  ${failed.length}`);
    
    if (failed.length > 0) {
      console.log('\n   Failed posts:');
      failed.forEach(f => {
        console.log(`      - Post ${f.index}: ${f.error}`);
      });
    }
    
    // Save results
    const outputPath = path.join(__dirname, 'migration-long-posts.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to: ${outputPath}`);
    
  } finally {
    await client.close();
    console.log('\n✅ Done');
  }
}

migrateLongPosts().catch(console.error);
