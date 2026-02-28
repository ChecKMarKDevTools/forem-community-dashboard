import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateProps = Readonly<{
  icon: LucideIcon;
  title: string;
  description?: string;
  variant?: "default" | "prominent";
  className?: string;
}>;

export function EmptyState({
  icon: Icon,
  title,
  description,
  variant = "default",
  className,
}: EmptyStateProps) {
  if (variant === "prominent") {
    return (
      <div className={cn("text-text-muted max-w-sm text-center", className)}>
        <div className="bg-surface-secondary mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
          <Icon className="text-surface-raised h-8 w-8" />
        </div>
        <p className="text-text-secondary text-lg font-medium">{title}</p>
        {description && <p className="mt-2 text-sm">{description}</p>}
      </div>
    );
  }

  return (
    <div className={cn("text-text-muted py-12 text-center", className)}>
      <Icon className="mx-auto mb-3 h-8 w-8 opacity-50" />
      <p>{title}</p>
      {description && <p className="mt-1 text-sm">{description}</p>}
    </div>
  );
}
