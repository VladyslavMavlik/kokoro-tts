/**
 * List all contents in R2 bucket to see what's there
 */

import { config } from 'dotenv';
config();

import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET || 'genis';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY
  }
});

async function listAll(prefix = '') {
  console.log(`\n📂 Listing objects in bucket: ${R2_BUCKET}${prefix ? ` with prefix: ${prefix}` : ''}\n`);

  let continuationToken = undefined;
  let allObjects = [];

  do {
    const command = new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken,
      MaxKeys: 1000
    });

    const response = await s3Client.send(command);

    if (response.Contents) {
      allObjects.push(...response.Contents);
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  console.log(`📊 Total objects found: ${allObjects.length}\n`);

  // Group by top-level directory
  const byDir = {};
  allObjects.forEach(obj => {
    const parts = obj.Key.split('/');
    const topDir = parts[0] || 'root';
    if (!byDir[topDir]) {
      byDir[topDir] = [];
    }
    byDir[topDir].push(obj.Key);
  });

  // Show structure
  Object.keys(byDir).sort().forEach(dir => {
    console.log(`\n📁 ${dir}/ (${byDir[dir].length} objects)`);
    byDir[dir].slice(0, 10).forEach(key => {
      console.log(`  - ${key}`);
    });
    if (byDir[dir].length > 10) {
      console.log(`  ... and ${byDir[dir].length - 10} more`);
    }
  });

  return allObjects;
}

async function main() {
  try {
    // First, list everything to see the structure
    const all = await listAll();

    // Look for Channels directory specifically
    console.log('\n\n🔍 Looking for Channels...\n');
    const channelObjects = all.filter(obj => obj.Key.includes('Channel'));

    if (channelObjects.length > 0) {
      console.log(`✅ Found ${channelObjects.length} objects with 'Channel' in path:\n`);
      channelObjects.forEach(obj => {
        console.log(`  - ${obj.Key}`);
      });
    } else {
      console.log('⚠️ No objects found with "Channel" in path');
    }

    // Look for specific patterns
    console.log('\n\n🔍 Looking for media files (jpg, png, mp3, wav)...\n');
    const mediaFiles = all.filter(obj =>
      /\.(jpg|jpeg|png|mp3|wav)$/i.test(obj.Key)
    );

    if (mediaFiles.length > 0) {
      console.log(`✅ Found ${mediaFiles.length} media files:\n`);
      mediaFiles.forEach(obj => {
        console.log(`  - ${obj.Key}`);
      });
    } else {
      console.log('⚠️ No media files found');
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
