import { MongoClient } from 'mongodb';

const MONGO_URI = 'mongodb+srv://cannect_pro_admin:uwscFFdGZ3cfpgcf@cannect-prod-cluster.jykrcf.mongodb.net/';

async function check() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db('cannect-database');
  
  // Check users for profile data
  console.log('=== USERS (Profile Data) ===');
  const users = db.collection('users');
  const sampleUser = await users.findOne({});
  console.log('Sample user fields:', Object.keys(sampleUser));
  console.log('\nSample user:', JSON.stringify(sampleUser, null, 2));
  
  // Find user with bio
  const userWithBio = await users.findOne({ bio: { $exists: true, $ne: null, $ne: '' } });
  if (userWithBio) {
    console.log('\nUser with bio:', JSON.stringify({
      username: userWithBio.username,
      displayName: userWithBio.displayName,
      bio: userWithBio.bio,
      avatarUrl: userWithBio.avatarUrl
    }, null, 2));
  }
  
  // Count users with profile data
  const withBio = await users.countDocuments({ bio: { $exists: true, $ne: null, $ne: '' } });
  const withDisplayName = await users.countDocuments({ displayName: { $exists: true, $ne: null, $ne: '' } });
  const withAvatar = await users.countDocuments({ avatarUrl: { $exists: true, $ne: null, $ne: '' } });
  console.log('\nUsers with bio:', withBio);
  console.log('Users with displayName:', withDisplayName);
  console.log('Users with avatar:', withAvatar);
  
  // Check likes collection
  console.log('\n=== LIKES ===');
  const likes = db.collection('likes');
  const likeCount = await likes.countDocuments({});
  console.log('Total likes:', likeCount);
  
  if (likeCount > 0) {
    const sampleLike = await likes.findOne({});
    console.log('Sample like:', JSON.stringify(sampleLike, null, 2));
  }
  
  // Check if likes are embedded in posts
  console.log('\n=== POSTS (checking for embedded likes) ===');
  const posts = db.collection('posts');
  const postWithLikes = await posts.findOne({ likes: { $gt: 0 } });
  if (postWithLikes) {
    console.log('Post with likes:', JSON.stringify({
      _id: postWithLikes._id,
      likes: postWithLikes.likes,
      likedBy: postWithLikes.likedBy
    }, null, 2));
  }
  
  // Check all collections
  console.log('\n=== ALL COLLECTIONS ===');
  const collections = await db.listCollections().toArray();
  for (const col of collections) {
    const count = await db.collection(col.name).countDocuments({});
    console.log(`${col.name}: ${count} documents`);
  }
  
  await client.close();
}

check().catch(console.error);
