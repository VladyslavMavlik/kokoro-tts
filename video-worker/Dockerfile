FROM nvidia/cuda:12.1.1-runtime-ubuntu22.04

# Install FFmpeg with NVENC support and Python
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy worker script
COPY worker.py .

# Set entrypoint
ENTRYPOINT ["python3", "/app/worker.py"]
