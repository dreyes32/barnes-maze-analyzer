# Live demo

* **Live demo:** _add the Vercel production URL here after deploy_
* **2–3 minute demo video:** _add an unlisted YouTube / Loom / repo link here_

# Barnes Maze Analyzer

A browser-based analysis tool for Barnes maze recordings. A student can import videos, mark the arena without clicking twenty holes, track the mouse, review uncertain intervals, correct mistakes, and export a spreadsheet of latency, errors, path measures, and search strategy — without a terminal, Python environment, Docker, account, or uploaded data.

## Who this is for

Behavioral neuroscience researchers and students who currently score Barnes maze videos with a stopwatch and a clicker, and who need numbers they can defend in a paper.

## What it does

1. **Videos** — import MP4s, read the real timebase (including `15000/1001` fps), enter animal / cohort / day / trial metadata.
2. **Arena** — click platform center and edge, click one hole, generate the other 19, refine and nudge, choose the target, enter platform diameter in cm. Reuse that layout on later videos.
3. **Track** — classical background-subtraction tracking in a Web Worker, with visible progress and cancel.
4. **Review** — quality timeline, issue queue, frame-by-frame correction, event confirmation. Automatic values are kept.
5. **Results** — metrics, trajectory, occupancy, hole-visit raster, strategy reasoning, CSV / XLSX / `.barnes.json` / print report.

## Why this architecture

The facility asked for something students can actually use. A static client-side page is the shape that matches that request:

- no install
- no login
- no backend to maintain
- research videos never leave the machine
- Vercel (or any static host) is enough

Computer vision runs in the browser with a classical pipeline, not a hosted model. That is a product decision, not a missing feature.

## Quick start

For an evaluator:

1. Open the live URL (or `npm run build && npm run preview` if you are developing).
2. Click **Load demo analysis**.
3. Walk Results → Review → Method settings → Download CSV.

For a developer:

```bash
npm ci
npm run dev
```

Then:

```bash
npm run test
npm run build
npm run e2e
```

## Workflow

| Step | What the scientist does |
|---|---|
| Videos | Drop MP4s. Enter IDs. Relink after reload if the browser cannot reopen the local file. |
| Arena | Two clicks for the platform, one click for a hole. Select the target. Type the real platform diameter. Reuse on the next video. |
| Track | Run tracking. Watch progress. Cancel if needed. |
| Review | Jump to issues. Correct a point or mark hidden-in-hole. Confirm or reject an inferred escape. |
| Results | Read metrics and strategy evidence. Export. |

## Tracking method

For each trial the app:

1. Samples frames across the video and builds a **pixelwise median background** inside the platform.
2. Subtracts that background from later frames so static holes and hardware fade.
3. Masks to the platform so cables and enclosure walls cannot become the animal.
4. Thresholds the difference (Otsu by default; adjustable).
5. Opens/closes the mask to drop speckle and reduce the tail.
6. Scores connected components by area, contrast, motion continuity, and platform membership. Expected area is learned from confident detections.
7. Places the **body** at a thick-core (distance-weighted) centroid, not the raw dark-pixel mean.
8. Estimates a **head** only when the blob axis and recent motion agree. Weak orientation is reported as low head confidence, not a fake nose.

If the tracker cannot support a location, the observation is `failed` or `low-confidence`. Long gaps stay empty unless you explicitly enable short-gap interpolation.

## Behavioral definitions

These are the defaults. All of them are visible and editable in **Method / Analysis settings**.

| Term | Definition used here |
|---|---|
| **Hole investigation** | A contiguous interval where the head (or, if head confidence is weak, the body) stays inside the investigation radius of a hole for at least the minimum duration. Hysteresis and a separation time stop boundary jitter from becoming many events. |
| **Target investigation** | The first valid investigation of the designated target hole. This is **primary latency**. |
| **Escape entry** | Entry into the escape box. Automatic proposals require recent target proximity plus a long enough disappearance that is spatially consistent with that hole. Disappearance alone is not escape. Non-target disappearances are not converted into total latency. |
| **Primary latency** | Time from trial start to first target investigation. Missing if that event never occurs. |
| **Total latency** | Time to confirmed or inferred escape. Uncertain automatic escapes are labeled as such. |
| **Primary errors** | Non-target investigations before the first target investigation. |
| **Total errors** | Non-target investigations up to escape or trial end. |
| **Path length** | Sum of effective body steps that do not cross a failed/hidden gap, converted with platform diameter. Unavailable in cm until diameter is entered. |
| **Speed** | Mean (and median) of step distance / real timestamp delta. Not `pixels × assumed fps`. |
| **Target quadrant** | 90° sector centered on the target-hole direction. Reported in seconds and as a percent of valid tracked time. |
| **Strategy** | Transparent rules: spatial (few primary errors, efficient path), serial (adjacent hole transitions + perimeter occupancy), otherwise random. Hole 20 → 1 is adjacent. The reviewer can override; both labels are exported. |

## Human corrections

