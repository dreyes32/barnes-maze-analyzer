import { useMemo } from "react";
import type { ArenaGeometry, TrackingSample } from "../../domain/types";
import { isInTargetQuadrant } from "../../domain/geometry";

export function TrajectoryPlot({
  arena,
  samples,
  title,
}: {
  arena: ArenaGeometry;
  samples: TrackingSample[];
  title: string;
}) {
  const size = 420;
  const pad = 16;
  const r = arena.platformRadiusPx;
  const scale = (size - pad * 2) / (r * 2);
  const tx = (x: number) => pad + (x - (arena.platformCenterPx.x - r)) * scale;
  const ty = (y: number) => pad + (y - (arena.platformCenterPx.y - r)) * scale;

  const segments = useMemo(() => {
    const mapX = (x: number) => pad + (x - (arena.platformCenterPx.x - r)) * scale;
    const mapY = (y: number) => pad + (y - (arena.platformCenterPx.y - r)) * scale;
    const out: Array<{ d: string; missing: boolean; manual: boolean }> = [];
    let current: PointLike[] = [];
    const flush = (missing: boolean, manual: boolean) => {
      if (current.length < 2) {
        current = [];
        return;
      }
      const d = current
        .map((point, index) => `${index === 0 ? "M" : "L"}${mapX(point.x).toFixed(1)},${mapY(point.y).toFixed(1)}`)
        .join(" ");
      out.push({ d, missing, manual });
      current = [];
    };
    for (let i = 0; i < samples.length; i += 1) {
      const sample = samples[i];
      if (!sample.body || sample.status === "failed") {
        flush(false, false);
        continue;
      }
      current.push(sample.body);
      if (sample.source === "interpolated") {
        flush(true, false);
      }
    }
    flush(false, false);
    return out;
  }, [samples, arena, scale, r]);

  const first = samples.find((sample) => sample.body);
  const last = [...samples].reverse().find((sample) => sample.body);

  return (
    <figure>
      <figcaption>
        <strong>{title}</strong>
      </figcaption>
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" role="img" aria-label={title}>
        <circle
          cx={tx(arena.platformCenterPx.x)}
          cy={ty(arena.platformCenterPx.y)}
          r={arena.platformRadiusPx * scale}
          fill="#f7f2e7"
          stroke="#1c1914"
        />
        <path
          d={quadrantPath(arena, tx, ty, scale)}
          fill="rgba(31,77,92,0.12)"
          stroke="#1f4d5c"
          strokeDasharray="4 3"
        />
        {arena.holeCentersPx.map((hole, index) => (
          <g key={index}>
            <circle
              cx={tx(hole.x)}
              cy={ty(hole.y)}
              r={arena.holeRadiusPx * scale}
              fill={index === arena.targetHoleIndex ? "#6b2d2d" : "#111"}
              fillOpacity={index === arena.targetHoleIndex ? 0.85 : 0.55}
            />
            <text x={tx(hole.x) + 6} y={ty(hole.y) - 6} fontSize="10">
              {index + 1}
              {index === arena.targetHoleIndex ? " T" : ""}
            </text>
          </g>
        ))}
        {segments.map((segment, index) => (
          <path
            key={index}
            d={segment.d}
            fill="none"
            stroke={segment.missing ? "#888" : "#1f4d5c"}
            strokeDasharray={segment.missing ? "3 4" : undefined}
            strokeWidth={1.6}
          />
        ))}
        {samples
          .filter((sample) => sample.source === "manual" && sample.body)
          .map((sample) => (
            <rect
              key={`${sample.timestampSeconds}-m`}
              x={tx(sample.body!.x) - 3}
              y={ty(sample.body!.y) - 3}
              width={6}
              height={6}
              fill="#3d2a78"
            />
          ))}
        {first?.body ? (
          <text x={tx(first.body.x)} y={ty(first.body.y) + 12} fontSize="11">
            start
          </text>
        ) : null}
        {last?.body ? (
          <text x={tx(last.body.x)} y={ty(last.body.y) + 12} fontSize="11">
            end
          </text>
        ) : null}
      </svg>
      <div className="vis-legend">
        <span>Solid = observed path</span>
        <span>Dashed = interpolated / not connected across long gaps</span>
        <span>Squares = manual</span>
        <span>Shaded wedge = target quadrant</span>
      </div>
    </figure>
  );
}

type PointLike = { x: number; y: number };

function quadrantPath(
  arena: ArenaGeometry,
  tx: (x: number) => number,
  ty: (y: number) => number,
  scale: number,
): string {
  const target = arena.holeCentersPx[arena.targetHoleIndex];
  if (!target) return "";
  const mid = Math.atan2(target.y - arena.platformCenterPx.y, target.x - arena.platformCenterPx.x);
  const a0 = mid - Math.PI / 4;
  const a1 = mid + Math.PI / 4;
  const r = arena.platformRadiusPx * scale;
  const cx = tx(arena.platformCenterPx.x);
  const cy = ty(arena.platformCenterPx.y);
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1} Z`;
}

void isInTargetQuadrant;
