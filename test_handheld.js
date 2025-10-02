#!/usr/bin/env node
// test_handheld.js - простий тест покачування

import { exec as _exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const exec = promisify(_exec);

async function testHandheld() {
  try {
    const scriptDir = path.dirname(new URL(import.meta.url).pathname);

    console.log("🧪 Testing handheld motion...");
    console.log("📁 Script directory:", scriptDir);

    // Тестові параметри
    const testImagesDir = "/Users/mavlik/heygen-bot/in";
    const testAudio = "/Users/mavlik/heygen-bot/in/voice.mp3";
    const testOutput = "/tmp/test_handheld.mp4";

    const handheldScript = path.join(scriptDir, 'build_handheld_video.js');

    console.log(`🚀 Running: node "${handheldScript}" "${testImagesDir}" "${testAudio}" "${testOutput}"`);

    const { stdout, stderr } = await exec(`node "${handheldScript}" "${testImagesDir}" "${testAudio}" "${testOutput}"`);

    console.log("✅ Test completed!");
    if (stdout) console.log("📤 Stdout:", stdout);
    if (stderr) console.log("📤 Stderr:", stderr);

  } catch (error) {
    console.error("❌ Test failed:", error.message);
    if (error.stdout) console.error("Stdout:", error.stdout);
    if (error.stderr) console.error("Stderr:", error.stderr);
  }
}

testHandheld();