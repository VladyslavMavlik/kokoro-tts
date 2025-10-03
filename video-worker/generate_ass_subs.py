#!/usr/bin/env python3
"""
Generate ASS subtitles with word-level highlighting (karaoke effect)
Uses faster-whisper for transcription with word timestamps
"""

import sys
import json
import argparse
from pathlib import Path
from faster_whisper import WhisperModel
import pysubs2
from pysubs2 import SSAFile, SSAEvent, SSAStyle


def transcribe_with_word_timestamps(audio_path, model_size="base", device="cpu", compute_type="int8"):
    """
    Transcribe audio with word-level timestamps using faster-whisper
    """
    print(f"🎤 Loading Whisper model: {model_size}")
    model = WhisperModel(model_size, device=device, compute_type=compute_type)

    print(f"🎵 Transcribing: {audio_path}")
    segments, info = model.transcribe(
        audio_path,
        beam_size=5,
        word_timestamps=True,
        language=None  # Auto-detect
    )

    print(f"📊 Detected language: {info.language} (probability: {info.language_probability:.2f})")

    # Collect all segments with word-level data
    result = []
    for segment in segments:
        if not segment.words:
            continue

        segment_data = {
            'start': segment.start,
            'end': segment.end,
            'text': segment.text,
            'words': [
                {
                    'word': word.word.strip(),
                    'start': word.start,
                    'end': word.end,
                    'probability': word.probability
                }
                for word in segment.words
            ]
        }
        result.append(segment_data)
        print(f"  📝 Segment: {segment.text[:50]}... ({len(segment.words)} words)")

    return result


def create_ass_style():
    """
    Create ASS style with yellow highlight for spoken words
    """
    style = SSAStyle()

    # Font settings
    style.fontname = "Jumper"  # Змінили на Jumper
    style.fontsize = 22  # Оптимальний розмір для читабельності
    style.bold = True  # Жирний шрифт (товщі букви)

    # Colors - pysubs2.Color(r, g, b, a) but ASS stores as &HAABBGGRR
    # Primary color: light gray/white (for unspoken words)
    # Сірувато-білий для слів що ще не озвучені
    style.primary_color = pysubs2.Color(r=200, g=200, b=200, a=0)  # &H00C8C8C8 (light gray)

    # Secondary color: bright yellow (for spoken words)
    # Яскраво-жовтий для озвучених слів
    style.secondary_color = pysubs2.Color(r=255, g=255, b=0, a=0)  # &H0000FFFF (yellow)

    # Outline color: black
    style.outline_color = pysubs2.Color(r=0, g=0, b=0, a=0)  # &H00000000

    # Shadow color: black with transparency
    style.back_color = pysubs2.Color(r=0, g=0, b=0, a=100)  # &H64000000

    # Border and shadow
    style.outline = 2  # Чорна обводка
    style.shadow = 1

    # Alignment: bottom center (2)
    style.alignment = 2

    # Margins
    style.marginl = 20
    style.marginr = 20
    style.marginv = 45  # Відступ знизу

    return style


