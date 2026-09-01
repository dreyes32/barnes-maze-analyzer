import type { ArenaGeometry, BehavioralEvent } from "../../domain/types";

function timeTicks(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [0];
  const step = duration <= 60 ? 10 : duration <= 180 ? 30 : 60;
  const ticks = [0];
  for (let t = step; t < duration; t += step) ticks.push(t);
  if (ticks[ticks.length - 1] !== Math.round(duration) && duration - ticks[ticks.length - 1] > step * 0.25) {
    ticks.push(duration);
  } else if (ticks[ticks.length - 1] < duration) {
    ticks.push(duration);
  }
  return ticks;
}

export function EventRaster({
  events,
  duration,
  arena,
  onSelect,
}: {
  events: BehavioralEvent[];
  duration: number;
  arena?: ArenaGeometry;
  onSelect: (event: BehavioralEvent) => void;
}) {
  const ticks = timeTicks(duration);
  const plotLeft = 48;
  const plotRight = 630;
  const plotWidth = plotRight - plotLeft;
  const height = 248;

  return (
    <figure>
      <figcaption>
        <strong>Hole-visit timeline</strong>
      </figcaption>
      <svg viewBox={`0 0 640 ${height}`} width="100%" role="group" aria-label="Hole visit timeline">
        {Array.from({ length: 20 }, (_, hole) => {
          const isTarget = hole === arena?.targetHoleIndex;
          return (
            <g key={hole}>
              <text
                x={4}
                y={12 + hole * 10}
                fontSize="8"
                fontWeight={isTarget ? 700 : 400}
                fill={isTarget ? "#6b2d2d" : "#4f4a42"}
              >
                {isTarget ? `${hole + 1} ★` : hole + 1}
              </text>
              <line x1={plotLeft} x2={plotRight} y1={10 + hole * 10} y2={10 + hole * 10} stroke="#ddd" />
            </g>
          );
        })}
        {events
          .filter((event) => event.holeIndex !== undefined)
          .map((event) => {
            const y = 10 + (event.holeIndex ?? 0) * 10;
            const x = plotLeft + (event.startSeconds / duration) * plotWidth;
            const w = Math.max(3, ((event.durationSeconds ?? 0.1) / duration) * plotWidth);
            const target = event.holeIndex === arena?.targetHoleIndex;
            return (
              <rect
                key={event.id}
                x={x}
                y={y - 3}
                width={w}
                height={6}
                fill={target ? "#6b2d2d" : "#1f4d5c"}
                stroke={event.source === "manual" ? "#3d2a78" : "#111"}
                role="button"
                tabIndex={0}
                aria-label={`${event.type} hole ${(event.holeIndex ?? 0) + 1}${target ? " — target" : ""} at ${event.startSeconds.toFixed(2)} s`}
                onClick={() => onSelect(event)}
                onKeyDown={(keyboard) => {
                  if (keyboard.key === "Enter" || keyboard.key === " ") {
                    keyboard.preventDefault();
                    onSelect(event);
                  }
                }}
              >
                <title>
                  {event.type} hole {(event.holeIndex ?? 0) + 1}
                  {target ? " (target)" : ""} {event.startSeconds.toFixed(2)}s {event.source}
                </title>
              </rect>
            );
          })}
        {ticks.map((tick) => {
          const x = plotLeft + (tick / duration) * plotWidth;
          return (
            <g key={tick}>
              <line x1={x} x2={x} y1={6} y2={206} stroke="#eee" />
              <text x={x} y={220} fontSize="8" textAnchor="middle" fill="#6f6960">
                {tick.toFixed(0)} s
              </text>
            </g>
          );
        })}
        <text x={340} y={238} fontSize="8" textAnchor="middle" fill="#6f6960">
          Trial time (s)
        </text>
      </svg>
    </figure>
  );
}
