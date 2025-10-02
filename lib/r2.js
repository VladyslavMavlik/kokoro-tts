import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import fs from "node:fs";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET || "genis";

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.warn("⚠️  R2 credentials not configured. R2 operations will fail.");
}

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

/**
 * Read text file from R2
 * @param {string} key - Object key (path) in bucket
 * @param {string} [bucket] - Bucket name (uses R2_BUCKET env if not provided)
 * @returns {Promise<string>} File contents as UTF-8 text
 */
export async function readTextFromR2(key, bucket = R2_BUCKET) {
  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await s3Client.send(command);
    const stream = response.Body;

    // Convert stream to string
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks).toString("utf-8");
  } catch (error) {
    if (error.name === "NoSuchKey") {
      throw new Error(`File not found in R2: ${bucket}/${key}`);
    }
    throw new Error(`Failed to read from R2 (${bucket}/${key}): ${error.message}`);
  }
}

/**
 * Upload file to R2
 * @param {string} filePath - Local file path to upload
 * @param {string} key - Target key (path) in bucket
 * @param {string} [bucket] - Bucket name (uses R2_BUCKET env if not provided)
 * @param {string} [contentType] - MIME type (e.g., 'audio/mpeg')
 * @returns {Promise<{key: string, bucket: string, url: string}>} Upload result
 */
export async function uploadFileToR2(filePath, key, bucket = R2_BUCKET, contentType) {
  try {
    const fileStream = fs.createReadStream(filePath);

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileStream,
      ContentType: contentType,
    });

    await s3Client.send(command);

    // Generate public URL (if bucket has public access configured)
    const publicUrl = `https://${bucket}.${R2_ACCOUNT_ID}.r2.dev/${key}`;

    return {
      key,
      bucket,
      url: publicUrl,
    };
  } catch (error) {
    throw new Error(`Failed to upload to R2 (${bucket}/${key}): ${error.message}`);
  }
}

/**
 * Upload buffer to R2
 * @param {Buffer} buffer - Buffer to upload
 * @param {string} key - Target key (path) in bucket
 * @param {string} [bucket] - Bucket name (uses R2_BUCKET env if not provided)
 * @param {string} [contentType] - MIME type (e.g., 'audio/mpeg')
 * @returns {Promise<{key: string, bucket: string, url: string}>} Upload result
 */
export async function uploadBufferToR2(buffer, key, bucket = R2_BUCKET, contentType) {
  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await s3Client.send(command);

    const publicUrl = `https://${bucket}.${R2_ACCOUNT_ID}.r2.dev/${key}`;

    return {
      key,
      bucket,
      url: publicUrl,
    };
  } catch (error) {
    throw new Error(`Failed to upload buffer to R2 (${bucket}/${key}): ${error.message}`);
  }
}
