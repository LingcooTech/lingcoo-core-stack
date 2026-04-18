import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { getOrderDetail, listOrders, reconcileOrder } from '@/api/admin';
import type { HydratedOrder, OrderDetail } from '@/api/types';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { FilterBar } from '@/components/shared/FilterBar';
import { JsonViewer } from '@/components/shared/JsonViewer';
import { PaginationBar } from '@/components/shared/PaginationBar';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { formatAmount, formatTime } from '@/lib/utils';

const PAGE_SIZE = 20;

export function OrdersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('__all__');
  const [providerFilter, setProviderFilter] = useState('__all__');
  const [selectedOrderNo, setSelectedOrderNo] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const qc = useQueryClient();
  const orderQuery = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      search: deferredSearchQuery.trim() || undefined,
      status: statusFilter !== '__all__' ? (statusFilter as 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded') : undefined,
      provider: providerFilter !== '__all__' ? (providerFilter as 'wechat_pay' | 'alipay') : undefined,
    }),
    [deferredSearchQuery, page, providerFilter, statusFilter],
  );
  const ordersQuery = useQuery({
    queryKey: ['orders', orderQuery],
    queryFn: () => listOrders(orderQuery),
  });
  const orderDetailQuery = useQuery({
    queryKey: ['order-detail', selectedOrderNo],
    queryFn: () => getOrderDetail(selectedOrderNo!),
    enabled: !!selectedOrderNo
  });

  const reconcileMutation = useMutation({
    mutationFn: reconcileOrder,
    onSuccess: (result, orderNo) => {
      toast.success(`订单已同步: ${orderNo} → ${result.reconciliation.status} (${result.reconciliation.reason})`);
      void qc.invalidateQueries({ queryKey: ['orders'] });
      if (selectedOrderNo === orderNo) {
        void qc.invalidateQueries({ queryKey: ['order-detail', orderNo] });
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '同步失败')
  });

  useEffect(() => {
    setPage(1);
  }, [deferredSearchQuery, providerFilter, statusFilter]);

  const orders = ordersQuery.data?.items ?? [];
  const totalOrders = ordersQuery.data?.total ?? 0;

  useEffect(() => {
    if (selectedOrderNo && !orders.some((order) => order.orderNo === selectedOrderNo)) {
      setSelectedOrderNo(null);
    }
  }, [orders, selectedOrderNo]);

  const orderColumns: Column<HydratedOrder>[] = [
    {
      key: 'order',
      header: '订单',
      cell: (row) => (
        <div>
          <p className="text-xs font-bold font-mono">{row.orderNo}</p>
          <p className="text-[10px] text-muted-foreground">{row.checkoutSession?.sessionCode ?? '—'}</p>
          <p className="text-[10px] text-muted-foreground">{row.app?.name ?? row.appId}</p>
        </div>
      )
    },
    {
      key: 'status',
      header: '状态',
      cell: (row) => (
        <div className="flex flex-col gap-1">
          <StatusPill tone={statusToTone(row.status)} label={row.status} />
          {row.provider && <StatusPill tone="neutral" label={row.provider} />}
          {row.providerOrderId && (
            <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px]">{row.providerOrderId}</p>
          )}
        </div>
      )
    },
    {
      key: 'user',
      header: '用户/应用',
      cell: (row) => (
        <div>
          <p className="text-xs font-bold">{row.user?.email ?? row.userId}</p>
          {row.app && <p className="text-[10px] text-muted-foreground font-mono">{row.app.code}</p>}
        </div>
      )
    },
    {
      key: 'amount',
      header: '金额',
      cell: (row) => (
        <div>
          <p className="text-xs font-bold">{formatAmount(row.amount, row.currency)}</p>
          {row.paidAt && <p className="text-[10px] text-muted-foreground">{formatTime(row.paidAt)}</p>}
          <p className="text-[10px] text-muted-foreground">{formatTime(row.createdAt)}</p>
        </div>
      )
    },
    {
      key: 'actions',
      header: '操作',
      cell: (row) => (
        <div className="flex flex-col gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={(e) => { e.stopPropagation(); setSelectedOrderNo(row.orderNo === selectedOrderNo ? null : row.orderNo); }}
          >
            {selectedOrderNo === row.orderNo ? (
              <><ChevronUp className="w-3 h-3 mr-1" />收起</>
            ) : (
              <><ChevronDown className="w-3 h-3 mr-1" />详情</>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            disabled={reconcileMutation.isPending && reconcileMutation.variables === row.orderNo}
            onClick={(e) => { e.stopPropagation(); reconcileMutation.mutate(row.orderNo); }}
          >
            {reconcileMutation.isPending && reconcileMutation.variables === row.orderNo ? '同步中...' : '同步'}
          </Button>
        </div>
      )
    }
  ];

  const detail: OrderDetail | undefined = orderDetailQuery.data;

  return (
    <div className="space-y-4">
      <div className="px-6 pt-5">
        <h1 className="text-[2rem] font-semibold tracking-tight text-slate-900">订单管理</h1>
      </div>
      <div className="px-6 pb-6 space-y-3.5">
        <FilterBar
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="搜索订单号、用户、应用..."
          filters={[
            {
              id: 'status',
              placeholder: '全部状态',
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { value: 'pending', label: 'pending' },
                { value: 'paid', label: 'paid' },
                { value: 'failed', label: 'failed' },
                { value: 'cancelled', label: 'cancelled' },
                { value: 'refunded', label: 'refunded' }
              ]
            },
            {
              id: 'provider',
              placeholder: '全部渠道',
              value: providerFilter,
              onChange: setProviderFilter,
              options: [
                { value: 'wechat_pay', label: 'wechat_pay' },
                { value: 'alipay', label: 'alipay' }
              ]
            }
          ]}
        />

        <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
          <DataTable
            columns={orderColumns}
            data={orders}
            isLoading={ordersQuery.isLoading}
            emptyMessage="暂无订单"
            getRowKey={(row) => row.orderNo}
          />
        </div>

        <PaginationBar
          total={totalOrders}
          page={page}
          pageSize={PAGE_SIZE}
          isLoading={ordersQuery.isLoading}
          itemLabel="条订单"
          onPageChange={setPage}
        />

        {/* Order Detail Panel */}
        {selectedOrderNo && (
          <div className="space-y-4 rounded-xl border border-border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">订单详情: {selectedOrderNo}</h3>
              <Button size="sm" variant="outline" onClick={() => reconcileMutation.mutate(selectedOrderNo)} disabled={reconcileMutation.isPending}>
                {reconcileMutation.isPending ? '同步中...' : '同步订单'}
              </Button>
            </div>

            {orderDetailQuery.isLoading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-8 rounded bg-muted animate-pulse" />)}</div>
            ) : detail ? (
              <OrderDetailSection detail={detail} />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function OrderDetailSection({ detail }: { detail: OrderDetail }) {
  const { item, paymentAttempts, entitlements, events } = detail;

  return (
    <div className="space-y-4 text-sm">
      {/* Order Meta */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <InfoBlock label="订单号" value={item.orderNo} mono />
        <InfoBlock label="状态" value={item.status} />
        <InfoBlock label="渠道" value={item.provider ?? '—'} />
        <InfoBlock label="金额" value={formatAmount(item.amount, item.currency)} />
        <InfoBlock label="用户" value={item.user?.email ?? item.userId} />
        <InfoBlock label="应用" value={item.app?.code ?? '—'} mono />
        <InfoBlock label="应用" value={item.app?.name ?? item.appId} />
        <InfoBlock label="套餐" value={item.plan?.name ?? item.planId} />
        <InfoBlock label="支付时间" value={formatTime(item.paidAt)} />
      </div>

      {/* Checkout Session */}
      {item.checkoutSession && (
        <div className="p-3 rounded-md bg-muted/30 border border-border">
          <p className="text-xs font-semibold mb-2">Checkout Session</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <InfoBlock label="Code" value={item.checkoutSession.sessionCode} mono />
            <InfoBlock label="状态" value={item.checkoutSession.status} />
            <InfoBlock label="渠道" value={item.checkoutSession.provider ?? '—'} />
            <InfoBlock label="动作" value={item.checkoutSession.actionType ?? '—'} />
          </div>
          <JsonViewer data={item.checkoutSession.actionPayload} label="actionPayload" />
        </div>
      )}

      {/* Payment Attempts */}
      {paymentAttempts.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2">支付尝试 ({paymentAttempts.length})</p>
          <div className="space-y-2">
            {paymentAttempts.map((attempt) => (
              <div key={attempt.id} className="p-3 rounded-md bg-muted/30 border border-border">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-mono font-bold">{attempt.attemptNo}</span>
                  <StatusPill tone={statusToTone(attempt.status)} label={attempt.status} />
                  <span className="text-[10px] text-muted-foreground">{formatTime(attempt.createdAt)}</span>
                </div>
                {attempt.providerReference && (
                  <p className="text-[10px] text-muted-foreground font-mono">{attempt.providerReference}</p>
                )}
                <div className="flex gap-3 mt-1">
                  <JsonViewer data={attempt.requestPayload} label="请求" />
                  <JsonViewer data={attempt.responsePayload} label="响应" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Entitlements */}
      {entitlements.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2">关联权益 ({entitlements.length})</p>
          <div className="flex flex-wrap gap-2">
            {entitlements.map((e) => (
              <div key={e.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/30 border border-border text-xs">
                <span className="font-mono">{e.plan?.code ?? e.id}</span>
                <StatusPill tone={statusToTone(e.status)} label={e.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Events */}
      {events.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2">关联事件 ({events.length})</p>
          <div className="space-y-1">
            {events.map((ev, idx) => (
              <div key={idx} className="flex items-center gap-3 text-xs py-1 border-b border-border last:border-0">
                <span className="text-muted-foreground w-28 flex-shrink-0 text-[10px]">{formatTime(ev.eventTime)}</span>
                <span className="font-mono font-bold">{ev.eventName}</span>
                <JsonViewer data={ev.properties} label="props" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoBlock({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-xs mt-0.5 ${mono ? 'font-mono' : 'font-medium'} truncate`}>{value}</p>
    </div>
  );
}
