# Video Worker for RunPod Serverless

GPU-accelerated video rendering worker for RTX 4090 using FFmpeg with NVENC.

## Features

- Downloads video frames, audio, and overlays from R2 pre-signed URLs
- Renders video using FFmpeg with NVIDIA NVENC (H.264)
- Supports person overlays and Fx effects
- Uploads final video back to R2
- Progress reporting and error handling

## Docker Image

Built automatically via GitHub Actions and pushed to GitHub Container Registry.

**Image**: `ghcr.io/mavlik/video-worker:latest`

## Usage

This worker is designed to run on RunPod Serverless with RTX 4090 GPUs.

### Input Payload

```json
{
  "job_id": "unique-job-id",
  "channel": "ChannelName",
  "inputs": {
    "frames": ["https://r2.../frame1.jpg", "https://r2.../frame2.jpg"],
    "audio": "https://r2.../audio.mp3",
    "person": "https://r2.../person.png",
    "overlays": ["https://r2.../fx.mp4"]
  },
  "params": {
    "resolution": "1080x1920",
    "fps": 30,
    "codec": "h264_nvenc"
  },
  "output": {
    "put_url": "https://r2.../output.mp4?signature=...",
    "public_url": "https://r2.../output.mp4"
  },
  "progress_url": "https://api.../jobs/{id}/progress",
  "orchestrator_callback": "https://api.../internal/callback"
}
```

### Output

Sends completion status to `orchestrator_callback`:

```json
{
  "job_id": "unique-job-id",
  "status": "completed",
  "output_url": "https://r2.../output.mp4"
}
```

Or on failure:

```json
{
  "job_id": "unique-job-id",
  "status": "failed",
  "error": "Error message"
}
```

## Local Testing

```bash
# Build
docker build -t video-worker .

# Run with test payload
echo '{"job_id":"test","inputs":{...}}' | docker run --rm -i video-worker
```

## Environment

- Base: `nvidia/cuda:12.1.1-runtime-ubuntu22.04`
- FFmpeg with NVENC support
- Python 3 with requests library
