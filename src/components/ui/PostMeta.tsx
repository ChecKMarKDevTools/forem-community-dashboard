import { Clock, User } from "lucide-react";
import { cn } from "@/lib/utils";

type PostMetaProps = Readonly<{
  author: string;
  date: string;
  variant?: "compact" | "full";
  className?: string;
}>;

export function PostMeta({
  author,
  date,
  variant = "compact",
  className,
}: PostMetaProps) {
  if (variant === "full") {
    return (
      <div
        className={cn(
          "text-accent-primary flex flex-wrap items-center gap-4 text-sm",
          className,
        )}
      >
        <span className="bg-surface-secondary flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium">
          <User className="h-4 w-4" /> @{author}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="h-4 w-4" />{" "}
          {new Date(date).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "text-text-muted flex items-center gap-2 text-xs",
        className,
      )}
    >
      <span className="flex items-center gap-1">
        <User className="h-3 w-3" /> @{author}
      </span>
      <span className="flex items-center gap-1">
        <Clock className="h-3 w-3" /> {new Date(date).toLocaleDateString()}
      </span>
    </div>
  );
}
