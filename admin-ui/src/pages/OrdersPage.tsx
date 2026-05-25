import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Eye, RefreshCw } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cancelOrder, getOrderDetail, listOrders, reconcileOrder, refundOrder } from '@/api/admin';
import type { HydratedOrder, OrderDetail } from '@/api/types';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { BulkActionBar, BulkActionButton } from '@/components/shared/BulkActionBar';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { FilterChipBar, type FilterChipConfig } from '@/components/shared/FilterChipBar';
import { JsonViewer } from '@/components/shared/JsonViewer';
import { PaginationBar } from '@/components/shared/PaginationBar';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { useTableState } from '@/hooks/useTableState';
import { toastErr, toastOk, toastWarn } from '@/lib/toast';
import { formatAmount, formatTime } from '@/lib/utils';

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: 'pending', label: '待支付' },
  { value: 'paid', label: '已支付' },
  { value: 'failed', label: '失败' },
  { value: 'cancelled', label: '已取消' },
  { value: 'refunding', label: '退款中' },
  { value: 'refunded', label: '已退款' },
] as const;

const PROVIDER_OPTIONS = [
  { value: 'wechat_pay', label: '微信支付' },
  { value: 'alipay', label: '支付宝' },
] as const;

type OrderStatus = (typeof STATUS_OPTIONS)[number]['value'];
type OrderProvider = (typeof PROVIDER_OPTIONS)[number]['value'];

function adminSearchHref(path: string, search: string) {
  return `${path}?search=${encodeURIComponent(search)}`;
}

function userDetailHref(userId: string) {
  return `/admin/users?userId=${encodeURIComponent(userId)}`;
}

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
      toastOk(
        `订单已同步: ${orderNo}`,
        `${result.reconciliation.status} · ${result.reconciliation.reason}`,
      );
      void qc.invalidateQueries({ queryKey: ['orders'] });
      if (selectedOrderNo === orderNo) {
        void qc.invalidateQueries({ queryKey: ['order-detail', orderNo] });
      }
    },
    onError: (err) => toastErr(err, '同步失败'),
  });

  const cancelMutation = useMutation({
    mutationFn: cancelOrder,
    onSuccess: (result, orderNo) => {
      toastWarn(`订单已关闭: ${orderNo}`, result.action.reason);
      void qc.invalidateQueries({ queryKey: ['orders'] });
      if (selectedOrderNo === orderNo) {
        void qc.invalidateQueries({ queryKey: ['order-detail', orderNo] });
      }
    },
    onError: (err) => toastErr(err, '关闭订单失败'),
  });

  const refundMutation = useMutation({
    mutationFn: refundOrder,
    onSuccess: (result, orderNo) => {
      const title = result.action.status === 'refunding' ? '退款已受理' : '订单已退款';
      toastWarn(`${title}: ${orderNo}`, result.action.reason);
      void qc.invalidateQueries({ queryKey: ['orders'] });
      if (selectedOrderNo === orderNo) {
        void qc.invalidateQueries({ queryKey: ['order-detail', orderNo] });
      }
    },
    onError: (err) => toastErr(err, '退款失败'),
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
    if (fail === 0) toastOk(`批量同步完成：${ok} 笔`);
    else toastWarn(`批量同步：成功 ${ok}、失败 ${fail}`);
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
      header: '订单号',
      cell: (row) => (
        <div className="min-w-0">
          <p className="text-foreground truncate font-mono text-[12px] font-semibold">
            {row.orderNo}
          </p>
          <p className="text-muted-foreground truncate text-[10px]">{row.app?.name ?? row.appId}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: '状态',
      cell: (row) => (
        <div className="inline-flex items-center gap-1.5">
          <StatusPill tone={statusToTone(row.status)} label={row.status} />
          {row.provider ? (
            <span className="text-muted-foreground text-[10px] uppercase tracking-wide">
              {row.provider}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'user',
      header: '用户',
      cell: (row) => <p className="truncate text-[12px]">{row.user?.email ?? row.userId}</p>,
    },
    {
      key: 'amount',
      header: '金额',
      cell: (row) => (
        <div className="tabular-nums">
          <p className="text-foreground text-[12px] font-semibold">
            {formatAmount(row.amount, row.currency)}
          </p>
          <p className="text-muted-foreground text-[10px]">{formatTime(row.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      className: 'w-[140px]',
      cell: (row) => (
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedOrderNo(row.orderNo);
            }}
          >
            <Eye className="h-3 w-3" />
            查看
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground h-7 px-2 text-xs"
            disabled={reconcileMutation.isPending && reconcileMutation.variables === row.orderNo}
            onClick={(e) => {
              e.stopPropagation();
              reconcileMutation.mutate(row.orderNo);
            }}
          >
            {reconcileMutation.isPending && reconcileMutation.variables === row.orderNo
              ? '同步中'
              : '同步'}
          </Button>
        </div>
      ),
    },
  ];

  const detail: OrderDetail | undefined = orderDetailQuery.data;

  return (
    <div className="space-y-4 px-6 py-5">
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

      <div className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
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
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) setSelectedOrderNo(null);
          }}
        >
          <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
            <SheetHeader className="border-border border-b px-6 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SheetDescription className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">
                    订单详情
                  </SheetDescription>
                  <SheetTitle className="text-foreground mt-1 truncate font-mono text-[15px] font-semibold">
                    {selectedOrderNo}
                  </SheetTitle>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => reconcileMutation.mutate(selectedOrderNo)}
                  disabled={reconcileMutation.isPending}
                >
                  <RefreshCw
                    className={`size-3.5 ${reconcileMutation.isPending ? 'animate-spin' : ''}`}
                  />
                  {reconcileMutation.isPending ? '同步中' : '同步订单'}
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    detail?.item.status !== 'pending' ||
                    cancelMutation.isPending ||
                    reconcileMutation.isPending
                  }
                  onClick={() => cancelMutation.mutate(selectedOrderNo)}
                >
                  {cancelMutation.isPending ? '关闭中' : '关闭订单'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    !['paid', 'refunding'].includes(detail?.item.status ?? '') ||
                    refundMutation.isPending ||
                    reconcileMutation.isPending
                  }
                  onClick={() => refundMutation.mutate(selectedOrderNo)}
                >
                  {refundMutation.isPending
                    ? '退款中'
                    : detail?.item.status === 'refunding'
                      ? '回查退款'
                      : '全额退款'}
                </Button>
              </div>
            </SheetHeader>

            <div className="px-6 py-5">
              {orderDetailQuery.isLoading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="bg-muted h-8 animate-pulse rounded" />
                  ))}
                </div>
              ) : detail ? (
                <OrderDetailSection detail={detail} />
              ) : null}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

