# Kokoro TTS Service

HTTP API сервіс для генерації аудіо з тексту за допомогою Kokoro TTS з інтеграцією Google Drive.

## Можливості

- ✅ Генерація WAV файлів з тексту через Kokoro TTS
- ✅ Інтеграція з Google Drive (читання txt, завантаження wav)
- ✅ HTTP API для n8n та інших автоматизацій
- ✅ Підтримка черги (BullMQ + Redis) або inline обробки
- ✅ Docker & docker-compose готовий до деплою
- ✅ Масштабування воркерів

## Швидкий старт

### 1. Встановлення залежностей

```bash
npm install
```

### 2. Налаштування Google Drive

1. Створіть Service Account в Google Cloud Console
2. Завантажте JSON ключ
3. Поділіться Google Drive папками/файлами з email Service Account
4. Додайте credentials в `.env`:

```bash
cp .env.example .env
# Відредагуйте .env, додайте GOOGLE_SERVICE_ACCOUNT_JSON
```

### 3. Запуск локально

**Без черги (inline обробка):**
```bash
USE_QUEUE=0 npm start
```

**З чергою (потрібен Redis):**
```bash
# Термінал 1: Redis
docker run -p 6379:6379 redis:7-alpine

# Термінал 2: API
USE_QUEUE=1 npm run dev:api

# Термінал 3: Worker
npm run worker
```

### 4. Запуск в Docker

```bash
docker-compose up --build
```

**Масштабування воркерів:**
```bash
docker-compose up --build --scale worker=3
```

## API Endpoints

### GET /healthz

Перевірка здоров'я сервісу.

**Відповідь:**
```json
{
  "ok": true,
  "timestamp": "2025-10-01T12:00:00.000Z"
}
```

### POST /synthesize

Синтез мовлення з тексту.

**Формат:** `multipart/form-data`

**Поля:**

| Поле | Тип | Обов'язкове | Опис |
|------|-----|-------------|------|
| `file` | file | ні* | Завантажений .txt файл |
| `input_txt_file_id` | string | ні* | ID файлу в Google Drive |
| `input_txt_folder_id` | string | ні* | ID папки в Google Drive (береться останній .txt) |
| `output_folder_id` | string | **так** | ID папки в Drive для збереження WAV |
| `voice_id` | string | ні | ID голосу (default: `af_bella`) |
| `callback_url` | string | ні | URL для POST callback з результатом |

*Потрібен хоча б один з: `file`, `input_txt_file_id`, `input_txt_folder_id`

**Відповідь (USE_QUEUE=1):**
```json
{
  "job_id": "uuid",
  "status": "queued",
  "message": "Job queued for processing"
}
```

**Відповідь (USE_QUEUE=0 або після обробки):**
```json
{
  "job_id": "uuid",
  "status": "done",
  "file": {
    "id": "google-drive-file-id",
    "name": "tts_uuid.wav",
    "webViewLink": "https://drive.google.com/file/d/...",
    "webContentLink": "https://drive.google.com/..."
  }
}
```

**Приклад (curl):**

```bash
# Завантаження файлу
curl -X POST http://localhost:8080/synthesize \
  -F "file=@input.txt" \
  -F "output_folder_id=1A2B3C4D5E6F7G8H9I" \
  -F "voice_id=af_bella"

# З Google Drive
curl -X POST http://localhost:8080/synthesize \
  -F "input_txt_file_id=1XyZ..." \
  -F "output_folder_id=1A2B3C4D5E6F7G8H9I"

# З папки Drive (останній .txt)
curl -X POST http://localhost:8080/synthesize \
  -F "input_txt_folder_id=1FolderID..." \
  -F "output_folder_id=1A2B3C4D5E6F7G8H9I"
```

## Інтеграція з n8n

### HTTP Request Node

**Method:** POST
**URL:** `http://localhost:8080/synthesize`
**Body:** Form-Data

**Поля:**
- `input_txt_folder_id`: ID вхідної папки Drive
- `output_folder_id`: ID вихідної папки Drive
- `voice_id`: af_bella
- `callback_url` (опціонально): URL для webhook

## Змінні середовища

| Змінна | Default | Опис |
|--------|---------|------|
| `PORT` | 8080 | Порт API сервера |
| `USE_QUEUE` | 0 | 1 = черга, 0 = inline |
| `REDIS_HOST` | localhost | Redis хост |
| `REDIS_PORT` | 6379 | Redis порт |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | - | JSON credentials (рядок) |
| `GOOGLE_SERVICE_ACCOUNT_JSON_PATH` | - | Шлях до JSON файлу |
| `KOKORO_MODEL_ID` | onnx-community/Kokoro-82M-v1.0-ONNX | Модель |
| `KOKORO_DTYPE` | q8 | q8/q4/fp16/fp32 |
| `KOKORO_DEVICE` | cpu | cpu/cuda |

## Доступні голоси

Kokoro підтримує різні голоси. Отримати список:

```javascript
import { listVoices } from './lib/tts.js';
const voices = await listVoices();
console.log(voices);
```

Популярні: `af_bella`, `af_sarah`, `am_adam`, `bf_emma`, `bm_george`

## Обробка помилок

**400 Bad Request** - відсутні обов'язкові поля
**403 Forbidden** - немає доступу до Drive (поділіться з SA email)
**404 Not Found** - файл/папка не знайдені
**500 Internal Server Error** - помилка обробки

**Приклад помилки:**
```json
{
  "error": "Access denied to folder (ID: 1XyZ...). Share the folder with service account email: sa@project.iam.gserviceaccount.com"
}
```

## Архітектура

```
kokoro-tts/
├── lib/
│   ├── tts.js          # Kokoro TTS wrapper
│   └── gdrive.js       # Google Drive API
├── server/
│   └── api.js          # Express HTTP API
├── worker/
│   └── worker.js       # BullMQ worker
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Розробка

```bash
# Запуск в dev режимі
npm run dev:api

# Запуск воркера
npm run worker
```

## Ліцензія

ISC
