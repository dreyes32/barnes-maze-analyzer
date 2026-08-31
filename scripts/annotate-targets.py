"""Overlay numbered holes from the latest analysis JSON onto late frames."""
from __future__ import annotations

import json
from pathlib import Path

import cv2

root = Path(__file__).resolve().parents[1]
session = json.loads((root / "examples/outputs/sample-analysis.barnes.json").read_text(encoding="utf-8"))
out = root / ".local-data" / "target-review"
out.mkdir(exist_ok=True)

picks = {
    "test50.mp4": "test50_184.0s.jpg",
    "test51.mp4": "test51_47.0s.jpg",
    "test53.mp4": "test53_28.0s.jpg",
}

for trial in session["trials"]:
    name = trial["source"]["fileName"]
    if name not in picks:
        continue
    img_path = out / picks[name]
    image = cv2.imread(str(img_path))
    if image is None:
        print("missing", img_path)
        continue
    arena = trial["arena"]
    for i, hole in enumerate(arena["holeCentersPx"]):
        x, y = int(hole["x"]), int(hole["y"])
        color = (0, 0, 255) if i == arena["targetHoleIndex"] else (0, 180, 255)
        cv2.circle(image, (x, y), 10, color, 1)
        cv2.putText(image, str(i + 1), (x + 6, y - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (20, 20, 20), 2)
        cv2.putText(image, str(i + 1), (x + 6, y - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
    dest = out / f"{Path(name).stem}_holes.jpg"
    cv2.imwrite(str(dest), image)
    print(name, "target", arena["targetHoleIndex"] + 1, "->", dest)
