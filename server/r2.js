/**
 * R2 Storage Service
 * Manages channel-based structure in Cloudflare R2
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET || 'genis';
const R2_PUBLIC_BASE = process.env.R2_PUBLIC_BASE;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  throw new Error('Missing R2 credentials in environment');
}

// Create S3 client configured for R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY
  }
});

/**
 * List all objects with a given prefix
 */
async function listObjects(prefix) {
  const command = new ListObjectsV2Command({
    Bucket: R2_BUCKET,
    Prefix: prefix
  });

  const response = await s3Client.send(command);
  return (response.Contents || []).map(obj => obj.Key);
}

/**
 * Get pre-signed GET URL for an object
 */
async function getSignedGetUrl(key, expiresIn = 3600) {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: key
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Get pre-signed PUT URL for an object
 */
async function getSignedPutUrl(key, contentType = 'video/mp4', expiresIn = 3600) {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Get public URL for an object (if R2 public access is configured)
 */
function getPublicUrl(key) {
  // R2_PUBLIC_BASE already includes the bucket in the path structure
  return `${R2_PUBLIC_BASE}/${key}`;
}

/**
 * Extract number from filename (e.g., "1.jpg" -> 1, "frame_42.png" -> 42)
 */
function extractNumber(filename) {
  const match = filename.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Collect channel inputs from R2 structure
 *
 * Expected structure:
 * Channels/<channel>/
 *   out/
 *     1.jpg, 2.jpg, ...
 *     audio/track.wav
 *     Fx/overlay.png
 *     text.txt
 *   person/
 *     person.png
 *   finish/
 *     final-<job_id>.mp4
 */
async function collectChannelInputs(channel) {
  const basePrefix = `Channels/${channel}/`;
  const outPrefix = `${basePrefix}out/`;
  const personPrefix = `${basePrefix}person/`;

  console.log(`📂 Collecting inputs for channel: ${channel}`);
  console.log(`📍 Base prefix: ${basePrefix}`);

  // List all files in out/ directory
  const allKeys = await listObjects(outPrefix);
  console.log(`📋 Found ${allKeys.length} objects in ${outPrefix}`);

  // Separate files by type
  const frames = [];
  const audioFiles = [];
  const overlayFiles = [];
  let textFile = null;

  for (const key of allKeys) {
    const relativePath = key.replace(outPrefix, '');

    // Skip if it's just a directory marker
    if (relativePath.endsWith('/')) continue;

    // Audio files
    if (relativePath.startsWith('audio/') && /\.(wav|mp3)$/i.test(relativePath)) {
      audioFiles.push(key);
    }
    // Overlay files (Fx directory - png images or mp4 videos)
    else if (relativePath.startsWith('Fx/') && /\.(png|mp4)$/i.test(relativePath)) {
      overlayFiles.push(key);
    }
    // Text file
    else if (relativePath === 'text.txt') {
      textFile = key;
    }
    // Frame images (jpg/png in root of out/, not in subdirs)
    else if (!relativePath.includes('/') && /\.(jpg|png)$/i.test(relativePath)) {
      frames.push({ key, name: relativePath });
    }
  }

  // Sort frames by numeric part of filename
  frames.sort((a, b) => extractNumber(a.name) - extractNumber(b.name));
  console.log(`🖼️ Found ${frames.length} frames`);
  console.log(`🎵 Found ${audioFiles.length} audio files`);
  console.log(`🎨 Found ${overlayFiles.length} overlay files`);

  // Check for person overlay
  const personKeys = await listObjects(personPrefix);
  const personFile = personKeys.find(k => k.endsWith('person.png'));
  if (personFile) {
    console.log(`👤 Found person overlay: ${personFile}`);
  }

  // Generate pre-signed URLs
  const inputs = {
    frames: await Promise.all(frames.map(f => getSignedGetUrl(f.key))),
    overlays: await Promise.all(overlayFiles.map(k => getSignedGetUrl(k)))
  };

  // Audio (take first one if multiple exist)
  if (audioFiles.length > 0) {
    inputs.audio = await getSignedGetUrl(audioFiles[0]);
  }

  // Person overlay
  if (personFile) {
    inputs.person = await getSignedGetUrl(personFile);
  }

  // Text file
  if (textFile) {
    inputs.text = await getSignedGetUrl(textFile);
  }

  return inputs;
}

/**
 * Prepare output location for a job
 */
async function prepareOutput(channel, jobId) {
  const finishKey = `Channels/${channel}/finish/final-${jobId}.mp4`;

  const putUrl = await getSignedPutUrl(finishKey, 'video/mp4', 7200); // 2 hours
  const publicUrl = getPublicUrl(finishKey);

  return { putUrl, publicUrl, key: finishKey };
}

export {
  collectChannelInputs,
  prepareOutput,
  getPublicUrl
};
