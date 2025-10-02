# Building and Deploying Video Worker

## Option 1: Docker Hub

1. Login to Docker Hub:
```bash
docker login
```

2. Build the image:
```bash
cd video-worker
docker build -t YOUR_DOCKERHUB_USERNAME/video-worker:1.0.0 .
```

3. Push to Docker Hub:
```bash
docker push YOUR_DOCKERHUB_USERNAME/video-worker:1.0.0
```

4. Use in RunPod:
```
Container Image: YOUR_DOCKERHUB_USERNAME/video-worker:1.0.0
```

## Option 2: GitHub Container Registry

1. Create GitHub Personal Access Token with `write:packages` permission

2. Login to GitHub Container Registry:
```bash
echo YOUR_GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

3. Build the image:
```bash
cd video-worker
docker build -t ghcr.io/YOUR_GITHUB_USERNAME/video-worker:1.0.0 .
```

4. Push to GitHub:
```bash
docker push ghcr.io/YOUR_GITHUB_USERNAME/video-worker:1.0.0
```

5. Make package public in GitHub (Settings → Packages → video-worker → Package settings → Change visibility to Public)

6. Use in RunPod:
```
Container Image: ghcr.io/YOUR_GITHUB_USERNAME/video-worker:1.0.0
```

## RunPod Serverless Configuration

- **GPU Type**: RTX 4090
- **Container Image**: (from above)
- **Container Start Command**: (leave empty - uses ENTRYPOINT from Dockerfile)
- **Min Workers**: 0 (or 1 if you want always-on)
- **Max Workers**: 3
- **GPUs per Worker**: 1
- **Container Disk**: 10 GB
- **Environment Variables**: None needed (all passed via payload)

## After Creating Endpoint

Copy the **Endpoint ID** and add to `.env`:
```
RUNPOD_ENDPOINT_ID=your-endpoint-id-here
```

Get your **RunPod API Key** from Settings and add to `.env`:
```
RUNPOD_API_KEY=your-runpod-api-key-here
```
