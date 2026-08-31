# AI development log

Working journal of genuine disagreements, failed approaches, and corrections during implementation. Source material for `AI_NOTES.md`.

## 2026-08-31 — Sample footage inspection before thresholds

Inspected official Salk frames for `test50`, `test51`, and `test53` before writing tracker constants.

Observed:

- All three are overhead grayscale 640×480 Barnes mazes with 20 rim holes.
- The mouse is dark on a light platform; holes are also dark.
- The tail is long and high-contrast in every clip.
- Framing and lighting differ: `test50` shows a bottom cable; `test51` has enclosure walls left/right; `test53` has stronger center hotspot and more visible hardware.

Decision: do not tune exclusively against one clip; use platform masking + background subtraction rather than global dark-pixel search.

## 2026-08-31 — Node install

Winget Node.js LTS installer requested administrator elevation and was cancelled. Switched to a portable Node.js zip under `.tools/` (gitignored) so the project can be built without admin rights.

## 2026-08-31 — Invented 30 fps fallback

An early `probeVideoFile` draft set `timebase.fps = 30` when MP4 parsing failed and only `HTMLVideoElement` metadata existed. That is convenient for `test50`/`test53` and silently wrong for `test51`. Removed. If the box parser cannot read a timescale, fps is omitted rather than assumed.

## 2026-08-31 — Escape-from-disappearance

A first `inferEscapeEntry` sketch treated any long failed interval as escape. Tests for generic loss and non-target-hole disappearance failed that idea immediately. Replaced with target-proximity + disappearance duration + optional recent target visit. Automatic escapes stay inferred until confirmed.

## 2026-08-31 — Offline tracker double-scaled the arena

A helper script downsampled frames to 0.5 and also built arena geometry from those downsampled pixels, then passed `scale: 0.5` into `trackFrame`. The worker API expects arena coordinates in *source* pixels. The platform mask landed in the wrong place; test53 coverage was 0%. Fixed by estimating geometry in source pixels, matching the browser client.

## 2026-08-31 — OpenCV fps is not the file timebase

OpenCV `CAP_PROP_FPS` reported `15.005` for `test51.mp4`. The MP4 `stts`/`mdhd` timebase is `15000/1001 ≈ 14.985`. Using OpenCV fps for scientific timestamps would have been a quieter version of the integer-15 bug. The app parser and tests use the box timebase.

## 2026-08-31 — Demo vs live analysis

A constructed example session is useful for cold-open evaluation, but it must not be presented as a fresh tracker run. The UI labels it **Example analysis**. Live tracking still requires local files.
