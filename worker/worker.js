import { Worker } from "bullmq";
import IORedis from "ioredis";
import { processJob } from "../server/api.js";

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);

const connection = new IORedis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
});

console.log(`✓ Worker connecting to Redis: ${REDIS_HOST}:${REDIS_PORT}`);

const worker = new Worker(
  "tts-jobs",
  async (job) => {
    console.log(`[Worker] Processing job ${job.id}`);
    const result = await processJob(job.data);
    console.log(`[Worker] Completed job ${job.id}`);
    return result;
  },
  {
    connection,
    concurrency: 1, // Process one job at a time per worker
    lockDuration: 3600000, // 60 minutes lock duration for long texts
    lockRenewTime: 5000, // Renew lock every 5 seconds
    stalledInterval: 30000, // Check for stalled jobs every 30 seconds
  }
);

worker.on("completed", (job, result) => {
  console.log(`✓ Job ${job.id} completed successfully`);
});

worker.on("failed", (job, err) => {
  console.error(`✗ Job ${job?.id} failed:`, err.message);
});

worker.on("error", (err) => {
  console.error("Worker error:", err);
});

console.log("✓ TTS Worker started and waiting for jobs...");

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully...");
  await worker.close();
  await connection.quit();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down gracefully...");
  await worker.close();
  await connection.quit();
  process.exit(0);
});
