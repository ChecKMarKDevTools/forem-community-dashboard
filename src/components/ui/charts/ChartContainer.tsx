import type { ReactNode } from "react";
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
  className?: string;
  children: ReactNode;
}>;

export function ChartContainer({
  title,
  description,
  className,
  children,
}: ChartContainerProps) {
  return (
    <SectionCard variant="muted" className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="font-heading text-text-secondary text-lg">
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </SectionCard>
  );
}
