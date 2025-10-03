#!/usr/bin/env python3
"""
Video Worker for RunPod Serverless
Renders videos using FFmpeg with NVENC (RTX 4090)
"""
import os
import sys
import json
import tempfile
import subprocess
import requests
import time
import shutil
import pathlib
import re
from urllib.parse import urlparse


def download_file(url, dst, chunk_size=1024*1024):
    """Download file from pre-signed URL"""
    print(f"📥 Downloading {os.path.basename(dst)}...")
    with requests.get(url, stream=True, timeout=600) as r:
        r.raise_for_status()
        with open(dst, "wb") as f:
            for chunk in r.iter_content(chunk_size=chunk_size):
                if chunk:
                    f.write(chunk)
    print(f"✅ Downloaded {os.path.basename(dst)}")


def upload_file(url, src, content_type="video/mp4"):
    """Upload file to pre-signed URL"""
    print(f"📤 Uploading {os.path.basename(src)}...")
    with open(src, "rb") as f:
        r = requests.put(url, data=f, headers={"Content-Type": content_type}, timeout=1800)
        r.raise_for_status()
    print(f"✅ Uploaded {os.path.basename(src)}")


def post_status(url, data):
    """Post status update (best effort, don't fail if it errors)"""
    if not url:
        return
    try:
        requests.post(url, json=data, timeout=10)
    except Exception as e:
        print(f"⚠️ Failed to post status: {e}")


def extract_filename(url):
    """Extract filename from URL (before query params)"""
    path = urlparse(url).path
    return os.path.basename(path)


def render_video(work_dir, params, frame_ext=".jpg"):
    """Render video using FFmpeg with NVENC"""
    frames_dir = work_dir / "frames"
    audio_file = work_dir / "audio"
    person_file = work_dir / "person.png"
    output_file = work_dir / "final.mp4"

    fps = int(params.get("fps", 30))
    resolution = params.get("resolution", "1080x1920")
    codec = params.get("codec", "h264_nvenc")

    # Count frames - use the extension we know we downloaded
    frame_pattern = f"*{frame_ext}"
    frame_files = sorted(frames_dir.glob(frame_pattern))
    if not frame_files:
        raise ValueError(f"No frames found with pattern {frame_pattern}!")

    print(f"🎬 Rendering {len(frame_files)} frames at {fps}fps, resolution {resolution}")

    # Build FFmpeg command
    # Disable GPU for now - FFmpeg doesn't have NVENC/NPP filters
    use_gpu = False  # Force CPU encoding until we fix FFmpeg build

    cmd = ["ffmpeg", "-y"]

    # Input frames with correct extension
    input_pattern = f"%06d{frame_ext}"
    cmd += [
        "-framerate", str(fps),
        "-i", str(frames_dir / input_pattern)
    ]

    # Video filter chain (CPU only)
    w, h = resolution.split('x')
    vf = [f"scale={w}:{h}"]

    # Add person overlay if exists (CPU only)
    if person_file.exists():
        print("👤 Adding person overlay")
        cmd += ["-i", str(person_file)]
        w, h = resolution.split('x')
        vf = [
            f"scale={w}:{h}",
            "overlay=(W-w)/2:(H-h)/2",
            "format=yuv420p"
        ]

    # Add audio if exists
    if audio_file.exists():
        print("🎵 Adding audio track")
        cmd += ["-i", str(audio_file), "-shortest"]

    # Add video filters
    cmd += ["-vf", ",".join(vf)]

    # Video encoding settings (CPU libx264)
    cmd += [
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-pix_fmt", "yuv420p"
    ]

    # Add audio codec if audio exists
    if audio_file.exists():
        cmd += ["-c:a", "aac", "-b:a", "192k"]

    cmd.append(str(output_file))

    print(f"🚀 Running FFmpeg: {' '.join(cmd)}")

    # Run FFmpeg with progress monitoring
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )

    # Collect all output
    ffmpeg_output = []
    for line in proc.stdout:
        print(line.rstrip())
        ffmpeg_output.append(line)

    code = proc.wait()
    if code != 0:
        # Include last 20 lines of output in error
        error_context = ''.join(ffmpeg_output[-20:]) if len(ffmpeg_output) > 20 else ''.join(ffmpeg_output)
        raise RuntimeError(f"FFmpeg exited with code {code}. Last output:\n{error_context}")

    print(f"✅ Video rendered: {output_file}")
    return output_file


