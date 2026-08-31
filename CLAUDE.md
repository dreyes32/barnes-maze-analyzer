# Barnes Maze Analyzer — agent notes

- Official brief: https://github.com/salk-airc/rse-takehome-2026
- Domain logic lives in `src/domain/`. Do not put scientific formulas in React components.
- Never assume 30 fps. `test51` is 15000/1001.
- Never silently interpolate long gaps or treat disappearance as escape.
- Do not commit sample MP4s.
- Do not hard-code filenames `test50` / `test51` / `test53` in the tracker.
- Corrections are append-only records. Raw automatic samples stay intact.
