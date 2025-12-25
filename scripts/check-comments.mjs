import { MongoClient } from 'mongodb';

const MONGO_URI = 'mongodb+srv://cannect_pro_admin:uwscFFdGZ3cfpgcf@cannect-prod-cluster.jykrcf.mongodb.net/';

async function check() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db('cannect-database');
  const comments = db.collection('comments');
  
  // Count by parentId
  const topLevel = await comments.countDocuments({ parentId: null });
  const nested = await comments.countDocuments({ parentId: { $ne: null } });
  
  console.log('Top-level comments (replies to posts):', topLevel);
  console.log('Nested comments (replies to comments):', nested);
  
  // Check which posts have comments
  const allComments = await comments.find({}).toArray();
  const postIds = [...new Set(allComments.map(c => c.postId?.toString()))];
  console.log('\nUnique posts with comments:', postIds.length);
  
  // Sample nested comment
  if (nested > 0) {
    const nestedSample = await comments.findOne({ parentId: { $ne: null } });
    console.log('\nSample nested comment:', JSON.stringify(nestedSample, null, 2));
  }
  
  await client.close();
}

check().catch(console.error);