def process_job(job):
    """Process a single rendering job"""
    print("🎬 Video Worker: Processing job...")
    print(f"📦 Raw job structure: {json.dumps(job, indent=2)[:500]}")

    # Handle different RunPod input structures
    if "input" in job:
        payload = job["input"]
    else:
        payload = job

    job_id = payload.get("job_id", "unknown")
    params = payload.get("params", {})
    inputs = payload["inputs"]
    output = payload["output"]
    progress_url = payload.get("progress_url")
    callback_url = payload.get("orchestrator_callback")

    print(f"📋 Job ID: {job_id}")
    print(f"📋 Channel: {payload.get('channel', 'unknown')}")

    # Create work directory
    work_dir = pathlib.Path(tempfile.mkdtemp(prefix=f"{job_id}_"))
    print(f"📁 Work directory: {work_dir}")

    frames_dir = work_dir / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    overlays_dir = work_dir / "overlays"
    overlays_dir.mkdir(exist_ok=True)

    post_status(progress_url, {"percent": 10, "message": "Downloading inputs..."})

    # Download frames - detect actual format from content-type
    frame_ext = None
    for idx, url in enumerate(inputs.get("frames", []), start=1):
        # Download and detect real format
        response = requests.head(url, timeout=10)
        content_type = response.headers.get('content-type', '').lower()

        # Determine extension based on actual content type
        if 'jpeg' in content_type or 'jpg' in content_type:
            ext = ".jpg"
        elif 'png' in content_type:
            ext = ".png"
        else:
            # Fallback: try from URL
            if url.lower().endswith(('.jpg', '.jpeg')):
                ext = ".jpg"
            else:
                ext = ".png"

        if frame_ext is None:
            frame_ext = ext  # Remember first frame extension

        download_file(url, frames_dir / f"{idx:06d}{ext}")

    # Download audio (optional)
    audio_url = inputs.get("audio")
    if audio_url:
        ext = os.path.splitext(extract_filename(audio_url))[1]
        download_file(audio_url, work_dir / f"audio{ext}")

    # Download overlays (optional)
    for url in inputs.get("overlays", []):
        filename = extract_filename(url)
        download_file(url, overlays_dir / filename)

    # Download person overlay (optional)
    person_url = inputs.get("person")
    if person_url:
        download_file(person_url, work_dir / "person.png")

    # Download text (optional)
    text_url = inputs.get("text")
    if text_url:
        download_file(text_url, work_dir / "text.txt")

    post_status(progress_url, {"percent": 30, "message": "Rendering video..."})

    # Render video (pass frame extension)
    output_file = render_video(work_dir, params, frame_ext or ".jpg")

    post_status(progress_url, {"percent": 90, "message": "Uploading result..."})

    # Upload result
    upload_file(output["put_url"], output_file)

    # Notify completion
    post_status(callback_url, {
        "job_id": job_id,
        "status": "completed",
        "output_url": output["public_url"]
    })

    post_status(progress_url, {"percent": 100, "message": "Done!"})

    print(f"✅ Job {job_id} completed successfully")
    print(f"🎥 Output: {output['public_url']}")

    # Cleanup
    try:
        shutil.rmtree(work_dir)
        print("🧹 Cleaned up work directory")
    except Exception as e:
        print(f"⚠️ Failed to cleanup: {e}")

    return {
        "status": "completed",
        "output_url": output["public_url"]
    }


def handler(job):
    """
    RunPod Serverless handler function
    This is called by RunPod with the job payload
    """
    try:
        result = process_job(job)
        return result
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

        # Try to notify failure
        try:
            callback_url = job["input"].get("orchestrator_callback")
            job_id = job["input"].get("job_id", "unknown")
            post_status(callback_url, {
                "job_id": job_id,
                "status": "failed",
                "error": str(e)
            })
        except:
            pass

        return {
            "status": "failed",
            "error": str(e)
        }


if __name__ == "__main__":
    # For local testing
    import runpod
    runpod.serverless.start({"handler": handler})
