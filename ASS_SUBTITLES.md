# ASS Субтитри з Караоке-Ефектом (Word Highlighting) 🎤✨

## Що нового?

Тепер система генерує **професійні ASS субтитри з підсвічуванням кожного слова** в момент його звучання - як у відео на скріншоті!

### Приклад візуального ефекту:
```
00:01.00: [and] the sky is a bruised shade of purple
00:01.20: and [the] sky is a bruised shade of purple
00:01.40: and the [sky] is a bruised shade of purple
00:01.70: and the sky [is] a bruised shade of purple
...
```

Кожне слово підсвічується **жовтим кольором** точно в момент звучання!

---

## 🚀 Швидкий старт

### Автоматичне використання (за замовчуванням)

Система **автоматично** використовує нові ASS субтитри при виклику `build_slideshow.js`:

```bash
node build_slideshow.js \
  --images_dir=/path/to/images \
  --audio=/path/to/audio.mp3 \
  --out=/path/to/output.mp4
```

**Що відбувається:**
1. ✅ faster-whisper транскрибує аудіо з word-level timestamps
2. ✅ Створюються ASS субтитри з караоке-ефектом (`\kf` теги)
3. ✅ Відео рендериться з підсвічуванням слів

---

## 📋 Ручне використання

### Генерація тільки субтитрів:

```bash
python3 generate_ass_subs.py \
  audio.mp3 \
  output.ass \
  --model base \
  --words-per-subtitle 5
```

**Опції:**
- `--model` - розмір моделі Whisper: `tiny`, `base`, `small`, `medium`, `large` (default: `base`)
- `--device` - пристрій: `cpu`, `cuda` (default: `cpu`)
- `--compute-type` - тип обчислень: `int8`, `float16`, `float32` (default: `int8`)
- `--words-per-subtitle` - кількість слів на субтитр (default: 5)
- `--save-json` - зберегти JSON транскрипцію

**Приклади:**

```bash
# Швидка генерація (tiny model)
python3 generate_ass_subs.py voice.mp3 subs.ass --model tiny

# Точна генерація (large model, GPU)
python3 generate_ass_subs.py voice.mp3 subs.ass --model large --device cuda

# Багато слів на субтитр (більш повільна зміна)
python3 generate_ass_subs.py voice.mp3 subs.ass --words-per-subtitle 8
```

---

## 🎨 Налаштування стилю

### Редагування кольорів

Відкрийте `generate_ass_subs.py` та змініть функцію `create_ass_style()`:

```python
def create_ass_style():
    style = SSAStyle()

    # Шрифт
    style.fontname = "Impact"  # Змініть на будь-який шрифт
    style.fontsize = 32        # Розмір
    style.bold = True          # Жирний

    # Кольори (RGBA format)
    style.primary_color = pysubs2.Color(r=255, g=255, b=255, a=0)  # Білий

    # Обведення та тінь
    style.outline = 2          # Товщина обведення
    style.shadow = 1           # Тінь
    style.outline_color = pysubs2.Color(r=0, g=0, b=0, a=0)  # Чорне обведення

    # Позиція
    style.alignment = 2        # 2 = знизу по центру
    style.marginv = 40         # Відступ від низу (px)

    return style
```

### Зміна кольору підсвічування

У функції `generate_ass_subtitles()` змініте колір у тегах:

```python
# Поточний: жовтий
ass_text += f"{{\\kf{duration_cs}\\c&H00FFFF&}}{word['word']} "

# Червоний (BGR: 0, 0, 255)
ass_text += f"{{\\kf{duration_cs}\\c&H0000FF&}}{word['word']} "

# Зелений (BGR: 0, 255, 0)
ass_text += f"{{\\kf{duration_cs}\\c&H00FF00&}}{word['word']} "

# Помаранчевий (BGR: 0, 165, 255)
ass_text += f"{{\\kf{duration_cs}\\c&H00A5FF&}}{word['word']} "
```

**Увага:** ASS використовує формат BGR (не RGB)!

