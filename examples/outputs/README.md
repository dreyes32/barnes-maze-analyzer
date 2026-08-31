# Example outputs

These files are produced by the same TypeScript functions the application uses (`src/domain/tracking.ts`, `src/domain/pipeline.ts`, `src/export`). They are not hand-edited.

`trial_summary.csv`, `events.csv`, `sample-analysis.barnes.json`, and `barnes-maze-sample-results.xlsx` come from running `scripts/analyze-extracted-frames.ts` on locally downloaded copies of the three Salk sample videos. The MP4s themselves are not in this repository.

A per-point `tracking_points.csv` is not committed here: the portable JSON already contains the effective samples, and a CSV of ~4,000 observations would add bulk without changing the numbers. Export it from the app if you need a spreadsheet of every point.

Important about these numbers:

- **Target hole is not inferred.** Offline regeneration used assisted hole 1 as a placeholder so the pipeline can run unattended. A scientist must select the real target in the Arena step. Primary latency is missing (`NA` / empty) when that placeholder hole was never investigated.
- **Platform diameter is 91 cm** in this export because a centimeter scale is required for path length. That value was entered for the sample run; the app does not assume it.
- **Coverage is not a quality grade.** High coverage can include low-confidence observations. Review the QC warnings in the JSON and the quality timeline in the app.

Regenerate (requires local `.local-data/` videos and extracted frames):

```bash
npx vite-node scripts/analyze-extracted-frames.ts
```

Official source videos: https://github.com/salk-airc/rse-takehome-2026/tree/main/data/barnes-maze

