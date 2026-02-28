import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

type QueueCardProps = Readonly<{
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}>;

export function QueueCard({
  selected,
  onClick,
  children,
  className,
}: QueueCardProps) {
  return (
    <Card
      className={cn(
        "border-brand-100 hover:border-brand-300 cursor-pointer transition-all duration-200 hover:shadow-md",
        selected ? "ring-brand-500 bg-brand-50 ring-2" : "bg-white",
        className,
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}