---

## 🔧 Технічні деталі

### Алгоритм генерації

1. **Транскрипція:**
   - `faster-whisper` (оптимізована версія Whisper)
   - Word-level timestamps (точність ±20-50ms)
   - INT8 quantization для економії пам'яті
   - Автоматичне визначення мови

2. **Групування слів:**
   - Групи по 5 слів (налаштовується)
   - Розумний розподіл часу між словами

3. **ASS теги:**
   - `\kf` - karaoke fill (плавне заповнення)
   - `\c&H00FFFF&` - inline колір для підсвічування
   - Centisecond precision (1/100 секунди)

### Формат ASS тегів

```ass
{\kf<duration>\c&H00FFFF&}word
```

- `\kf` - karaoke fill effect
- `<duration>` - тривалість в сантисекундах (1/100 с)
- `\c&H00FFFF&` - колір підсвічування (жовтий у BGR)

---

## 📊 Порівняння з старою системою

| Функція | Стара система (SRT) | Нова система (ASS) |
|---------|---------------------|---------------------|
| **Підсвічування слів** | ❌ Весь рядок одразу | ✅ Кожне слово окремо |
| **Точність timestamps** | ±100-200ms | ✅ ±20-50ms |
| **Швидкість** | Whisper base | ✅ faster-whisper (4-5x) |
| **Кольори** | Обмежені | ✅ Повний контроль (inline теги) |
| **Анімації** | ❌ Ні | ✅ Караоке fill, fade, тощо |
| **Шрифти** | Системні | ✅ Custom fonts |
| **Позиціонування** | Базове | ✅ Pixel-perfect |

---

## ⚠️ Вимоги

### Python пакети:
```bash
pip3 install faster-whisper pysubs2
```

### Системні залежності:
- Python 3.8+
- ffmpeg з libass підтримкою (для рендерингу)
- 2GB+ RAM (для моделі base)

---

## 🐛 Troubleshooting

### Помилка: "Missing Python packages"
```bash
pip3 install --upgrade faster-whisper pysubs2
```

### Помилка: "Model download failed"
Перший запуск завантажує модель (~150MB для base). Потрібен інтернет.

### Субтитри не відображаються у відео
Перевірте чи ffmpeg має підтримку libass:
```bash
ffmpeg -filters | grep subtitles
```

### Повільна генерація на CPU
Використовуйте меншу модель:
```bash
python3 generate_ass_subs.py audio.mp3 subs.ass --model tiny
```

Або увімкніть GPU (якщо є CUDA):
```bash
python3 generate_ass_subs.py audio.mp3 subs.ass --device cuda
```

---

## 🎯 Приклади використання

### Освітнє відео з читанням
```bash
# Більше слів для повільного читання
python3 generate_ass_subs.py lecture.mp3 lecture.ass --words-per-subtitle 8
```

### Швидке відео для соціальних мереж
```bash
# Менше слів для динаміки
python3 generate_ass_subs.py reel.mp3 reel.ass --words-per-subtitle 3
```

### Багатомовний контент
```bash
# Whisper автоматично визначить мову
python3 generate_ass_subs.py multilang.mp3 subs.ass --model large
```

---

## 📚 Додаткові ресурси

- **faster-whisper:** https://github.com/SYSTRAN/faster-whisper
- **pysubs2:** https://pysubs2.readthedocs.io/
- **ASS теги:** https://aeg-dev.github.io/AegiSub-Manual/
- **libass:** https://github.com/libass/libass

---

## ✅ Висновок

Нова система ASS субтитрів з караоке-ефектом:
- ✅ Підсвічує кожне слово точно в момент звучання
- ✅ Використовує швидший faster-whisper (4-5x прискорення)
- ✅ Дає повний контроль над стилем та кольорами
- ✅ Автоматично інтегрована в build_slideshow.js
- ✅ Сумісна з усіма форматами відео

**Просто запускайте `build_slideshow.js` як звичайно - все працює автоматично!** 🚀
