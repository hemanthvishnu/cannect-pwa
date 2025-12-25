/**
 * Phase 1: User Migration (Test Run - 5 Users)
 * 
 * Creates user accounts on cannect.space PDS
 */

import { MongoClient } from 'mongodb';
import { BskyAgent } from '@atproto/api';
import crypto from 'crypto';
import fs from 'fs';

// Config
const MONGO_URI = 'mongodb+srv://cannect_pro_admin:uwscFFdGZ3cfpgcf@cannect-prod-cluster.jykrcf.mongodb.net/?appName=cannect-prod-cluster';
const DB_NAME = 'cannect-database';
const PDS_URL = 'https://cannect.space';
const TEST_LIMIT = 0; // 0 = no limit, migrate all
const OUTPUT_FILE = 'scripts/migration-users.json';

// Already migrated user IDs (from test run)
const ALREADY_MIGRATED = [
  '691c22ccba9643f217a1b1f9', // Vermontijuana
  '691c22ccba9643f217a1b1fd', // Vast_Verbal  
  '691c22ccba9643f217a1b1fe', // closetmedicine
  '691bf969ba12ed55662f4921', // longpassuser6751 (test account)
];

// Previous successful migrations (to merge with new results)
const PREVIOUS_SUCCESS = [
  {
    "mongoId": "691c22ccba9643f217a1b1f9",
    "username": "Vermontijuana",
    "email": "eli@yourgreenbridge.com",
    "handle": "vermontijuana.cannect.space",
    "did": "did:plc:akx74gjaogubgle2qgqtvcwx",
    "tempPassword": "55xEaNZz9Qph2sgJ",
    "createdAt": "2025-11-18T07:39:55.992Z"
  },
  {
    "mongoId": "691c22ccba9643f217a1b1fd",
    "username": "Vast_Verbal",
    "email": "verbalvast@gmail.com",
    "handle": "vastverbal.cannect.space",
    "did": "did:plc:6pzfbngvyorb2tquefxlvvje",
    "tempPassword": "d8JxgfKbfk4xgF63",
    "createdAt": "2025-11-18T07:39:55.992Z"
  },
  {
    "mongoId": "691c22ccba9643f217a1b1fe",
    "username": "closetmedicine",
    "email": "Dimorajr@gmail.com",
    "handle": "closetmedicine.cannect.space",
    "did": "did:plc:2x42g5yqprhbobsyowb3cqhw",
    "tempPassword": "m0PO4APX5pRd2um7",
    "createdAt": "2025-11-18T07:39:55.992Z"
  },
];

// Generate a secure random password
function generatePassword() {
  return crypto.randomBytes(12).toString('base64').replace(/[+/=]/g, 'x');
}

// Check if user looks like a test account
function isTestAccount(user) {
  const email = (user.email || '').toLowerCase();
  const username = (user.username || '').toLowerCase();
  
  // Test email patterns
  if (email.includes('test') || email.includes('@example.') || email.endsWith('.test')) return true;
  
  // Test username patterns
  if (username.includes('test') || username.match(/^user\d+$/) || username.match(/testuser/)) return true;
  
  // Fake/placeholder emails
  if (email.includes('fake') || email.includes('placeholder')) return true;
  
  return false;
}

// Clean username for AT Protocol (lowercase, no special chars)
function cleanHandle(username) {
  return username
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Remove special chars
    .substring(0, 18); // Max 18 chars to be safe (handle + .cannect.space < 30)
}

// Delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function migrateUsers() {
  const mongoClient = new MongoClient(MONGO_URI);
  const results = {
    success: [...PREVIOUS_SUCCESS], // Include previous migrations
    failed: [],
    skipped: [],
  };
  
  try {
    // Connect to MongoDB
    await mongoClient.connect();
    console.log('✅ Connected to MongoDB\n');
    
    const db = mongoClient.db(DB_NAME);
    const usersCollection = db.collection('users');
    
    // Get all users (or limit if TEST_LIMIT > 0)
    const query = TEST_LIMIT > 0 
      ? usersCollection.find().limit(TEST_LIMIT) 
      : usersCollection.find();
    const users = await query.toArray();
    console.log(`📊 Found ${users.length} total users in MongoDB\n`);
    console.log('='.repeat(60) + '\n');
    
    let processed = 0;
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const mongoId = user._id.toString();
      const handle = cleanHandle(user.username);
      const tempPassword = generatePassword();
      
      // Skip already migrated
      if (ALREADY_MIGRATED.includes(mongoId)) {
        console.log(`[${i + 1}/${users.length}] ⏭️  Skipping (already migrated): ${user.username}`);
        results.skipped.push({
          mongoId,
          username: user.username,
          reason: 'Already migrated in test run',
        });
        continue;
      }
      
      // Skip test accounts
      if (isTestAccount(user)) {
        console.log(`[${i + 1}/${users.length}] ⏭️  Skipping (test account): ${user.username}`);
        results.skipped.push({
          mongoId,
          username: user.username,
          email: user.email,
          reason: 'Test account',
        });
        continue;
      }
      
      processed++;
      console.log(`[${i + 1}/${users.length}] Migrating: ${user.username}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Handle: ${handle}.cannect.space`);
      
      try {
        // Create new agent for this account creation
        const agent = new BskyAgent({ service: PDS_URL });
        
        // Create account
        const result = await agent.createAccount({
          email: user.email,
          password: tempPassword,
          handle: `${handle}.cannect.space`,
        });
        
        console.log(`   ✅ Created! DID: ${result.data.did}`);
        
        results.success.push({
          mongoId,
          username: user.username,
          email: user.email,
          handle: `${handle}.cannect.space`,
          did: result.data.did,
          tempPassword: tempPassword,
          createdAt: user.createdAt,
        });
        
      } catch (err) {
        console.log(`   ❌ Failed: ${err.message}`);
        
        if (err.message.includes('already') || err.message.includes('taken')) {
          results.skipped.push({
            mongoId: user._id.toString(),
            username: user.username,
            email: user.email,
            reason: 'Handle or email already exists',
          });
        } else {
          results.failed.push({
            mongoId: user._id.toString(),
            username: user.username,
            email: user.email,
            error: err.message,
          });
        }
      }
      
      console.log('');
      
      // Rate limit: 1 second between requests
      if (i < users.length - 1) {
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

migrateUsers();
