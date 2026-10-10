import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Flex,
  Form,
  Input,
  Modal,
  Select,
  Table,
} from 'antd';
import { useState } from 'react';
import type { ItemRefundCommand } from '@lingcoo/contracts';
import { useItemRefundActions } from '@/hooks/useItemRefundLedger';
import { formatAmount, formatTime } from '@/lib/utils';
import { AsyncState } from './AsyncState';
import { FormActions } from './PageContainer';
export function AdminItemRefundLedger({ orderNo }: { orderNo: string }) {
  return (
    <Collapse
      items={[{ key: 'ledger', label: '退款明细与进度', children: <Ledger orderNo={orderNo} /> }]}
    />
  );
}
type Draft = { kind: 'software' | 'hosting'; amount: string; reason: string };
function Ledger({ orderNo }: { orderNo: string }) {
  const [form] = Form.useForm<Draft>();
  const [command, setCommand] = useState<ItemRefundCommand | null>(null);
  const [notice, setNotice] = useState('');
  const { canRefund, result, refund, reconcile, error } = useItemRefundActions(
    orderNo,
    true,
    () => {
      setCommand(null);
      form.resetFields();
      setNotice('申请已记录，请以账本中的处理结果为准。');
    },
  );
  const ledger = result.data;
  const submit = (values: Draft) =>
    setCommand({
      requestId: crypto.randomUUID(),
      kind: values.kind,
      amount: Math.round(Number(values.amount) * 100),
      reason: values.reason.trim(),
    });
  return (
    <AsyncState
      loading={result.isPending}
      error={result.error}
      onRetry={() => void result.refetch()}
    >
      {ledger && (
        <div className="space-y-4">
          {ledger.legacyRefund && (
            <Alert type="info" title="此订单使用原整单退款流程，请查看订单状态。" />
          )}
          <Flex wrap gap={12}>
            {ledger.lines.map((line) => (
              <Card
                key={line.kind}
                size="small"
                title={`${line.kind === 'software' ? '软件' : '托管'} · ${line.title}`}
                style={{ flex: '1 1 280px' }}
              >
                <Descriptions
                  column={2}
                  size="small"
                  items={[
                    { key: 'amount', label: '原金额', children: formatAmount(line.amount, 'CNY') },
                    {
                      key: 'refunded',
                      label: '已退款',
                      children: formatAmount(line.refunded, 'CNY'),
                    },
                    {
                      key: 'pending',
                      label: '处理中',
                      children: formatAmount(line.pending, 'CNY'),
                    },
                    {
                      key: 'remaining',
                      label: '可退余额',
                      children: formatAmount(line.remaining, 'CNY'),
                    },
                  ]}
                />
              </Card>
            ))}
          </Flex>
          <Table
            dataSource={ledger.records}
            rowKey="id"
            pagination={false}
            scroll={{ x: 640 }}
            locale={{ emptyText: '暂无分项退款记录' }}
            columns={[
              {
                title: '项目',
                dataIndex: 'kind',
                render: (value) => (value === 'software' ? '软件' : '托管'),
              },
              {
                title: '金额',
                dataIndex: 'amount',
                render: (value: number) => formatAmount(value, 'CNY'),
              },
              {
                title: '状态',
                dataIndex: 'status',
                render: (value) =>
                  value === 'pending'
                    ? '等待渠道确认'
                    : value === 'succeeded'
                      ? '退款成功'
                      : '退款失败',
              },
              { title: '原因', dataIndex: 'reason' },
              {
                title: '创建时间',
                dataIndex: 'createdAt',
                render: (value: string) => formatTime(value),
              },
              {
                title: '操作',
                key: 'actions',
                render: (_, row) =>
                  canRefund && row.status === 'pending' ? (
                    <Button
                      size="small"
                      loading={reconcile.isPending}
                      onClick={() => reconcile.mutate(row.id)}
                    >
                      查询退款结果
                    </Button>
                  ) : (
                    '—'
                  ),
              },
            ]}
          />
          {canRefund &&
            ledger.orderStatus === 'paid' &&
            !ledger.legacyRefund &&
            ledger.lines.length > 0 && (
              <Form
                form={form}
                layout="vertical"
                initialValues={{ kind: ledger.lines[0]?.kind }}
                onFinish={submit}
                disabled={refund.isPending}
              >
                <Alert
                  style={{ marginBottom: 16 }}
                  type="info"
                  title="部分退款作为费用补偿，不缩短服务期限；累计全退会撤销对应权益。已部署服务须先处理终止与交接。"
                />
                <Form.Item name="kind" label="退款项目" rules={[{ required: true }]}>
                  <Select
                    options={ledger.lines.map((line) => ({
                      value: line.kind,
                      label: `${line.kind === 'software' ? '软件' : '托管'} · ${line.title}`,
                    }))}
                  />
                </Form.Item>
                <Form.Item
                  name="amount"
                  label="退款金额（元）"
                  dependencies={['kind']}
                  rules={[
                    { required: true, message: '请输入退款金额' },
                    {
                      validator: (_, amount: string) => {
                        const cents = Math.round(Number(amount) * 100),
                          line = ledger.lines.find(
                            (item) => item.kind === form.getFieldValue('kind'),
                          );
                        return /^\d+(\.\d{1,2})?$/.test(amount ?? '') &&
                          Number.isSafeInteger(cents) &&
                          cents > 0 &&
                          cents <= (line?.remaining ?? 0)
                          ? Promise.resolve()
                          : Promise.reject(new Error('金额须大于零、最多两位小数且不超过可退余额'));
                      },
                    },
                  ]}
                >
                  <Input inputMode="decimal" />
                </Form.Item>
                <Form.Item
                  name="reason"
                  label="退款原因"
                  rules={[
                    { required: true, whitespace: true },
                    {
                      validator: (_, value: string) =>
                        value?.trim().length >= 5 && value.trim().length <= 500
                          ? Promise.resolve()
                          : Promise.reject(new Error('原因须为 5–500 字')),
                    },
                  ]}
                >
                  <Input.TextArea rows={3} maxLength={500} />
                </Form.Item>
                <FormActions>
                  <Button htmlType="submit" danger>
                    核对退款申请
                  </Button>
                </FormActions>
              </Form>
            )}
          {notice && <Alert type="success" title={notice} />}
          {error && (
            <Alert
              type="error"
              title={
                error instanceof Error ? error.message : '请求失败，请刷新账本确认结果后重试。'
              }
            />
          )}
        </div>
      )}
      <Modal
        open={!!command}
        title="确认发起分项退款？"
        okText="确认发起退款"
        cancelText="返回修改"
        okButtonProps={{ danger: true }}
        confirmLoading={refund.isPending}
        onCancel={() => {
          if (!refund.isPending) {
            setCommand(null);
            refund.reset();
          }
        }}
        onOk={() => {
          if (command && !refund.isPending) refund.mutate(command);
        }}
      >
        <p>
          退还{command?.kind === 'software' ? '软件' : '托管'}费用{' '}
          {formatAmount(command?.amount ?? 0, 'CNY')}
        </p>
        <p>{command?.reason}</p>
        {refund.error && <Alert type="error" title={refund.error.message} />}
      </Modal>
    </AsyncState>
  );
}
