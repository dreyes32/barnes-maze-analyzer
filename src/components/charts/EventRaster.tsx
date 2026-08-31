import type { ArenaGeometry, BehavioralEvent } from "../../domain/types";

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
  return (
    <figure>
      <figcaption>
        <strong>Hole-visit timeline</strong>
      </figcaption>
      <svg viewBox="0 0 640 220" width="100%" role="group" aria-label="Hole visit timeline">
        {Array.from({ length: 20 }, (_, hole) => (
          <g key={hole}>
            <text x={4} y={12 + hole * 10} fontSize="8">
              {hole + 1}
            </text>
            <line x1={28} x2={630} y1={10 + hole * 10} y2={10 + hole * 10} stroke="#ddd" />
          </g>
        ))}
        {events
          .filter((event) => event.holeIndex !== undefined)
          .map((event) => {
            const y = 10 + (event.holeIndex ?? 0) * 10;
            const x = 28 + (event.startSeconds / duration) * 600;
            const w = Math.max(3, ((event.durationSeconds ?? 0.1) / duration) * 600);
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
                onClick={() => onSelect(event)}
                onKeyDown={(keyboard) => {
                  if (keyboard.key === "Enter" || keyboard.key === " ") {
                    keyboard.preventDefault();
                    onSelect(event);
                  }
                }}
              >
                <title>
                  {event.type} hole {(event.holeIndex ?? 0) + 1} {event.startSeconds.toFixed(2)}s {event.source}
                </title>
              </rect>
            );
          })}
      </svg>
    </figure>
  );
}
