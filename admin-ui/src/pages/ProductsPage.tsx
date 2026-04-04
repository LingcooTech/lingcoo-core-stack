import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Boxes, PackagePlus } from 'lucide-react';

import { listAppsAdmin } from '@/api/apps';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { useCatalogData } from '@/hooks/useCatalogData';
import { buildManagedProducts } from '@/lib/product-model';
import { getInitials } from '@/lib/utils';

function resolveDeliveryMode(row: { primaryApp: { meta?: Record<string, unknown> } | null; product: { type?: string } }) {
  const raw = row.primaryApp?.meta?.productDeliveryMode;
  if (raw === 'one_click_deploy' || raw === 'direct_access') {
    return raw;
  }

  return row.product.type === 'chrome_extension' ? 'direct_access' : 'one_click_deploy';
}

export function ProductsPage() {
  const { products, authorizationTemplates, allPrices, isLoading: isCatalogLoading } = useCatalogData();
  const appsQuery = useQuery({ queryKey: ['apps'], queryFn: listAppsAdmin });
  const apps = appsQuery.data?.items ?? [];

  const managedProducts = buildManagedProducts({
    products,
    authorizationTemplates,
    prices: allPrices,
    apps
  });

  const columns: Column<(typeof managedProducts)[number]>[] = [
    {
      key: 'product',
      header: '产品',
      className: 'align-top py-5',
      cell: (row) => (
        <div className="flex items-center gap-3">
          {row.product.iconUrl ? (
            <img
              src={row.product.iconUrl}
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
      key: 'pricing',
      header: '价格 / 授权',
      className: 'align-top py-5 w-[180px]',
      cell: (row) => (
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>{row.prices.length} 个价格方案</p>
          <p>{row.authorizationTemplates.length} 个授权定义</p>
        </div>
      )
    },
    {
      key: 'applications',
      header: '售卖应用 / 交付承接',
      className: 'align-top py-5',
      cell: (row) => {
        const primaryApp = row.primaryApp;
        const hasManifest = Boolean(primaryApp?.meta?.deliveryManifest);
        const deliveryMode = resolveDeliveryMode(row);

        if (!primaryApp) {
          return (
            <div className="space-y-1 text-xs">
              <StatusPill tone="warn" label="待绑定应用" />
              <p className="text-muted-foreground">交付模式和接入身份尚未承接。</p>
            </div>
          );
        }

        return (
          <div className="space-y-1 text-xs">
            <p className="font-mono text-foreground">{primaryApp.code}</p>
            <div className="flex flex-wrap gap-1">
              {deliveryMode === 'one_click_deploy' ? (
                <StatusPill tone={hasManifest ? 'ok' : 'warn'} label={hasManifest ? '已接入交付声明' : '待同步交付声明'} />
              ) : (
                <StatusPill tone="neutral" label="免部署" />
              )}
            </div>
            <p className="text-muted-foreground">
              {row.linkedApps.length} 个应用可售卖
            </p>
            {row.linkedApps.length > 1 ? (
              <p className="text-amber-600">已绑定多个应用，当前展示承接使用最新匹配项。</p>
            ) : null}
          </div>
        );
      }
    }
  ];

  return (
    <div>
      <SectionHeader sectionKey="products" />
      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-[28px] font-black tracking-tight text-slate-900">产品列表</h2>
            <StatusPill tone="neutral" label={`${managedProducts.length} 个产品`} />
          </div>
          <Button asChild className="h-11 rounded-2xl px-5 text-sm font-black">
            <Link to="/admin/products/new">
              <PackagePlus className="mr-1 h-4 w-4" />
              新建产品
            </Link>
          </Button>
        </div>

        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_16px_48px_rgba(15,23,42,0.04)]">
          <DataTable
            columns={columns}
            data={managedProducts}
            isLoading={isCatalogLoading || appsQuery.isLoading}
            emptyMessage="暂无产品"
            getRowKey={(row) => row.product.id}
            rowClassName={() => 'hover:bg-slate-50/70 transition-colors'}
          />
        </section>

        {!isCatalogLoading && managedProducts.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/80 p-8 text-center text-sm text-muted-foreground">
            <Boxes className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
            暂无产品
          </div>
        ) : null}
      </div>
    </div>
  );
}
