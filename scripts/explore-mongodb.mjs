/**
 * MongoDB Schema Explorer
 * Temporary script to understand legacy database structure
 */

import { MongoClient } from 'mongodb';

const MONGO_URI = 'mongodb+srv://cannect_pro_admin:uwscFFdGZ3cfpgcf@cannect-prod-cluster.jykrcf.mongodb.net/?appName=cannect-prod-cluster';
const DB_NAME = 'cannect-database';

async function explore() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB Atlas\n');
    
    const db = client.db(DB_NAME);
    
    // List all collections
    const collections = await db.listCollections().toArray();
    console.log('📁 Collections:');
    collections.forEach(c => console.log(`   - ${c.name}`));
    console.log('');
    
    // Explore each collection
    for (const col of collections) {
      const collection = db.collection(col.name);
      const count = await collection.countDocuments();
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📊 ${col.name.toUpperCase()} (${count} documents)`);
      console.log('='.repeat(60));
      
      // Get sample documents
      const samples = await collection.find().limit(2).toArray();
      
      if (samples.length > 0) {
        console.log('\n📄 Sample document:');
        console.log(JSON.stringify(samples[0], null, 2));
        
        // Show field summary
        console.log('\n📋 Fields:');
        const fields = Object.keys(samples[0]);
        fields.forEach(f => {
          const value = samples[0][f];
          const type = Array.isArray(value) ? 'Array' : typeof value;
          console.log(`   - ${f}: ${type}`);
        });
      }
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await client.close();
    console.log('\n\n✅ Connection closed');
  }
}

explore();
