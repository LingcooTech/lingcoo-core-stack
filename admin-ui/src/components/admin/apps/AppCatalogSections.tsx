import { Button, Card, Form, Input, InputNumber, Radio, Select, Switch } from 'antd';
import type { FormInstance } from 'antd';
import { AssetImageField } from '@/components/storage/AssetImageField';
import {
  createDraftId,
  type EditableFeature,
  type EditablePlan,
  type EditableOffer,
} from '@/components/apps/app-edit/model';
import type { DeliveryManifest } from '@/lib/app-delivery';
const statusOptions = ['active', 'inactive', 'cancelled', 'expired'].map((value) => ({
  value,
  label: value,
}));
export function AppBasicsSection({ create }: { create: boolean }) {
  return (
    <Card title="基本信息">
      <div className="admin-form-grid">
        <Form.Item
          name={['app', 'appCode']}
          label="App Code"
          rules={[{ required: true }]}
          extra="创建后不可修改；使用英文、数字和下划线。"
        >
          <Input disabled={!create} />
        </Form.Item>
        <Form.Item name={['app', 'name']} label="名称" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name={['app', 'tagline']} label="一句话简介">
          <Input maxLength={200} showCount />
        </Form.Item>
        <Form.Item name={['app', 'category']} label="分类">
          <Input />
        </Form.Item>
        <Form.Item
          name={['app', 'type']}
          label="类型"
          extra="仅作为分类标签，交付行为由交付方式决定。"
        >
          <Input />
        </Form.Item>
        <Form.Item name={['app', 'deliveryMode']} label="交付方式">
          <Select
            options={[
              { value: 'none', label: '免部署' },
              { value: 'one_click', label: '一键部署' },
            ]}
          />
        </Form.Item>
        <Form.Item name={['app', 'status']} label="状态">
          <Select options={statusOptions} />
        </Form.Item>
      </div>
      <Form.Item name={['app', 'iconUrl']} label="应用图标">
        <AssetImageField defaultPrefix="apps/icon" previewAlt="应用图标" />
      </Form.Item>
      <Form.Item name={['app', 'coverUrl']} label="应用封面">
        <AssetImageField defaultPrefix="apps/cover" previewAlt="应用封面" />
      </Form.Item>
    </Card>
  );
}
export function AppFeaturesSection() {
  return (
    <Card title="功能">
      <Form.List name="features">
        {(fields, { add, remove }) => (
          <>
            {fields.map((f) => (
              <Card
                size="small"
                key={f.key}
                title={`功能 ${f.name + 1}`}
                extra={
                  <Button danger onClick={() => remove(f.name)}>
                    删除功能
                  </Button>
                }
              >
                <div className="admin-form-grid">
                  {[
                    ['code', 'Code'],
                    ['name', '名称'],
                    ['kind', '类型'],
                  ].map(([k = '', l = '']) => (
                    <Form.Item key={k} name={[f.name, k]} label={l}>
                      <Input />
                    </Form.Item>
                  ))}
                  <Form.Item name={[f.name, 'status']} label="状态">
                    <Select options={statusOptions} />
                  </Form.Item>
                </div>
              </Card>
            ))}
            <Button
              onClick={() =>
                add({
                  id: createDraftId('feature'),
                  code: `feature_${fields.length + 1}`,
                  name: '',
                  kind: 'boolean',
                  status: 'active',
                })
              }
            >
              添加功能
            </Button>
          </>
        )}
      </Form.List>
    </Card>
  );
}
export function AppPlansSection({
  form,
  manifest,
}: {
  form: FormInstance;
  manifest: DeliveryManifest | null;
}) {
  const features: EditableFeature[] = Form.useWatch('features', form) ?? [];
  return (
    <Card title="套餐">
      <Form.List name="plans">
        {(fields, { add, remove }) => (
          <>
            {fields.map((f) => (
              <Card
                size="small"
                key={f.key}
                title={`套餐 ${f.name + 1}`}
                extra={
                  <Button danger onClick={() => remove(f.name)}>
                    删除套餐
                  </Button>
                }
              >
                <div className="admin-form-grid">
                  {[
                    ['code', 'Code'],
                    ['name', '名称'],
                    ['billingProvider', '计费提供方'],
                    ['billingPriceId', '外部价格 ID'],
                    ['priceYuan', '价格（元）'],
                    ['currency', '币种'],
                  ].map(([k = '', l = '']) => (
                    <Form.Item key={k} name={[f.name, k]} label={l}>
                      <Input />
                    </Form.Item>
                  ))}
                  <Form.Item name={[f.name, 'interval']} label="计费周期">
                    <Select
                      options={[
                        { value: 'month', label: '月' },
                        { value: 'year', label: '年' },
                        { value: 'one_time', label: '一次性' },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name={[f.name, 'status']} label="状态">
                    <Select options={statusOptions} />
                  </Form.Item>
                  <Form.Item name={[f.name, 'featureCodes']} label="关联功能">
                    <Select
                      mode="multiple"
                      options={features.map((v) => ({
                        value: v.code,
                        label: `${v.name || v.code} (${v.code})`,
                      }))}
                    />
                  </Form.Item>
                  <Form.Item
                    name={[f.name, 'deploymentPolicy', 'maxActiveDeployments']}
                    label="最大活跃部署数"
                  >
                    <InputNumber min={1} precision={0} />
                  </Form.Item>
                  <Form.Item
                    name={[f.name, 'deploymentPolicy', 'domainBindingMode']}
                    label="域名绑定"
                  >
                    <Select
                      options={[
                        { value: 'none', label: '不绑定' },
                        { value: 'lock_on_first_success', label: '首次成功后锁定' },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item
                    name={[f.name, 'deploymentPolicy', 'domainBindingSource']}
                    label="绑定域名来源"
                  >
                    <Select
                      options={[
                        { value: 'none', label: '无' },
                        ...(manifest?.domainSlots ?? []).map((v) => ({
                          value: v.sourceField,
                          label: v.label,
                        })),
                      ]}
                    />
                  </Form.Item>
                  <Form.Item
                    name={[f.name, 'deploymentPolicy', 'domainBindingScope']}
                    label="绑定范围"
                  >
                    <Select
                      options={[
                        { value: 'registrable_domain', label: '主域名' },
                        { value: 'exact_host', label: '精确主机' },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item
                    name={[f.name, 'deploymentPolicy', 'allowMultiplePurchases']}
                    label="允许重复购买"
                    valuePropName="checked"
                  >
                    <Switch />
                  </Form.Item>
                </div>
              </Card>
            ))}
            <Button
              onClick={() =>
                add({
                  id: createDraftId('plan'),
                  code: `plan_${fields.length + 1}`,
                  name: '',
                  billingProvider: 'self_hosted',
                  billingPriceId: '',
                  priceYuan: '0.00',
                  currency: 'CNY',
                  interval: 'month',
                  status: 'active',
                  featureCodes: features[0] ? [features[0].code] : [],
                  deploymentPolicy: {
                    maxActiveDeployments: 1,
                    domainBindingMode: 'none',
                    domainBindingSource: 'none',
                    domainBindingScope: 'registrable_domain',
                    allowMultiplePurchases: false,
                  },
                })
              }
            >
              添加套餐
            </Button>
          </>
        )}
      </Form.List>
    </Card>
  );
}
export function AppOffersSection({ form }: { form: FormInstance }) {
  const plans: EditablePlan[] = Form.useWatch('plans', form) ?? [];
  const offers: EditableOffer[] = Form.useWatch('offers', form) ?? [];
  return (
    <Card title="售卖 Offers">
      <Form.List name="offers">
        {(fields, { add, remove }) => (
          <>
            {fields.map((f) => (
              <Card
                size="small"
                key={f.key}
                title={`Offer ${f.name + 1}`}
                extra={
                  <Button danger onClick={() => remove(f.name)}>
                    删除 Offer
                  </Button>
                }
              >
                <Radio
                  checked={offers[f.name]?.isDefault}
                  onChange={() =>
                    form.setFieldValue(
                      'offers',
                      offers.map((o, i) => ({ ...o, isDefault: i === f.name })),
                    )
                  }
                >
                  默认购买选项
                </Radio>
                <div className="admin-form-grid">
                  {[
                    ['code', 'Code'],
                    ['title', '展示标题'],
                    ['description', '描述'],
                    ['badge', '角标'],
                    ['priceYuan', '价格（元）'],
                    ['currency', '币种'],
                  ].map(([k = '', l = '']) => (
                    <Form.Item key={k} name={[f.name, k]} label={l}>
                      <Input />
                    </Form.Item>
                  ))}
                  <Form.Item name={[f.name, 'planCode']} label="关联套餐">
                    <Select
                      options={plans.map((p) => ({
                        value: p.code,
                        label: `${p.name || p.code} (${p.code})`,
                      }))}
                    />
                  </Form.Item>
                  <Form.Item name={[f.name, 'status']} label="状态">
                    <Select options={statusOptions} />
                  </Form.Item>
                </div>
              </Card>
            ))}
            <Button
              disabled={!plans.length}
              onClick={() =>
                add({
                  id: createDraftId('offer'),
                  code: `offer_${fields.length + 1}`,
                  planCode: plans[0]?.code ?? '',
                  title: '',
                  description: '',
                  badge: '',
                  priceYuan: plans[0]?.priceYuan ?? '0.00',
                  currency: plans[0]?.currency ?? 'CNY',
                  status: 'active',
                  isDefault: !offers.length,
                })
              }
            >
              添加 Offer
            </Button>
          </>
        )}
      </Form.List>
    </Card>
  );
}
