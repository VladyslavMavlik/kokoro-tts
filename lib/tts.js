import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { KokoroTTS } from "kokoro-js";

const execAsync = promisify(exec);

const MODEL_ID = process.env.KOKORO_MODEL_ID || "onnx-community/Kokoro-82M-v1.0-ONNX";
const DTYPE = process.env.KOKORO_DTYPE || "q8";
const DEVICE = process.env.KOKORO_DEVICE || "cpu";

let ttsInstance = null;

/**
 * Get or initialize TTS instance (singleton pattern)
 */
async function getTTS() {
  if (!ttsInstance) {
    ttsInstance = await KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: DTYPE,
      device: DEVICE,
    });
  }
  return ttsInstance;
}

/**
 * Split text into chunks that are safe for TTS processing
 * @param {string} text - Input text
 * @param {number} maxChunkSize - Maximum characters per chunk
 * @returns {string[]} Array of text chunks
 */
function splitTextIntoChunks(text, maxChunkSize = 500) {
  // Split by sentences (periods, exclamation marks, question marks)
  const sentences = text.match(/[^.!?]+[.!?]+/gs) || [text];
  const chunks = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    // If adding this sentence exceeds max size, save current chunk and start new one
    if (currentChunk.length + trimmed.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = trimmed;
    } else {
      currentChunk += (currentChunk ? " " : "") + trimmed;
    }
  }

  // Add remaining chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [text];
}

/**
 * Synthesize text to audio file (WAV or MP3), splitting long texts into chunks
 * @param {Object} options
 * @param {string} options.text - Text to synthesize
 * @param {string} [options.voice='af_bella'] - Voice ID
 * @param {string} [options.outDir='./output'] - Output directory
 * @param {string} [options.baseName='audio'] - Base filename (without extension)
 * @param {string} [options.format='mp3'] - Output format: 'wav' or 'mp3'
 * @returns {Promise<string>} Full path to generated audio file
 */
export async function synthToWav({ text, voice = "af_bella", outDir = "./output", baseName = "audio", format = "mp3" }) {
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    throw new Error("Text is required and must be a non-empty string");
  }

  const tts = await getTTS();

  // Ensure output directory exists
  await fs.mkdir(outDir, { recursive: true });

  // Split text into manageable chunks (500 chars is the safe maximum for Kokoro)
  const textChunks = splitTextIntoChunks(text, 500);
  console.log(`Processing ${textChunks.length} text chunks`);

  const wavFiles = [];

  // Generate audio for each chunk
  for (let i = 0; i < textChunks.length; i++) {
    console.log(`Generating audio for chunk ${i + 1}/${textChunks.length} (${textChunks[i].length} chars)`);

    const audio = await tts.generate(textChunks[i], { voice });
    const chunkPath = path.join(outDir, `chunk_${i}.wav`);
    await audio.save(chunkPath);

    // Check WAV file size
    const stats = await fs.stat(chunkPath);
    console.log(`  Saved chunk ${i}: ${stats.size} bytes`);

    wavFiles.push(chunkPath);
  }

  // Merge all WAV files
  const finalWavPath = path.join(outDir, `${baseName}.wav`);

  if (wavFiles.length === 1) {
    // Only one chunk, just rename it
    await fs.rename(wavFiles[0], finalWavPath);
  } else if (wavFiles.length > 1) {
    // Multiple chunks - concatenate using ffmpeg filter
    console.log(`Merging ${wavFiles.length} audio chunks`);

    // Build filter_complex input string
    const inputs = wavFiles.map((f, i) => `-i "${f}"`).join(' ');
    const filterInputs = wavFiles.map((_, i) => `[${i}:a]`).join('');
    const filter = `${filterInputs}concat=n=${wavFiles.length}:v=0:a=1[out]`;

    // Use filter_complex for proper audio concatenation
    await execAsync(`ffmpeg ${inputs} -filter_complex "${filter}" -map "[out]" -y "${finalWavPath}"`);

    // Check merged file size
    const mergedStats = await fs.stat(finalWavPath);
    console.log(`  Merged WAV: ${mergedStats.size} bytes`);

    // Clean up chunk files
    for (const wavFile of wavFiles) {
      await fs.unlink(wavFile);
    }
  }

  // If MP3 requested, convert using ffmpeg
  if (format === "mp3") {
    const mp3FileName = `${baseName}.mp3`;
    const mp3Path = path.join(outDir, mp3FileName);

    console.log("Converting to MP3");
    // Convert WAV to MP3 with good quality (192kbps)
    await execAsync(`ffmpeg -i "${finalWavPath}" -codec:a libmp3lame -b:a 192k -y "${mp3Path}"`);

    // Remove WAV file
    await fs.unlink(finalWavPath);

    return mp3Path;
  }

  return finalWavPath;
}

/**
 * List available voices
 * @returns {Promise<string[]>} Array of voice IDs
 */
export async function listVoices() {
  const tts = await getTTS();
  return await tts.list_voices();
}
