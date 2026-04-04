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
        <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-5 shadow-[0_16px_48px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Integration Center</p>
              <div>
                <h2 className="text-[28px] font-black tracking-tight text-slate-900">应用列表</h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                  这里管理的是接入身份，不是商品。应用详情页负责密钥、回调、交付配置和可售产品绑定。
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-right">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">接入应用数</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{apps.length}</p>
              </div>
              <Button asChild className="h-11 rounded-2xl px-5 text-sm font-black">
                <Link to="/admin/applications/new">
                  <Plus className="mr-1 h-4 w-4" />
                  新建应用
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_16px_48px_rgba(15,23,42,0.04)]">
          <div className="border-b border-slate-200/80 px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-slate-900">接入目录</p>
                <p className="mt-1 text-xs text-slate-500">统一查看应用接入身份、可售商品、密钥与交付接入状态。</p>
              </div>
              <StatusPill
                tone={apps.length > 0 ? 'ok' : 'warn'}
                label={apps.length > 0 ? '已建立接入目录' : '待创建首个应用'}
              />
            </div>
          </div>
          <DataTable
            columns={columns}
            data={apps}
            isLoading={appsQuery.isLoading}
            emptyMessage="暂无应用，请先创建一个接入应用。"
            getRowKey={(row) => row.id}
            rowClassName={() => 'hover:bg-slate-50/70 transition-colors'}
          />
        </section>

        {!appsQuery.isLoading && apps.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/80 p-8 text-center text-sm text-muted-foreground">
            <AppWindow className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
            先创建应用接入身份，再去绑定产品与价格。
          </div>
        ) : null}
      </div>
    </div>
  );
}
