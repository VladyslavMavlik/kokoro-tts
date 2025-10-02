#!/usr/bin/env node
// create_sync_srt.js
// Простий скрипт для створення синхронізованих субтитрів з Whisper JSON
// Використання: node create_sync_srt.js input.json output.srt [words_per_chunk]

import fs from "node:fs/promises";
import path from "node:path";

// Форматування таймкоду для SRT
function formatTimecode(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${millis.toString().padStart(3, '0')}`;
}

// Розумне перенесення рядків для субтитрів
function smartLineWrap(words, maxCharsPerLine = 35) {
  const text = words.join(' ');

  // Якщо коротко - залишаємо одним рядком
  if (text.length <= maxCharsPerLine) {
    return text;
  }

  // Шукаємо найкраще місце для розділення
  const halfLength = Math.floor(words.length / 2);

  // Пробуємо розділити приблизно посередині, але на межі слів
  for (let i = 0; i <= 2; i++) {
    const splitIndex = halfLength - i;
    if (splitIndex > 0 && splitIndex < words.length - 1) {
      const firstLine = words.slice(0, splitIndex).join(' ');
      const secondLine = words.slice(splitIndex).join(' ');

      // Перевіряємо чи обидва рядки не надто довгі
      if (firstLine.length <= maxCharsPerLine && secondLine.length <= maxCharsPerLine) {
        return `${firstLine}\n${secondLine}`;
      }
    }

    // Пробуємо з іншого боку
    const splitIndexRight = halfLength + i;
    if (splitIndexRight > 0 && splitIndexRight < words.length - 1) {
      const firstLine = words.slice(0, splitIndexRight).join(' ');
      const secondLine = words.slice(splitIndexRight).join(' ');

      if (firstLine.length <= maxCharsPerLine && secondLine.length <= maxCharsPerLine) {
        return `${firstLine}\n${secondLine}`;
      }
    }
  }

  // Якщо не знайшли хороше місце - просто ділимо посередині
  const firstLine = words.slice(0, halfLength).join(' ');
  const secondLine = words.slice(halfLength).join(' ');
  return `${firstLine}\n${secondLine}`;
}

// Основна функція створення SRT
async function createSyncSrt(jsonPath, srtPath, wordsPerChunk = 5) {
  try {
    console.log(`📋 Reading Whisper JSON: ${jsonPath}`);

    // Читаємо JSON файл
    const jsonContent = await fs.readFile(jsonPath, 'utf8');
    const whisperData = JSON.parse(jsonContent);

    if (!whisperData.segments || whisperData.segments.length === 0) {
      throw new Error("No segments found in Whisper JSON");
    }

    // Збираємо всі слова з усіх сегментів
    const allWords = [];
    for (const segment of whisperData.segments) {
      if (segment.words && Array.isArray(segment.words)) {
        for (const word of segment.words) {
          // Фільтруємо слова з валідними timestamps
          if (word.start !== undefined && word.end !== undefined && word.word) {
            allWords.push({
              word: word.word.trim(),
              start: word.start,
              end: word.end
            });
          }
        }
      }
    }

    if (allWords.length === 0) {
      throw new Error("No words with valid timestamps found");
    }

    console.log(`📊 Found ${allWords.length} words with timestamps`);
    console.log(`🔢 Grouping by ${wordsPerChunk} words per subtitle`);

    // Групуємо слова по wordsPerChunk
    const chunks = [];
    for (let i = 0; i < allWords.length; i += wordsPerChunk) {
      const chunk = allWords.slice(i, i + wordsPerChunk);
      chunks.push(chunk);
    }

    // Створюємо SRT записи з точною синхронізацією
    const srtEntries = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const startTime = chunk[0].start;

      // Кінцевий час - останнє слово + невеликий буфер
      let endTime = chunk[chunk.length - 1].end;

      // Додаємо буфер між групами (100ms), але не більше початку наступної групи
      if (i < chunks.length - 1) {
        const nextStartTime = chunks[i + 1][0].start;
        endTime = Math.min(endTime + 0.1, nextStartTime - 0.05);
      } else {
        endTime += 0.1; // Останній субтитр - просто +100ms
      }

      // Розумне перенесення: розділяємо на 2 рядки якщо довго
      const text = smartLineWrap(chunk.map(word => word.word));

      const startTimecode = formatTimecode(startTime);
      const endTimecode = formatTimecode(endTime);

      srtEntries.push(
        `${i + 1}`,
        `${startTimecode} --> ${endTimecode}`,
        text,
        ''
      );
    }

    // Записуємо SRT файл
    const srtContent = srtEntries.join('\n');
    await fs.writeFile(srtPath, srtContent, 'utf8');

    console.log(`✅ Created synchronized SRT: ${srtPath}`);
    console.log(`📊 Total subtitles: ${chunks.length}`);
    console.log(`⏱️ Duration: ${formatTimecode(allWords[allWords.length - 1].end)}`);

    return srtPath;
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    throw error;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error("Usage: node create_sync_srt.js input.json output.srt [words_per_chunk]");
    console.error("Example: node create_sync_srt.js voice.json subtitles.srt 5");
    process.exit(1);
  }

  const jsonPath = path.resolve(args[0]);
  const srtPath = path.resolve(args[1]);
  const wordsPerChunk = args[2] ? parseInt(args[2]) : 5;

  if (wordsPerChunk < 2 || wordsPerChunk > 10) {
    console.error("Words per chunk should be between 2 and 10");
    process.exit(1);
  }

  try {
    await createSyncSrt(jsonPath, srtPath, wordsPerChunk);
  } catch (error) {
    console.error("Failed to create SRT:", error.message);
    process.exit(1);
  }
}

// Експортуємо функцію для використання в інших скриптах
export { createSyncSrt };

// Запускаємо CLI якщо викликаний напряму
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}