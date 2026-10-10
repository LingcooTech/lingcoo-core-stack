import { AdminItemRefundLedger } from '@/components/admin/ItemRefundLedger';
import { HostingFulfillmentStatus } from '@/components/admin/HostingFulfillmentStatus';
import { OrderItems } from '@/components/admin/OrderItems';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Eye } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cancelOrder, getOrderDetail, listOrders, reconcileOrder, refundOrder } from '@/api/admin';
import type { HydratedOrder, OrderDetail } from '@/api/types';
import {
  App,
  Alert,
  Card,
  Typography,
  Button,
  Flex,
  Input,
  Modal,
  Select,
  Table,
  type TableColumnsType,
} from 'antd';
import { PageContainer } from '@/components/admin/PageContainer';
import { ManagementDrawer } from '@/components/admin/ManagementDrawer';
import { AsyncState } from '@/components/admin/AsyncState';
import { JsonViewer } from '@/components/admin/JsonViewer';
import { StatusTag, statusToTone } from '@/components/admin/StatusTag';
import { useAuth } from '@/lib/auth';
import { hasPermission, normalizeRole, type AppPermission } from '@/lib/rbac';
import { useTableState } from '@/hooks/useTableState';
import {
  checkoutActionTypeLabel,
  checkoutSessionStatusLabel,
  entitlementStatusLabel,
  orderStatusLabel,
  paymentProviderLabel,
} from '@/lib/portal-labels';
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
  const { message } = App.useApp();
  const { user } = useAuth();
  const can = (permission: AppPermission) => hasPermission(normalizeRole(user?.role), permission);
  const toastOk = (title: string, detail?: string) => {
    void message.success(detail ? `${title}：${detail}` : title);
  };
  const toastWarn = (title: string, detail?: string) => {
    void message.warning(detail ? `${title}：${detail}` : title);
  };
  const toastErr = (error: unknown, title: string) => {
    void message.error(error instanceof Error ? `${title}：${error.message}` : title);
  };
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

  useEffect(() => {
    setSelectedRowIds(new Set());
  }, [page, search, statusValues, providerValues]);

  const qc = useQueryClient();
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

  const orderColumns: TableColumnsType<HydratedOrder> = [
    {
      key: 'order',
      width: 300,
      title: '订单号',
      render: (_, row) => (
        <div className="min-w-0">
          <p className="admin-text truncate font-mono text-sm font-semibold">{row.orderNo}</p>
          <p className="admin-text-secondary truncate text-xs">{row.app?.name ?? row.appId}</p>
        </div>
      ),
    },
    {
      key: 'status',
      width: 160,
      title: '状态',
      render: (_, row) => (
        <div className="inline-flex items-center gap-1.5">
          <StatusTag tone={statusToTone(row.status)} label={orderStatusLabel(row.status)} />
          {row.provider ? (
            <span className="admin-text-secondary text-xs">
              {paymentProviderLabel(row.provider)}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'user',
      width: 240,
      title: '用户',
      render: (_, row) => <p className="truncate text-sm">{row.user?.email ?? row.userId}</p>,
    },
    {
      key: 'amount',
      width: 160,
      title: '金额',
      render: (_, row) => (
        <div className="tabular-nums">
          <p className="admin-text text-sm font-semibold">
            {formatAmount(row.amount, row.currency)}
          </p>
          <p className="admin-text-secondary text-xs">{formatTime(row.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'actions',
      width: 180,
      title: '操作',
      className: 'w-[140px]',
      render: (_, row) => (
        <div className="flex items-center gap-1.5">
          <Button
            size="small"
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
            size="small"
            type="text"
            className="admin-text-secondary h-7 px-2 text-xs"
            disabled={
              !can('orders.reconcile') ||
              (reconcileMutation.isPending && reconcileMutation.variables === row.orderNo)
            }
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

  const resetSelection = () => setSelectedRowIds(new Set());
  return (
    <PageContainer
      title="订单管理"
      filters={
        <>
          <Input.Search
            value={search}
            onChange={(event) => {
              resetSelection();
              setSearch(event.target.value);
            }}
            aria-label="搜索订单"
            allowClear
            placeholder="搜索订单号、用户、应用…"
            style={{ width: 320, maxWidth: '100%' }}
          />
          <Select
            value={statusValues[0]}
            allowClear
            aria-label="订单状态"
            placeholder="全部状态"
            style={{ width: 140 }}
            options={[...STATUS_OPTIONS]}
            onChange={(value) => {
              resetSelection();
              setFilter('status', value ? [value] : []);
            }}
          />
          <Select
            value={providerValues[0]}
            allowClear
            aria-label="支付方式"
            placeholder="全部支付方式"
            style={{ width: 140 }}
            options={[...PROVIDER_OPTIONS]}
            onChange={(value) => {
              resetSelection();
              setFilter('provider', value ? [value] : []);
            }}
          />
          <Button
            onClick={() => {
              resetSelection();
              clearFilters();
            }}
          >
            清除筛选
          </Button>
        </>
      }
    >
      {selectedRowIds.size > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title={`已选择当前页 ${selectedRowIds.size} 笔订单`}
          action={
            <Flex gap={8}>
              <Button onClick={resetSelection} disabled={bulkRunning}>
                清除选择
              </Button>
              {can('orders.reconcile') && (
                <Button
                  loading={bulkRunning}
                  onClick={() => {
                    void runBulkReconcile().catch((error) => toastErr(error, '批量同步失败'));
                  }}
                >
                  批量同步
                </Button>
              )}
            </Flex>
          }
        />
      )}
      <AsyncState error={ordersQuery.error} onRetry={() => void ordersQuery.refetch()}>
        <Table
          columns={orderColumns}
          dataSource={orders}
          rowKey="orderNo"
          loading={ordersQuery.isLoading}
          scroll={{ x: 1040 }}
          tableLayout="fixed"
          locale={{ emptyText: '暂无订单' }}
          rowSelection={
            can('orders.reconcile')
              ? {
                  selectedRowKeys: [...selectedRowIds],
                  onChange: (keys) => setSelectedRowIds(new Set(keys.map(String))),
                  preserveSelectedRowKeys: false,
                  getCheckboxProps: () => ({ disabled: bulkRunning }),
                }
              : undefined
          }
          pagination={{
            total: totalOrders,
            current: page,
            pageSize: PAGE_SIZE,
            showSizeChanger: false,
            onChange: (next) => {
              resetSelection();
              setPage(next);
            },
            showTotal: (total) => `共 ${total} 条订单`,
          }}
        />
      </AsyncState>
      <ManagementDrawer
        open={!!selectedOrderNo}
        title={`订单详情 · ${selectedOrderNo ?? ''}`}
        onClose={() => setSelectedOrderNo(null)}
        footer={
          <Flex justify="flex-end" gap={8} wrap>
            <Button onClick={() => setSelectedOrderNo(null)}>关闭</Button>
            {can('orders.reconcile') && (
              <Button
                loading={reconcileMutation.isPending}
                onClick={() => {
                  if (selectedOrderNo) reconcileMutation.mutate(selectedOrderNo);
                }}
              >
                同步订单
              </Button>
            )}
            {can('orders.cancel') && (
              <Button
                danger
                disabled={detail?.item.status !== 'pending' || reconcileMutation.isPending}
                loading={cancelMutation.isPending}
                onClick={() => {
                  if (selectedOrderNo)
                    setPendingAction({ type: 'cancel', orderNo: selectedOrderNo });
                }}
              >
                关闭订单
              </Button>
            )}
            {can('orders.refund') && (
              <Button
                danger
                disabled={
                  (!!detail?.item.items?.length && detail.item.status !== 'refunding') ||
                  !['paid', 'refunding'].includes(detail?.item.status ?? '') ||
                  reconcileMutation.isPending
                }
                loading={refundMutation.isPending}
                onClick={() => {
                  if (selectedOrderNo)
                    setPendingAction({
                      type: 'refund',
                      orderNo: selectedOrderNo,
                      amountLabel: detail
                        ? formatAmount(detail.item.amount, detail.item.currency)
                        : undefined,
                    });
                }}
              >
                {!!detail?.item.items?.length && detail.item.status !== 'refunding'
                  ? '请使用下方分项退款'
                  : detail?.item.status === 'refunding'
                    ? '回查退款'
                    : '全额退款'}
              </Button>
            )}
          </Flex>
        }
      >
        <AsyncState
          loading={orderDetailQuery.isLoading}
          error={orderDetailQuery.error}
          onRetry={() => void orderDetailQuery.refetch()}
        >
          {detail && <OrderDetailSection detail={detail} />}
        </AsyncState>
      </ManagementDrawer>
      <Modal
        open={!!pendingAction}
        title={pendingAction?.type === 'refund' ? '确认发起退款？' : '确认关闭订单？'}
        okText={pendingAction?.type === 'refund' ? '确认退款' : '确认关闭'}
        cancelText="取消"
        okButtonProps={{ danger: true }}
        confirmLoading={cancelMutation.isPending || refundMutation.isPending}
        onCancel={() => setPendingAction(null)}
        onOk={() => {
          if (!pendingAction || cancelMutation.isPending || refundMutation.isPending) return;
          if (pendingAction.type === 'refund') refundMutation.mutate(pendingAction.orderNo);
          else cancelMutation.mutate(pendingAction.orderNo);
        }}
      >
        {pendingAction?.type === 'refund'
          ? `将对订单 ${pendingAction.orderNo} 发起全额退款${pendingAction.amountLabel ? `（${pendingAction.amountLabel}）` : ''}。退款可能影响对应授权状态，请确认已完成必要核对。`
          : pendingAction
            ? `将关闭订单 ${pendingAction.orderNo}。用户需要重新购买才能继续支付。`
            : ''}
      </Modal>
    </PageContainer>
  );
}

function OrderDetailSection({ detail }: { detail: OrderDetail }) {
  const { item, paymentAttempts, entitlements, events } = detail;

  return (
    <div className="admin-detail-stack">
      <Card title="基本信息">
        <div className="admin-detail-fields">
          <InfoBlock
            label="状态"
            render={
              <StatusTag tone={statusToTone(item.status)} label={orderStatusLabel(item.status)} />
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
              item.items?.find((i) => i.kind === 'software')?.title ??
              item.plan?.name ??
              item.planId
            }
          />
          <InfoBlock label="支付时间" value={item.paidAt ? formatTime(item.paidAt) : '未支付'} />
          <InfoBlock label="创建时间" value={formatTime(item.createdAt)} />
        </div>
      </Card>

      <OrderItems items={item.items} />
      {!!item.items?.length && <AdminItemRefundLedger orderNo={item.orderNo} />}
      {item.items?.some((i) => i.hostingTerms?.target) && (
        <HostingFulfillmentStatus orderNo={item.orderNo} />
      )}
      <Card title="关联处理">
        <div className="flex flex-wrap gap-2">
          <ActionLink to={userDetailHref(item.userId)} label="用户 360" />
          <ActionLink to={adminSearchHref('/admin/tickets', item.orderNo)} label="关联工单" />
          <ActionLink to={adminSearchHref('/admin/licenses', item.orderNo)} label="关联授权" />
          <ActionLink
            to={adminSearchHref('/admin/orders', item.user?.email ?? item.userId)}
            label="用户订单"
          />
        </div>
      </Card>

      {item.checkoutSession && (
        <DetailSection title="支付会话">
          <div className="admin-detail-fields">
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
              <Card key={attempt.id} size="small">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold">{attempt.attemptNo}</span>
                  <StatusTag
                    tone={statusToTone(attempt.status)}
                    label={checkoutSessionStatusLabel(attempt.status)}
                  />
                  <span className="admin-text-secondary ml-auto text-xs tabular-nums">
                    {formatTime(attempt.createdAt)}
                  </span>
                </div>
                {attempt.providerReference && (
                  <p className="admin-text-secondary mt-1.5 font-mono text-xs">
                    {attempt.providerReference}
                  </p>
                )}
                <div className="mt-2 flex gap-3">
                  <JsonViewer data={attempt.requestPayload} label="请求" />
                  <JsonViewer data={attempt.responsePayload} label="响应" />
                </div>
              </Card>
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
                className="inline-flex items-center gap-2"
                title="在授权管理中查看"
              >
                <span className="admin-text font-mono">{e.plan?.code ?? e.id}</span>
                <StatusTag tone={statusToTone(e.status)} label={entitlementStatusLabel(e.status)} />
                <ArrowUpRight className="admin-text-secondary h-3 w-3" />
              </Link>
            ))}
          </div>
        </DetailSection>
      )}

      {events.length > 0 && (
        <DetailSection title={`关联事件 (${events.length})`}>
          <Table
            rowKey="key"
            size="small"
            dataSource={events.map((event, index) => ({
              ...event,
              key: `${event.eventTime}-${index}`,
            }))}
            pagination={false}
            scroll={{ x: 560 }}
            columns={[
              { title: '时间', width: 180, render: (_, event) => formatTime(event.eventTime) },
              { title: '事件', dataIndex: 'eventName' },
              {
                title: '数据',
                render: (_, event) => <JsonViewer data={event.properties} label="事件数据" />,
              },
            ]}
          />
        </DetailSection>
      )}
    </div>
  );
}

function ActionLink({ to, label }: { to: string; label: string }) {
  return <Link to={to}>{label}</Link>;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card title={title} size="small">
      {children}
    </Card>
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
    <div className="admin-detail-field">
      <Typography.Text type="secondary">{label}</Typography.Text>
      {render ?? (
        <Typography.Text className={valueClassName} code={mono}>
          {value}
        </Typography.Text>
      )}
    </div>
  );
}
