// build_slideshow.js
// Виклик: node build_slideshow.js --images_dir=/path/in --audio=/path/voice.mp3 --out=/path/out.mp4 [--w=1920 --h=1080 --fps=30 --transition=1.0 --zoom=1.1 --subs=/path/subs.srt --text=/path/text.txt --font_size=32 --font_name=Impact --fx_dir=/path/Fx]

import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { exec as _exec } from "node:child_process";
import { createSyncSrt } from "./create_sync_srt.js";

// Обгортка exec з великим буфером
const _pexec = promisify(_exec);
async function exec(cmd, opts = {}) {
  return _pexec(cmd, { maxBuffer: 64 * 1024 * 1024, ...opts }); // 64 МБ
}

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map(a => {
      const [k, ...r] = a.replace(/^--/, "").split("=");
      return [k, r.join("=") || true];
    })
  );
  if (!args.images_dir || !args.audio || !args.out) {
    console.error("Usage: node build_slideshow.js --images_dir=/dir/in --audio=/path/audio.mp3 --out=/path/out.mp4 [--w=1920 --h=1080 --fps=30 --transition=1.0 --zoom=1.1 --subs=/path/subs.srt --text=/path/text.txt --font_size=32 --font_name=Impact --fx_dir=/path/Fx]");
    process.exit(2);
  }
  args.w = Number(args.w || 1920);
  args.h = Number(args.h || 1080);
  args.fps = Number(args.fps || 30);
  args.transition = Number(args.transition || 1.0); // тривалість переходу в секундах
  args.zoom = Number(args.zoom || 1.1); // максимальний зум для ken burns ефекту
  args.font_size = Number(args.font_size || 24); // розмір шрифту субтитрів
  args.font_name = String(args.font_name || 'Impact'); // назва шрифту
  return args;
}

async function ffprobeDuration(file) {
  try {
    // Перевіряємо чи існує файл
    await fs.access(file);

    const { stdout } = await exec(`ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "${file}"`);
    const duration = parseFloat(stdout.trim());

    if (!isFinite(duration) || duration <= 0) {
      throw new Error(`Invalid duration: ${duration}`);
    }

    return duration;
  } catch (error) {
    throw new Error(`Failed to get audio duration from "${file}": ${error.message}`);
  }
}

