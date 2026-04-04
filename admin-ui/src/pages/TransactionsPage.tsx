import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { getOrderDetail, listOrders, reconcileOrder } from '@/api/admin';
import type { HydratedOrder, OrderDetail } from '@/api/types';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { FilterBar } from '@/components/shared/FilterBar';
import { JsonViewer } from '@/components/shared/JsonViewer';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { formatAmount, formatTime } from '@/lib/utils';

export function TransactionsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('__all__');
  const [providerFilter, setProviderFilter] = useState('__all__');
  const [selectedOrderNo, setSelectedOrderNo] = useState<string | null>(null);

  const qc = useQueryClient();
  const ordersQuery = useQuery({ queryKey: ['orders', 100], queryFn: () => listOrders(100) });
  const orderDetailQuery = useQuery({
    queryKey: ['order-detail', selectedOrderNo],
    queryFn: () => getOrderDetail(selectedOrderNo!),
    enabled: Boolean(selectedOrderNo)
  });

  const reconcileMutation = useMutation({
    mutationFn: reconcileOrder,
    onSuccess: (result, orderNo) => {
      toast.success(`交易已同步: ${orderNo} → ${result.reconciliation.status} (${result.reconciliation.reason})`);
      void qc.invalidateQueries({ queryKey: ['orders'] });
      if (selectedOrderNo === orderNo) {
        void qc.invalidateQueries({ queryKey: ['order-detail', orderNo] });
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '同步失败')
  });

  const orders = ordersQuery.data?.items ?? [];
  const filteredOrders = orders.filter((order) => {
    const query = searchQuery.toLowerCase();
    const matchSearch =
      !query ||
      [order.orderNo, order.user?.email ?? '', order.product?.code ?? '', order.price?.code ?? ''].some((value) =>
        value.toLowerCase().includes(query)
      );
    const matchStatus = statusFilter === '__all__' || order.status === statusFilter;
    const matchProvider = providerFilter === '__all__' || (order.provider ?? '') === providerFilter;
    return matchSearch && matchStatus && matchProvider;
  });

  const uniqueStatuses = [...new Set(orders.map((order) => order.status))];
  const uniqueProviders = [...new Set(orders.map((order) => order.provider ?? '').filter(Boolean))];

  const columns: Column<HydratedOrder>[] = [
    {
      key: 'order',
      header: '订单',
      cell: (row) => (
        <div className="space-y-1">
          <p className="text-xs font-bold font-mono text-foreground">{row.orderNo}</p>
          <p className="text-[10px] text-muted-foreground">{row.checkoutSession?.sessionCode ?? '—'}</p>
          <p className="text-[10px] text-muted-foreground">{row.product?.name ?? row.productId}</p>
        </div>
      )
    },
    {
      key: 'payment',
      header: '支付状态',
      cell: (row) => (
        <div className="flex flex-col gap-1">
          <StatusPill tone={statusToTone(row.status)} label={row.status} />
          {row.provider ? <StatusPill tone="neutral" label={row.provider} /> : null}
          {row.providerOrderId ? <p className="text-[10px] font-mono text-muted-foreground">{row.providerOrderId}</p> : null}
        </div>
      )
    },
    {
      key: 'user',
      header: '用户 / 应用',
      cell: (row) => (
        <div className="space-y-1">
          <p className="text-xs font-bold text-foreground">{row.user?.email ?? row.userId}</p>
          <p className="text-[10px] text-muted-foreground font-mono">{row.app?.code ?? '—'}</p>
        </div>
      )
    },
    {
      key: 'amount',
      header: '金额',
      cell: (row) => (
        <div className="space-y-1">
          <p className="text-xs font-bold text-foreground">{formatAmount(row.amount, row.currency)}</p>
          <p className="text-[10px] text-muted-foreground">{formatTime(row.createdAt)}</p>
          {row.paidAt ? <p className="text-[10px] text-muted-foreground">支付于 {formatTime(row.paidAt)}</p> : null}
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
            onClick={(event) => {
              event.stopPropagation();
              setSelectedOrderNo(row.orderNo === selectedOrderNo ? null : row.orderNo);
            }}
          >
            {selectedOrderNo === row.orderNo ? (
              <>
                <ChevronUp className="mr-1 h-3 w-3" />
                收起
              </>
            ) : (
              <>
                <ChevronDown className="mr-1 h-3 w-3" />
                详情
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            disabled={reconcileMutation.isPending && reconcileMutation.variables === row.orderNo}
            onClick={(event) => {
              event.stopPropagation();
              reconcileMutation.mutate(row.orderNo);
            }}
          >
            {reconcileMutation.isPending && reconcileMutation.variables === row.orderNo ? '同步中...' : '同步'}
          </Button>
        </div>
      )
    }
  ];

  const detail: OrderDetail | undefined = orderDetailQuery.data;

  return (
    <div>
      <SectionHeader sectionKey="transactions" />
      <div className="px-6 py-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="交易总数" value={orders.length} note="最近加载的交易记录数量" />
          <MetricCard label="已支付" value={orders.filter((order) => order.status === 'paid').length} note="状态为 paid 的订单" />
          <MetricCard label="待处理" value={orders.filter((order) => ['pending', 'processing'].includes(order.status)).length} note="需要继续关注的订单" tone="warn" />
        </div>

        <FilterBar
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="搜索订单号、用户、产品..."
          filters={[
            {
              id: 'status',
              placeholder: '全部状态',
              value: statusFilter,
              onChange: setStatusFilter,
              options: uniqueStatuses.map((status) => ({ value: status, label: status }))
            },
            {
              id: 'provider',
              placeholder: '全部渠道',
              value: providerFilter,
              onChange: setProviderFilter,
              options: uniqueProviders.map((provider) => ({ value: provider, label: provider }))
            }
          ]}
        />

        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <DataTable
            columns={columns}
            data={filteredOrders}
            isLoading={ordersQuery.isLoading}
            emptyMessage="暂无交易记录"
            getRowKey={(row) => row.orderNo}
          />
        </div>

        {selectedOrderNo ? (
          <div className="rounded-2xl border border-border bg-white p-5 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-foreground">交易详情: {selectedOrderNo}</h3>
                <p className="mt-1 text-xs text-muted-foreground">串联订单、支付尝试、授权结果和事件记录。</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => reconcileMutation.mutate(selectedOrderNo)} disabled={reconcileMutation.isPending}>
                {reconcileMutation.isPending ? '同步中...' : '同步交易'}
              </Button>
            </div>

            {orderDetailQuery.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-8 rounded bg-muted animate-pulse" />
                ))}
              </div>
            ) : detail ? (
              <TransactionDetailSection detail={detail} />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  note,
  tone = 'neutral'
}: {
  label: string;
  value: number;
  note: string;
  tone?: 'neutral' | 'warn';
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-3 text-3xl font-black ${tone === 'warn' && value > 0 ? 'text-amber-600' : 'text-foreground'}`}>
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function TransactionDetailSection({ detail }: { detail: OrderDetail }) {
  const { item, paymentAttempts, authorizationGrants, events } = detail;

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <InfoBlock label="订单号" value={item.orderNo} mono />
        <InfoBlock label="状态" value={item.status} />
        <InfoBlock label="渠道" value={item.provider ?? '—'} />
        <InfoBlock label="金额" value={formatAmount(item.amount, item.currency)} />
        <InfoBlock label="用户" value={item.user?.email ?? item.userId} />
        <InfoBlock label="产品" value={item.product?.name ?? item.productId} />
        <InfoBlock label="价格方案" value={item.price?.name ?? item.price?.code ?? item.priceId} />
        <InfoBlock label="应用" value={item.app?.code ?? '—'} mono />
        <InfoBlock label="支付时间" value={formatTime(item.paidAt)} />
      </div>

      {item.checkoutSession ? (
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <p className="mb-2 text-xs font-black">Checkout Session</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <InfoBlock label="Code" value={item.checkoutSession.sessionCode} mono />
            <InfoBlock label="状态" value={item.checkoutSession.status} />
            <InfoBlock label="渠道" value={item.checkoutSession.provider ?? '—'} />
            <InfoBlock label="动作" value={item.checkoutSession.actionType ?? '—'} />
          </div>
          <JsonViewer data={item.checkoutSession.actionPayload} label="actionPayload" />
        </div>
      ) : null}

      {paymentAttempts.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-black">支付尝试 ({paymentAttempts.length})</p>
          <div className="space-y-2">
            {paymentAttempts.map((attempt) => (
              <div key={attempt.id} className="rounded-xl border border-border bg-muted/30 p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold font-mono">{attempt.attemptNo}</span>
                  <StatusPill tone={statusToTone(attempt.status)} label={attempt.status} />
                  <span className="text-[10px] text-muted-foreground">{formatTime(attempt.createdAt)}</span>
                </div>
                {attempt.providerReference ? (
                  <p className="text-[10px] font-mono text-muted-foreground">{attempt.providerReference}</p>
                ) : null}
                <div className="mt-1 flex gap-3">
                  <JsonViewer data={attempt.requestPayload} label="请求" />
                  <JsonViewer data={attempt.responsePayload} label="响应" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {authorizationGrants.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-black">关联授权 ({authorizationGrants.length})</p>
          <div className="flex flex-wrap gap-2">
            {authorizationGrants.map((authorizationGrant) => (
              <div key={authorizationGrant.id} className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2 py-1 text-xs">
                <span className="font-mono">{authorizationGrant.authorizationTemplate?.code ?? authorizationGrant.id}</span>
                <StatusPill tone={statusToTone(authorizationGrant.status)} label={authorizationGrant.status} />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {events.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-black">关联事件 ({events.length})</p>
          <div className="space-y-2">
            {events.map((event, index) => (
              <div key={`${event.eventName}-${index}`} className="rounded-xl border border-border bg-muted/30 p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold font-mono">{event.eventName}</span>
                  <span className="text-[10px] text-muted-foreground">{formatTime(event.eventTime)}</span>
                </div>
                <JsonViewer data={event.properties} label="properties" />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InfoBlock({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-white px-3 py-2">
      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xs text-foreground ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}
