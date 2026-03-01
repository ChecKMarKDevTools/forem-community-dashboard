import { useId, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { SectionCard } from "@/components/ui/SectionCard";
import {
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/Card";

type ChartContainerProps = Readonly<{
  title: string;
  description?: string;
  tooltip?: string;
  className?: string;
  children: ReactNode;
}>;

export function ChartContainer({
  title,
  description,
  tooltip,
  className,
  children,
}: ChartContainerProps) {
  const tooltipId = useId();

  return (
    <SectionCard variant="muted" className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="font-heading text-text-secondary flex items-center gap-2 text-lg">
          {title}
          {tooltip && (
            <button
              type="button"
              className="group relative shrink-0 cursor-help"
              aria-describedby={tooltipId}
            >
              <HelpCircle className="text-text-muted group-hover:text-accent-primary group-focus:text-accent-primary h-4 w-4" />
              <span
                id={tooltipId}
                role="tooltip"
                className="bg-surface-raised text-text-primary border-surface-border pointer-events-none absolute top-1/2 left-6 z-10 w-64 -translate-y-1/2 rounded-lg border px-3 py-2 text-xs leading-relaxed font-normal opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus:opacity-100"
              >
                {tooltip}
              </span>
            </button>
          )}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </SectionCard>
  );
}
