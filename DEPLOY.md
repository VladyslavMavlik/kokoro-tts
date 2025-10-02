# Деплой Kokoro TTS на Hetzner

## A) Підготовка репозиторію (1 раз)

### ✅ A1. docker-compose.yml — оновлено
Файл вже налаштовано для продакшну:
- ✅ Redis не публікується назовні (тільки внутрішня мережа)
- ✅ Автоперезапуск всіх сервісів (`restart: unless-stopped`)
- ✅ Healthchecks для API та Redis
- ✅ Підтримка опційного API_KEY для захисту ендпоінта

**Якщо будете використовувати Caddy/NGINX (HTTPS):**
Змініть рядок `ports: ["8080:8080"]` на `ports: ["127.0.0.1:8080:8080"]`

### ✅ A2. Захист API-ключем — додано
Код вже додано в `server/api.js`:
- Якщо встановлена змінна `API_KEY`, всі запити потребують заголовок `X-API-Key`
- Якщо `API_KEY` не встановлена, захист вимкнений

---

## B) Підготовка Hetzner сервера

### B1. Створення сервера

1. **Вибір конфігурації:**
   - Модель: CX32 (4 vCPU, 8GB RAM) або більше
   - Образ: Ubuntu 22.04 LTS
   - Локація: на ваш вибір (Falkenstein, Helsinki, Ashburn)
   - SSH ключ: додайте ваш публічний ключ

**Ваш SSH публічний ключ:**
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEfstNHvX7MH02ofOTnk9DVvxYHfP1L8wqK74NOIm6GR mavlik@hetzner
```

2. **Налаштування Firewall:**
   - SSH: 22/tcp з вашого IP (або 0.0.0.0/0)
   - API: 8080/tcp — тимчасово 0.0.0.0/0 для тесту (пізніше обмежте до IP n8n)
   - ICMP: дозволити
   - ⚠️ **НЕ відкривайте порт 6379** (Redis має бути тільки внутрішнім)

### B2. Встановлення Docker + Compose + Swap

Підключіться до сервера:
```bash
ssh root@SERVER_IP
```

Встановіть Docker та необхідні утиліти:
```bash
apt-get update
apt-get install -y docker.io docker-compose-plugin jq wget
```

Налаштуйте swap (для стабільності при великих навантаженнях):
```bash
swapoff -a || true
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Увімкніть Docker:
```bash
systemctl enable --now docker
```

---

## C) Завантаження коду і секретів

### C1. Копіювання проекту на сервер

**Варіант 1: Через Git (рекомендовано):**
```bash
mkdir -p /opt/kokoro && cd /opt/kokoro
git clone <YOUR_REPO_URL> .
```

**Варіант 2: З локальної машини:**
```bash
# На вашій локальній машині
scp -r ./kokoro-tts root@SERVER_IP:/opt/kokoro

# Перевірка
ssh root@SERVER_IP "cd /opt/kokoro && ls -la"
```

### C2. Створення .env з секретами

На сервері створіть файл `.env`:

```bash
cd /opt/kokoro
cat > .env <<'EOF'
PORT=8080
USE_QUEUE=1
REDIS_HOST=redis
REDIS_PORT=6379
GOOGLE_SERVICE_ACCOUNT_JSON=REPLACE_WITH_ONE_LINE_JSON
KOKORO_MODEL_ID=onnx-community/Kokoro-82M-v1.0-ONNX
KOKORO_DTYPE=q8
KOKORO_DEVICE=cpu
# Опційно для захисту API:
# API_KEY=supersecret
EOF
```

**Для Google Service Account JSON (one-liner):**

Якщо у вас є файл `sa.json` на сервері:
```bash
echo "GOOGLE_SERVICE_ACCOUNT_JSON=$(jq -c . /root/sa.json)" >> /opt/kokoro/.env
```

Або вручну скопіюйте JSON в один рядок і замініть `REPLACE_WITH_ONE_LINE_JSON`.

