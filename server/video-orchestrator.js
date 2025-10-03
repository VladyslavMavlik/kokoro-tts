/**
 * Video Rendering Orchestrator
 * Coordinates video rendering jobs between n8n, R2 storage, and RunPod workers
 */

import express from 'express';
import crypto from 'crypto';
import { collectChannelInputs, prepareOutput } from './r2.js';

const PORT = process.env.VIDEO_PORT || 8081;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
const RUNPOD_ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID;

if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT_ID) {
  throw new Error('Missing RUNPOD_API_KEY or RUNPOD_ENDPOINT_ID in environment');
}

const app = express();
app.use(express.json());

// In-memory job storage (for simple deployments; use Redis for production)
const jobs = new Map();

/**
 * Health check
 */
app.get('/healthz', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

/**
 * Create a new video rendering job
 *
 * Request body:
 * {
 *   "channel": "MilasConfessions",
 *   "job_id": "optional-custom-id",
 *   "callback_url": "https://n8n.example.com/webhook/render-done",
 *   "params": {
 *     "resolution": "1080x1920",
 *     "fps": 30,
 *     "codec": "h264_nvenc"
 *   }
 * }
 */
app.post('/jobs', async (req, res) => {
  try {
    const { channel, job_id, callback_url, params = {} } = req.body;

    // Validate channel
    if (!channel || typeof channel !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid required field: channel'
      });
    }

    // Generate job ID if not provided
    const jobId = job_id || `job-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    console.log(`\n📋 Creating video job: ${jobId}`);
    console.log(`📺 Channel: ${channel}`);

    // Collect inputs from R2
    let inputs;
    try {
      inputs = await collectChannelInputs(channel);
    } catch (err) {
      console.error(`❌ Failed to collect inputs for channel ${channel}:`, err);
      return res.status(400).json({
        error: `Failed to collect channel inputs: ${err.message}`
      });
    }

    // Validate we have at least frames
    if (!inputs.frames || inputs.frames.length === 0) {
      return res.status(400).json({
        error: `No frames found in channel ${channel}`
      });
    }

    // Prepare output location
    const output = await prepareOutput(channel, jobId);

    console.log(`📤 Output will be: ${output.key}`);
    console.log(`🌐 Public URL: ${output.publicUrl}`);

    // Build worker payload
    const workerPayload = {
      job_id: jobId,
      channel: channel,
      inputs: inputs,
      params: {
        resolution: params.resolution || '1080x1920',
        fps: params.fps || 30,
        codec: params.codec || 'h264_nvenc'
      },
      output: {
        put_url: output.putUrl,
        public_url: output.publicUrl
      },
      progress_url: `${PUBLIC_BASE_URL}/jobs/${jobId}/progress`,
      orchestrator_callback: `${PUBLIC_BASE_URL}/internal/callback`
    };

    // Store job info
    jobs.set(jobId, {
      id: jobId,
      channel: channel,
      status: 'pending',
      created_at: new Date().toISOString(),
      callback_url: callback_url,
      output_url: output.publicUrl,
      progress: []
    });

    // Submit to RunPod (async mode)
    console.log(`🚀 Submitting to RunPod endpoint: ${RUNPOD_ENDPOINT_ID}`);
    console.log(`📦 Payload preview:`, JSON.stringify({
      frames: inputs.frames?.length || 0,
      audio: !!inputs.audio,
      person: !!inputs.person,
      overlays: inputs.overlays?.length || 0
    }));

    const runpodResponse = await fetch(`https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/run`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RUNPOD_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: workerPayload
      })
    });

    if (!runpodResponse.ok) {
      const errorText = await runpodResponse.text();
      throw new Error(`RunPod API error: ${runpodResponse.status} ${errorText}`);
    }

    const runpodData = await runpodResponse.json();
    console.log(`✅ RunPod job submitted: ${runpodData.id}`);

    // Update job with RunPod ID
    const job = jobs.get(jobId);
    job.runpod_id = runpodData.id;
    job.status = 'running';

    // Return response
    res.json({
      job_id: jobId,
      status: 'running',
      channel: channel,
      runpod_id: runpodData.id,
      output_url: output.publicUrl,
      status_url: `${PUBLIC_BASE_URL}/jobs/${jobId}`
    });

  } catch (err) {
    console.error('❌ Error creating job:', err);
    res.status(500).json({
      error: err.message || 'Internal server error'
    });
  }
});

/**
 * Get job status
 */
app.get('/jobs/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json(job);
});

/**
 * Receive progress updates from worker
 */
app.post('/jobs/:jobId/progress', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const { percent, message } = req.body;
  console.log(`📊 [${jobId}] Progress: ${percent}% - ${message}`);

  job.progress.push({
    timestamp: new Date().toISOString(),
    percent: percent,
    message: message
  });

  res.json({ ok: true });
});

/**
 * Internal callback from worker (completion/failure)
 */
app.post('/internal/callback', async (req, res) => {
  const { job_id, status, output_url, error } = req.body;

  console.log(`\n🔔 Callback received for job: ${job_id}`);
  console.log(`📊 Status: ${status}`);

  const job = jobs.get(job_id);
  if (!job) {
    console.warn(`⚠️ Job ${job_id} not found in memory`);
    return res.json({ ok: true }); // Don't fail the worker
  }

  // Update job status
  job.status = status;
  job.completed_at = new Date().toISOString();

  if (status === 'completed') {
    console.log(`✅ Job completed: ${output_url}`);
    job.output_url = output_url || job.output_url;
  } else if (status === 'failed') {
    console.error(`❌ Job failed: ${error}`);
    job.error = error;
  }

  // Send callback to n8n (if configured)
  if (job.callback_url) {
    try {
      console.log(`📡 Sending callback to: ${job.callback_url}`);

      const callbackData = {
        job_id: job_id,
        status: status,
        channel: job.channel,
        output_url: job.output_url,
        error: error
      };

      const response = await fetch(job.callback_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(callbackData)
      });

      console.log(`✅ Callback sent, response: ${response.status}`);
    } catch (callbackErr) {
      console.error(`❌ Failed to send callback:`, callbackErr);
    }
  }

  res.json({ ok: true });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🎬 Video Orchestrator started`);
  console.log(`✓ Listening on port ${PORT}`);
  console.log(`✓ Public URL: ${PUBLIC_BASE_URL}`);
  console.log(`✓ RunPod Endpoint: ${RUNPOD_ENDPOINT_ID}`);
  console.log(`\nEndpoints:`);
  console.log(`  POST ${PUBLIC_BASE_URL}/jobs - Create rendering job`);
  console.log(`  GET  ${PUBLIC_BASE_URL}/jobs/:id - Get job status`);
  console.log(`  GET  ${PUBLIC_BASE_URL}/healthz - Health check`);
  console.log();
});
