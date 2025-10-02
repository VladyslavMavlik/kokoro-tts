import express from "express";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { synthToWav } from "../lib/tts.js";
import { readTextFromR2, uploadFileToR2 } from "../lib/r2.js";

const PORT = process.env.PORT || 8080;
const USE_QUEUE = process.env.USE_QUEUE === "1";
const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);

const app = express();

// Initialize Redis connection and queue if needed
let ttsQueue = null;
if (USE_QUEUE) {
  const connection = new IORedis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    maxRetriesPerRequest: null,
  });

  ttsQueue = new Queue("tts-jobs", { connection });
  console.log(`✓ BullMQ queue initialized (Redis: ${REDIS_HOST}:${REDIS_PORT})`);
}

app.use(express.json());

// Optional API key protection
const API_KEY = process.env.API_KEY;
app.use((req, res, next) => {
  if (!API_KEY) return next();
  if (req.headers['x-api-key'] === API_KEY) return next();
  return res.status(401).json({ error: 'unauthorized' });
});

/**
 * Health check endpoint
 */
app.get("/healthz", (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

/**
 * Main TTS synthesis endpoint
 * Accepts JSON body:
 *   - bucket: R2 bucket name (optional, uses env R2_BUCKET if not provided)
 *   - input_key: Path to .txt file in R2 (e.g., "chanels/test/out/text.txt")
 *   - output_key: Output path for audio file (optional, auto-generated if not provided)
 *   - voice_id: Voice to use (optional, default: af_bella)
 *   - callback_url: URL to POST result to (optional)
 */
app.post("/tts", async (req, res) => {
  try {
    const { bucket, input_key, output_key, voice_id, callback_url } = req.body;

    // Validate required fields
    if (!input_key) {
      return res.status(400).json({
        error: "Missing required field: input_key",
      });
    }

    const jobId = crypto.randomUUID();
    const jobData = {
      job_id: jobId,
      bucket: bucket || process.env.R2_BUCKET || "genis",
      input_key,
      output_key,
      voice_id: voice_id || "af_bella",
      callback_url,
    };

    // If using queue, add job and return immediately
    if (USE_QUEUE && ttsQueue) {
      await ttsQueue.add("tts-job", jobData, {
        jobId: jobId,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 100, // Keep last 100 failed jobs
      });

      return res.json({
        job_id: jobId,
        status: "queued",
        message: "Job queued for processing",
      });
    }

    // Otherwise, process inline
    const result = await processJob(jobData);
    return res.json(result);
  } catch (err) {
    console.error("Error in /tts:", err);
    res.status(500).json({
      error: err.message || "Internal server error",
    });
  }
});

/**
 * Process a TTS job
 */
export async function processJob(jobData) {
  const { job_id, bucket, input_key, output_key, voice_id, callback_url } = jobData;

  let text;
  let tempDir;
  let audioPath;

  try {
    console.log(`[${job_id}] Reading text from R2: ${bucket}/${input_key}`);

    // Step 1: Read text from R2
    text = await readTextFromR2(input_key, bucket);

    if (!text || text.trim().length === 0) {
      throw new Error("Retrieved text is empty");
    }

    console.log(`[${job_id}] Text length: ${text.length} characters`);

    // Step 2: Synthesize to MP3
    tempDir = path.join(process.cwd(), "temp", job_id);
    await fs.mkdir(tempDir, { recursive: true });

    console.log(`[${job_id}] Synthesizing with voice: ${voice_id}`);
    audioPath = await synthToWav({
      text,
      voice: voice_id,
      outDir: tempDir,
      baseName: "output",
      format: "mp3",
    });

    console.log(`[${job_id}] Generated MP3: ${audioPath}`);

    // Step 3: Upload to R2
    // Auto-generate output key if not provided
    let finalOutputKey = output_key;
    if (!finalOutputKey) {
      // Extract folder from input_key and create output path
      const inputFolder = path.dirname(input_key);
      finalOutputKey = `${inputFolder}/audio.mp3`;
    }

    console.log(`[${job_id}] Uploading to R2: ${bucket}/${finalOutputKey}`);

    const uploadResult = await uploadFileToR2(
      audioPath,
      finalOutputKey,
      bucket,
      "audio/mpeg"
    );

    console.log(`[${job_id}] Upload complete: ${uploadResult.url}`);

    const result = {
      job_id: job_id,
      status: "completed",
      bucket: uploadResult.bucket,
      audio_key: uploadResult.key,
      audio_url: uploadResult.url,
      text_length: text.length,
    };

    // Step 4: Send callback if provided
    if (callback_url) {
      try {
        console.log(`[${job_id}] Sending callback to: ${callback_url}`);
        const response = await fetch(callback_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(result),
        });
        console.log(`[${job_id}] Callback response: ${response.status}`);
      } catch (callbackErr) {
        console.error(`[${job_id}] Callback failed:`, callbackErr.message);
      }
    }

    // Step 5: Cleanup temp files
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }

    return result;
  } catch (err) {
    // Cleanup on error
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }

    console.error(`[${job_id}] Error:`, err);

    // Send error to callback if provided
    if (callback_url) {
      try {
        await fetch(callback_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            job_id: job_id,
            status: "failed",
            error: err.message,
          }),
        });
      } catch (callbackErr) {
        console.error(`[${job_id}] Error callback failed:`, callbackErr.message);
      }
    }

    throw err;
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`✓ TTS API server listening on port ${PORT}`);
  console.log(`✓ Mode: ${USE_QUEUE ? "Queue (async)" : "Inline (sync)"}`);
  console.log(`✓ Health check: http://localhost:${PORT}/healthz`);
  console.log(`✓ TTS endpoint: POST http://localhost:${PORT}/tts`);
});
