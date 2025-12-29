/**
 * Register Feed with Bluesky
 *
 * Run once to publish the feed generator record to your PDS.
 * This makes the feed discoverable via its URI.
 *
 * Usage:
 *   node register-feed.js
 */

require('dotenv').config();
const { BskyAgent } = require('@atproto/api');

const HOSTNAME = process.env.FEEDGEN_HOSTNAME || 'feed.cannect.space';
const HANDLE = process.env.FEEDGEN_HANDLE;
const PASSWORD = process.env.FEEDGEN_PASSWORD;

async function main() {
  console.log('='.repeat(60));
  console.log('Registering Cannect Feed Generator');
  console.log('='.repeat(60));

  if (!HANDLE || !PASSWORD) {
    console.error('Error: FEEDGEN_HANDLE and FEEDGEN_PASSWORD must be set in .env');
    process.exit(1);
  }

  // Login to Cannect PDS (not bsky.social)
  const agent = new BskyAgent({ service: 'https://cannect.space' });

  console.log(`Logging in as ${HANDLE}...`);
  await agent.login({
    identifier: HANDLE,
    password: PASSWORD,
  });

  const publisherDid = agent.session?.did;
  console.log(`Logged in! DID: ${publisherDid}`);

  // Feed record
  const feedRecord = {
    repo: publisherDid,
    collection: 'app.bsky.feed.generator',
    rkey: 'cannect',
    record: {
      did: `did:web:${HOSTNAME}`,
      displayName: 'Cannect',
      description:
        'Cannabis community feed - posts from cannect.space users and cannabis-related content across Bluesky.',
      avatar: undefined, // Can add later
      createdAt: new Date().toISOString(),
    },
  };

  console.log('\nPublishing feed record...');
  console.log(`  Feed URI: at://${publisherDid}/app.bsky.feed.generator/cannect`);

  try {
    const response = await agent.api.com.atproto.repo.putRecord(feedRecord);
    console.log('\n✅ Feed registered successfully!');
    console.log(`   URI: ${response.data.uri}`);
    console.log(`   CID: ${response.data.cid}`);
  } catch (err) {
    if (err.message?.includes('already exists')) {
      console.log('\n⚠️  Feed already registered. Updating...');
      const response = await agent.api.com.atproto.repo.putRecord(feedRecord);
      console.log('✅ Feed updated!');
      console.log(`   URI: ${response.data.uri}`);
    } else {
      throw err;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Next steps:');
  console.log('1. Update FEEDGEN_PUBLISHER_DID in .env:');
  console.log(`   FEEDGEN_PUBLISHER_DID=${publisherDid}`);
  console.log('2. Restart the feed generator');
  console.log('3. Update your app to use this feed URI');
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
