import { useId } from "react";
import { cn } from "@/lib/utils";

type DivergingBarProps = Readonly<{
  positive: number;
  neutral: number;
  negative: number;
  className?: string;
}>;

const BAR_HEIGHT = 24;
const WIDTH = 400;
const PADDING = { left: 12, right: 12 };
const LABEL_Y_OFFSET = 18;

export function DivergingBar({
  positive,
  neutral,
  negative,
  className,
}: DivergingBarProps) {
  const titleId = useId();
  const total = positive + neutral + negative;
  const barWidth = WIDTH - PADDING.left - PADDING.right;
  const height = BAR_HEIGHT + LABEL_Y_OFFSET + 8;

  if (total === 0) {
    return (
      <div
        className={cn("text-text-muted text-center text-sm italic", className)}
      >
        Not enough data yet
      </div>
    );
  }

  const posW = (positive / total) * barWidth;
  const neutW = (neutral / total) * barWidth;
  const negW = (negative / total) * barWidth;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${height}`}
      className={cn("w-full", className)}
      aria-labelledby={titleId}
    >
      <title id={titleId}>
        {`Sentiment: ${Math.round(positive)}% positive, ${Math.round(neutral)}% neutral, ${Math.round(negative)}% negative`}
      </title>
      {/* Positive segment */}
      {posW > 0 && (
        <rect
          x={PADDING.left}
          y={0}
          width={posW}
          height={BAR_HEIGHT}
          rx={posW === barWidth ? 6 : 0}
          className="fill-state-positive"
          opacity={0.8}
        />
      )}
      {/* Round left corners */}
      {posW > 0 && (
        <rect
          x={PADDING.left}
          y={0}
          width={Math.min(posW, 6)}
          height={BAR_HEIGHT}
          rx={6}
          className="fill-state-positive"
          opacity={0.8}
        />
      )}

      {/* Neutral segment */}
      {neutW > 0 && (
        <rect
          x={PADDING.left + posW}
          y={0}
          width={neutW}
          height={BAR_HEIGHT}
          className="fill-chart-axis"
          opacity={0.4}
        />
      )}

      {/* Negative segment */}
      {negW > 0 && (
        <rect
          x={PADDING.left + posW + neutW}
          y={0}
          width={negW}
          height={BAR_HEIGHT}
          className="fill-state-negative"
          opacity={0.8}
        />
      )}
      {/* Round right corners */}
      {negW > 0 && (
        <rect
          x={PADDING.left + posW + neutW + negW - Math.min(negW, 6)}
          y={0}
          width={Math.min(negW, 6)}
          height={BAR_HEIGHT}
          rx={6}
          className="fill-state-negative"
          opacity={0.8}
        />
      )}

      {/* Labels */}
      {positive > 5 && (
        <text
          x={PADDING.left + posW / 2}
          y={BAR_HEIGHT + LABEL_Y_OFFSET}
          textAnchor="middle"
          className="fill-state-positive text-[10px] font-medium"
        >
          {Math.round(positive)}% positive
        </text>
      )}
      {neutral > 10 && (
        <text
          x={PADDING.left + posW + neutW / 2}
          y={BAR_HEIGHT + LABEL_Y_OFFSET}
          textAnchor="middle"
          className="fill-chart-axis text-[10px]"
        >
          {Math.round(neutral)}% neutral
        </text>
      )}
      {negative > 5 && (
        <text
          x={PADDING.left + posW + neutW + negW / 2}
          y={BAR_HEIGHT + LABEL_Y_OFFSET}
          textAnchor="middle"
          className="fill-state-negative text-[10px] font-medium"
        >
          {Math.round(negative)}% negative
        </text>
      )}
    </svg>
  );
}
