import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?:
    | "default"
    | "secondary"
    | "destructive"
    | "outline"
    | "success"
    | "warning";
}

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <div
      className={cn(
        "focus:ring-ring inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none",
        {
          "bg-brand-500 hover:bg-brand-600 border-transparent text-white":
            variant === "default",
          "bg-brand-100 text-brand-900 hover:bg-brand-200 border-transparent":
            variant === "secondary",
          "bg-danger-500 hover:bg-danger-600 border-transparent text-white":
            variant === "destructive",
          "text-foreground": variant === "outline",
          "bg-success-500 hover:bg-success-600 border-transparent text-white":
            variant === "success",
          "bg-warning-500 hover:bg-warning-600 border-transparent text-white":
            variant === "warning",
        },
        className,
      )}
      {...props}
    />
  );
}
