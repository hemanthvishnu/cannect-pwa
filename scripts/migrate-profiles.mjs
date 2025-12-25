/**
 * Phase 5a: Migrate Profiles (Display Name, Bio, Avatar)
 * 
 * Updates AT Protocol profiles with:
 * - displayName (from username)
 * - description (from bio)
 * - avatar (download from Cloudflare, upload to PDS)
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
// HELPERS
// ============================================================

async function downloadImage(url) {
  try {
    const response = await fetch(url, { timeout: 30000 });
    if (!response.ok) {
      return null;
    }
    const buffer = await response.arrayBuffer();
    return {
      data: new Uint8Array(buffer),
      mimeType: response.headers.get('content-type') || 'image/jpeg'
    };
  } catch (error) {
    return null;
  }
}

function isCustomAvatar(url) {
  return url && !url.includes('ui-avatars.com');
}

function cleanBio(bio) {
  if (!bio || bio === 'undefined') return null;
  // Skip test bios
  if (bio.includes('Test user') || bio.includes('CACHE_TEST')) return null;
  return bio.trim();
}

// ============================================================
// MAIN MIGRATION
// ============================================================

async function migrateProfiles() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');
    
    const db = client.db(DB_NAME);
    const usersCollection = db.collection('users');
    
    // Get all users
    const allUsers = await usersCollection.find({}).toArray();
    console.log(`📊 Found ${allUsers.length} users in MongoDB\n`);
    
    // Filter to users that have profile data worth migrating
    const usersToMigrate = allUsers.filter(u => {
      const mapping = userByMongoId.get(u._id.toString());
      if (!mapping) return false;
      
      const hasBio = cleanBio(u.bio);
      const hasCustomAvatar = isCustomAvatar(u.avatarUrl);
      const hasLocation = u.location && u.location.trim();
      const hasWebsite = u.website && u.website.trim();
      
      // Only migrate if there's something meaningful
      return hasBio || hasCustomAvatar || hasLocation || hasWebsite;
    });
    
    console.log(`📝 ${usersToMigrate.length} users have profile data to migrate\n`);
    console.log('='.repeat(60) + '\n');
    
    const results = {
      success: [],
      skipped: [],
      failed: []
    };
    
    const toProcess = TEST_LIMIT > 0 ? usersToMigrate.slice(0, TEST_LIMIT) : usersToMigrate;
    
    for (let i = 0; i < toProcess.length; i++) {
      const mongoUser = toProcess[i];
      const mapping = userByMongoId.get(mongoUser._id.toString());
      
      console.log(`[${i + 1}/${toProcess.length}] @${mongoUser.username}`);
      
      try {
        // Login as this user
        const agent = new BskyAgent({ service: PDS_URL });
        await agent.login({
          identifier: mapping.handle,
          password: mapping.tempPassword
        });
        
        // Get current profile
        const { data: currentProfile } = await agent.getProfile({ actor: mapping.did });
        
        // Build profile update
        const profileUpdate = {};
        
        // Display name - use existing or username
        profileUpdate.displayName = mongoUser.username || currentProfile.displayName;
        console.log(`   Display name: ${profileUpdate.displayName}`);
        
        // Bio/Description
        const bio = cleanBio(mongoUser.bio);
        if (bio) {
          // Combine bio with location and website if present
          let description = bio;
          if (mongoUser.location) {
            description += `\n📍 ${mongoUser.location}`;
          }
          if (mongoUser.website) {
            description += `\n🔗 ${mongoUser.website}`;
          }
          profileUpdate.description = description;
          console.log(`   Bio: ${bio.substring(0, 50)}${bio.length > 50 ? '...' : ''}`);
        }
        
        // Avatar
        if (isCustomAvatar(mongoUser.avatarUrl)) {
          console.log(`   📷 Downloading avatar...`);
          const imageData = await downloadImage(mongoUser.avatarUrl);
          if (imageData) {
            console.log(`   📤 Uploading avatar (${(imageData.data.length / 1024).toFixed(1)} KB)...`);
            const uploadResponse = await agent.uploadBlob(imageData.data, {
              encoding: imageData.mimeType
            });
            profileUpdate.avatar = uploadResponse.data.blob;
            console.log(`   ✅ Avatar uploaded`);
          } else {
            console.log(`   ⚠️  Avatar download failed`);
          }
        }
        
        // Update profile
        await agent.upsertProfile((existing) => {
          return {
            ...existing,
            ...profileUpdate
          };
        });
        
        console.log(`   ✅ Profile updated\n`);
        
        results.success.push({
          mongoId: mongoUser._id.toString(),
          handle: mapping.handle,
          displayName: profileUpdate.displayName,
          hasBio: !!profileUpdate.description,
          hasAvatar: !!profileUpdate.avatar
        });
        
      } catch (error) {
        console.log(`   ❌ Failed: ${error.message}\n`);
        results.failed.push({
          mongoId: mongoUser._id.toString(),
          username: mongoUser.username,
          error: error.message
        });
      }
    }
    
    // ========================================
    // SUMMARY
    // ========================================
    console.log('='.repeat(60));
    console.log('📊 PROFILE MIGRATION SUMMARY');
    console.log('='.repeat(60) + '\n');
    
    console.log(`   ✅ Success: ${results.success.length}`);
    console.log(`   ❌ Failed:  ${results.failed.length}`);
    
    const withBio = results.success.filter(r => r.hasBio).length;
    const withAvatar = results.success.filter(r => r.hasAvatar).length;
    console.log(`\n   Profiles with bio: ${withBio}`);
    console.log(`   Profiles with avatar: ${withAvatar}`);
    
    // Save results
    const outputPath = path.join(__dirname, 'migration-profiles.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to: ${outputPath}`);
    
  } finally {
    await client.close();
    console.log('\n✅ Done');
  }
}

migrateProfiles().catch(console.error);
