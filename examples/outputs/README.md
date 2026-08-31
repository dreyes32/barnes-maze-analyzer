# Example outputs

These files are produced by the same TypeScript functions the application uses (`src/domain/tracking.ts`, `src/domain/pipeline.ts`, `src/export`). They are not hand-edited.

`trial_summary.csv`, `events.csv`, `sample-analysis.barnes.json`, and `barnes-maze-sample-results.xlsx` come from running `scripts/analyze-extracted-frames.ts` on locally downloaded copies of the three Salk sample videos. The MP4s themselves are not in this repository.

A per-point `tracking_points.csv` is not committed here: the portable JSON already contains the effective samples, and a CSV of ~4,000 observations would add bulk without changing the numbers. Export it from the app if you need a spreadsheet of every point.

Important about these numbers:

- **Target holes were selected manually during arena configuration, as intended by the workflow.** The software does not attempt to infer experimental target identity. Inspected selections (1-based overlay numbers, stored in `scripts/reviewed-targets.json`):
  - `test50` — hole 6 (mouse remains at the 6 o'clock hole through trial end)
  - `test51` — hole 20 (mouse is at the 2 o'clock hole at trial end)
  - `test53` — hole 3 (mouse is at the 4 o'clock hole from ~25 s through trial end)
- **`test51.mp4` uses a nominal frame rate of `15000/1001 ≈ 14.985 fps`.** The analyzer does not assume integer FPS. Browser analysis uses source media timestamps. Duration/frame-count averages near 15.005 are a container artifact, not the advertised frame rate.
- **Platform diameter is 91 cm** in this export because a centimeter scale is required for path length. That value was entered for the sample run; the app does not assume it.
- **Coverage is not a quality grade.** High coverage can include low-confidence observations. Review the QC warnings in the JSON and the quality timeline in the app.

Regenerate (requires local `.local-data/` videos and extracted frames):

```bash
npx vite-node scripts/analyze-extracted-frames.ts
```

Official source videos: https://github.com/salk-airc/rse-takehome-2026/tree/main/data/barnes-maze
