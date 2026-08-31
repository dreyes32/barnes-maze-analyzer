"""Convert already-extracted PNGs into grayscale .bin + manifest.json."""
from __future__ import annotations

import json
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / ".local-data" / "frames-raw"
VIDEOS = {
    "test50": {"fileName": "test50.mp4", "fps": 30.0, "frames": 5539, "size": 2333495},
    "test51": {"fileName": "test51.mp4", "fps": 15000 / 1001, "frames": 741, "size": 455830},
    "test53": {"fileName": "test53.mp4", "fps": 30.0, "frames": 905, "size": 496723},
}

for name, meta in VIDEOS.items():
    dest = RAW / name
    pngs = sorted(dest.glob("*.png"))
    if not pngs:
        print("skip", name)
        continue
    first = cv2.imread(str(pngs[0]), cv2.IMREAD_GRAYSCALE)
    height, width = first.shape
    times = []
    source_fps = meta["fps"]
    stride = max(1, round(meta["frames"] / max(len(pngs), 1)))
    for i, png in enumerate(pngs):
        gray = cv2.imread(str(png), cv2.IMREAD_GRAYSCALE)
        (dest / f"{i:05d}.bin").write_bytes(gray.tobytes())
        times.append(i * stride / source_fps)
    manifest = {
        "fileName": meta["fileName"],
        "width": int(width),
        "height": int(height),
        "sourceFps": source_fps,
        "sourceFrameCount": meta["frames"],
        "timestamps": times,
        "fileSize": meta["size"],
    }
    (dest / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    print(name, "frames", len(pngs), width, height)
