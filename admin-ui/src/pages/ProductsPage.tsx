import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Boxes, PackagePlus } from 'lucide-react';
import { toast } from 'sonner';

import { listAppsAdmin, upsertCatalogBundle } from '@/api/apps';
import { CatalogBundleDialog, type CatalogBundleSummary } from '@/components/apps/CatalogBundleDialog';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { useCatalogData } from '@/hooks/useCatalogData';
import { buildManagedProducts } from '@/lib/product-model';
import { getInitials } from '@/lib/utils';

export function ProductsPage() {
  const qc = useQueryClient();
  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false);
  const [selectedBundle, setSelectedBundle] = useState<CatalogBundleSummary | null>(null);

  const { products, features, allPlans, isLoading: isCatalogLoading } = useCatalogData();
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
      className: 'align-top py-5',
      cell: (row) => (
        <div className="flex items-center gap-3">
          {row.primaryApp?.iconUrl ? (
            <img
              src={row.primaryApp.iconUrl}
              alt={row.product.name}
              className="h-11 w-11 rounded-2xl border border-border object-cover"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-blue-500 text-sm font-black text-white">
              {getInitials(row.product.name)}
            </div>
          )}
          <div className="min-w-0">
            <Link
              to={`/admin/products/${row.product.code}`}
              className="text-sm font-bold text-foreground underline decoration-slate-300 underline-offset-4 transition-colors hover:text-primary hover:decoration-primary"
            >
              {row.product.name}
            </Link>
            <p className="text-xs font-mono text-muted-foreground">{row.product.code}</p>
          </div>
        </div>
      )
    },
    {
      key: 'status',
      header: '类型 / 状态',
      className: 'align-top py-5 w-[160px]',
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
      className: 'align-top py-5 w-[180px]',
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
      className: 'align-top py-5',
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
    }
  ];

  return (
    <div>
      <SectionHeader sectionKey="catalog" />
      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-6 py-6">
        <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-5 shadow-[0_16px_48px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Product Center</p>
              <div>
                <h2 className="text-[28px] font-black tracking-tight text-slate-900">产品列表</h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                  点击产品名称即可进入详情页，沿着“产品信息 → 功能/授权/价格 → 交付”的顺序完成配置。
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-right">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">总产品数</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{managedProducts.length}</p>
              </div>
              <Button
                className="h-11 rounded-2xl px-5 text-sm font-black"
                onClick={() => {
                  setSelectedBundle(null);
                  setCatalogDialogOpen(true);
                }}
              >
                <PackagePlus className="mr-1 h-4 w-4" />
                新建产品
              </Button>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_16px_48px_rgba(15,23,42,0.04)]">
          <div className="border-b border-slate-200/80 px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-slate-900">产品目录</p>
                <p className="mt-1 text-xs text-slate-500">统一查看产品档案、授权方案和交付准备状态。</p>
              </div>
              <StatusPill
                tone={managedProducts.length > 0 ? 'ok' : 'warn'}
                label={managedProducts.length > 0 ? '已建立产品目录' : '待创建首个产品'}
              />
            </div>
          </div>
          <DataTable
            columns={columns}
            data={managedProducts}
            isLoading={isCatalogLoading || appsQuery.isLoading}
            emptyMessage="暂无产品，请先创建一个可售卖产品。"
            getRowKey={(row) => row.product.id}
            rowClassName={() => 'hover:bg-slate-50/70 transition-colors'}
          />
        </section>

        {!isCatalogLoading && managedProducts.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/80 p-8 text-center text-sm text-muted-foreground">
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
