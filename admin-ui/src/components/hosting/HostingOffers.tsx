import { useRef, useState } from 'react';
import { Alert, App, Button, Form, Input, InputNumber, Modal, Select, Space, Table } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  hostingOfferCreateSchema,
  hostingOfferWriteSchema,
  type HostingOffer,
} from '@lingcoo/contracts';
import { apiClient } from '@/api/client';
import { AsyncState } from '@/components/admin/AsyncState';
import { ManagementDrawer } from '@/components/admin/ManagementDrawer';
import { StatusTag } from '@/components/admin/StatusTag';
import { FormActions } from '@/components/admin/PageContainer';
import { useSettingsForm } from '@/lib/settings-form';
const labels = { draft: '草稿', active: '已上架', archived: '已下架' };
export function HostingOffers() {
  const [page, setPage] = useState(1),
    [editing, setEditing] = useState<HostingOffer | 'new' | null>(null);
  const query = useQuery({
    queryKey: ['hosting-offers', (page - 1) * 20],
    queryFn: () =>
      apiClient(
        'GET /v1/admin/billing/hosting-offers',
        `/v1/admin/billing/hosting-offers?offset=${(page - 1) * 20}&limit=20`,
      ),
  });
  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Alert
        type="info"
        title="应用托管独立计费"
        description="套餐上架不会收款、创建实例或调整已有服务期限。价格和服务政策只影响后续购买。"
      />
      <Button type="primary" disabled={!query.data} onClick={() => setEditing('new')}>
        新增托管套餐
      </Button>
      <AsyncState
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        <Table
          rowKey="id"
          dataSource={query.data?.items ?? []}
          locale={{ emptyText: '尚无托管套餐。可以先保存价格为零的草稿。' }}
          scroll={{ x: 1000 }}
          pagination={{
            current: page,
            pageSize: 20,
            total: query.data?.total ?? 0,
            showSizeChanger: false,
            onChange: setPage,
          }}
          columns={[
            {
              title: '套餐',
              render: (_, o) => (
                <>
                  <strong>{o.title}</strong>
                  <p>
                    {query.data?.apps.find((a) => a.id === o.appId)?.name ?? o.appId} · {o.code}
                  </p>
                </>
              ),
            },
            {
              title: '价格',
              render: (_, o) =>
                `¥${(o.priceAmount / 100).toFixed(2)} / ${o.interval === 'month' ? '月' : '年'}`,
            },
            {
              title: '状态',
              render: (_, o) => (
                <StatusTag
                  tone={o.status === 'active' ? 'ok' : o.status === 'draft' ? 'warn' : 'neutral'}
                  label={labels[o.status]}
                />
              ),
            },
            {
              title: '政策',
              render: (_, o) =>
                `宽限 ${o.graceDays} 天 · 保留 ${o.retentionDays} 天 · 版本 ${o.version}`,
            },
            { title: '服务内容', dataIndex: 'description' },
            {
              title: '操作',
              render: (_, o) => <Button onClick={() => setEditing(o)}>编辑套餐</Button>,
            },
          ]}
        />
      </AsyncState>
      {editing && query.data && (
        <OfferForm
          key={editing === 'new' ? 'new' : `${editing.id}:${editing.version}`}
          offer={editing === 'new' ? null : editing}
          apps={query.data.apps}
          onClose={() => setEditing(null)}
        />
      )}
    </Space>
  );
}
function OfferForm({
  offer,
  apps,
  onClose,
}: {
  offer: HostingOffer | null;
  apps: { id: string; name: string; code: string }[];
  onClose: () => void;
}) {
  const [id] = useState(() => crypto.randomUUID()),
    submitted = useRef(false),
    qc = useQueryClient(),
    { message } = App.useApp(),
    [modal, context] = Modal.useModal();
  const { form, dirty, reset } = useSettingsForm({
    appId: offer?.appId ?? '',
    code: offer?.code ?? '',
    title: offer?.title ?? '',
    description: offer?.description ?? '',
    interval: offer?.interval ?? 'month',
    price: offer ? (offer.priceAmount / 100).toFixed(2) : '',
    graceDays: offer?.graceDays ?? 7,
    retentionDays: offer?.retentionDays ?? 30,
    status: offer?.status ?? 'draft',
    reason: '',
  });
  const mutation = useMutation({
    mutationFn: async () => {
      const v = await form.validateFields();
      if (!/^\d{1,7}(\.\d{1,2})?$/.test(v.price))
        throw new Error('价格请输入非负金额，最多两位小数');
      const [whole, decimals = ''] = v.price.split('.');
      const body = {
        title: v.title.trim(),
        description: v.description.trim(),
        interval: v.interval,
        priceAmount: Number(whole) * 100 + Number(decimals.padEnd(2, '0')),
        currency: 'CNY',
        graceDays: v.graceDays,
        retentionDays: v.retentionDays,
        status: v.status,
        reason: v.reason.trim(),
      };
      if (offer) {
        const parsed = hostingOfferWriteSchema.parse({ ...body, expectedVersion: offer.version });
        return apiClient(
          'PUT /v1/admin/billing/hosting-offers/:offerId',
          `/v1/admin/billing/hosting-offers/${offer.id}`,
          { body: JSON.stringify(parsed) },
        );
      }
      const parsed = hostingOfferCreateSchema.parse({
        ...body,
        id,
        appId: v.appId,
        code: v.code.trim(),
      });
      return apiClient(
        'POST /v1/admin/billing/hosting-offers',
        '/v1/admin/billing/hosting-offers',
        { body: JSON.stringify(parsed) },
      );
    },
    onSuccess: () => {
      reset(form.getFieldsValue(true));
      void qc.invalidateQueries({ queryKey: ['hosting-offers'] });
      onClose();
      void message.success('套餐已保存');
    },
    onSettled: () => {
      submitted.current = false;
    },
  });
  const save = () => {
    if (submitted.current) return;
    submitted.current = true;
    mutation.mutate();
  };
  const close = () => {
    if (dirty)
      modal.confirm({
        title: '放弃套餐修改？',
        okText: '放弃修改',
        cancelText: '继续编辑',
        onOk: onClose,
      });
    else onClose();
  };
  return (
    <ManagementDrawer
      open
      title={offer ? '编辑托管套餐' : '新增托管套餐'}
      onClose={close}
      footer={
        <FormActions hint={dirty ? '有未保存的修改' : '已保存'}>
          <Button onClick={close} disabled={mutation.isPending}>
            取消
          </Button>
          <Button type="primary" loading={mutation.isPending} onClick={save}>
            保存套餐
          </Button>
        </FormActions>
      }
    >
      {context}
      <Form
        name="hosting-offer"
        form={form}
        layout="vertical"
        disabled={mutation.isPending}
        onFinish={save}
      >
        <div className="admin-form-grid">
          {!offer && (
            <>
              <Form.Item name="appId" label="所属应用" rules={[{ required: true }]}>
                <Select
                  options={apps.map((a) => ({ value: a.id, label: `${a.name} (${a.code})` }))}
                />
              </Form.Item>
              <Form.Item
                name="code"
                label="套餐编码"
                rules={[{ required: true }, { pattern: /^[a-z0-9][a-z0-9_-]*$/ }]}
              >
                <Input maxLength={64} />
              </Form.Item>
            </>
          )}
          <Form.Item name="title" label="套餐名称" rules={[{ required: true, whitespace: true }]}>
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="interval" label="计费周期">
            <Select
              options={[
                { value: 'month', label: '自然月' },
                { value: 'year', label: '自然年' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="price"
            label="价格（元）"
            rules={[
              { required: true },
              { pattern: /^\d{1,7}(\.\d{1,2})?$/, message: '非负金额，最多两位小数' },
            ]}
          >
            <Input inputMode="decimal" />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { value: 'draft', label: '草稿' },
                { value: 'active', label: '上架' },
                { value: 'archived', label: '下架' },
              ]}
            />
          </Form.Item>
          <Form.Item name="graceDays" label="到期宽限天数" rules={[{ required: true }]}>
            <InputNumber min={0} max={90} precision={0} />
          </Form.Item>
          <Form.Item name="retentionDays" label="停服后数据保留天数" rules={[{ required: true }]}>
            <InputNumber min={1} max={3650} precision={0} />
          </Form.Item>
        </div>
        <Form.Item name="description" label="服务内容" rules={[{ required: true, min: 5 }]}>
          <Input.TextArea rows={3} maxLength={2000} />
        </Form.Item>
        <Form.Item name="reason" label="变更原因（内部审计）" rules={[{ required: true, min: 5 }]}>
          <Input maxLength={500} />
        </Form.Item>
        {mutation.isError && <Alert type="error" showIcon title={mutation.error.message} />}
      </Form>
    </ManagementDrawer>
  );
}