A correction is a separate record: timestamp, kind, previous value, new value. The original automatic sample stays in `tracking.rawSamples`. Downstream events, metrics, and strategy recompute from the effective trajectory. Corrections persist in IndexedDB and in `.barnes.json`. Manual points are drawn as squares with a **Manual** label, not color alone.

## Data format

`<session-name>.barnes.json` contains schema version, app version, video fingerprints, metadata, arena geometry, tracking, corrections, events, parameters, metrics, strategy, and QC. Re-opening it restores analysis without retracking. Visual review still needs the original video relinked.

## What leaves the user's machine

For local research videos: **nothing.** Decoding, tracking, annotation, metrics, persistence, and exports run in the browser. Imported recordings are not uploaded to this application or to a third-party vision service.

The deployed site loads its own static JavaScript/CSS. **Load demo analysis** uses a fixture bundled with the app. If you optionally fetch the public Salk sample MP4s to watch them, that request goes to GitHub / the Salk take-home repository — only when you choose to.

## Keys and cost

- No API key.
- No per-analysis API charge.
- Static hosting (Vercel, or equivalent) can run on a free tier for this tool.
- Institutional deployment is a static file drop behind whatever existing web host the core facility already uses. There is no GPU bill and no model-vendor bill.

## Accessibility

Keyboard workflow for steps, trial switching, sample stepping, issue queue, and hole nudging. Visible focus. Labels on inputs. Meaning is not color-only (text, shape, and patterns). 200% zoom stacks the sidebar. Essential actions have buttons, not just drag or hover.

## Tests

- Domain tests for geometry, `15000/1001` timebase, cleanup, events, metrics, strategy, export columns, and session schema.
- Playwright covers load-demo → review correction → reload → parameter change → CSV download, plus keyboard/zoom and axe checks.

Sample-video validation is documented under Known limitations; full-video CV is not run in every CI job.

## Known limitations

### Known defects

- **Head orientation is weak when the mouse is still at the rim.** Those samples get low head confidence and hole events fall back to body/contour evidence. That is reported on the event, not hidden.
- **Automatic escape is a proposal, not a fact.** Target-adjacent disappearance can look like a tracking miss. Low-confidence escapes are queued for review and do not silently become confident total latency.
- **Browser reload cannot reopen an arbitrary local file** without a new picker (or a File System Access handle in Chromium). Analysis is restored; the video must be relinked. The app says so.
- **Seeking every analysis sample in the browser is slower than a native decoder.** test50 (~3 minutes) is practical with ~12 Hz sampling and a progress bar, but it is not real-time on a 2019 laptop. The sampling rate is shown.
- **The bundled demo trajectories are generated by the same event/metric/strategy code as live analysis, but they are not a substitute for running the tracker on the Salk MP4s.** The Results screen labels this **Example analysis**. Use Import + Track on the local sample files for a newly executed run.
- **Automatic platform suggestion can undershoot if it treats the largest bright blob as the maze** (a center hotspot or a wall). The estimator was changed to radial brightness falloff from near the image center after `test53` came out with radius ~89 px. The suggestion is still a suggestion; drag / numeric edit remains required.
- **`examples/outputs` from the three Salk clips (same tracker as the app):** `test50` 97.3% coverage, 31 events, primary latency 93.8 s (target hole 6); `test51` 100% coverage, 12 events, primary latency 36.0 s (target hole 20); `test53` 83.4% coverage, 3 events, primary latency 24.9 s (target hole 3). Target holes were selected manually during arena configuration, as intended by the workflow. The software does not attempt to infer experimental target identity. `test51` coverage near 100% can include intervals where a hole-sized blob was still selected; those should be reviewed, not trusted as continuous visibility. `test53` coverage around 83% is an honest miss rate, not a defect to hide.
- **`test51` file timing:** `test51.mp4` uses a nominal frame rate of `15000/1001 ≈ 14.985 fps`. The analyzer does not assume integer FPS; browser analysis uses source media timestamps for timing calculations. An `mdhd` timescale of `15000` is not itself the frame rate. Duration/frame-count averages and OpenCV `CAP_PROP_FPS` can look like ~15.005 because of leftover `stts` samples; that derived average is not the video's frame rate.

### Deliberately excluded scope

- No accounts, cloud database, or hosted vision API.
- No DeepLabCut / SLEAP import in this version.
- No trained search-strategy classifier.
- No inter-rater scoring UI.
- No MCP server.

## Future improvements

- Stronger pose (or SLEAP/DLC interop) for nose-poke evidence
- Model-assisted corrections after a few manual fixes
- Inter-rater comparison
- Larger-cohort batch queue

## Deployment

The build is static (`npm run build` → `dist/`). Vite `base` is `./` so the app also works from a subdirectory if needed. The intended live host is **Vercel** (Vite, output `dist/`), which serves the app at a root URL. GitHub Actions (`.github/workflows/ci.yml`) remains the test/lint/typecheck/build gate. Videos stay on the user's machine; Vercel only serves the static JS/CSS/HTML.

## License

MIT. Sample videos belong to the [Salk AIRC take-home repository](https://github.com/salk-airc/rse-takehome-2026/tree/main/data/barnes-maze) and are not copied here.
