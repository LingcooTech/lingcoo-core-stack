import { Card, CardContent } from '@/components/ui/card';

export interface PortalMetricItem {
  label: string;
  value: string | number;
  note: string;
}

export function MetricStrip({ items }: { items: PortalMetricItem[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className="border-border/80 bg-card/90">
          <CardContent className="space-y-1.5 p-4">
            <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
              {item.label}
            </p>
            <p className="text-foreground text-[1.7rem] font-semibold tracking-tight">
              {item.value}
            </p>
            <p className="text-muted-foreground text-xs leading-5">{item.note}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
