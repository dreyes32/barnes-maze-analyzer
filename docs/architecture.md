# Architecture — Barnes Maze Analyzer

## Product decision

Barnes Maze Analyzer is a **fully client-side static web application**.

A neuroscience student opens a URL (or a local `index.html` after a static build), imports videos from their computer, and works through arena setup, tracking, review, and export without a terminal, Python environment, Docker, account, or backend.

This is intentional:

- Facility users will not install Python, conda, or Node.
- Barnes maze videos are IACUC-covered research recordings and should stay on the user's machine.
- A static host (Vercel, or equivalent) has negligible cost and no per-analysis API charge.
- There is no login because this is a single-user analysis tool (Task 1 exemption).

Imported research videos are decoded and analyzed in the browser. They are not uploaded to this application or to a third-party vision service.

## Stack

| Layer | Choice | Why |
|---|---|---|
| UI | React + TypeScript + Vite | Static build, typed UI, no server |
| State | Zustand | Small, explicit session store |
| Persistence | Dexie / IndexedDB | Survives refresh; large tracking arrays do not belong in `localStorage` |
| Validation | Zod | Portable `.barnes.json` and imported sessions |
| Video time | Lightweight MP4 box parser + `HTMLVideoElement` | Real timescale (including `15000/1001`), not assumed 30 fps |
| Computer vision | Classical pipeline in a Web Worker | Transparent, no GPU, no API key |
| Spreadsheets | ExcelJS + CSV writers | Browser-generated XLSX/CSV |
| Tests | Vitest + Playwright | Domain tests in CI; lightweight E2E |

## Scientific pipeline (do not collapse these layers)

```text
raw automatic observations
        ↓
cleanup (gap fill / smooth / outliers — optional, visible)
        ↓
manual overrides (stored separately; never overwrite raw)
        ↓
effective trajectory
        ↓
event detection
        ↓
metrics
        ↓
strategy
```

A parameter change or correction recomputes from the affected layer downward. Raw automatic samples are retained for provenance.

## Module map

- `src/domain/` — typed schemas and scientific algorithms. No React.
- `src/video/` — MP4 metadata, fingerprinting, frame capture.
- `src/workers/` — tracking worker and client progress/cancel API.
- `src/persistence/` — IndexedDB, migrations, session I/O.
- `src/state/` — Zustand session store.
- `src/export/` — CSV, XLSX, JSON, figures, ZIP.
- `src/components/` — researcher-facing UI.
- `src/demo/` — labeled example-analysis fixtures (not presented as a fresh run).

## Video time

Timestamps come from the file timebase or from `requestVideoFrameCallback` media time.

Do **not** compute `frame / 30`. `test51.mp4` is `15000/1001 ≈ 14.985` fps. If the source appears variable-frame-rate, timestamps are authoritative and frame indices are labeled approximate.

## What is not in this architecture

- Authentication / accounts
- Hosted vision APIs
- Required Python or Docker for scientists
- A backend
- Fake ML classifiers
