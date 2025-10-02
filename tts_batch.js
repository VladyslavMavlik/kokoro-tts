// tts_batch.js
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec as _exec } from "node:child_process";
import { promisify } from "node:util";
import { KokoroTTS } from "kokoro-js";

const exec = promisify(_exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- аргументи CLI ----
const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, ...rest] = a.replace(/^--/, "").split("=");
    return [k, rest.join("=") || true];
  })
);
/*
  --in=/tmp/in.txt         (обов'язково): шлях до тексту
  --out=/tmp/out.wav       (обов'язково): шлях до фінального WAV/MP3
  --voice=af_heart         (необов'язково)
  --dtype=q8               (q8|q4|fp16|fp32)
  --format=wav             (wav|mp3) — якщо mp3, потрібен ffmpeg
  --rate=24000             (частота дискретизації)
*/

if (!args.in || !args.out) {
  console.error("Usage: node tts_batch.js --in=/path/in.txt --out=/path/out.wav [--voice=af_heart] [--dtype=q8] [--format=wav|mp3] [--rate=24000]");
  process.exit(2);
}

const VOICE = String(args.voice || "af_heart");
const DTYPE = String(args.dtype || "q8");
const FORMAT = String(args.format || "wav").toLowerCase();
const RATE = args.rate ? Number(args.rate) : undefined;

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

// простий sentence-split + обмеження довжини фрагментів (~280–320 симв.)
function splitIntoChunks(text, maxLen = 300) {
  // розбиваємо на речення
  const sentences = (text.match(/[^.!?]+[.!?]+|\S+$/g) || [text]).map(s => s.trim());
  const chunks = [];
  let buf = "";
  for (const s of sentences) {
    if ((buf + " " + s).trim().length > maxLen && buf.length > 0) {
      chunks.push(buf.trim());
      buf = s;
    } else {
      buf = (buf ? buf + " " : "") + s;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

async function main() {
  const inputPath = path.resolve(String(args.in));
  const outputPath = path.resolve(String(args.out));
  const tmpDir = path.join(path.dirname(outputPath), ".kokoro_parts");

  await fs.mkdir(tmpDir, { recursive: true });

  const text = await fs.readFile(inputPath, "utf8");
  const chunks = splitIntoChunks(text, 300); // 21 тис. символів підемо батчами
  if (chunks.length === 0) {
    throw new Error("Input text is empty");
  }

  // 1) ініціалізація моделі
  const tts = await KokoroTTS.from_pretrained(MODEL_ID, {
    dtype: DTYPE,
    device: "cpu",
  });

  // 2) генерація частинами
  const partFiles = [];
  for (let i = 0; i < chunks.length; i++) {
    const a = await tts.generate(chunks[i], {
      voice: VOICE,
      ...(RATE ? { sample_rate: RATE } : {}),
    });
    const p = path.join(tmpDir, `part_${String(i).padStart(4, "0")}.wav`);
    await a.save(p);
    partFiles.push(p);
  }

  // 3) конкатенація у фінальний файл
  const listPath = path.join(tmpDir, "list.txt");
  await fs.writeFile(listPath, partFiles.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));

  const outExt = path.extname(outputPath).toLowerCase();
  const wantMp3 = FORMAT === "mp3" || outExt === ".mp3";

  if (wantMp3) {
    // Конвертуємо одразу в MP3 (менше розміром)
    const tmpWav = outputPath.replace(/\.mp3$/i, ".wav");
    await exec(`ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${tmpWav}"`);
    await exec(`ffmpeg -y -i "${tmpWav}" -codec:a libmp3lame -q:a 2 "${outputPath}"`);
    await fs.rm(tmpWav).catch(()=>{});
  } else {
    await exec(`ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${outputPath}"`);
  }

  // прибирання тимчасових
  await fs.rm(tmpDir, { recursive: true, force: true });

  console.log(`OK ${outputPath}`);
}

main().catch(err => {
  console.error("ERROR", err);
  process.exit(1);
});
