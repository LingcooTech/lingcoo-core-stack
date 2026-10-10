import {
  Button,
  Card,
  Collapse,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Space,
  Switch,
} from 'antd';
import type { FormInstance } from 'antd';
import MDEditor from '@uiw/react-md-editor';
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
      <Form.Item name={['app', 'iconUrl']} label="图标 URL">
        <AssetImageField defaultPrefix="apps/icon" previewAlt="应用图标" />
      </Form.Item>
      <Form.Item name={['app', 'coverUrl']} label="封面图 URL">
        <AssetImageField defaultPrefix="apps/cover" previewAlt="应用封面" />
      </Form.Item>
    </Card>
  );
}
export function AppContentSection() {
  return (
    <Space orientation="vertical" style={{ width: '100%' }} size={16}>
      <Card title="详情内容">
        <Form.Item name={['app', 'content']}>
          <MDEditor height={400} />
        </Form.Item>
      </Card>
      <Card title="展示素材">
        <Collapse
          items={[
            {
              key: 'highlights',
              label: '亮点',
              children: (
                <Form.List name={['app', 'highlights']}>
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map((f) => (
                        <Card
                          size="small"
                          key={f.key}
                          extra={
                            <Button danger size="small" onClick={() => remove(f.name)}>
                              删除亮点
                            </Button>
                          }
                        >
                          <div className="admin-form-grid">
                            <Form.Item name={[f.name, 'title']} label="标题">
                              <Input />
                            </Form.Item>
                            <Form.Item name={[f.name, 'description']} label="描述">
                              <Input.TextArea />
                            </Form.Item>
                            <Form.Item name={[f.name, 'icon']} label="图标名称">
                              <Input />
                            </Form.Item>
                          </div>
                        </Card>
                      ))}
                      <Button onClick={() => add({ title: '', description: '', icon: '' })}>
                        添加亮点
                      </Button>
                    </>
                  )}
                </Form.List>
              ),
            },
            {
              key: 'screenshots',
              label: '截图',
              children: (
                <Form.List name={['app', 'screenshots']}>
                  {(fields, { add, remove, move }) => (
                    <>
                      {fields.map((f) => (
                        <Card
                          size="small"
                          key={f.key}
                          extra={
                            <Space>
                              <Button
                                size="small"
                                disabled={f.name === 0}
                                onClick={() => move(f.name, f.name - 1)}
                              >
                                上移
                              </Button>
                              <Button size="small" danger onClick={() => remove(f.name)}>
                                删除截图
                              </Button>
                            </Space>
                          }
                        >
                          <Form.Item name={[f.name, 'url']} label="图片 URL">
                            <AssetImageField
                              defaultPrefix="apps/screenshots"
                              previewAlt="应用截图"
                            />
                          </Form.Item>
                          <Form.Item name={[f.name, 'caption']} label="说明">
                            <Input />
                          </Form.Item>
                        </Card>
                      ))}
                      <Button onClick={() => add({ url: '', caption: '' })}>添加截图</Button>
                    </>
                  )}
                </Form.List>
              ),
            },
            {
              key: 'faq',
              label: 'FAQ',
              children: (
                <Form.List name={['app', 'faq']}>
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map((f) => (
                        <Card
                          size="small"
                          key={f.key}
                          extra={
                            <Button danger size="small" onClick={() => remove(f.name)}>
                              删除问答
                            </Button>
                          }
                        >
                          <Form.Item name={[f.name, 'question']} label="问题">
                            <Input />
                          </Form.Item>
                          <Form.Item name={[f.name, 'answer']} label="回答">
                            <Input.TextArea rows={3} />
                          </Form.Item>
                        </Card>
                      ))}
                      <Button onClick={() => add({ question: '', answer: '' })}>添加问答</Button>
                    </>
                  )}
                </Form.List>
              ),
            },
            {
              key: 'links',
              label: '外部链接',
              children: (
                <Form.List name={['app', 'links']}>
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map((f) => (
                        <Card
                          size="small"
                          key={f.key}
                          extra={
                            <Button danger size="small" onClick={() => remove(f.name)}>
                              删除链接
                            </Button>
                          }
                        >
                          <div className="admin-form-grid">
                            {[
                              ['label', '名称'],
                              ['url', '链接'],
                              ['description', '说明'],
                            ].map(([k = '', l = '']) => (
                              <Form.Item key={k} name={[f.name, k]} label={l}>
                                <Input />
                              </Form.Item>
                            ))}
                            <Form.Item name={[f.name, 'type']} label="类型">
                              <Select
                                options={['website', 'download', 'support', 'docs', 'other'].map(
                                  (value) => ({ value, label: value }),
                                )}
                              />
                            </Form.Item>
                          </div>
                        </Card>
                      ))}
                      <Button
                        onClick={() =>
                          add({ label: '', url: '', type: 'website', description: '' })
                        }
                      >
                        添加链接
                      </Button>
                    </>
                  )}
                </Form.List>
              ),
            },
          ]}
        />
      </Card>
      <Card title="应用详情资料">
        <div className="admin-form-grid">
          {[
            ['developer', '开发者'],
            ['version', '版本'],
            ['updateDate', '更新时间'],
            ['size', '大小'],
            ['platformsText', '平台（逗号或换行分隔）'],
            ['languages', '语言'],
            ['systemRequirements', '系统要求'],
            ['technicalNotes', '技术说明'],
            ['price', '展示价格'],
            ['purchaseUrl', '购买链接'],
            ['usageInstructions', '使用说明'],
            ['trialDays', '试用天数'],
            ['notes', '备注'],
          ].map(([k = '', l = '']) => (
            <Form.Item key={k} name={['app', 'appDetail', k]} label={l}>
              <Input />
            </Form.Item>
          ))}
          <Form.Item name={['app', 'appDetail', 'purchaseType']} label="购买类型">
            <Select
              options={['free', 'onsite_onetime', 'onsite_subscription', 'offsite'].map(
                (value) => ({
                  value,
                  label: value,
                }),
              )}
            />
          </Form.Item>
        </div>
        <Form.List name={['app', 'appDetail', 'subscriptionPlans']}>
          {(fields, { add, remove }) => (
            <>
              {fields.map((f) => (
                <Card
                  size="small"
                  key={f.key}
                  extra={
                    <Button danger onClick={() => remove(f.name)}>
                      删除订阅说明
                    </Button>
                  }
                >
                  <div className="admin-form-grid">
                    {[
                      ['period', '周期'],
                      ['price', '价格'],
                      ['description', '描述'],
                    ].map(([k = '', l = '']) => (
                      <Form.Item key={k} name={[f.name, k]} label={l}>
                        <Input />
                      </Form.Item>
                    ))}
                  </div>
                </Card>
              ))}
              <Button
                onClick={() =>
                  add({ id: createDraftId('subscription'), period: '', price: '', description: '' })
                }
              >
                添加订阅说明
              </Button>
            </>
          )}
        </Form.List>
      </Card>
    </Space>
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
