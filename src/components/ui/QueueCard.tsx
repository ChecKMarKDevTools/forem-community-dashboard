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
        "card-lift cursor-pointer",
        selected
          ? "card-active border-l-accent-primary border-l-[3px]"
          : "bg-paper-clue hover:border-surface-raised",
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
