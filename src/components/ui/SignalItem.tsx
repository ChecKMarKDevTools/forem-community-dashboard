import { useId, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type SignalItemProps = Readonly<{
  tooltip?: string;
  children: ReactNode;
  className?: string;
}>;

export function SignalItem({ tooltip, children, className }: SignalItemProps) {
  const tooltipId = useId();

  return (
    <li
      className={cn(
        "text-brand-700 bg-brand-50 border-brand-100 flex items-center gap-3 rounded-lg border p-3 text-sm",
        className,
      )}
    >
      {tooltip ? (
        <button
          type="button"
          className="group relative shrink-0 cursor-help"
          aria-describedby={tooltipId}
        >
          <HelpCircle className="text-brand-400 group-hover:text-brand-600 group-focus:text-brand-600 h-4 w-4" />
          <span
            id={tooltipId}
            role="tooltip"
            className="bg-brand-900 pointer-events-none absolute top-1/2 left-6 z-10 w-56 -translate-y-1/2 rounded-lg px-3 py-2 text-xs leading-relaxed text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus:opacity-100"
          >
            {tooltip}
          </span>
        </button>
      ) : (
        <span className="w-4 shrink-0" />
      )}
      <span className="min-w-0 flex-1 leading-snug">{children}</span>
    </li>
  );
}
