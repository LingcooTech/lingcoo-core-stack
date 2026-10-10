import { Button, Card, Collapse, Form, Input, Select, Space } from 'antd';
import MDEditor from '@uiw/react-md-editor';
import { AssetImageField } from '@/components/storage/AssetImageField';
import { createDraftId } from '@/components/apps/app-edit/model';

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
