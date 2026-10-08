import { OrderItems } from '@/components/shared/OrderItems';
import { handleAsync } from '@/lib/async-events';
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
import { ConfirmActionDialog } from '@/components/shared/ConfirmActionDialog';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { FilterChipBar, type FilterChipConfig } from '@/components/shared/FilterChipBar';
import { JsonViewer } from '@/components/shared/JsonViewer';
import { PaginationBar } from '@/components/shared/PaginationBar';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { useTableState } from '@/hooks/useTableState';
import {
  checkoutActionTypeLabel,
  checkoutSessionStatusLabel,
  entitlementStatusLabel,
  orderStatusLabel,
  paymentProviderLabel,
} from '@/lib/portal-labels';
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
type PendingOrderAction = { type: 'cancel' | 'refund'; orderNo: string; amountLabel?: string };

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
  const [pendingAction, setPendingAction] = useState<PendingOrderAction | null>(null);

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
      toastOk(`订单已同步: ${orderNo}`, result.reconciliation.reason);
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
      setPendingAction(null);
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
      setPendingAction(null);
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
          <p className="truncate font-mono text-[12px] font-semibold text-foreground">
            {row.orderNo}
          </p>
          <p className="truncate text-[10px] text-muted-foreground">{row.app?.name ?? row.appId}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: '状态',
      cell: (row) => (
        <div className="inline-flex items-center gap-1.5">
          <StatusPill tone={statusToTone(row.status)} label={orderStatusLabel(row.status)} />
          {row.provider ? (
            <span className="text-[10px] text-muted-foreground">
              {paymentProviderLabel(row.provider)}
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
          <p className="text-[12px] font-semibold text-foreground">
            {formatAmount(row.amount, row.currency)}
          </p>
          <p className="text-[10px] text-muted-foreground">{formatTime(row.createdAt)}</p>
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
            className="h-7 px-2 text-xs text-muted-foreground"
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
        <BulkActionButton onClick={handleAsync(runBulkReconcile)} disabled={bulkRunning}>
          <RefreshCw className={`size-3.5 ${bulkRunning ? 'animate-spin' : ''}`} />
          {bulkRunning ? '同步中...' : '批量同步'}
        </BulkActionButton>
      </BulkActionBar>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
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
            <SheetHeader className="border-b border-border px-6 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SheetDescription className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                    订单详情
                  </SheetDescription>
                  <SheetTitle className="mt-1 truncate font-mono text-[15px] font-semibold text-foreground">
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
                  onClick={() => setPendingAction({ type: 'cancel', orderNo: selectedOrderNo })}
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
                  onClick={() =>
                    setPendingAction({
                      type: 'refund',
                      orderNo: selectedOrderNo,
                      amountLabel: detail
                        ? formatAmount(detail.item.amount, detail.item.currency)
                        : undefined,
                    })
                  }
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
                    <div key={i} className="h-8 animate-pulse rounded bg-muted" />
                  ))}
                </div>
              ) : detail ? (
                <OrderDetailSection detail={detail} />
              ) : null}
            </div>
          </SheetContent>
        </Sheet>
      )}

      <ConfirmActionDialog
        open={!!pendingAction}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
        title={pendingAction?.type === 'refund' ? '确认发起退款？' : '确认关闭订单？'}
        description={
          pendingAction?.type === 'refund'
            ? `将对订单 ${pendingAction.orderNo} 发起全额退款${pendingAction.amountLabel ? `（${pendingAction.amountLabel}）` : ''}。退款可能影响对应授权状态，请确认已完成必要核对。`
            : pendingAction
              ? `将关闭订单 ${pendingAction.orderNo}。关闭后用户需要重新发起购买才能继续支付。`
              : undefined
        }
        confirmText={pendingAction?.type === 'refund' ? '确认退款' : '确认关闭'}
        isConfirming={cancelMutation.isPending || refundMutation.isPending}
        onConfirm={() => {
          if (!pendingAction) return;
          if (pendingAction.type === 'refund') {
            refundMutation.mutate(pendingAction.orderNo);
            return;
          }
          cancelMutation.mutate(pendingAction.orderNo);
        }}
      />
    </div>
  );
}