function sortImages(files) {
  const exts = new Set([".jpg", ".jpeg", ".png", ".webp"]);
  return files
    .filter(f => exts.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

// Функція для пошуку Fx файлу в папці heygen-bot/Fx
async function findFxFile(fxDir) {
  if (!fxDir) {
    console.log("❌ No Fx directory specified");
    return null;
  }

  console.log(`🔍 Searching for Fx files in: ${fxDir}`);

  try {
    // Перевіряємо чи існує папка
    await fs.access(fxDir);
    console.log("✅ Fx directory exists");

    const files = await fs.readdir(fxDir);
    console.log(`📂 Files in Fx directory: ${files.join(', ')}`);

    const mp4Files = files.filter(f => path.extname(f).toLowerCase() === '.mp4');
    console.log(`🎬 MP4 files found: ${mp4Files.join(', ')}`);

    if (mp4Files.length > 0) {
      const fxFile = path.join(fxDir, mp4Files[0]); // беремо перший знайдений MP4
      console.log(`✅ Selected Fx overlay: ${mp4Files[0]}`);
      console.log(`📍 Full path: ${fxFile}`);
      return fxFile;
    } else {
      console.log("❌ No MP4 files found in Fx directory");
    }
  } catch (err) {
    console.error(`❌ Error accessing Fx directory: ${err.message}`);
  }

  return null;
}

// Функція для створення SRT файлу з тексту (тільки однорядкові субтитри)
function createSrtFromText(text, duration) {
  const words = text.split(/\s+/);
  const wordsPerSecond = 2.5; // швидкість читання
  const maxWordsPerSub = 8; // оптимум для одного рядка

  const srtEntries = [];
  let entryIndex = 1;
  let currentTime = 0;

  for (let i = 0; i < words.length; i += maxWordsPerSub) {
    const chunk = words.slice(i, i + maxWordsPerSub);
    const chunkDuration = Math.max(2, chunk.length / wordsPerSecond); // мінімум 2 секунди
    const endTime = Math.min(currentTime + chunkDuration, duration);

    const startTimecode = formatTimecode(currentTime);
    const endTimecode = formatTimecode(endTime);

    // Простий однорядковий текст без розривів
    const subtitleText = chunk.join(' ');

    srtEntries.push(
      `${entryIndex}`,
      `${startTimecode} --> ${endTimecode}`,
      subtitleText,
      ''
    );

    entryIndex++;
    currentTime = endTime;

    if (currentTime >= duration) break;
  }

  return srtEntries.join('\n');
}

// Функція для перевірки та виправлення SRT файлу (склеювання багаторядкових в однорядкові)
async function fixSrtToSingleLine(srtPath) {
  try {
    console.log(`🔧 Checking SRT file for multi-line subtitles: ${srtPath}`);

    const content = await fs.readFile(srtPath, 'utf8');
    const lines = content.split('\n');

    const fixedLines = [];
    let i = 0;
    let hasChanges = false;

    while (i < lines.length) {
      const line = lines[i].trim();

      // Пропускаємо порожні рядки
      if (!line) {
        fixedLines.push('');
        i++;
        continue;
      }

      // Якщо це номер субтитру (тільки цифри)
      if (/^\d+$/.test(line)) {
        fixedLines.push(line); // номер
        i++;

        // Додаємо timestamp
        if (i < lines.length) {
          fixedLines.push(lines[i].trim()); // timestamp
          i++;
        }

        // Збираємо всі текстові рядки до наступного порожнього
        const textLines = [];
        while (i < lines.length && lines[i].trim() !== '') {
          textLines.push(lines[i].trim());
          i++;
        }

        // Склеюємо всі текстові рядки в один (прибираємо \N та переноси)
        if (textLines.length > 0) {
          const combinedText = textLines.join(' ')
            .replace(/\\N/g, ' ')  // прибираємо \N розриви
            .replace(/\\n/g, ' ')  // прибираємо \n розриви
            .replace(/\n/g, ' ')   // прибираємо звичайні переноси
            .replace(/\s+/g, ' ')  // прибираємо зайві пробіли
            .trim();

          if (textLines.length > 1) {
            hasChanges = true;
            console.log(`📝 Fixed multi-line subtitle: "${textLines.join('\\n')}" → "${combinedText}"`);
          }

          fixedLines.push(combinedText);
        }
      } else {
        fixedLines.push(line);
        i++;
      }
    }

    if (hasChanges) {
      const fixedContent = fixedLines.join('\n');
      await fs.writeFile(srtPath, fixedContent, 'utf8');
      console.log(`✅ Fixed SRT file - all subtitles are now single-line`);
    } else {
      console.log(`✅ SRT file already has single-line subtitles`);
    }

    return true;
  } catch (error) {
    console.warn(`⚠️ Could not fix SRT file: ${error.message}`);
    return false;
  }
}

// Функція для розрізання SRT субтитрів на шматочки по 4-5 слів з правильними таймінгами
async function splitSrtToChunks(srtPath, maxWordsPerChunk = 4) {
  try {
    console.log(`✂️ Splitting SRT subtitles to ${maxWordsPerChunk} words per chunk: ${srtPath}`);

    const content = await fs.readFile(srtPath, 'utf8');
    const entries = content.trim().split('\n\n');

    const newEntries = [];
    let newIndex = 1;

    for (const entry of entries) {
      const lines = entry.trim().split('\n');
      if (lines.length < 3) continue; // Пропускаємо невалідні записи

      const originalIndex = lines[0];
      const timecode = lines[1];
      const text = lines.slice(2).join(' ').trim();

      // Парсимо таймінги
      const timeMatch = timecode.match(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/);
      if (!timeMatch) continue;

      const startTime = parseTimecode(timeMatch[1]);
      const endTime = parseTimecode(timeMatch[2]);
      const totalDuration = endTime - startTime;

      // Розбиваємо текст на слова
      const words = text.split(/\s+/).filter(w => w.length > 0);

      if (words.length <= maxWordsPerChunk) {
        // Якщо слів менше або рівно максимуму - залишаємо як є
        newEntries.push(`${newIndex}\n${timecode}\n${text}`);
        newIndex++;
      } else {
        // Розрізаємо на шматочки
        const chunks = [];
        for (let i = 0; i < words.length; i += maxWordsPerChunk) {
          chunks.push(words.slice(i, i + maxWordsPerChunk));
        }

        // Розраховуємо таймінги для кожного шматочка
        const chunkDuration = totalDuration / chunks.length;

        chunks.forEach((chunk, chunkIndex) => {
          const chunkStartTime = startTime + (chunkDuration * chunkIndex);
          const chunkEndTime = startTime + (chunkDuration * (chunkIndex + 1));

          const chunkStartTimecode = formatTimecode(chunkStartTime);
          const chunkEndTimecode = formatTimecode(chunkEndTime);
          const chunkText = chunk.join(' ');

          newEntries.push(`${newIndex}\n${chunkStartTimecode} --> ${chunkEndTimecode}\n${chunkText}`);
          newIndex++;
        });
      }
    }

    const newContent = newEntries.join('\n\n') + '\n';
    await fs.writeFile(srtPath, newContent, 'utf8');

    console.log(`✅ SRT split complete: ${entries.length} → ${newEntries.length} chunks (max ${maxWordsPerChunk} words each)`);
    return true;
  } catch (error) {
    console.warn(`⚠️ Could not split SRT file: ${error.message}`);
    return false;
  }
}

// Парсинг таймкоду в секунди
function parseTimecode(timecode) {
  const [time, ms] = timecode.split(',');
  const [hours, minutes, seconds] = time.split(':').map(Number);
  return hours * 3600 + minutes * 60 + seconds + Number(ms) / 1000;
}


// Функція для автоматичного створення субтитрів з аудіо
async function generateSubtitlesFromAudio(audioPath, outputDir) {
  try {
    console.log("🎤 Starting subtitle generation from audio...");
    console.log(`📂 Audio file: ${audioPath}`);
    console.log(`📂 Output directory: ${outputDir}`);

    // Перевіряємо чи існує whisper
    try {
      await exec('which python3');
      console.log("✅ Python3 found in system");
    } catch (e) {
      throw new Error("Python3 not found. Please install python3");
    }

    // Формуємо команду Whisper для отримання JSON з word timestamps
    console.log("⚙️ Running whisper command for JSON with word timestamps...");
    const whisperCmd =
      `PYTHONWARNINGS=ignore ` +
      `python3 -m whisper "${audioPath}" ` +
      `--model base ` +
      `--task transcribe ` +
      `--output_format json ` +
      `--word_timestamps True ` +
      `--output_dir "${outputDir}" --verbose False --device cpu --fp16 False`;
    console.log(`📋 Command: ${whisperCmd}`);

    const { stdout, stderr } = await exec(whisperCmd);
    console.log("📤 Whisper stdout:", stdout);
    if (stderr) console.log("📤 Whisper stderr:", stderr);

    // Підхоплюємо JSON файл з word timestamps
    const jsonPath = path.join(
      outputDir,
      path.basename(audioPath).replace(/\.[^.]+$/, ".json")
    );
    console.log(`🔍 Looking for generated JSON: ${jsonPath}`);

    // Перевіряємо, що файл є
    await fs.access(jsonPath);
    console.log("✅ JSON file found! Reading word timestamps...");

    // Створюємо синхронізований SRT з 4-6 слів на субтитр
    const srtPath = path.join(outputDir, path.basename(audioPath).replace(/\.[^.]+$/, ".srt"));
    await createSyncSrt(jsonPath, srtPath, 5); // 5 слів на субтитр

    console.log("✅ Subtitles generated successfully from audio with word-level precision");
    return srtPath;
  } catch (error) {
    console.error("❌ Failed to generate subtitles from audio:", error.message);
    console.error("💡 Make sure whisper is installed: pip install openai-whisper");
    console.error("💡 Or try: pip3 install openai-whisper");
    return null;
  }
}

function formatTimecode(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${millis.toString().padStart(3, '0')}`;
}


async function main() {
  const args = parseArgs();

  // Валідація вхідних файлів та папок
  console.log("🔍 Validating input files...");

  // Перевіряємо папку з зображеннями
  try {
    await fs.access(args.images_dir);
  } catch (error) {
    throw new Error(`Images directory not found: ${args.images_dir}`);
  }

  // Перевіряємо аудіо файл
  try {
    await fs.access(args.audio);
  } catch (error) {
    throw new Error(`Audio file not found: ${args.audio}`);
  }

  // Завантажуємо та сортуємо зображення
  let imageFiles;
  try {
    imageFiles = await fs.readdir(args.images_dir);
  } catch (error) {
    throw new Error(`Cannot read images directory: ${error.message}`);
  }

  const images = sortImages(imageFiles).map(f => path.join(args.images_dir, f));
  if (images.length === 0) {
    throw new Error(`No valid images found in ${args.images_dir}. Supported formats: jpg, jpeg, png, webp`);
  }

  console.log(`📸 Found ${images.length} images`);

  // Отримуємо тривалість аудіо
  console.log("🎵 Getting audio duration...");
  const dur = await ffprobeDuration(args.audio);
  console.log(`⏱️ Audio duration: ${dur.toFixed(2)} seconds`);

  // Простий розрахунок часу на кожне зображення
  const per = dur / images.length;
  console.log(`📊 Time per image: ${per.toFixed(2)} seconds (${images.length} images)`);
  console.log(`🎯 Final video will be exactly ${dur.toFixed(2)} seconds long`);

  const tmpDir = path.join(path.dirname(args.out), ".slideshow_tmp");
  await fs.mkdir(tmpDir, { recursive: true });

  // Обробка субтитрів з детальним логуванням
  console.log("\n🎯 === SUBTITLE PROCESSING START ===");
  let subtitleFile = null;

  console.log("🔍 Checking subtitle sources...");
  console.log(`   --subs parameter: ${args.subs || 'not provided'}`);
  console.log(`   --text parameter: ${args.text || 'not provided'}`);

  if (args.subs && await fs.access(args.subs).then(() => true).catch(() => false)) {
    // Використовуємо готовий SRT файл
    subtitleFile = args.subs;
    console.log("✅ Using existing SRT file:", subtitleFile);

    // Виправляємо SRT файл для однорядковості
    await fixSrtToSingleLine(subtitleFile);
  } else if (args.text && await fs.access(args.text).then(() => true).catch(() => false)) {
    // Створюємо SRT файл з текстового файлу
    console.log("📄 Creating subtitles from text file...");
    const textContent = await fs.readFile(args.text, 'utf8');
    const srtContent = createSrtFromText(textContent, dur);
    subtitleFile = path.join(tmpDir, 'generated_subtitles.srt');
    await fs.writeFile(subtitleFile, srtContent);
    console.log("✅ Created subtitles from text file:", subtitleFile);
  } else {
    // Автоматична генерація субтитрів з аудіо
    console.log("🎤 No explicit subtitle source - attempting audio-to-subtitle generation...");
    subtitleFile = await generateSubtitlesFromAudio(args.audio, tmpDir);

    // Якщо не вдалося згенерувати з аудіо, шукаємо текстові файли
    if (!subtitleFile) {
      console.log("📄 Audio generation failed - searching for text files...");
      const possibleTextFiles = ['script.txt', 'text.txt', 'subtitles.txt', 'captions.txt'];

      for (const fileName of possibleTextFiles) {
        const textFilePath = path.join(path.dirname(args.images_dir), fileName);
        console.log(`🔍 Checking: ${textFilePath}`);

        if (await fs.access(textFilePath).then(() => true).catch(() => false)) {
          console.log("✅ Found text file for subtitles:", textFilePath);
          const textContent = await fs.readFile(textFilePath, 'utf8');
          const srtContent = createSrtFromText(textContent, dur);
          subtitleFile = path.join(tmpDir, 'generated_subtitles.srt');
          await fs.writeFile(subtitleFile, srtContent);
          console.log("✅ Created subtitles from text file:", subtitleFile);

          // Додаткова перевірка для впевненості
          await fixSrtToSingleLine(subtitleFile);
          break;
        } else {
          console.log("❌ File not found");
        }
      }

      // Якщо не знайшли текст, шукаємо в папці з зображеннями
      if (!subtitleFile) {
        const textInImageDir = path.join(args.images_dir, 'script.txt');
        console.log(`🔍 Final attempt - checking images directory: ${textInImageDir}`);

        if (await fs.access(textInImageDir).then(() => true).catch(() => false)) {
          console.log("✅ Found text file in images directory");
          const textContent = await fs.readFile(textInImageDir, 'utf8');
          const srtContent = createSrtFromText(textContent, dur);
          subtitleFile = path.join(tmpDir, 'generated_subtitles.srt');
          await fs.writeFile(subtitleFile, srtContent);
          console.log("✅ Created subtitles from images directory:", subtitleFile);
        } else {
          console.log("❌ No text file found in images directory");
        }
      }
    }
  }

  console.log(`\n📋 SUBTITLE PROCESSING RESULT:`);
  console.log(`   Final subtitle file: ${subtitleFile || 'NONE'}`);
  if (subtitleFile) {
    console.log(`   File exists: ${await fs.access(subtitleFile).then(() => 'YES').catch(() => 'NO')}`);
  }
  console.log("🎯 === SUBTITLE PROCESSING END ===\n");

  // Пошук Fx оверлею в папці heygen-bot/Fx
  const defaultFxDir = "/Users/mavlik/heygen-bot/Fx";
  const fxDir = args.fx_dir || defaultFxDir;
  const fxFile = await findFxFile(fxDir);

  if (fxFile) {
    console.log(`🎬 Fx overlay found: ${fxFile}`);
  } else {
    console.log(`ℹ️ No Fx overlay found in: ${fxDir}`);
    console.log("💡 Looking for any .mp4 file in Fx directory");
  }

  if (subtitleFile) {
    console.log(`📝 Subtitles will be added: ${subtitleFile}`);
    console.log(`🎨 Subtitle style: ${args.font_name}, size ${args.font_size}px`);
  } else {
    console.log("⚠️ No subtitles found! Looking for:");
    console.log("   - script.txt, text.txt, subtitles.txt, captions.txt");
    console.log("   - In parent directory or images directory");
  }

  const tmpVid = path.join(tmpDir, "slides.mp4");

  // Створення відео з ручним покачуванням через Remotion
  console.log("🎬 Creating base video with handheld motion using Remotion...");

  try {
    // Отримуємо абсолютний шлях до скрипту
    const scriptDir = path.dirname(new URL(import.meta.url).pathname);
    const handheldScript = path.join(scriptDir, 'build_handheld_video.js');

    console.log(`🔍 Script directory: ${scriptDir}`);
    console.log(`🔍 Handheld script: ${handheldScript}`);

    // Перевіряємо чи існує скрипт
    await fs.access(handheldScript);
    console.log("✅ Handheld script exists");

    // Спробуємо створити відео з покачуванням
    console.log(`🚀 Executing: node "${handheldScript}" "${args.images_dir}" "${args.audio}" "${tmpVid}"`);
    const { stdout, stderr } = await exec(`node "${handheldScript}" "${args.images_dir}" "${args.audio}" "${tmpVid}"`);

    if (stdout) console.log("📤 Remotion stdout:", stdout);
    if (stderr) console.log("📤 Remotion stderr:", stderr);

    console.log("✅ Handheld motion video created successfully");

    // Перевіряємо чи файл існує і який розмір
    try {
      const stats = await fs.stat(tmpVid);
      console.log(`📊 Remotion output size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

      // Перевіряємо тривалість
      const { stdout: durationCheck } = await exec(`ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "${tmpVid}"`);
      const duration = parseFloat(durationCheck.trim());
      console.log(`⏱️ Remotion video duration: ${duration.toFixed(2)}s (expected: ~${dur.toFixed(2)}s)`);

      if (duration < dur * 0.8) {
        console.warn(`⚠️ WARNING: Remotion video is too short! Expected ${dur}s but got ${duration}s`);
      }
    } catch (checkErr) {
      console.error(`❌ Failed to verify Remotion output: ${checkErr.message}`);
    }
  } catch (remotionError) {
    console.error("❌ Remotion failed, falling back to standard method:");
    console.error("Error message:", remotionError.message);
    console.error("Error code:", remotionError.code);
    if (remotionError.stdout) console.error("Stdout:", remotionError.stdout);
    if (remotionError.stderr) console.error("Stderr:", remotionError.stderr);

    // Fallback до стандартного методу
    const videoParts = [];

    const imagePromises = images.map((img, i) => {
      const outVid = path.join(tmpDir, `slide_${i.toString().padStart(3, "0")}.mp4`);
      videoParts.push(outVid);

      const staticFilter = `scale=${args.w}:${args.h}:force_original_aspect_ratio=increase,crop=${args.w}:${args.h}`;

      return exec(`ffmpeg -y -loop 1 -t ${per} -i "${img}" -vf "${staticFilter}" -c:v libx264 -pix_fmt yuv420p -r ${args.fps} -movflags +faststart "${outVid}"`);
    });

    console.log(`🚀 Processing ${images.length} images in parallel (fallback)...`);
    await Promise.all(imagePromises);

    const listPath = path.join(tmpDir, "concat.txt");
    const listContent = videoParts.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join("\n");
    await fs.writeFile(listPath, listContent);

    await exec(`ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${tmpVid}"`);
    console.log("✅ Standard video created as fallback");
  }

  // Один проход з усіма ефектами в filter_complex
  console.log("🎬 Combining all effects in single pass...");

  let inputs = [`-i "${tmpVid}"`, `-i "${args.audio}"`];
  let filterComplex = [];
  let inputIndex = 0;

  // Базове відео та Fx
  let currentStream;

  if (fxFile) {
    inputs.splice(1, 0, `-t ${dur} -stream_loop -1 -i "${fxFile}"`); // ОБМЕЖУЄМО довжину аудіо
    filterComplex.push(`[1:v]scale=${args.w}:${args.h}:flags=bicubic,colorkey=0x000000:0.30:0.02,format=rgba[fxk]`);
    filterComplex.push(`[${inputIndex}:v]format=yuv420p[base]`);
    filterComplex.push(`[base][fxk]overlay=0:0:shortest=1[bled]`);
    currentStream = '[bled]';
    inputIndex++;
    console.log("✨ Fx overlay will be applied with colorkey (black background removed)");
  } else {
    filterComplex.push(`[${inputIndex}:v]format=rgba[base]`);
    currentStream = '[base]';
  }
  inputIndex++;

  // Додаємо субтитри якщо є
  if (subtitleFile) {
    const subtitleFilter = `subtitles='${subtitleFile}':force_style='FontName=${args.font_name},FontSize=${args.font_size},PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,BorderStyle=1,Outline=1,Shadow=1,Bold=0,WrapStyle=2,MarginV=40'`;
    filterComplex.push(`${currentStream}${subtitleFilter},fps=30[v]`);
    currentStream = '[v]';
    console.log("📝 Subtitles will be applied over everything, downsampled to 30fps");
  } else {
    // Якщо немає субтитрів, тільки downsample до 30fps
    filterComplex.push(`${currentStream}fps=30[v]`);
    console.log("📹 Video downsampled to 30fps for final output");
  }

  // Складаємо фінальну команду
  const inputsStr = inputs.join(' ');
  const filterComplexStr = filterComplex.join(';');
  const audioMap = fxFile ? `${inputIndex}:a` : '1:a'; // враховуємо зсув індексу через Fx

  const finalCmd = `ffmpeg -y ${inputsStr} -filter_complex "${filterComplexStr}" -map "[v]" -map ${audioMap} -c:v libx264 -c:a aac -b:a 192k -movflags +faststart "${args.out}"`;

  console.log(`📋 Final command: ${finalCmd}`);
  console.log("⚙️ Executing single-pass rendering...");
  console.log("🎵 Video duration will match audio duration exactly");

  await exec(finalCmd);

  // Зберігаємо субтитри перед видаленням тимчасової папки
  if (subtitleFile && subtitleFile.includes(tmpDir)) {
    const finalSubsPath = path.join(path.dirname(args.out), path.basename(subtitleFile));
    try {
      await exec(`cp "${subtitleFile}" "${finalSubsPath}"`);
      console.log("💾 Saved subtitles to:", finalSubsPath);
    } catch (e) {
      console.warn("⚠️ Could not save subtitles:", e.message);
    }
  }

  await fs.rm(tmpDir, { recursive: true, force: true });
  console.log("✅ DONE:", args.out);
}

main().catch(e => {
  console.error("❌ ERROR:", e.message || e);

  // Додаткова інформація для діагностики
  if (e.message && e.message.includes('ffprobe')) {
    console.error("💡 Possible solutions:");
    console.error("   - Check if ffmpeg/ffprobe is installed and available in PATH");
    console.error("   - Verify the audio file exists and is not corrupted");
    console.error("   - Try with a different audio file format");
  }

  process.exit(1);
});
