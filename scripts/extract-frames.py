"""Extract grayscale frames from local Salk sample videos for offline tracking."""
from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    import cv2
except ImportError:
    sys.stderr.write("opencv-python is required: pip install opencv-python-headless\n")
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / ".local-data"
OUT = ROOT / ".local-data" / "frames-raw"
OUT.mkdir(parents=True, exist_ok=True)

for video in sorted(SRC.glob("test*.mp4")):
    dest = OUT / video.stem
    dest.mkdir(exist_ok=True)
    cap = cv2.VideoCapture(str(video))
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0)
    count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    print(f"{video.name}: fps={fps} frames={count}")
    index = 0
    written = 0
    times = []
    stride = max(1, round(fps / 12.0)) if fps else 2
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if index % stride == 0:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            raw_path = dest / f"{written:05d}.bin"
            raw_path.write_bytes(gray.tobytes())
            times.append(index / fps if fps else written / 12.0)
            written += 1
        index += 1
    cap.release()
    height, width = gray.shape
    manifest = {
        "fileName": video.name,
        "width": int(width),
        "height": int(height),
        "sourceFps": fps,
        "sourceFrameCount": count,
        "timestamps": times,
        "fileSize": video.stat().st_size,
    }
    (dest / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    print(f"  wrote {written} frames ({width}x{height}) to {dest} stride={stride}")
