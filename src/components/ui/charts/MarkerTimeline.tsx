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
  if (markers.length === 0) {
    return null;
  }

  const trackWidth = WIDTH - PADDING.left - PADDING.right;
  const step =
    markers.length > 1 ? trackWidth / (markers.length - 1) : trackWidth / 2;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={cn("w-full", className)}
      role="img"
      aria-label="Risk signal timeline"
    >
      {/* Track line */}
      <line
        x1={PADDING.left}
        x2={WIDTH - PADDING.right}
        y1={HEIGHT / 2 - 4}
        y2={HEIGHT / 2 - 4}
        className="stroke-chart-grid"
        strokeWidth={2}
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
  );
}
