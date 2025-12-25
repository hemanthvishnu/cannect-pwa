import { MongoClient } from 'mongodb';

const MONGO_URI = 'mongodb+srv://cannect_pro_admin:uwscFFdGZ3cfpgcf@cannect-prod-cluster.jykrcf.mongodb.net/';

async function check() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db('cannect-database');
  
  // Users with actual bios
  console.log('=== USERS WITH BIOS ===');
  const users = db.collection('users');
  const usersWithBio = await users.find({ 
    bio: { $exists: true, $ne: null, $ne: '' } 
  }).toArray();
  
  console.log(`Found ${usersWithBio.length} users with bios:\n`);
  usersWithBio.forEach(u => {
    console.log(`@${u.username}:`);
    console.log(`  Bio: ${u.bio?.substring(0, 100)}${u.bio?.length > 100 ? '...' : ''}`);
    console.log(`  Location: ${u.location || '(none)'}`);
    console.log(`  Website: ${u.website || '(none)'}`);
    const isCustomAvatar = u.avatarUrl && !u.avatarUrl.includes('ui-avatars.com');
    console.log(`  Custom Avatar: ${isCustomAvatar ? 'YES' : 'no'}`);
    console.log('');
  });
  
  // Count custom avatars
  const allUsers = await users.find({}).toArray();
  const customAvatars = allUsers.filter(u => 
    u.avatarUrl && !u.avatarUrl.includes('ui-avatars.com')
  );
  console.log(`\n=== CUSTOM AVATARS: ${customAvatars.length} ===`);
  customAvatars.forEach(u => {
    console.log(`@${u.username}: ${u.avatarUrl?.substring(0, 60)}...`);
  });
  
  // Count total likes across posts
  console.log('\n=== LIKES SUMMARY ===');
  const posts = db.collection('posts');
  const allPosts = await posts.find({}).toArray();
  
  let totalLikes = 0;
  let postsWithLikes = 0;
  
  allPosts.forEach(p => {
    if (p.likedBy && p.likedBy.length > 0) {
      totalLikes += p.likedBy.length;
      postsWithLikes++;
    }
  });
  
  console.log(`Posts with likes: ${postsWithLikes}`);
  console.log(`Total like records: ${totalLikes}`);
  
  await client.close();
}

check().catch(console.error);
