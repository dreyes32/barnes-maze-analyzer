import { useMemo } from "react";
import type { ArenaGeometry, TrackingSample } from "../../domain/types";
import { isInTargetQuadrant } from "../../domain/geometry";

export function TrajectoryPlot({
  arena,
  samples,
  title,
  subtitle,
}: {
  arena: ArenaGeometry;
  samples: TrackingSample[];
  title: string;
  subtitle?: string;
}) {
  const size = 420;
  const pad = 28;
  const r = arena.platformRadiusPx;
  const scale = (size - pad * 2) / (r * 2);
  const tx = (x: number) => pad + (x - (arena.platformCenterPx.x - r)) * scale;
  const ty = (y: number) => pad + (y - (arena.platformCenterPx.y - r)) * scale;

  const segments = useMemo(() => {
    const mapX = (x: number) => pad + (x - (arena.platformCenterPx.x - r)) * scale;
    const mapY = (y: number) => pad + (y - (arena.platformCenterPx.y - r)) * scale;
    const out: Array<{ d: string; missing: boolean; manual: boolean }> = [];
    let current: PointLike[] = [];
    let kind: "observed" | "interpolated" | "manual" = "observed";
    const flush = () => {
      if (current.length < 2) {
        current = [];
        return;
      }
      const d = current
        .map((point, index) => `${index === 0 ? "M" : "L"}${mapX(point.x).toFixed(1)},${mapY(point.y).toFixed(1)}`)
        .join(" ");
      out.push({ d, missing: kind === "interpolated", manual: kind === "manual" });
      current = [];
    };
    for (const sample of samples) {
      if (!sample.body || sample.status === "failed") {
        flush();
        continue;
      }
      const nextKind = sample.source === "interpolated" ? "interpolated" : sample.source === "manual" ? "manual" : "observed";
      if (current.length && nextKind !== kind) flush();
      kind = nextKind;
      current.push(sample.body);
    }
    flush();
    return out;
  }, [samples, arena, scale, r]);

  const first = samples.find((sample) => sample.body);
  const last = [...samples].reverse().find((sample) => sample.body);
  const target = arena.holeCentersPx[arena.targetHoleIndex];

  const labelAway = (point: PointLike) => {
    const dx = point.x - arena.platformCenterPx.x;
    const dy = point.y - arena.platformCenterPx.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: tx(point.x + (dx / len) * 18), y: ty(point.y + (dy / len) * 18) };
  };

  return (
    <figure>
      <figcaption>
        <strong>{title}</strong>
        {subtitle ? <div className="help">{subtitle}</div> : null}
      </figcaption>
      <svg viewBox={`0 0 ${size} ${size + 36}`} width="100%" role="img" aria-label={title}>
        <circle
          cx={tx(arena.platformCenterPx.x)}
          cy={ty(arena.platformCenterPx.y)}
          r={arena.platformRadiusPx * scale}
          fill="#f7f2e7"
          stroke="#1c1914"
        />
        <path
          d={quadrantPath(arena, tx, ty, scale)}
          fill="rgba(31,77,92,0.07)"
          stroke="#1f4d5c"
          strokeOpacity={0.45}
          strokeDasharray="4 3"
        />
        {arena.holeCentersPx.map((hole, index) => {
          const isTarget = index === arena.targetHoleIndex;
          return (
            <g key={index}>
              <circle
                cx={tx(hole.x)}
                cy={ty(hole.y)}
                r={arena.holeRadiusPx * scale}
                fill={isTarget ? "#6b2d2d" : "#111"}
                fillOpacity={isTarget ? 0.9 : 0.4}
                stroke={isTarget ? "#1c1914" : "none"}
                strokeWidth={isTarget ? 1.4 : 0}
              />
              {isTarget ? (
                <circle
                  cx={tx(hole.x)}
                  cy={ty(hole.y)}
                  r={arena.holeRadiusPx * scale + 3}
                  fill="none"
                  stroke="#6b2d2d"
                  strokeWidth={1.2}
                />
              ) : null}
              <text
                x={tx(hole.x) + (isTarget ? 8 : 5)}
                y={ty(hole.y) - (isTarget ? 8 : 5)}
                fontSize={isTarget ? 8 : 7}
                fill="#4f4a42"
              >
                {index + 1}
                {isTarget ? " ★" : ""}
              </text>
            </g>
          );
        })}
        {target ? (
          <text x={tx(target.x) + 10} y={ty(target.y) + 12} fontSize="8" fontWeight={600} fill="#6b2d2d">
            TARGET
          </text>
        ) : null}
        {segments.map((segment, index) => (
          <path
            key={index}
            d={segment.d}
            fill="none"
            stroke={segment.manual ? "#3d2a78" : segment.missing ? "#888" : "#1f4d5c"}
            strokeDasharray={segment.missing ? "3 4" : segment.manual ? undefined : "5 3"}
            strokeWidth={segment.manual ? 2 : 1.5}
          />
        ))}
        {samples
          .filter((sample) => sample.source === "manual" && sample.body)
          .map((sample) => (
            <rect
              key={`${sample.timestampSeconds}-m`}
              x={tx(sample.body!.x) - 2.5}
              y={ty(sample.body!.y) - 2.5}
              width={5}
              height={5}
              fill="#3d2a78"
            />
          ))}
        {first?.body ? (
          <>
            <circle cx={tx(first.body.x)} cy={ty(first.body.y)} r={3.5} fill="#1f4d5c" />
            <text x={labelAway(first.body).x} y={labelAway(first.body).y} fontSize="8" fill="#1b1915">
              start
            </text>
          </>
        ) : null}
        {last?.body ? (
          <>
            <rect x={tx(last.body.x) - 3} y={ty(last.body.y) - 3} width={6} height={6} fill="#1b1915" />
            <text x={labelAway(last.body).x} y={labelAway(last.body).y + (first === last ? 10 : 0)} fontSize="8" fill="#1b1915">
              end
            </text>
          </>
        ) : null}
        <g transform={`translate(12 ${size + 8})`} fontSize="8" fill="#4f4a42">
          <circle cx={4} cy={0} r={3} fill="#1f4d5c" />
          <text x={10} y={3}>Start</text>
          <rect x={42} y={-3} width={6} height={6} fill="#1b1915" />
          <text x={52} y={3}>End</text>
          <circle cx={86} cy={0} r={3} fill="none" stroke="#6b2d2d" />
          <text x={92} y={3}>Target</text>
          <line x1={136} y1={0} x2={154} y2={0} stroke="#1f4d5c" strokeDasharray="4 3" />
          <text x={158} y={3}>Automatic</text>
          <line x1={214} y1={0} x2={232} y2={0} stroke="#3d2a78" strokeWidth={2} />
          <text x={236} y={3}>Manual</text>
        </g>
      </svg>
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
