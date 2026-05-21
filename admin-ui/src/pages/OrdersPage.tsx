import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { getOrderDetail, listOrders, reconcileOrder } from '@/api/admin';
import type { HydratedOrder, OrderDetail } from '@/api/types';
import { Button } from '@/components/ui/button';
import { BulkActionBar, BulkActionButton } from '@/components/shared/BulkActionBar';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { FilterChipBar, type FilterChipConfig } from '@/components/shared/FilterChipBar';
import { JsonViewer } from '@/components/shared/JsonViewer';
import { PaginationBar } from '@/components/shared/PaginationBar';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { useTableState } from '@/hooks/useTableState';
import { formatAmount, formatTime } from '@/lib/utils';

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: 'pending', label: '待支付' },
  { value: 'paid', label: '已支付' },
  { value: 'failed', label: '失败' },
  { value: 'cancelled', label: '已取消' },
  { value: 'refunded', label: '已退款' },
] as const;

const PROVIDER_OPTIONS = [
  { value: 'wechat_pay', label: '微信支付' },
  { value: 'alipay', label: '支付宝' },
] as const;

type OrderStatus = (typeof STATUS_OPTIONS)[number]['value'];
type OrderProvider = (typeof PROVIDER_OPTIONS)[number]['value'];

export function OrdersPage() {
  const { page, search, filters, setPage, setSearch, setFilter, clearFilters } = useTableState({
    defaultPageSize: PAGE_SIZE,
    knownFilters: ['status', 'provider'],
  });

  const statusValues = useMemo(() => filters.status ?? [], [filters.status]);
  const providerValues = useMemo(() => filters.provider ?? [], [filters.provider]);
  const deferredSearch = useDeferredValue(search);

  const [selectedOrderNo, setSelectedOrderNo] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  const qc = useQueryClient();
  // 后端 status/provider 当前为单值；多选时取首项，UI 仍允许多选以便未来扩展
  const orderQuery = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      search: deferredSearch.trim() || undefined,
      status: (statusValues[0] as OrderStatus | undefined) ?? undefined,
      provider: (providerValues[0] as OrderProvider | undefined) ?? undefined,
    }),
    [deferredSearch, page, providerValues, statusValues],
  );
  const ordersQuery = useQuery({
    queryKey: ['orders', orderQuery],
    queryFn: () => listOrders(orderQuery),
  });
  const orderDetailQuery = useQuery({
    queryKey: ['order-detail', selectedOrderNo],
    queryFn: () => getOrderDetail(selectedOrderNo!),
    enabled: !!selectedOrderNo,
  });

  const reconcileMutation = useMutation({
    mutationFn: reconcileOrder,
    onSuccess: (result, orderNo) => {
      toast.success(
        `订单已同步: ${orderNo} → ${result.reconciliation.status} (${result.reconciliation.reason})`,
      );
      void qc.invalidateQueries({ queryKey: ['orders'] });
      if (selectedOrderNo === orderNo) {
        void qc.invalidateQueries({ queryKey: ['order-detail', orderNo] });
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '同步失败'),
  });

  const [bulkRunning, setBulkRunning] = useState(false);
  const runBulkReconcile = async () => {
    if (selectedRowIds.size === 0) return;
    setBulkRunning(true);
    const ids = Array.from(selectedRowIds);
    let ok = 0;
    let fail = 0;
    for (const orderNo of ids) {
      try {
        await reconcileOrder(orderNo);
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    setBulkRunning(false);
    setSelectedRowIds(new Set());
    void qc.invalidateQueries({ queryKey: ['orders'] });
    if (fail === 0) toast.success(`批量同步完成：${ok} 笔`);
    else toast.warning(`批量同步：成功 ${ok}、失败 ${fail}`);
  };

  const orders = useMemo(() => ordersQuery.data?.items ?? [], [ordersQuery.data?.items]);
  const totalOrders = ordersQuery.data?.total ?? 0;

  useEffect(() => {
    if (selectedOrderNo && !orders.some((order) => order.orderNo === selectedOrderNo)) {
      setSelectedOrderNo(null);
    }
  }, [orders, selectedOrderNo]);

  const chips: FilterChipConfig[] = [
    {
      id: 'status',
      label: '状态',
      values: statusValues,
      onChange: (next) => setFilter('status', next),
      options: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    },
    {
      id: 'provider',
      label: '支付方式',
      values: providerValues,
      onChange: (next) => setFilter('provider', next),
      options: PROVIDER_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    },
  ];

  const orderColumns: Column<HydratedOrder>[] = [
    {
      key: 'order',
      header: '订单',
      cell: (row) => (
        <div>
          <p className="font-mono text-xs font-bold">{row.orderNo}</p>
          <p className="text-muted-foreground text-[10px]">
            {row.checkoutSession?.sessionCode ?? '—'}
          </p>
          <p className="text-muted-foreground text-[10px]">{row.app?.name ?? row.appId}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: '状态',
      cell: (row) => (
        <div className="flex flex-col gap-1">
          <StatusPill tone={statusToTone(row.status)} label={row.status} />
          {row.provider && <StatusPill tone="neutral" label={row.provider} />}
          {row.providerOrderId && (
            <p className="text-muted-foreground max-w-[120px] truncate font-mono text-[10px]">
              {row.providerOrderId}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'user',
      header: '用户/应用',
      cell: (row) => (
        <div>
          <p className="text-xs font-bold">{row.user?.email ?? row.userId}</p>
          {row.app && <p className="text-muted-foreground font-mono text-[10px]">{row.app.code}</p>}
        </div>
      ),
    },
    {
      key: 'amount',
      header: '金额',
      cell: (row) => (
        <div>
          <p className="text-xs font-bold">{formatAmount(row.amount, row.currency)}</p>
          {row.paidAt && (
            <p className="text-muted-foreground text-[10px]">{formatTime(row.paidAt)}</p>
          )}
          <p className="text-muted-foreground text-[10px]">{formatTime(row.createdAt)}</p>
        </div>
      ),
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
            onClick={(e) => {
              e.stopPropagation();
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
            onClick={(e) => {
              e.stopPropagation();
              reconcileMutation.mutate(row.orderNo);
            }}
          >
            {reconcileMutation.isPending && reconcileMutation.variables === row.orderNo
              ? '同步中...'
              : '同步'}
          </Button>
        </div>
      ),
    },
  ];

  const detail: OrderDetail | undefined = orderDetailQuery.data;

  return (
    <div className="space-y-4">
      <div className="px-6 pt-5">
        <h1 className="text-[2rem] font-semibold tracking-tight text-slate-900">订单管理</h1>
      </div>
      <div className="space-y-3.5 px-6 pb-6">
        <FilterChipBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="搜索订单号、用户、应用..."
          chips={chips}
          onClearAll={clearFilters}
        />

        <BulkActionBar
          selectedCount={selectedRowIds.size}
          onClear={() => setSelectedRowIds(new Set())}
        >
          <BulkActionButton onClick={runBulkReconcile} disabled={bulkRunning}>
            <RefreshCw className={`size-3.5 ${bulkRunning ? 'animate-spin' : ''}`} />
            {bulkRunning ? '同步中...' : '批量同步'}
          </BulkActionButton>
        </BulkActionBar>

        <div className="border-border overflow-hidden rounded-xl border bg-white shadow-sm">
          <DataTable
            columns={orderColumns}
            data={orders}
            isLoading={ordersQuery.isLoading}
            emptyMessage="暂无订单"
            getRowId={(row) => row.orderNo}
            enableRowSelection
            selectedRowIds={selectedRowIds}
            onSelectionChange={setSelectedRowIds}
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

        {selectedOrderNo && (
          <div className="border-border space-y-4 rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">订单详情: {selectedOrderNo}</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => reconcileMutation.mutate(selectedOrderNo)}
                disabled={reconcileMutation.isPending}
              >
                {reconcileMutation.isPending ? '同步中...' : '同步订单'}
              </Button>
            </div>

            {orderDetailQuery.isLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-muted h-8 animate-pulse rounded" />
                ))}
              </div>
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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
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

      {item.checkoutSession && (
        <div className="bg-muted/30 border-border rounded-md border p-3">
          <p className="mb-2 text-xs font-semibold">Checkout Session</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <InfoBlock label="Code" value={item.checkoutSession.sessionCode} mono />
            <InfoBlock label="状态" value={item.checkoutSession.status} />
            <InfoBlock label="渠道" value={item.checkoutSession.provider ?? '—'} />
            <InfoBlock label="动作" value={item.checkoutSession.actionType ?? '—'} />
          </div>
          <JsonViewer data={item.checkoutSession.actionPayload} label="actionPayload" />
        </div>
      )}

      {paymentAttempts.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold">支付尝试 ({paymentAttempts.length})</p>
          <div className="space-y-2">
            {paymentAttempts.map((attempt) => (
              <div key={attempt.id} className="bg-muted/30 border-border rounded-md border p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold">{attempt.attemptNo}</span>
                  <StatusPill tone={statusToTone(attempt.status)} label={attempt.status} />
                  <span className="text-muted-foreground text-[10px]">
                    {formatTime(attempt.createdAt)}
                  </span>
                </div>
                {attempt.providerReference && (
                  <p className="text-muted-foreground font-mono text-[10px]">
                    {attempt.providerReference}
                  </p>
                )}
                <div className="mt-1 flex gap-3">
                  <JsonViewer data={attempt.requestPayload} label="请求" />
                  <JsonViewer data={attempt.responsePayload} label="响应" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {entitlements.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold">关联权益 ({entitlements.length})</p>
          <div className="flex flex-wrap gap-2">
            {entitlements.map((e) => (
              <div
                key={e.id}
                className="bg-muted/30 border-border flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs"
              >
                <span className="font-mono">{e.plan?.code ?? e.id}</span>
                <StatusPill tone={statusToTone(e.status)} label={e.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {events.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold">关联事件 ({events.length})</p>
          <div className="space-y-1">
            {events.map((ev, idx) => (
              <div
                key={idx}
                className="border-border flex items-center gap-3 border-b py-1 text-xs last:border-0"
              >
                <span className="text-muted-foreground w-28 shrink-0 text-[10px]">
                  {formatTime(ev.eventTime)}
                </span>
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
      <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">
        {label}
      </p>
      <p className={`mt-0.5 text-xs ${mono ? 'font-mono' : 'font-medium'} truncate`}>{value}</p>
    </div>
  );
}
