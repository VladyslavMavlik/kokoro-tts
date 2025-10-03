#!/usr/bin/env node
/**
 * Remotion Video Worker for RunPod Serverless
 * Renders videos using build_slideshow.js with subtitles and effects
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { exec as _exec } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(_exec);

/**
 * Download file from URL
 */
async function downloadFile(url, dest) {
    console.log(`📥 Downloading ${path.basename(dest)}...`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const buffer = await response.arrayBuffer();
    await fs.writeFile(dest, Buffer.from(buffer));
    console.log(`✅ Downloaded ${path.basename(dest)}`);
}

/**
 * Upload file to pre-signed URL
 */
async function uploadFile(filePath, putUrl) {
    console.log(`📤 Uploading ${path.basename(filePath)}...`);
    const fileBuffer = await fs.readFile(filePath);

    const response = await fetch(putUrl, {
        method: 'PUT',
        body: fileBuffer,
        headers: { 'Content-Type': 'video/mp4' }
    });

    if (!response.ok) throw new Error(`Upload failed: HTTP ${response.status}`);
    console.log(`✅ Uploaded ${path.basename(filePath)}`);
}

/**
 * Post status update
 */
async function postStatus(url, data) {
    if (!url) return;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch (err) {
        console.warn(`⚠️ Status update failed: ${err.message}`);
    }
}

/**
 * Process video rendering job
 */
async function processJob(job) {
    console.log('🎬 Remotion Video Worker: Processing job...');

    const payload = job.input || job;
    const jobId = payload.job_id || 'unknown';
    const channel = payload.channel || 'unknown';
    const inputs = payload.inputs;
    const output = payload.output;
    const progressUrl = payload.progress_url;
    const callbackUrl = payload.orchestrator_callback;

    console.log(`📋 Job ID: ${jobId}`);
    console.log(`📺 Channel: ${channel}`);

    // Create work directory
    const workDir = `/tmp/${jobId}`;
    await fs.mkdir(workDir, { recursive: true });

    const framesDir = path.join(workDir, 'frames');
    const fxDir = path.join(workDir, 'Fx');
    await fs.mkdir(framesDir, { recursive: true });
    await fs.mkdir(fxDir, { recursive: true });

    await postStatus(progressUrl, { percent: 10, message: 'Downloading assets...' });

    // Download frames
    console.log(`📥 Downloading ${inputs.frames.length} frames...`);
    for (let i = 0; i < inputs.frames.length; i++) {
        const url = inputs.frames[i];
        // Detect extension from Content-Type
        const headResp = await fetch(url, { method: 'HEAD' });
        const contentType = headResp.headers.get('content-type') || '';
        const ext = contentType.includes('jpeg') ? '.jpg' : '.png';

        await downloadFile(url, path.join(framesDir, `${i + 1}${ext}`));
    }

    // Download audio
    let audioPath = null;
    if (inputs.audio) {
        console.log(`🎵 Audio URL provided: ${inputs.audio.substring(0, 100)}...`);
        audioPath = path.join(workDir, 'audio.mp3');
        await downloadFile(inputs.audio, audioPath);

        // Verify file exists
        const audioStats = await fs.stat(audioPath);
        console.log(`✅ Audio downloaded: ${audioStats.size} bytes`);
    } else {
        console.log(`⚠️ No audio URL in inputs!`);
    }

    // Download text for subtitles
    let textPath = null;
    if (inputs.text) {
        console.log(`📝 Text URL provided: ${inputs.text.substring(0, 100)}...`);
        textPath = path.join(workDir, 'text.txt');
        await downloadFile(inputs.text, textPath);

        const textStats = await fs.stat(textPath);
        console.log(`✅ Text downloaded: ${textStats.size} bytes`);
    } else {
        console.log(`⚠️ No text URL in inputs!`);
    }

    // Download Fx overlays
    if (inputs.overlays && inputs.overlays.length > 0) {
        console.log(`📥 Downloading ${inputs.overlays.length} overlays...`);
        for (let i = 0; i < inputs.overlays.length; i++) {
            const url = inputs.overlays[i];
            const filename = `overlay_${i}.mp4`;
            await downloadFile(url, path.join(fxDir, filename));
        }
    }

    await postStatus(progressUrl, { percent: 30, message: 'Rendering video...' });

    // Build command for build_slideshow.js
    const outputPath = path.join(workDir, 'final.mp4');

    let cmd = `node /app/build_slideshow.js`;
    cmd += ` --images_dir=${framesDir}`;
    cmd += ` --out=${outputPath}`;

    if (audioPath) {
        cmd += ` --audio=${audioPath}`;
    }

    if (textPath) {
        cmd += ` --text=${textPath}`;
    }

    cmd += ` --fx_dir=${fxDir}`;
    cmd += ` --w=1080 --h=1920`; // Vertical video
    cmd += ` --fps=30`;

    console.log(`🚀 Running build_slideshow.js`);
    console.log(`📋 Full command: ${cmd}`);
    console.log(`📁 Working directory: /app`);
    console.log(`📁 Output path: ${outputPath}`);
    console.log(`🎵 Audio path: ${audioPath || 'NONE'}`);
    console.log(`📝 Text path: ${textPath || 'NONE'}`);

    try {
        const { stdout, stderr } = await exec(cmd, {
            maxBuffer: 64 * 1024 * 1024,
            cwd: '/app'
        });

        console.log('--- build_slideshow.js OUTPUT START ---');
        console.log(stdout);
        console.log('--- build_slideshow.js OUTPUT END ---');

        if (stderr) {
            console.error('--- build_slideshow.js STDERR START ---');
            console.error(stderr);
            console.error('--- build_slideshow.js STDERR END ---');
        }
    } catch (err) {
        console.error(`❌ Render failed: ${err.message}`);
        console.error(`❌ Stderr: ${err.stderr}`);
        console.error(`❌ Stdout: ${err.stdout}`);
        throw new Error(`build_slideshow.js failed: ${err.message}`);
    }

    // Check if output exists
    try {
        await fs.access(outputPath);
    } catch {
        throw new Error('Output video not found after render');
    }

    await postStatus(progressUrl, { percent: 90, message: 'Uploading result...' });

    // Upload result
    await uploadFile(outputPath, output.put_url);

    // Notify completion
    await postStatus(callbackUrl, {
        job_id: jobId,
        status: 'completed',
        output_url: output.public_url
    });

    await postStatus(progressUrl, { percent: 100, message: 'Done!' });

    console.log(`✅ Job ${jobId} completed successfully`);
    console.log(`🎥 Output: ${output.public_url}`);

    // Cleanup
    try {
        await fs.rm(workDir, { recursive: true, force: true });
    } catch (err) {
        console.warn(`⚠️ Cleanup failed: ${err.message}`);
    }

    return {
        status: 'completed',
        output_url: output.public_url
    };
}

/**
 * RunPod Serverless handler
 */
function handler(job) {
    return processJob(job)
        .then(result => result)
        .catch(err => {
            console.error(`❌ Error: ${err.message}`);
            console.error(err.stack);

            // Try to notify failure
            try {
                const payload = job.input || job;
                const callbackUrl = payload.orchestrator_callback;
                const jobId = payload.job_id || 'unknown';

                if (callbackUrl) {
                    postStatus(callbackUrl, {
                        job_id: jobId,
                        status: 'failed',
                        error: err.message
                    });
                }
            } catch {}

            return {
                status: 'failed',
                error: err.message
            };
        });
}

// RunPod entrypoint
if (process.env.RUNPOD_WORKER === '1') {
    // RunPod mode
    const runpodSdk = await import('runpod-sdk');
    runpodSdk.runpod.serverless.start({ handler });
} else {
    // Local testing
    console.log('🧪 Local test mode');
    const testPayload = JSON.parse(await fs.readFile('/tmp/test-payload.json', 'utf8'));
    const result = await handler(testPayload);
    console.log('Result:', result);
}
