import { useId } from "react";
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
// Reduced height: labels are now in HTML, not SVG, so we only need space
// for the track line and circles.
const HEIGHT = 40;
const PADDING = { left: 50, right: 50 };
const CIRCLE_R = 8;
const ACTIVE_R = 10;

export function MarkerTimeline({ markers, className }: MarkerTimelineProps) {
  const titleId = useId();
  const noneActive = markers.length > 0 && markers.every((m) => !m.active);

  // No markers at all: minimal disabled placeholder
  if (markers.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-2 opacity-40">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className={cn("w-full", className)}
          aria-labelledby={titleId}
        >
          <title id={titleId}>Not enough data yet</title>
          <line
            x1={PADDING.left}
            x2={WIDTH - PADDING.right}
            y1={HEIGHT / 2}
            y2={HEIGHT / 2}
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

  return (
    <div className={cn("flex flex-col gap-1 py-2", noneActive && "opacity-40")}>
      {/* SVG: track line + circles only — no SVG text so labels scale with
          CSS rather than shrinking with the viewBox at narrow widths. */}
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className={cn("w-full", className)}
        aria-labelledby={titleId}
      >
        <title id={titleId}>
          {noneActive
            ? "No behavioral signals detected"
            : "Behavioral signal timeline"}
        </title>
        {/* Track line — dashed when no signals are active */}
        <line
          x1={PADDING.left}
          x2={WIDTH - PADDING.right}
          y1={HEIGHT / 2}
          y2={HEIGHT / 2}
          className="stroke-chart-grid"
          strokeWidth={2}
          strokeDasharray={noneActive ? "6 4" : undefined}
          strokeLinecap="round"
        />

        {/* Markers — circles only, labels rendered in HTML below */}
        {markers.map((marker, i) => {
          const cx = markers.length === 1 ? WIDTH / 2 : PADDING.left + i * step;
          const cy = HEIGHT / 2;
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
            </g>
          );
        })}
      </svg>

      {/* HTML labels grid — uses CSS font sizing so text stays readable at
          any viewport width, unlike SVG text which shrinks with the viewBox. */}
      <div
        className="grid w-full gap-0.5"
        style={{ gridTemplateColumns: `repeat(${markers.length}, 1fr)` }}
      >
        {markers.map((marker) => (
          <span
            key={marker.label}
            className={cn(
              "text-center text-[10px] leading-tight break-words",
              marker.active
                ? "text-state-warning font-medium"
                : "text-text-muted",
            )}
          >
            {marker.label}
          </span>
        ))}
      </div>
    </div>
  );
}
