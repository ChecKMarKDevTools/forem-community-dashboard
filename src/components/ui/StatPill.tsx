import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type StatPillProps = Readonly<{
  icon?: LucideIcon;
  iconClassName?: string;
  children: ReactNode;
  className?: string;
}>;

export function StatPill({
  icon: Icon,
  iconClassName,
  children,
  className,
}: StatPillProps) {
  return (
    <div
      className={cn("text-text-secondary flex items-center gap-2", className)}
    >
      {Icon && <Icon className={cn("h-5 w-5", iconClassName)} />}
      <span className="font-semibold">{children}</span>
    </div>
  );
}
