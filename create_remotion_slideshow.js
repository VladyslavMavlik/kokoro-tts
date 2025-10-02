#!/usr/bin/env node
// create_remotion_slideshow.js
// Створює базове відео з ручним покачуванням через Remotion

import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { exec as _exec } from "node:child_process";

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
    throw new Error(`Failed to get audio duration from "${file}": ${error.message}`);
  }
}

// Створення динамічного Root.tsx з параметрами
async function createDynamicRoot(images, audioDuration, audioPath) {
  const imagesList = images.map(img => `'${path.basename(img)}'`).join(', ');

  const rootContent = `import React from 'react';
import {Composition, Sequence, staticFile, Audio} from 'remotion';
import {Handheld} from './Handheld';

const Slideshow: React.FC = () => {
  const images = [${imagesList}];
  const audioDuration = ${audioDuration};
  const audioPath = '${path.basename(audioPath)}';

  const fps = 30;
  const totalFrames = Math.ceil(audioDuration * fps);
  const framesPerImage = Math.floor(totalFrames / images.length);

  return (
    <>
      <Audio src={staticFile(audioPath)} />
      {images.map((image, index) => (
        <Sequence
          key={index}
          from={index * framesPerImage}
          durationInFrames={framesPerImage}
        >
          <Handheld src={staticFile(image)} />
        </Sequence>
      ))}
    </>
  );
};

export const RemotionRoot: React.FC = () => {
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
};`;

  await fs.writeFile('./src/Video.tsx', rootContent);
}

// Копіювання ресурсів в public папку Remotion
async function prepareAssets(images, audioPath) {
  await fs.mkdir('./public', { recursive: true });

  // Копіюємо зображення
  for (const image of images) {
    const destPath = `./public/${path.basename(image)}`;
    await exec(`cp "${image}" "${destPath}"`);
  }

  // Копіюємо аудіо
  const audioDestPath = `./public/${path.basename(audioPath)}`;
  await exec(`cp "${audioPath}" "${audioDestPath}"`);

  console.log(`📁 Copied ${images.length} images and audio to public/`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error("Usage: node create_remotion_slideshow.js images_dir audio_path output_path");
    process.exit(1);
  }

  const [imagesDir, audioPath, outputPath] = args;

  console.log("🎬 Creating Remotion slideshow with handheld motion...");

  // Читаємо зображення
  const imageFiles = await fs.readdir(imagesDir);
  const images = imageFiles
    .filter(f => ['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    .map(f => path.join(imagesDir, f));

  if (images.length === 0) {
    throw new Error(`No valid images found in ${imagesDir}`);
  }

  console.log(`📸 Found ${images.length} images`);

  // Отримуємо тривалість аудіо
  const audioDuration = await ffprobeDuration(audioPath);
  console.log(`🎵 Audio duration: ${audioDuration.toFixed(2)} seconds`);

  // Підготовка assets
  await prepareAssets(images, audioPath);

  // Створення динамічного компонента
  await createDynamicRoot(images, audioDuration, audioPath);

  // Рендеринг через Remotion
  console.log("🚀 Rendering base video with handheld motion...");
  const renderCmd = `npx remotion render src/Video.tsx HandheldSlideshow "${outputPath}" --codec=h264 --concurrency=4`;
  console.log(`📋 Command: ${renderCmd}`);

  await exec(renderCmd);

  // Очищення
  await fs.rm('./public', { recursive: true, force: true });

  console.log(`✅ Base video created: ${outputPath}`);
  console.log("🔄 Ready for FX and subtitle overlay");
}

main().catch(err => {
  console.error("❌ ERROR:", err.message || err);
  process.exit(1);
});

export { main };