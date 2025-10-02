#!/usr/bin/env node
// build_handheld_video.js
// Створює відео з ручним покачуванням через Remotion

import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { exec as _exec, spawn } from "node:child_process";

const exec = promisify(_exec);

// Функція для отримання тривалості аудіо
async function ffprobeDuration(file) {
  try {
    await fs.access(file);
    const { stdout } = await exec(`ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "${file}"`);
    const duration = parseFloat(stdout.trim());
    if (!isFinite(duration) || duration <= 0) {
      throw new Error(`Invalid duration: ${duration}`);
    }
    return duration;
  } catch (error) {
    throw new Error(`Failed to get audio duration: ${error.message}`);
  }
}

// Сортування зображень
function sortImages(files) {
  const exts = new Set([".jpg", ".jpeg", ".png", ".webp"]);
  return files
    .filter(f => exts.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

// Створення динамічного композиції
async function createDynamicComposition(images, audioDuration, audioPath, outputDir, personImage = null) {
  const imagesList = images.map(img => `'${path.basename(img)}'`).join(', ');
  const audioBasename = path.basename(audioPath);
  const personBasename = personImage ? path.basename(personImage) : null;

  const compositionContent = `import React from 'react';
import {Composition, Sequence, staticFile, Audio, registerRoot} from 'remotion';
import {Handheld} from './Handheld';
import {PersonOverlay} from './PersonOverlay';

const Slideshow: React.FC = () => {
  const images = [${imagesList}];
  const audioDuration = ${audioDuration};
  const audioPath = '${audioBasename}';
  const personSrc = ${personBasename ? `'${personBasename}'` : 'null'};

  const fps = 30;
  const totalFrames = Math.ceil(audioDuration * fps);
  const framesPerImage = Math.floor(totalFrames / images.length);

  return (
    <>
      <Audio src={staticFile(audioPath)} />

      {/* Слайди фонових зображень */}
      {images.map((image, index) => (
        <Sequence
          key={index}
          from={index * framesPerImage}
          durationInFrames={framesPerImage}
        >
          <Handheld src={staticFile(image)} />
        </Sequence>
      ))}

      {/* Жінка як окремий шар поверх всіх слайдів */}
      {personSrc && (
        <Sequence
          from={0}
          durationInFrames={totalFrames}
        >
          <PersonOverlay personSrc={personSrc} />
        </Sequence>
      )}
    </>
  );
};

const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="HandheldSlideshow"
        component={Slideshow}
        durationInFrames={${Math.ceil(audioDuration * 30)}}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};

registerRoot(RemotionRoot);`;

  const compositionPath = path.join(outputDir, 'DynamicRoot.tsx');
  await fs.writeFile(compositionPath, compositionContent);
  return compositionPath;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error("Usage: node build_handheld_video.js images_dir audio_path output_path");
    process.exit(1);
  }

  const [imagesDir, audioPath, outputPath] = args;
  const outputDir = path.dirname(outputPath);

  // Переходимо в директорію де знаходиться скрипт (для Remotion)
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const originalCwd = process.cwd();
  process.chdir(scriptDir);

  console.log("🎬 Creating Remotion slideshow with handheld motion...");
  console.log(`📁 Working directory: ${scriptDir}`);

  try {
    // Читаємо зображення
    const imageFiles = await fs.readdir(imagesDir);
    const images = sortImages(imageFiles).map(f => path.join(imagesDir, f));

    if (images.length === 0) {
      throw new Error(`No valid images found in ${imagesDir}`);
    }

    console.log(`📸 Found ${images.length} images`);

    // Отримуємо тривалість аудіо
    const audioDuration = await ffprobeDuration(audioPath);
    console.log(`🎵 Audio duration: ${audioDuration.toFixed(2)} seconds`);

    // Пошук PNG жінки в папці person (всередині папки in)
    let personImage = null;
    const personDir = path.join(imagesDir, 'person');
    console.log(`🔍 Looking for person directory: ${personDir}`);

    try {
      await fs.access(personDir);
      console.log("✅ Person directory exists");

      const personFiles = await fs.readdir(personDir);
      console.log(`📂 Files in person directory: ${personFiles.join(', ')}`);

      const pngFiles = personFiles.filter(f => path.extname(f).toLowerCase() === '.png');
      console.log(`🖼️ PNG files found: ${pngFiles.join(', ')}`);

      if (pngFiles.length > 0) {
        personImage = path.join(personDir, pngFiles[0]);
        console.log(`👩 Selected person image: ${pngFiles[0]}`);
        console.log(`📍 Full path: ${personImage}`);
      } else {
        console.log("❌ No PNG files found in person directory");
      }
    } catch (e) {
      console.log(`❌ Person directory not found: ${e.message}`);
      console.log(`💡 Expected path: ${personDir}`);
    }

    // Створюємо public папку та копіюємо ресурси
    await fs.mkdir('./public', { recursive: true });

    // Копіюємо зображення
    for (const image of images) {
      const destPath = `./public/${path.basename(image)}`;
      await exec(`cp "${image}" "${destPath}"`);
    }

    // Копіюємо аудіо
    const audioDestPath = `./public/${path.basename(audioPath)}`;
    await exec(`cp "${audioPath}" "${audioDestPath}"`);

    // Копіюємо PNG жінки (якщо є)
    if (personImage) {
      const personDestPath = `./public/${path.basename(personImage)}`;
      await exec(`cp "${personImage}" "${personDestPath}"`);
      console.log(`👩 Copied person image: ${path.basename(personImage)}`);
    }

    console.log(`📁 Copied assets to public/`);

    // Створюємо динамічну композицію
    console.log(`🎬 Creating composition with person: ${personImage ? 'YES' : 'NO'}`);
    if (personImage) {
      console.log(`👩 Person image will be: ${path.basename(personImage)}`);
    }
    const compositionPath = await createDynamicComposition(images, audioDuration, audioPath, './src', personImage);

    // Рендеримо через Remotion
    console.log("🚀 Rendering with Remotion...");
    const remotionBin = './node_modules/.bin/remotion';

    // Перевіряємо чи існує remotion бінарний файл
    await fs.access(remotionBin);
    console.log("✅ Remotion binary found");

    // Перевіряємо чи існує композиція
    await fs.access(compositionPath);
    console.log("✅ Composition file exists");

    // Підготовлюємо аргументи для spawn
    const args = [
      'render',
      compositionPath,
      'HandheldSlideshow',
      outputPath,
      '--codec=h264',
      '--concurrency=4'
    ];

    console.log(`📋 Running: ${remotionBin} ${args.join(' ')}`);

    // Використовуємо spawn для real-time логування
    await new Promise((resolve, reject) => {
      const remotionProcess = spawn(remotionBin, args, {
        cwd: scriptDir,
        stdio: 'inherit', // стрімити логи в реальному часі
        shell: process.platform === 'win32'
      });

      remotionProcess.on('close', (code) => {
        if (code === 0) {
          console.log("✅ Remotion render completed successfully");
          resolve();
        } else {
          reject(new Error(`Remotion process exited with code ${code}`));
        }
      });

      remotionProcess.on('error', (error) => {
        reject(new Error(`Failed to start Remotion process: ${error.message}`));
      });
    });

    // Очищення
    await fs.rm('./public', { recursive: true, force: true }).catch(() => {});
    await fs.rm(compositionPath).catch(() => {});

    console.log(`✅ Handheld video created: ${outputPath}`);

  } catch (error) {
    console.error("❌ Error:", error.message);

    // Очищення при помилці
    await fs.rm('./public', { recursive: true, force: true }).catch(() => {});

    throw error;
  } finally {
    // Повертаємо оригінальну робочу директорію
    process.chdir(originalCwd);
  }
}

main().catch(err => {
  console.error("❌ FATAL ERROR:", err.message || err);
  process.exit(1);
});