**⚠️ ВАЖЛИВО:** Поділіться Google Drive папками з Service Account email:
```
texts-dobbi@dobbi-471519.iam.gserviceaccount.com
```
Права: **Editor** або **Writer**

---

## D) Запуск Docker контейнерів

### D1. Збірка та запуск

```bash
cd /opt/kokoro
docker compose up --build -d
```

### D2. Перевірка статусу

```bash
# Статус контейнерів
docker compose ps

# Логи API
docker compose logs -f api

# Логи Worker
docker compose logs -f worker

# Логи Redis
docker compose logs -f redis
```

### D3. Health check

```bash
curl http://SERVER_IP:8080/healthz
# Очікуваний результат: {"ok":true,"timestamp":"..."}
```

### D4. Масштабування воркерів

При необхідності збільште кількість воркерів:
```bash
docker compose up -d --scale worker=2
# або
docker compose up -d --scale worker=3
```

---

## E) Smoke-тест синтезу

### E1. Підготовка Google Drive

1. Створіть папку для вихідних WAV файлів
2. Поділіться нею з `texts-dobbi@dobbi-471519.iam.gserviceaccount.com`
3. Скопіюйте ID папки з URL (після `/folders/`)

### E2. Тест з локальним TXT файлом

```bash
curl -X POST http://SERVER_IP:8080/synthesize \
  -F file=@test-input.txt \
  -F output_folder_id=PASTE_DRIVE_FOLDER_ID
```

### E3. Тест з Google Drive файлом

```bash
curl -X POST http://SERVER_IP:8080/synthesize \
  -F input_txt_file_id=PASTE_TXT_FILE_ID \
  -F output_folder_id=PASTE_DRIVE_FOLDER_ID
```

### E4. Тест з папки Google Drive (останній .txt)

```bash
curl -X POST http://SERVER_IP:8080/synthesize \
  -F input_txt_folder_id=PASTE_INPUT_FOLDER_ID \
  -F output_folder_id=PASTE_OUTPUT_FOLDER_ID
```

### E5. Якщо увімкнений API_KEY

Додайте заголовок до всіх запитів:
```bash
curl -X POST http://SERVER_IP:8080/synthesize \
  -H "X-API-Key: supersecret" \
  -F file=@test-input.txt \
  -F output_folder_id=PASTE_DRIVE_FOLDER_ID
```

---

## F) Інтеграція з n8n

### HTTP Request Node налаштування:

- **Method:** POST
- **URL:** `http://SERVER_IP:8080/synthesize`
- **Body:** Form-Data

**Headers (якщо є API_KEY):**
```
X-API-Key: supersecret
```

**Body Parameters:**
- `file` - завантажений TXT файл (опціонально)
- `input_txt_file_id` - ID файлу в Google Drive (опціонально)
- `input_txt_folder_id` - ID папки в Google Drive (опціонально)
- `output_folder_id` - ID папки для WAV (обов'язково!)
- `voice_id` - голос (default: af_bella)
- `callback_url` - webhook URL для результату (опціонально)

---

## G) Troubleshooting

### Помилка: "Access denied to folder"
**Рішення:** Поділіться Google Drive папкою з `texts-dobbi@dobbi-471519.iam.gserviceaccount.com`

### Контейнер не стартує
```bash
# Перевірте логи
docker compose logs api
docker compose logs worker

# Перезапустіть контейнери
docker compose restart
```

### Порт 8080 зайнятий
Змініть `PORT` в `.env` файлі та в `docker-compose.yml`

### Worker падає
Перевірте, чи Redis доступний:
```bash
docker compose exec redis redis-cli ping
# Має відповісти: PONG
```

---

## H) Оновлення коду

```bash
cd /opt/kokoro
git pull
docker compose up --build -d
```

---

## I) Зупинка та видалення

```bash
# Зупинити всі контейнери
docker compose down

# Зупинити та видалити volumes (включно з Redis даними)
docker compose down -v
```