function OrderDetailSection({ detail }: { detail: OrderDetail }) {
  const { item, paymentAttempts, entitlements, events } = detail;

  return (
    <div className="space-y-5 text-sm">
      <section className="grid grid-cols-2 gap-x-5 gap-y-4 rounded-xl border border-border bg-card p-4 md:grid-cols-3">
        <InfoBlock
          label="状态"
          render={
            <StatusPill tone={statusToTone(item.status)} label={orderStatusLabel(item.status)} />
          }
        />
        <InfoBlock label="渠道" value={paymentProviderLabel(item.provider)} />
        <InfoBlock
          label="金额"
          value={formatAmount(item.amount, item.currency)}
          valueClassName="text-[15px] font-semibold tabular-nums"
        />
        <InfoBlock label="用户" value={item.user?.email ?? item.userId} />
        <InfoBlock
          label="应用名"
          value={item.items?.[0]?.appName ?? item.app?.name ?? item.appId}
        />
        <InfoBlock label="应用 Code" value={item.app?.code ?? '—'} mono />
        <InfoBlock
          label="套餐"
          value={
            item.items?.find((i) => i.kind === 'software')?.title ?? item.plan?.name ?? item.planId
          }
        />
        <InfoBlock label="支付时间" value={formatTime(item.paidAt)} />
        <InfoBlock label="创建时间" value={formatTime(item.createdAt)} />
      </section>

      <OrderItems items={item.items} />
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-foreground">关联处理</h3>
          <p className="mt-1 text-xs text-muted-foreground">
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
        <DetailSection title="支付会话">
          <div className="grid grid-cols-2 gap-x-5 gap-y-3 text-xs">
            <InfoBlock label="Code" value={item.checkoutSession.sessionCode} mono />
            <InfoBlock
              label="状态"
              value={checkoutSessionStatusLabel(item.checkoutSession.status)}
            />
            <InfoBlock label="渠道" value={paymentProviderLabel(item.checkoutSession.provider)} />
            <InfoBlock
              label="动作"
              value={checkoutActionTypeLabel(item.checkoutSession.actionType)}
            />
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
              <div key={attempt.id} className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[12px] font-semibold">{attempt.attemptNo}</span>
                  <StatusPill
                    tone={statusToTone(attempt.status)}
                    label={checkoutSessionStatusLabel(attempt.status)}
                  />
                  <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                    {formatTime(attempt.createdAt)}
                  </span>
                </div>
                {attempt.providerReference && (
                  <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">
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
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs no-underline transition-colors hover:border-foreground/20 hover:bg-muted/40"
                title="在授权管理中查看"
              >
                <span className="font-mono text-foreground">{e.plan?.code ?? e.id}</span>
                <StatusPill
                  tone={statusToTone(e.status)}
                  label={entitlementStatusLabel(e.status)}
                />
                <ArrowUpRight className="h-3 w-3 text-muted-foreground/60" />
              </Link>
            ))}
          </div>
        </DetailSection>
      )}

      {events.length > 0 && (
        <DetailSection title={`关联事件 (${events.length})`}>
          <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {events.map((ev, idx) => (
              <div key={idx} className="flex items-start gap-3 px-3 py-2 text-xs">
                <span className="w-28 shrink-0 text-[10px] text-muted-foreground tabular-nums">
                  {formatTime(ev.eventTime)}
                </span>
                <span className="font-mono text-[11px] font-semibold text-foreground">
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
      <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
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
      <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <div className="mt-1">
        {render ?? (
          <p
            className={
              valueClassName ??
              `truncate text-xs text-foreground ${mono ? 'font-mono' : 'font-medium'}`
            }
          >
            {value}
          </p>
        )}
      </div>
    </div>
  );
}
