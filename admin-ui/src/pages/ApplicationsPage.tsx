import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AppWindow, Plus } from 'lucide-react';

import { listAppsAdmin } from '@/api/apps';
import type { AppWithDetails } from '@/api/types';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { formatTime } from '@/lib/utils';

function getDeliveryModeLabel(app: AppWithDetails) {
  const raw = app.meta?.productDeliveryMode;
  if (raw === 'direct_access') {
    return '直达访问';
  }
  if (raw === 'one_click_deploy') {
    return '一键部署';
  }
  return '未设置';
}

export function ApplicationsPage() {
  const appsQuery = useQuery({ queryKey: ['apps'], queryFn: listAppsAdmin });
  const apps = appsQuery.data?.items ?? [];

  const columns: Column<AppWithDetails>[] = [
    {
      key: 'application',
      header: '应用',
      cell: (row) => (
        <div className="space-y-1">
          <Link
            to={`/admin/applications/${row.code}`}
            className="text-sm font-bold text-foreground underline decoration-slate-300 underline-offset-4 transition-colors hover:text-primary hover:decoration-primary"
          >
            {row.name}
          </Link>
          <p className="text-xs font-mono text-muted-foreground">{row.code}</p>
          {row.description ? <p className="text-xs text-muted-foreground">{row.description}</p> : null}
        </div>
      )
    },
    {
      key: 'status',
      header: '类型 / 状态',
      className: 'w-[180px]',
      cell: (row) => (
        <div className="flex flex-col gap-1.5">
          <StatusPill tone="neutral" label={row.type} />
          <StatusPill tone={statusToTone(row.status)} label={row.status} />
        </div>
      )
    },
    {
      key: 'products',
      header: '可售商品',
      cell: (row) => (
        <div className="space-y-1">
          <p className="text-xs font-bold text-foreground">{row.products?.length ?? 0} 个产品</p>
          <div className="flex flex-wrap gap-1">
            {(row.products ?? []).slice(0, 3).map((product) => (
              <span
                key={product.code}
                className="rounded border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[10px] font-mono text-blue-700"
              >
                {product.code}
              </span>
            ))}
            {(row.products?.length ?? 0) > 3 ? (
              <span className="text-[10px] text-muted-foreground">+{(row.products?.length ?? 0) - 3}</span>
            ) : null}
          </div>
        </div>
      )
    },
    {
      key: 'integration',
      header: '接入状态',
      cell: (row) => (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">密钥 {row.secrets?.length ?? 0} 个</p>
          <p className="text-xs text-muted-foreground">{getDeliveryModeLabel(row)}</p>
          <p className="text-xs text-muted-foreground">
            {row.meta?.deliveryManifest ? '已同步交付声明' : '未同步交付声明'}
          </p>
        </div>
      )
    },
    {
      key: 'updatedAt',
      header: '最近更新',
      className: 'w-[180px]',
      cell: (row) => (
        <div className="space-y-1">
          <p className="text-xs font-bold text-foreground">{formatTime(row.updatedAt)}</p>
          <p className="text-xs text-muted-foreground">创建于 {formatTime(row.createdAt)}</p>
        </div>
      )
    }
  ];

  return (
    <div>
      <SectionHeader sectionKey="applications" />
      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-[28px] font-black tracking-tight text-slate-900">应用列表</h2>
            <StatusPill tone="neutral" label={`${apps.length} 个应用`} />
          </div>
          <Button asChild className="h-11 rounded-2xl px-5 text-sm font-black">
            <Link to="/admin/applications/new">
              <Plus className="mr-1 h-4 w-4" />
              新建应用
            </Link>
          </Button>
        </div>

        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_16px_48px_rgba(15,23,42,0.04)]">
          <DataTable
            columns={columns}
            data={apps}
            isLoading={appsQuery.isLoading}
            emptyMessage="暂无应用"
            getRowKey={(row) => row.id}
            rowClassName={() => 'hover:bg-slate-50/70 transition-colors'}
          />
        </section>

        {!appsQuery.isLoading && apps.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/80 p-8 text-center text-sm text-muted-foreground">
            <AppWindow className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
            暂无应用
          </div>
        ) : null}
      </div>
    </div>
  );
}
