import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?:
    | "default"
    | "secondary"
    | "outline"
    | "neutral"
    | "info"
    | "teal"
    | "attention"
    | "critical";
}

export function Badge({
  className,
  variant = "default",
  ...props
}: Readonly<BadgeProps>) {
  return (
    <div
      className={cn(
        "focus:ring-ring inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none",
        {
          "bg-brand-500 hover:bg-brand-600 border-transparent text-white":
            variant === "default",
          "bg-brand-100 text-brand-900 hover:bg-brand-200 border-transparent":
            variant === "secondary",
          "text-foreground": variant === "outline",
          "border-transparent bg-neutral-200 text-neutral-700 hover:bg-neutral-300":
            variant === "neutral",
          "bg-info-100 text-info-700 hover:bg-info-200 border-transparent":
            variant === "info",
          "border-transparent bg-teal-100 text-teal-700 hover:bg-teal-200":
            variant === "teal",
          "bg-attention-100 text-attention-700 hover:bg-attention-200 border-transparent":
            variant === "attention",
          "bg-critical-100 text-critical-700 hover:bg-critical-200 border-transparent":
            variant === "critical",
        },
        className,
      )}
      {...props}
    />
  );
}
