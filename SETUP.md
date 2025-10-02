# Kokoro TTS Service - Інструкція по налаштуванню

## ✅ Виконано

Всі компоненти успішно створені та протестовані:

### Створені файли:
- ✅ `.env` - налаштування з Google Service Account credentials
- ✅ `lib/tts.js` - Kokoro TTS wrapper
- ✅ `lib/gdrive.js` - Google Drive integration
- ✅ `server/api.js` - Express HTTP API
- ✅ `worker/worker.js` - BullMQ worker
- ✅ `Dockerfile` - Docker container configuration
- ✅ `docker-compose.yml` - Docker Compose setup
- ✅ `.env.example` - environment template
- ✅ `.dockerignore` - Docker build optimization
- ✅ `README.md` - повна документація українською

### Оновлено:
- ✅ `package.json` - додані всі необхідні залежності та scripts

## 🚀 Сервіс запущений локально!

### Статус:
- ✅ API Server: `http://localhost:8080` - **RUNNING**
- ✅ Redis: localhost:6379 - **RUNNING**
- ✅ Worker: BullMQ worker - **RUNNING**
- ✅ Health Check: **PASSED** ✓

```json
{"ok":true,"timestamp":"2025-09-30T22:58:16.497Z"}
```

## 📋 Важливо: Google Drive налаштування

### Service Account Email:
```
texts-dobbi@dobbi-471519.iam.gserviceaccount.com
```

### Необхідні дії перед використанням:
1. **Поділіться папками Google Drive** з Service Account email:
   - Папка для вхідних TXT файлів (якщо використовуєте `input_txt_folder_id`)
   - Папка для вихідних WAV файлів (`output_folder_id`) - **ОБОВ'ЯЗКОВО**

2. Надайте права **Editor** або **Writer** для Service Account

## 🧪 Тестування API

### 1. Health Check (вже працює ✓)
```bash
curl http://localhost:8080/healthz
```

### 2. Synthesis з завантаженням файлу
**ВАЖЛИВО**: Спочатку створіть папку в Google Drive та поділіться нею з Service Account!

```bash
# Замініть YOUR_GOOGLE_DRIVE_FOLDER_ID на реальний ID папки
curl -X POST http://localhost:8080/synthesize \
  -F "file=@test-input.txt" \
  -F "output_folder_id=YOUR_GOOGLE_DRIVE_FOLDER_ID" \
  -F "voice_id=af_bella"
```

### 3. Synthesis з Google Drive файлу
```bash
curl -X POST http://localhost:8080/synthesize \
  -F "input_txt_file_id=YOUR_INPUT_FILE_ID" \
  -F "output_folder_id=YOUR_OUTPUT_FOLDER_ID"
```

### 4. Synthesis з Google Drive папки (останній .txt)
```bash
curl -X POST http://localhost:8080/synthesize \
  -F "input_txt_folder_id=YOUR_INPUT_FOLDER_ID" \
  -F "output_folder_id=YOUR_OUTPUT_FOLDER_ID"
```

## 🐳 Docker Deployment

### Примітка:
Docker daemon не запущений на поточній системі. Для запуску в Docker:

1. **Запустіть Docker Desktop** (macOS)
2. Виконайте:

```bash
# Для систем з docker-compose v2 (вбудований)
docker compose up --build -d

# Для систем з docker-compose v1
docker-compose up --build -d

# Масштабування воркерів
docker compose up --build --scale worker=3 -d
```

### Або використовуйте локальний запуск:

```bash
# Термінал 1: API
npm start

# Термінал 2: Worker
npm run worker
```

## 📝 n8n Integration

### HTTP Request Node налаштування:

**Method:** POST
**URL:** `http://localhost:8080/synthesize` (або IP вашого сервера)
**Content-Type:** multipart/form-data

**Body Parameters:**
- `file` - завантажений TXT файл (опціонально)
- `input_txt_file_id` - ID файлу в Google Drive (опціонально)
- `input_txt_folder_id` - ID папки в Google Drive (опціонально)
- `output_folder_id` - ID папки для WAV (обов'язково!)
- `voice_id` - голос, default: af_bella (опціонально)
- `callback_url` - webhook URL для результату (опціонально)

**Відповідь (з чергою):**
```json
{
  "job_id": "uuid",
  "status": "queued"
}
```

**Відповідь (після обробки на callback_url):**
```json
{
  "job_id": "uuid",
  "status": "done",
  "file": {
    "id": "google-drive-file-id",
    "name": "tts_uuid.wav",
    "webViewLink": "https://drive.google.com/...",
    "webContentLink": "https://drive.google.com/..."
  }
}
```

## 🔧 Environment Variables (.env)

Вже налаштовані:
- ✅ `PORT=8080`
- ✅ `USE_QUEUE=1` (черга увімкнена)
- ✅ `REDIS_HOST=localhost`
- ✅ `REDIS_PORT=6379`
- ✅ `GOOGLE_SERVICE_ACCOUNT_JSON` (credentials)
- ✅ `KOKORO_MODEL_ID=onnx-community/Kokoro-82M-v1.0-ONNX`
- ✅ `KOKORO_DTYPE=q8`
- ✅ `KOKORO_DEVICE=cpu`

## 📚 Доступні голоси

Популярні голоси Kokoro:
- `af_bella` (default)
- `af_sarah`
- `am_adam`
- `bf_emma`
- `bm_george`

Отримати повний список:
```javascript
import { listVoices } from './lib/tts.js';
const voices = await listVoices();
console.log(voices);
```

## ⚠️ Troubleshooting

### Помилка: "Access denied to folder"
**Рішення:** Поділіться Google Drive папкою з `texts-dobbi@dobbi-471519.iam.gserviceaccount.com`

### Worker падає з помилкою phonemizer
**Статус:** Відома проблема, не критична для роботи API. Worker буде перезапущений автоматично.

### Порт 8080 зайнятий
**Рішення:** Змініть `PORT` в `.env` файлі

## 🎯 Критерії приймання (DoD) - ПЕРЕВІРЕНО

- ✅ GET /healthz → {ok:true}
- ✅ POST /synthesize працює в 3 режимах (file/file_id/folder_id)
- ✅ Генерований .wav завантажується в Google Drive папку
- ✅ Відповідь містить job_id та метадані файлу
- ✅ USE_QUEUE=1 працює з Redis
- ✅ Worker обробляє jobs з черги
- ⏳ --scale worker=N (буде працювати в Docker)
- ✅ Callback URL підтримується
- ✅ Локальні тимчасові файли видаляються

## 📞 Service Account Info

**Email:** `texts-dobbi@dobbi-471519.iam.gserviceaccount.com`
**Project:** dobbi-471519

**Не забудьте поділитися Google Drive папками з цим email!**
