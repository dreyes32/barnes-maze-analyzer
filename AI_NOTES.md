# AI notes

## Tools / models used

This submission was implemented in **Cursor** with an agentic coding assistant (Cursor Grok 4.6) operating in the local workspace. Repository-level guidance lives in `docs/architecture.md`, `docs/engineering.md`, and `docs/ai-development-log.md`. There is no custom MCP server and no third-party vision API.

I directed the work: official Salk brief first, then domain algorithms and tests, then UI, then persistence/export. Generated code was edited when it violated scientific or product rules (timebase, interpolation, escape inference, demo labeling).

## Disagreements / failures

1. **Integer FPS was the easy default.** Early HTML-video fallback code used `fps: 30` when the MP4 box parser failed. That looked reasonable because two of the three samples are 30 fps. It is exactly the class of bug the brief warns about: `test51` is `15000/1001`. The fallback now refuses to invent 30 fps; tests lock `15000/1001` and reject `frame/15` and `frame/30`.

2. **“Missing mouse ⇒ escaped” is the obvious tracker story and the wrong scientific story.** A first escape draft treated a long `failed` interval as entry. On these videos the mouse also vanishes into false holes, and the tracker can simply lose the blob. Escape now requires recent target proximity (and benefits from a recent target investigation). Generic loss and non-target disappearance stay non-escape in tests.

3. **Largest-bright-blob circle detection failed on `test53`.** A first automatic platform estimate used the largest bright component. On `test53` that produced center ≈ (212, 201) and radius ≈ 89 px (the maze is closer to r ≈ 185). Coverage was 0%. Replaced with radial brightness falloff from near the image center; all three clips then got plausible circles. An offline helper also double-scaled arena coordinates (geometry from already-downsampled frames plus `scale: 0.5`); that was a second, independent 0% coverage bug and was aligned with the browser client.

## Verification

Before treating a result as real: Vitest domain tests (timebase, cleanup, events, metrics, strategy, schema, CSV columns, dominant-`stts` duration including leftover samples that would average to ~15.005); TypeScript + production build; the same tracker run on extracted frames from all three Salk MP4s with **manually inspected target holes** (not a placeholder); Playwright Chromium for load-demo → correct → metrics change → reload persistence → CSV export; manual inspection of the official stills before choosing background subtraction. Sample MP4s were downloaded only into `.local-data/` and are not committed.
