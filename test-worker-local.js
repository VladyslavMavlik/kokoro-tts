#!/usr/bin/env node
/**
 * Test worker locally (simulate RunPod payload)
 */

import 'dotenv/config';
import { collectChannelInputs, prepareOutput } from './server/r2.js';
import { writeFileSync } from 'fs';

const channel = process.argv[2] || 'MilasConfessions';

async function testLocal() {
  console.log('🧪 Testing worker locally\n');

  const inputs = await collectChannelInputs(channel);
  const jobId = `local-test-${Date.now()}`;
  const output = await prepareOutput(channel, jobId);

  const payload = {
    job_id: jobId,
    channel: channel,
    inputs: inputs,
    params: {
      resolution: '1080x1920',
      fps: 30,
      codec: 'libx264'  // CPU mode for local testing
    },
    output: {
      put_url: output.putUrl,
      public_url: output.publicUrl
    }
  };

  // Write payload to file
  const payloadFile = '/tmp/test-worker-payload.json';
  writeFileSync(payloadFile, JSON.stringify({ input: payload }, null, 2));

  console.log(`✅ Payload written to: ${payloadFile}`);
  console.log('\n📋 To test worker locally:');
  console.log(`   cat ${payloadFile} | python3 video-worker/worker.py\n`);
}

testLocal();
