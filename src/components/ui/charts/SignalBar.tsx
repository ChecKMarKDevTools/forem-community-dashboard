import { cn } from "@/lib/utils";

type SignalBarProps = Readonly<{
  /** Percentage of comments with strong signal (composite > 0.6). */
  strong: number;
  /** Percentage of comments with moderate signal (composite 0.3-0.6). */
  moderate: number;
  /** Percentage of comments with faint signal (composite < 0.3). */
  faint: number;
  className?: string;
}>;

const SEGMENTS = [
  {
    key: "strong",
    label: "Substantive",
    dotClass: "bg-state-positive",
    barClass: "bg-state-positive/80",
  },
  {
    key: "moderate",
    label: "Mixed",
    dotClass: "bg-chart-axis",
    barClass: "bg-chart-axis/50",
  },
  {
    key: "faint",
    label: "Surface-level",
    dotClass: "bg-state-warning",
    barClass: "bg-state-warning/70",
  },
] as const;

export function SignalBar({
  strong,
  moderate,
  faint,
  className,
}: SignalBarProps) {
  const total = strong + moderate + faint;

  if (total === 0) {
    return (
      <div
        className={cn("text-text-muted text-center text-sm italic", className)}
      >
        Not enough data yet
      </div>
    );
  }

  // Pre-compute normalized percentages so aria-label and displayed text agree
  // even when callers pass values that don't already sum to 100.
  const pcts: Record<string, number> = {
    strong: Math.round((strong / total) * 100),
    moderate: Math.round((moderate / total) * 100),
    faint: Math.round((faint / total) * 100),
  };

  return (
    <div
      className={cn("space-y-2.5", className)}
      role="img"
      aria-label={`Comment depth: ${pcts.strong}% substantive, ${pcts.moderate}% mixed, ${pcts.faint}% surface-level`}
    >
      {SEGMENTS.map(({ key, label, dotClass, barClass }) => {
        const pct = pcts[key];
        return (
          <div key={key} className="flex items-center gap-3">
            <span
              className={cn("h-2 w-2 shrink-0 rounded-full", dotClass)}
              aria-hidden="true"
            />
            <span className="text-text-secondary w-24 shrink-0 text-xs">
              {label}
            </span>
            <div className="bg-surface-raised h-1.5 flex-1 overflow-hidden rounded-full">
              <div
                className={cn("h-full rounded-full transition-all", barClass)}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-text-muted w-10 shrink-0 text-right text-xs tabular-nums">
              {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
