import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

type SectionCardProps = Readonly<{
  variant?: "default" | "muted";
  className?: string;
  children: ReactNode;
}>;

export function SectionCard({
  variant = "default",
  className,
  children,
}: SectionCardProps) {
  return (
    <Card
      className={cn(
        "border-surface-border",
        variant === "muted" && "bg-surface-primary/30",
        className,
      )}
    >
      {children}
    </Card>
  );
}