def generate_ass_subtitles(segments, output_path, words_per_subtitle=5):
    """
    Generate ASS file with karaoke effect (word highlighting)
    """
    print(f"\n✨ Generating ASS subtitles with karaoke effect...")

    # Create SSA file
    subs = SSAFile()

    # Add custom style
    subs.styles["Default"] = create_ass_style()

    # Group words into subtitle chunks with smart splitting at punctuation
    all_words = []
    for segment in segments:
        all_words.extend(segment['words'])

    if not all_words:
        print("⚠️ No words found in segments!")
        return

    print(f"📊 Total words: {len(all_words)}")
    print(f"🔢 Grouping by {words_per_subtitle} words per subtitle (with smart punctuation splits)")

    # Smart chunking: розбиваємо на крапках, комах, питальниках
    chunks = []
    current_chunk = []

    for word_obj in all_words:
        current_chunk.append(word_obj)
        word_text = word_obj['word']

        # Якщо слово закінчується на . ! ? - починаємо новий субтитр
        if word_text.rstrip().endswith(('.', '!', '?')):
            chunks.append(current_chunk)
            current_chunk = []
        # Або якщо досягли ТОЧНОЇ максимальної довжини (без гнучкості!)
        elif len(current_chunk) >= words_per_subtitle:
            chunks.append(current_chunk)
            current_chunk = []

    # Додаємо останній chunk якщо є
    if current_chunk:
        chunks.append(current_chunk)

    print(f"📊 Created {len(chunks)} subtitle chunks (split at punctuation)")

    # Create subtitle events with karaoke tags
    for chunk in chunks:
        if not chunk:
            continue

        start_time = chunk[0]['start'] * 1000  # Convert to milliseconds
        end_time = chunk[-1]['end'] * 1000

        # Build ASS text with ABSOLUTE timing for each word
        # ВАЖЛИВО: використовуємо абсолютний час від початку субтитра!
        ass_text = ""

        subtitle_start_ms = start_time  # Початок субтитра в мілісекундах

        for i, word in enumerate(chunk):
            # Абсолютний час початку слова (від початку відео)
            word_start_abs_ms = word['start'] * 1000

            # Відносний час від початку ЦЬОГО субтитра (в мілісекундах)
            word_start_relative_ms = word_start_abs_ms - subtitle_start_ms

            # Конвертуємо в мілісекунди для \t() тега
            # ASS \t() використовує мілісекунди!
            transition_time = int(word_start_relative_ms)

            # Конвертуємо слово в КАПС
            word_upper = word['word'].upper()

            if i == 0 and transition_time <= 0:
                # Перше слово - якщо воно на самому початку субтитра, одразу жовте
                ass_text += f"{{\\c&H00FFFF&}}{word_upper} "
            else:
                # Всі інші слова: спочатку сірі, потім стають жовтими в точний момент
                # \t(start,end,tags) де start=end для миттєвої зміни
                ass_text += f"{{\\c&HC8C8C8&\\t({transition_time},{transition_time},\\c&H00FFFF&)}}{word_upper} "

        ass_text = ass_text.strip()

        # Create SSA event
        event = SSAEvent(
            start=int(start_time),
            end=int(end_time),
            text=ass_text
        )
        subs.events.append(event)

    # Save to file
    subs.save(output_path)

    # ВАЖЛИВО: pysubs2 не зберігає Primary color правильно
    # Виправляємо вручну після збереження
    with open(output_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Змінюємо Primary color з білого на сірий
    # І змінюємо WrapStyle на 2 (smart wrapping, але ми все одно не будемо мати довгі рядки)
    content = content.replace('WrapStyle: 0', 'WrapStyle: 2')

    # Виправляємо стиль вручну (простіше і надійніше)
    import re
    # Спочатку міняємо FontName, FontSize, PrimaryColour
    content = re.sub(
        r'Style: Default,\w+,\d+,&H00FFFFFF,',
        'Style: Default,Jumper,22,&H00C8C8C8,',
        content
    )
    # Потім міняємо Bold з 0 на -1
    content = re.sub(
        r'(Style: Default,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,)0,',
        r'\1-1,',
        content
    )
    # Outline вже 2 - не міняємо
    # Міняємо MarginV з 20 на 45
    content = re.sub(
        r',2,20,20,20,1$',
        ',2,20,20,45,1',
        content,
        flags=re.MULTILINE
    )

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"✅ ASS subtitles saved: {output_path}")
    print(f"📊 Total subtitle events: {len(subs.events)}")
    print(f"🎨 Colors: Gray (&H00C8C8C8) → Yellow (&H00FFFF)")


def main():
    parser = argparse.ArgumentParser(
        description="Generate ASS subtitles with word-level highlighting (karaoke effect)"
    )
    parser.add_argument("audio_path", help="Path to audio file")
    parser.add_argument("output_path", help="Path to output ASS file")
    parser.add_argument(
        "--model",
        default="base",
        choices=["tiny", "base", "small", "medium", "large"],
        help="Whisper model size (default: base)"
    )
    parser.add_argument(
        "--device",
        default="cpu",
        choices=["cpu", "cuda"],
        help="Device to run on (default: cpu)"
    )
    parser.add_argument(
        "--compute-type",
        default="int8",
        choices=["int8", "int16", "float16", "float32"],
        help="Compute type for model (default: int8)"
    )
    parser.add_argument(
        "--words-per-subtitle",
        type=int,
        default=5,
        help="Number of words per subtitle (default: 5)"
    )
    parser.add_argument(
        "--save-json",
        action="store_true",
        help="Save raw transcription to JSON file"
    )

    args = parser.parse_args()

    # Validate inputs
    audio_path = Path(args.audio_path)
    if not audio_path.exists():
        print(f"❌ Error: Audio file not found: {audio_path}")
        sys.exit(1)

    output_path = Path(args.output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        # Step 1: Transcribe with word timestamps
        segments = transcribe_with_word_timestamps(
            str(audio_path),
            model_size=args.model,
            device=args.device,
            compute_type=args.compute_type
        )

        if not segments:
            print("❌ No segments transcribed!")
            sys.exit(1)

        # Save JSON if requested
        if args.save_json:
            json_path = output_path.with_suffix('.json')
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(segments, f, indent=2, ensure_ascii=False)
            print(f"💾 Saved transcription JSON: {json_path}")

        # Step 2: Generate ASS subtitles with karaoke effect
        generate_ass_subtitles(segments, str(output_path), args.words_per_subtitle)

        print("\n✅ Done!")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
