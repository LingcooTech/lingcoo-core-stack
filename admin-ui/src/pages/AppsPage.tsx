import { useQuery } from '@tanstack/react-query';
import { FileEdit, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

import { listAppsAdmin } from '@/api/apps';
import type { AppWithDetails } from '@/api/types';
import { formatPlanInterval, formatPriceYuan } from '@/components/apps/app-edit/model';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';

export function AppsPage() {
  const { data: appsData, isLoading: isAppsLoading } = useQuery({
    queryKey: ['apps'],
    queryFn: listAppsAdmin,
  });

  const apps = appsData?.items ?? [];

  const appColumns: Column<AppWithDetails>[] = [
    {
      key: 'name',
      header: '应用',
      cell: (row) => (
        <div>
          <p className="text-sm font-bold">{row.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{row.code}</p>
          {row.tagline ? (
            <p className="mt-0.5 max-w-[280px] truncate text-xs text-muted-foreground">
              {row.tagline}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: '类型/状态',
      cell: (row) => (
        <div className="flex flex-col gap-1.5">
          <StatusPill tone="neutral" label={row.type} />
          <StatusPill tone={statusToTone(row.status)} label={row.status} />
        </div>
      ),
    },
    {
      key: 'catalog',
      header: '功能 / 套餐 / Offers',
      cell: (row) => (
        <div className="space-y-2 text-xs">
          <p className="text-muted-foreground">
            {row.features.length} Features · {row.plans.length} Plans · {row.checkoutOffers.length} Offers
          </p>
          {row.checkoutOffers.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {row.checkoutOffers.slice(0, 3).map((offer) => (
                <span
                  key={offer.code}
                  className={`rounded border px-1.5 py-0.5 font-mono ${
                    offer.isDefault
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-emerald-100 bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {offer.title} ¥{formatPriceYuan(offer.priceAmount)}/{formatPlanInterval(offer.interval)}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">未配置 Offer</p>
          )}
        </div>
      ),
    },
    {
      key: 'secrets',
      header: 'Secrets',
      cell: (row) => {
        const activeCount =
          row.secrets?.filter(
            (secret) => !secret.expiresAt || new Date(secret.expiresAt) > new Date(),
          ).length ?? 0;

        return <span className="text-xs text-muted-foreground">{activeCount} 个有效</span>;
      },
    },
    {
      key: 'actions',
      header: '操作',
      cell: (row) => (
        <Button size="sm" variant="outline" asChild>
          <Link to={`/admin/apps/${row.code}/edit`}>
            <FileEdit className="mr-1 h-3.5 w-3.5" />
            编辑详情
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="p-6">
        <h1 className="text-2xl font-black tracking-tight">应用管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          新建应用会进入完整配置页，直接填写 App Code、功能、套餐和 Offers。
        </p>
      </div>

      <div className="p-6 pt-0">
        <div className="mb-4 flex items-center justify-end">
          <Button size="sm" asChild>
            <Link to="/admin/apps/new">
              <Plus className="mr-1 h-4 w-4" />
              新建应用
            </Link>
          </Button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <DataTable
            columns={appColumns}
            data={apps}
            isLoading={isAppsLoading}
            emptyMessage="暂无应用"
            getRowKey={(row) => row.id}
          />
        </div>
      </div>
    </div>
  );
}