function OrderDetailSection({ detail }: { detail: OrderDetail }) {
  const { item, paymentAttempts, entitlements, events } = detail;

  return (
    <div className="space-y-5 text-sm">
      <section className="border-border bg-card grid grid-cols-2 gap-x-5 gap-y-4 rounded-xl border p-4 md:grid-cols-3">
        <InfoBlock
          label="状态"
          render={<StatusPill tone={statusToTone(item.status)} label={item.status} />}
        />
        <InfoBlock label="渠道" value={item.provider ?? '—'} />
        <InfoBlock
          label="金额"
          value={formatAmount(item.amount, item.currency)}
          valueClassName="text-[15px] font-semibold tabular-nums"
        />
        <InfoBlock label="用户" value={item.user?.email ?? item.userId} />
        <InfoBlock label="应用名" value={item.app?.name ?? item.appId} />
        <InfoBlock label="应用 Code" value={item.app?.code ?? '—'} mono />
        <InfoBlock label="套餐" value={item.plan?.name ?? item.planId} />
        <InfoBlock label="支付时间" value={formatTime(item.paidAt)} />
        <InfoBlock label="创建时间" value={formatTime(item.createdAt)} />
      </section>

      <section className="border-border bg-card rounded-xl border p-4">
        <div className="mb-3">
          <h3 className="text-foreground text-sm font-semibold">关联处理</h3>
          <p className="text-muted-foreground mt-1 text-xs">
            从当前订单继续定位用户、授权与工单上下文，避免在异常处理时重复检索。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionLink to={userDetailHref(item.userId)} label="用户 360" />
          <ActionLink to={adminSearchHref('/admin/tickets', item.orderNo)} label="关联工单" />
          <ActionLink to={adminSearchHref('/admin/licenses', item.orderNo)} label="关联授权" />
          <ActionLink
            to={adminSearchHref('/admin/orders', item.user?.email ?? item.userId)}
            label="用户订单"
          />
        </div>
      </section>

      {item.checkoutSession && (
        <DetailSection title="Checkout Session">
          <div className="grid grid-cols-2 gap-x-5 gap-y-3 text-xs">
            <InfoBlock label="Code" value={item.checkoutSession.sessionCode} mono />
            <InfoBlock label="状态" value={item.checkoutSession.status} />
            <InfoBlock label="渠道" value={item.checkoutSession.provider ?? '—'} />
            <InfoBlock label="动作" value={item.checkoutSession.actionType ?? '—'} />
          </div>
          <div className="mt-3">
            <JsonViewer data={item.checkoutSession.actionPayload} label="actionPayload" />
          </div>
        </DetailSection>
      )}

      {paymentAttempts.length > 0 && (
        <DetailSection title={`支付尝试 (${paymentAttempts.length})`}>
          <div className="space-y-2">
            {paymentAttempts.map((attempt) => (
              <div key={attempt.id} className="border-border rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[12px] font-semibold">{attempt.attemptNo}</span>
                  <StatusPill tone={statusToTone(attempt.status)} label={attempt.status} />
                  <span className="text-muted-foreground ml-auto text-[10px] tabular-nums">
                    {formatTime(attempt.createdAt)}
                  </span>
                </div>
                {attempt.providerReference && (
                  <p className="text-muted-foreground mt-1.5 font-mono text-[10px]">
                    {attempt.providerReference}
                  </p>
                )}
                <div className="mt-2 flex gap-3">
                  <JsonViewer data={attempt.requestPayload} label="请求" />
                  <JsonViewer data={attempt.responsePayload} label="响应" />
                </div>
              </div>
            ))}
          </div>
        </DetailSection>
      )}

      {entitlements.length > 0 && (
        <DetailSection title={`关联权益 (${entitlements.length})`}>
          <div className="flex flex-wrap gap-2">
            {entitlements.map((e) => (
              <Link
                key={e.id}
                to={`/admin/licenses?search=${encodeURIComponent(e.id)}`}
                className="border-border bg-card hover:border-foreground/20 hover:bg-muted/40 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs no-underline transition-colors"
                title="在授权管理中查看"
              >
                <span className="text-foreground font-mono">{e.plan?.code ?? e.id}</span>
                <StatusPill tone={statusToTone(e.status)} label={e.status} />
                <ArrowUpRight className="text-muted-foreground/60 h-3 w-3" />
              </Link>
            ))}
          </div>
        </DetailSection>
      )}

      {events.length > 0 && (
        <DetailSection title={`关联事件 (${events.length})`}>
          <div className="border-border divide-border divide-y overflow-hidden rounded-md border">
            {events.map((ev, idx) => (
              <div key={idx} className="flex items-start gap-3 px-3 py-2 text-xs">
                <span className="text-muted-foreground w-28 shrink-0 text-[10px] tabular-nums">
                  {formatTime(ev.eventTime)}
                </span>
                <span className="text-foreground font-mono text-[11px] font-semibold">
                  {ev.eventName}
                </span>
                <div className="ml-auto">
                  <JsonViewer data={ev.properties} label="props" />
                </div>
              </div>
            ))}
          </div>
        </DetailSection>
      )}
    </div>
  );
}

function ActionLink({ to, label }: { to: string; label: string }) {
  return (
    <Button size="sm" variant="outline" asChild className="h-8 text-xs">
      <Link to={to}>
        {label}
        <ArrowUpRight className="h-3 w-3" />
      </Link>
    </Button>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-muted-foreground mb-2 text-[11px] font-semibold uppercase tracking-wider">
        {title}
      </h3>
      {children}
    </section>
  );
}

function InfoBlock({
  label,
  value,
  mono,
  valueClassName,
  render,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  valueClassName?: string;
  render?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">
        {label}
      </p>
      <div className="mt-1">
        {render ?? (
          <p
            className={
              valueClassName ??
              `text-foreground truncate text-xs ${mono ? 'font-mono' : 'font-medium'}`
            }
          >
            {value}
          </p>
        )}
      </div>
    </div>
  );
}
