import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Boxes, PackagePlus, Settings2 } from 'lucide-react';
import { toast } from 'sonner';

import { listAppsAdmin, upsertCatalogBundle } from '@/api/apps';
import { CatalogBundleDialog, type CatalogBundleSummary } from '@/components/apps/CatalogBundleDialog';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { useCatalogData } from '@/hooks/useCatalogData';
import { buildManagedProducts } from '@/lib/product-model';

export function ProductsPage() {
  const qc = useQueryClient();
  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false);
  const [selectedBundle, setSelectedBundle] = useState<CatalogBundleSummary | null>(null);

  const { catalogBundles, products, features, allPlans, isLoading: isCatalogLoading } = useCatalogData();
  const appsQuery = useQuery({ queryKey: ['apps'], queryFn: listAppsAdmin });
  const apps = appsQuery.data?.items ?? [];

  const managedProducts = buildManagedProducts({
    products,
    features,
    plans: allPlans,
    apps
  });

  const catalogMutation = useMutation({
    mutationFn: ({
      productCode,
      values
    }: {
      productCode: string;
      values: Parameters<typeof upsertCatalogBundle>[1];
    }) => upsertCatalogBundle(productCode, values),
    onSuccess: () => {
      toast.success('产品能力与授权方案已保存');
      void qc.invalidateQueries({ queryKey: ['catalog'] });
      void qc.invalidateQueries({ queryKey: ['apps'] });
      setCatalogDialogOpen(false);
      setSelectedBundle(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '保存失败')
  });

  const columns: Column<(typeof managedProducts)[number]>[] = [
    {
      key: 'product',
      header: '产品',
      cell: (row) => (
        <div>
          <p className="text-sm font-bold">{row.product.name}</p>
          <p className="text-xs font-mono text-muted-foreground">{row.product.code}</p>
        </div>
      )
    },
    {
      key: 'status',
      header: '类型 / 状态',
      cell: (row) => (
        <div className="flex flex-col gap-1.5">
          <StatusPill tone="neutral" label={row.product.type || 'service'} />
          <StatusPill tone={statusToTone(row.product.status || 'inactive')} label={row.product.status || 'inactive'} />
        </div>
      )
    },
    {
      key: 'capability',
      header: '能力与方案',
      cell: (row) => (
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>{row.features.length} 个能力项</p>
          <p>{row.plans.length} 个授权方案</p>
        </div>
      )
    },
    {
      key: 'profile',
      header: '销售与交付档案',
      cell: (row) => {
        const primaryApp = row.primaryApp;
        const activeSecrets =
          primaryApp?.secrets?.filter((secret) => !secret.expiresAt || new Date(secret.expiresAt) > new Date()).length ?? 0;
        const hasManifest = Boolean(primaryApp?.meta?.deliveryManifest);

        if (!primaryApp) {
          return (
            <div className="space-y-1 text-xs">
              <StatusPill tone="warn" label="待创建产品档案" />
              <p className="text-muted-foreground">首次进入产品工作台后即可创建。</p>
            </div>
          );
        }

        return (
          <div className="space-y-1 text-xs">
            <p className="font-mono text-foreground">{primaryApp.code}</p>
            <div className="flex flex-wrap gap-1">
              <StatusPill tone={hasManifest ? 'ok' : 'warn'} label={hasManifest ? '已接入交付声明' : '待同步交付声明'} />
            </div>
            <p className="text-muted-foreground">
              {primaryApp.checkoutOffers?.length ?? 0} 个销售方案 · {activeSecrets} 个有效密钥
            </p>
            {row.linkedApps.length > 1 ? (
              <p className="text-amber-600">已发现 {row.linkedApps.length} 个内部档案，当前优先使用最新匹配项。</p>
            ) : null}
          </div>
        );
      }
    },
    {
      key: 'actions',
      header: '操作',
      cell: (row) => {
        const bundle = catalogBundles.find((item) => item.product.code === row.product.code) ?? null;

        return (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link to={`/admin/products/${row.product.code}`}>
                <Settings2 className="mr-1 h-3.5 w-3.5" />
                产品工作台
              </Link>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={(event) => {
                event.stopPropagation();
                setSelectedBundle(bundle);
                setCatalogDialogOpen(true);
              }}
            >
              编辑能力方案
            </Button>
          </div>
        );
      }
    }
  ];

  return (
    <div>
      <SectionHeader sectionKey="catalog" />
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="rounded-2xl border border-border bg-white px-4 py-3 text-sm text-muted-foreground">
            一个产品就是一个对外售卖、授权和交付的主体。内部的 app 记录已退居实现层，不再作为主操作对象。
          </div>
          <Button
            size="sm"
            onClick={() => {
              setSelectedBundle(null);
              setCatalogDialogOpen(true);
            }}
          >
            <PackagePlus className="mr-1 h-4 w-4" />
            新建产品
          </Button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <DataTable
            columns={columns}
            data={managedProducts}
            isLoading={isCatalogLoading || appsQuery.isLoading}
            emptyMessage="暂无产品，请先创建一个可售卖产品。"
            getRowKey={(row) => row.product.id}
          />
        </div>

        {!isCatalogLoading && managedProducts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            <Boxes className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
            先定义产品，再补齐销售与交付档案。
          </div>
        ) : null}
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
