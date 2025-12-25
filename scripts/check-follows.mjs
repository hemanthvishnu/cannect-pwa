import { MongoClient } from 'mongodb';

const MONGO_URI = 'mongodb+srv://cannect_pro_admin:uwscFFdGZ3cfpgcf@cannect-prod-cluster.jykrcf.mongodb.net/';

async function check() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db('cannect-database');
  const follows = db.collection('follows');
  
  // Count
  const total = await follows.countDocuments({});
  console.log('Total follows:', total);
  
  // Sample
  const sample = await follows.findOne({});
  console.log('\nSample follow:', JSON.stringify(sample, null, 2));
  
  // Check for unique follower/following pairs
  const allFollows = await follows.find({}).toArray();
  const uniqueFollowers = new Set(allFollows.map(f => f.followerId?.toString()));
  const uniqueFollowing = new Set(allFollows.map(f => f.followingId?.toString()));
  
  console.log('\nUnique followers:', uniqueFollowers.size);
  console.log('Unique following:', uniqueFollowing.size);
  
  await client.close();
}

check().catch(console.error);
