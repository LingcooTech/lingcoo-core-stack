import { Card, CardContent } from '@/components/ui/card';

export interface PortalMetricItem {
  label: string;
  value: string | number;
  note: string;
}

export function MetricStrip({ items }: { items: PortalMetricItem[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className="border-gray-200/80 bg-white/90">
          <CardContent className="space-y-2 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{item.label}</p>
            <p className="text-2xl font-semibold tracking-tight text-gray-900">{item.value}</p>
            <p className="text-xs leading-5 text-muted-foreground">{item.note}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
