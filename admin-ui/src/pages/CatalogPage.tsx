import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { upsertCatalogBundle } from '@/api/apps';
import { CatalogBundleDialog, type CatalogBundleSummary } from '@/components/apps/CatalogBundleDialog';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { useCatalogData } from '@/hooks/useCatalogData';
import { formatPriceYuan, formatPlanInterval } from '@/lib/catalog-utils';

export function CatalogPage() {
  const qc = useQueryClient();
  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false);
  const [selectedBundle, setSelectedBundle] = useState<CatalogBundleSummary | null>(null);

  const { catalogBundles, isLoading } = useCatalogData();

  const catalogMutation = useMutation({
    mutationFn: ({
      productCode,
      values
    }: {
      productCode: string;
      values: Parameters<typeof upsertCatalogBundle>[1];
    }) => upsertCatalogBundle(productCode, values),
    onSuccess: () => {
      toast.success('产品目录已保存');
      void qc.invalidateQueries({ queryKey: ['catalog'] });
      void qc.invalidateQueries({ queryKey: ['apps'] });
      setCatalogDialogOpen(false);
      setSelectedBundle(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '保存目录失败')
  });

  const openCatalogCreate = () => {
    setSelectedBundle(null);
    setCatalogDialogOpen(true);
  };

  const openCatalogEdit = (bundle: CatalogBundleSummary) => {
    setSelectedBundle(bundle);
    setCatalogDialogOpen(true);
  };

  const catalogColumns: Column<CatalogBundleSummary>[] = [
    {
      key: 'product',
      header: '产品目录',
      cell: (row) => (
        <div>
          <p className="text-sm font-bold">{row.product.name}</p>
          <p className="text-xs text-muted-foreground font-mono">{row.product.code}</p>
        </div>
      )
    },
    {
      key: 'status',
      header: '类型/状态',
      cell: (row) => (
        <div className="flex flex-col gap-1.5">
          <StatusPill tone="neutral" label={row.product.type || 'service'} />
          <StatusPill tone={statusToTone(row.product.status || 'inactive')} label={row.product.status || 'inactive'} />
        </div>
      )
    },
    {
      key: 'features',
      header: '功能项',
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.features.map((feature) => (
            <span key={feature.code} className="rounded border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-xs font-mono text-blue-700">
              {feature.code}
            </span>
          ))}
          {row.features.length === 0 && <span className="text-xs text-muted-foreground">未配置</span>}
        </div>
      )
    },
    {
      key: 'plans',
      header: 'Plans',
      cell: (row) => (
        <div className="space-y-1">
          {row.plans.map((plan) => (
            <div key={plan.code} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{plan.name}</span>
              <span className="ml-2 font-mono">{plan.code}</span>
              <span className="ml-2">
                ¥{formatPriceYuan(plan.priceAmount)}/{formatPlanInterval(plan.interval)}
              </span>
            </div>
          ))}
          {row.plans.length === 0 && <span className="text-xs text-muted-foreground">未配置</span>}
        </div>
      )
    },
    {
      key: 'actions',
      header: '操作',
      cell: (row) => (
        <Button
          size="sm"
          variant="outline"
          onClick={(event) => {
            event.stopPropagation();
            openCatalogEdit(row);
          }}
        >
          编辑目录
        </Button>
      )
    }
  ];

  return (
    <div>
      <div className="p-6">
        <h1 className="text-2xl font-black tracking-tight">产品目录</h1>
        <p className="text-sm text-muted-foreground mt-1">管理产品、功能项和套餐定义</p>
      </div>
      <div className="p-6 pt-0">
        <div className="mb-4 flex items-center justify-end">
          <Button size="sm" onClick={openCatalogCreate}>
            <Plus className="mr-1 h-4 w-4" />
            新建产品目录
          </Button>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <DataTable
            columns={catalogColumns}
            data={catalogBundles}
            isLoading={isLoading}
            emptyMessage="暂无产品目录"
            getRowKey={(row) => row.product.id}
          />
        </div>
      </div>

      <CatalogBundleDialog
        open={catalogDialogOpen}
        onOpenChange={(open) => {
          setCatalogDialogOpen(open);
          if (!open) {
            setSelectedBundle(null);
          }
        }}
        bundle={selectedBundle}
        pending={catalogMutation.isPending}
        onSubmit={(payload) =>
          catalogMutation.mutate({
            productCode: payload.productCode,
            values: {
              name: payload.name,
              type: payload.type,
              status: payload.status,
              features: payload.features,
              plans: payload.plans
            }
          })
        }
      />
    </div>
  );
}
