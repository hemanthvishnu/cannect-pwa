/**
 * Phase 4: Migrate Follows → AT Protocol Follow Records
 * 
 * Strategy:
 * 1. Load user mappings (mongoUserId → did, handle, tempPassword)
 * 2. For each follow relationship:
 *    - Login as follower
 *    - Follow the followee by DID
 * 3. Skip orphaned follows (user not migrated)
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
// LOAD USER MAPPINGS
// ============================================================

const userMappingsPath = path.join(__dirname, 'migration-users.json');
const userMappingsData = JSON.parse(fs.readFileSync(userMappingsPath, 'utf-8'));
const userMappings = userMappingsData.success || [];

const userByMongoId = new Map();
userMappings.forEach(u => userByMongoId.set(u.mongoId, u));
console.log(`📋 Loaded ${userMappings.length} user mappings\n`);

// ============================================================
// MAIN MIGRATION
// ============================================================

async function migrateFollows() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');
    
    const db = client.db(DB_NAME);
    const followsCollection = db.collection('follows');
    
    // Get all follows sorted by createdAt
    const allFollows = await followsCollection.find({}).sort({ createdAt: 1 }).toArray();
    console.log(`📊 Found ${allFollows.length} total follow relationships\n`);
    
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
    
    // Track already-created follows to avoid duplicates
    const followedPairs = new Set();
    
    console.log('='.repeat(60) + '\n');
    
    const followsToProcess = TEST_LIMIT > 0 ? allFollows.slice(0, TEST_LIMIT) : allFollows;
    
    for (let i = 0; i < followsToProcess.length; i++) {
      const follow = followsToProcess[i];
      
      const followerId = follow.followerId?.toString();
      const followeeId = follow.followeeId?.toString();
      
      // Progress indicator (less verbose for 905 items)
      if ((i + 1) % 50 === 0 || i === 0 || i === followsToProcess.length - 1) {
        console.log(`[${i + 1}/${followsToProcess.length}] Processing...`);
      }
      
      // Get follower mapping
      const followerMapping = userByMongoId.get(followerId);
      if (!followerMapping) {
        results.skipped.push({
          followerId,
          followeeId,
          reason: 'Follower not migrated'
        });
        continue;
      }
      
      // Get followee mapping
      const followeeMapping = userByMongoId.get(followeeId);
      if (!followeeMapping) {
        results.skipped.push({
          followerId,
          followeeId,
          reason: 'Followee not migrated'
        });
        continue;
      }
      
      // Check for duplicate
      const pairKey = `${followerMapping.did}:${followeeMapping.did}`;
      if (followedPairs.has(pairKey)) {
        results.skipped.push({
          followerId,
          followeeId,
          reason: 'Duplicate follow'
        });
        continue;
      }
      
      // Skip self-follows
      if (followerMapping.did === followeeMapping.did) {
        results.skipped.push({
          followerId,
          followeeId,
          reason: 'Self-follow'
        });
        continue;
      }
      
      try {
        const agent = await getAgent(followerMapping);
        
        // Create follow record
        const result = await agent.follow(followeeMapping.did);
        
        followedPairs.add(pairKey);
        
        results.success.push({
          followerDid: followerMapping.did,
          followerHandle: followerMapping.handle,
          followeeDid: followeeMapping.did,
          followeeHandle: followeeMapping.handle,
          uri: result.uri,
          originalCreatedAt: follow.createdAt
        });
        
      } catch (error) {
        // Handle "already following" gracefully
        if (error.message?.includes('already following') || 
            error.message?.includes('duplicate')) {
          results.skipped.push({
            followerId,
            followeeId,
            reason: 'Already following'
          });
          followedPairs.add(pairKey);
        } else {
          results.failed.push({
            followerId,
            followeeId,
            followerHandle: followerMapping.handle,
            followeeHandle: followeeMapping.handle,
            error: error.message
          });
        }
      }
    }
    
    // ========================================
    // SUMMARY
    // ========================================
    console.log('\n' + '='.repeat(60));
    console.log('📊 PHASE 4 MIGRATION SUMMARY');
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
    
    if (results.failed.length > 0 && results.failed.length <= 10) {
      console.log('\n   Failed follows:');
      results.failed.forEach(f => {
        console.log(`      - ${f.followerHandle} → ${f.followeeHandle}: ${f.error}`);
      });
    }
    
    // Save results
    const outputPath = path.join(__dirname, 'migration-follows.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to: ${outputPath}`);
    
  } finally {
    await client.close();
    console.log('\n✅ Done');
  }
}

migrateFollows().catch(console.error);
