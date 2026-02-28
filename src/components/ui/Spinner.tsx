import { cn } from "@/lib/utils";

const SIZE_MAP = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-12 w-12",
} as const;

type SpinnerProps = Readonly<{
  size?: "sm" | "md" | "lg";
  className?: string;
}>;

export function Spinner({ size = "md", className }: SpinnerProps) {
  return (
    <div
      className={cn(
        "border-brand-600 animate-spin rounded-full border-b-2",
        SIZE_MAP[size],
        className,
      )}
    />
  );
}
