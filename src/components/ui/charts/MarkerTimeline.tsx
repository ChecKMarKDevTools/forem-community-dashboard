import { cn } from "@/lib/utils";

type Marker = Readonly<{
  label: string;
  active: boolean;
}>;

type MarkerTimelineProps = Readonly<{
  markers: ReadonlyArray<Marker>;
  className?: string;
}>;

const WIDTH = 600;
const HEIGHT = 56;
const PADDING = { left: 50, right: 50 };
const CIRCLE_R = 8;
const ACTIVE_R = 10;

export function MarkerTimeline({ markers, className }: MarkerTimelineProps) {
  const noneActive = markers.length > 0 && markers.every((m) => !m.active);

  // No markers at all: minimal disabled placeholder
  if (markers.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-2 opacity-40">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className={cn("w-full", className)}
          role="img"
          aria-label="No risk signals detected"
        >
          <line
            x1={PADDING.left}
            x2={WIDTH - PADDING.right}
            y1={HEIGHT / 2 - 4}
            y2={HEIGHT / 2 - 4}
            className="stroke-chart-grid"
            strokeWidth={2}
            strokeDasharray="6 4"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  const trackWidth = WIDTH - PADDING.left - PADDING.right;
  const step =
    markers.length > 1 ? trackWidth / (markers.length - 1) : trackWidth / 2;

  // All markers inactive: show full timeline (with labels) in muted style
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 py-2",
        noneActive && "opacity-40",
      )}
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className={cn("w-full", className)}
        role="img"
        aria-label={
          noneActive ? "No risk signals detected" : "Risk signal timeline"
        }
      >
        {/* Track line — dashed when no signals are active */}
        <line
          x1={PADDING.left}
          x2={WIDTH - PADDING.right}
          y1={HEIGHT / 2 - 4}
          y2={HEIGHT / 2 - 4}
          className="stroke-chart-grid"
          strokeWidth={2}
          strokeDasharray={noneActive ? "6 4" : undefined}
          strokeLinecap="round"
        />

        {/* Markers */}
        {markers.map((marker, i) => {
          const cx = markers.length === 1 ? WIDTH / 2 : PADDING.left + i * step;
          const cy = HEIGHT / 2 - 4;
          const r = marker.active ? ACTIVE_R : CIRCLE_R;

          return (
            <g key={marker.label}>
              <circle
                cx={cx}
                cy={cy}
                r={r}
                className={
                  marker.active
                    ? "fill-state-warning stroke-state-warning"
                    : "fill-chart-grid stroke-chart-axis"
                }
                strokeWidth={1.5}
                opacity={marker.active ? 0.85 : 0.5}
              />
              {marker.active && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r + 3}
                  fill="none"
                  className="stroke-state-warning"
                  strokeWidth={1}
                  opacity={0.3}
                />
              )}
              <text
                x={cx}
                y={HEIGHT - 2}
                textAnchor="middle"
                className={cn(
                  "text-[8px]",
                  marker.active
                    ? "fill-state-warning font-medium"
                    : "fill-text-muted",
                )}
              >
                {marker.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
