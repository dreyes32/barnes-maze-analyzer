# Engineering notes

## Layered computation

```text
raw automatic observations
        ↓
cleanup (visible gap fill / smooth / outliers)
        ↓
manual overrides (separate correction records)
        ↓
effective trajectory
        ↓
event detection
        ↓
metrics
        ↓
strategy
```

`src/domain/pipeline.ts` is the only place that should recompute a trial after a correction or parameter change. React components call the session store; they do not implement scientific formulas.

Raw automatic samples are never overwritten. A correction record stores the previous and new values. Undo pops the last correction and recomputes downward.

## Video time

`src/video/mp4Metadata.ts` parses `mdhd` / `stts`. `test51` must come out as `15000/1001 ≈ 14.985`, not 15, not 30, and not a duration/frame-count average near 15.005. The parser reports the modal `stts` sample duration as the nominal fps even when leftover edit samples exist. Tracking uses `HTMLVideoElement.currentTime` after each seek, not `frame/fps`. Manual review can step source frames with that timebase; analysis sampling stays separate.

## Tracking

`src/domain/tracking.ts` and `src/domain/image.ts` implement classical CV:

1. Pixelwise median background from distributed frames
2. Platform mask
3. Absolute difference, Otsu or manual threshold
4. Open/close to suppress the tail and speckle
5. Connected-component scoring (area, contrast, motion, platform membership, ambiguity)
6. Distance-to-background weighted core centroid
7. Head only when the principal axis and recent motion agree

The worker (`src/workers/tracker.worker.ts`) never touches the DOM.

## Persistence

Dexie database `barnes-maze-analyzer` stores the session. Video bytes are not stored. After reload the UI asks the user to relink files and checks name/size/fingerprint.

## Portable file

`.barnes.json` is the documented analysis file. Schema is versioned in `src/domain/types.ts` and validated with Zod.
