import type { ArenaGeometry, TrackingSample } from "../../domain/types";

export function OccupancyHeatmap({
  arena,
  samples,
}: {
  arena: ArenaGeometry;
  samples: TrackingSample[];
}) {
  const bins = 24;
  const counts = Array.from({ length: bins * bins }, () => 0);
  const minX = arena.platformCenterPx.x - arena.platformRadiusPx;
  const minY = arena.platformCenterPx.y - arena.platformRadiusPx;
  const size = arena.platformRadiusPx * 2;
  for (const sample of samples) {
    if (!sample.body || sample.source === "interpolated") continue;
    const bx = Math.floor(((sample.body.x - minX) / size) * bins);
    const by = Math.floor(((sample.body.y - minY) / size) * bins);
    if (bx >= 0 && by >= 0 && bx < bins && by < bins) counts[by * bins + bx] += 1;
  }
  const max = Math.max(1, ...counts);
  return (
    <figure>
      <figcaption className="sr-only">Occupancy heatmap</figcaption>
      <svg viewBox={`0 0 ${bins} ${bins}`} width="100%" role="img" aria-label="Occupancy heatmap">
        {counts.map((count, index) => {
          const x = index % bins;
          const y = Math.floor(index / bins);
          const t = count / max;
          const shade = Math.round(255 - t * 180);
          return <rect key={index} x={x} y={y} width={1} height={1} fill={`rgb(${shade},${shade - 10},${shade - 20})`} />;
        })}
      </svg>
    </figure>
  );
}
