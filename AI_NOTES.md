# AI notes

## Tools / models used

This submission was implemented in **Cursor** with an agentic coding assistant (Cursor Grok 4.6) operating in the local workspace. Repository-level guidance lives in `docs/architecture.md`, `docs/engineering.md`, and `docs/ai-development-log.md`. There is no third-party vision API. An optional local MCP server can query completed `.barnes.json` exports; it does not analyze video.

I directed the work: official Salk brief first, then domain algorithms and tests, then UI, then persistence/export. Generated code was edited when it violated scientific or product rules (timebase, interpolation, escape inference, demo labeling).

## Disagreements / failures

1. **Integer FPS was the easy default.** Early HTML-video fallback code used `fps: 30` when the MP4 box parser failed. That looked reasonable because two of the three samples are 30 fps. It is exactly the class of bug the brief warns about: `test51` is `15000/1001`. The fallback now refuses to invent 30 fps; tests lock `15000/1001` and reject `frame/15` and `frame/30`.

2. **“Missing mouse ⇒ escaped” is the obvious tracker story and the wrong scientific story.** A first escape draft treated a long `failed` interval as entry. On these videos the mouse also vanishes into false holes, and the tracker can simply lose the blob. Escape now requires recent target proximity (and benefits from a recent target investigation). Generic loss and non-target disappearance stay non-escape in tests.

3. **Automatic event IDs were initially regenerated with random UUIDs during every recomputation.** Because manual event corrections referenced those IDs, a rejected or edited automatic event could return after recomputation. The issue was found during code review. Automatic detections now use deterministic identities, and regression tests verify rejection/edit persistence through `recomputeTrial()`.

## Verification

Before treating a result as real: Vitest domain tests (timebase, cleanup, events, metrics, strategy, schema, CSV columns, dominant-`stts` duration including leftover samples that would average to ~15.005); TypeScript + production build; the same tracker run on extracted frames from all three Salk MP4s with **manually inspected target holes** (not a placeholder); Playwright Chromium for load-demo → correct → metrics change → reload persistence → CSV export; manual inspection of the official stills before choosing background subtraction. An early largest-bright-blob platform guess also failed on `test53` (center ≈ 212, 201, r ≈ 89 vs maze r ≈ 185); radial falloff plus a double-scale fix produced plausible circles on all three clips. Sample MP4s were downloaded only into `.local-data/` and are not committed.
