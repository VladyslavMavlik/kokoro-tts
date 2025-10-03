#!/usr/bin/env node
/**
 * Test script to trigger video rendering on RunPod
 * Usage: node test-render.js [channel_name]
 */

import 'dotenv/config';
import { collectChannelInputs, prepareOutput } from './server/r2.js';

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
const RUNPOD_ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID;
const channel = process.argv[2] || 'MilasConfessions';

if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT_ID) {
  console.error('❌ Missing RUNPOD_API_KEY or RUNPOD_ENDPOINT_ID in .env');
  process.exit(1);
}

async function testRender() {
  console.log(`\n🎬 Testing video render for channel: ${channel}\n`);

  try {
    // Step 1: Collect inputs from R2
    console.log('📦 Step 1: Collecting inputs from R2...');
    const inputs = await collectChannelInputs(channel);

    if (!inputs.frames || inputs.frames.length === 0) {
      throw new Error('No frames found in channel!');
    }

    console.log(`✅ Collected ${inputs.frames.length} frames`);
    if (inputs.audio) console.log('✅ Audio found');
    if (inputs.person) console.log('✅ Person overlay found');
    if (inputs.overlays?.length > 0) console.log(`✅ ${inputs.overlays.length} overlays found`);

    // Step 2: Prepare output
    const jobId = `test-${Date.now()}`;
    console.log(`\n📤 Step 2: Preparing output location...`);
    const output = await prepareOutput(channel, jobId);
    console.log(`✅ Output will be: ${output.key}`);

    // Step 3: Build payload
    const payload = {
      job_id: jobId,
      channel: channel,
      inputs: inputs,
      params: {
        resolution: '1080x1920',
        fps: 30,
        codec: 'h264_nvenc'
      },
      output: {
        put_url: output.putUrl,
        public_url: output.publicUrl
      }
    };

    console.log(`\n📊 Payload summary:`);
    console.log(`  - Job ID: ${jobId}`);
    console.log(`  - Frames: ${inputs.frames.length}`);
    console.log(`  - Resolution: 1080x1920`);
    console.log(`  - FPS: 30`);

    // Step 4: Submit to RunPod
    console.log(`\n🚀 Step 3: Submitting to RunPod endpoint: ${RUNPOD_ENDPOINT_ID}`);

    const response = await fetch(`https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/run`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RUNPOD_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ input: payload })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`RunPod API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    console.log(`\n✅ Job submitted successfully!`);
    console.log(`📋 RunPod Job ID: ${result.id}`);
    console.log(`🔗 Check status: https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/status/${result.id}`);
    console.log(`\n🎥 Output will be available at:`);
    console.log(`   ${output.publicUrl}`);

    // Step 5: Poll for status (optional)
    console.log(`\n⏳ Polling for status (Ctrl+C to stop)...`);
    await pollStatus(result.id);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

async function pollStatus(runpodJobId) {
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

    try {
      const response = await fetch(
        `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/status/${runpodJobId}`,
        {
          headers: { 'Authorization': `Bearer ${RUNPOD_API_KEY}` }
        }
      );

      if (!response.ok) continue;

      const data = await response.json();
      const status = data.status;

      if (status === 'COMPLETED') {
        console.log('\n✅ Rendering completed!');
        console.log('📊 Result:', JSON.stringify(data.output, null, 2));
        break;
      } else if (status === 'FAILED') {
        console.log('\n❌ Rendering failed!');
        console.log('📊 Error:', JSON.stringify(data.error || data, null, 2));
        break;
      } else if (status === 'IN_PROGRESS' || status === 'IN_QUEUE') {
        process.stdout.write('.');
      }

      attempts++;
    } catch (err) {
      console.error('⚠️ Poll error:', err.message);
    }
  }

  if (attempts >= maxAttempts) {
    console.log('\n⏱️ Timeout reached. Check RunPod dashboard for final status.');
  }
}

testRender();
