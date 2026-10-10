import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Flex, Form, Input, Modal, Switch, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { clearSiteSettings, getSiteSettings, upsertSiteSettings } from '@/api/settings';
import { AssetImageField } from '@/components/storage/AssetImageField';
import { AsyncState } from '@/components/admin/AsyncState';
import { FormActions } from '@/components/admin/PageContainer';
import { parseSettingsForm, useSettingsForm } from '@/lib/settings-form';
import { buildSitePayload, siteSchema, type SiteValues } from '@/lib/settings-schemas';
export function SiteSettingsPanel() {
  const qc = useQueryClient(),
    { message } = App.useApp(),
    [modal, context] = Modal.useModal();
  const query = useQuery({ queryKey: ['system-settings', 'site'], queryFn: getSiteSettings });
  const values = query.data
    ? { ...query.data.values, brandPrimaryColor: query.data.values.brandPrimaryColor ?? '' }
    : undefined;
  const { form, dirty, reset } = useSettingsForm<SiteValues>(values);
  const save = useMutation({
    mutationFn: upsertSiteSettings,
    onSuccess: (result) => {
      reset({ ...result.values, brandPrimaryColor: result.values.brandPrimaryColor ?? '' });
      qc.setQueryData(['system-settings', 'site'], result);
      qc.setQueryData(['public-site-settings'], result.values);
      void message.success('站点品牌与页脚设置已保存');
    },
    onError: (error) => {
      void message.error(error.message);
    },
  });
  const clear = useMutation({
    mutationFn: clearSiteSettings,
    onSuccess: async () => {
      const result = await getSiteSettings();
      reset({ ...result.values, brandPrimaryColor: result.values.brandPrimaryColor ?? '' });
      qc.setQueryData(['system-settings', 'site'], result);
      await qc.invalidateQueries({ queryKey: ['public-site-settings'] });
      void message.success('站点品牌与页脚设置已重置');
    },
    onError: (error) => {
      void message.error(error.message);
    },
  });
  return (
    <AsyncState loading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
      {context}
      <Form
        name="site"
        form={form}
        layout="vertical"
        disabled={save.isPending || clear.isPending}
        onFinish={(input) => {
          try {
            save.mutate(buildSitePayload(parseSettingsForm(siteSchema, input, form)));
          } catch (error) {
            void message.error(error instanceof Error ? error.message : '请检查表单');
          }
        }}
      >
        <Card title="站点品牌">
          <div className="admin-form-grid">
            <Form.Item
              name="siteName"
              label="站点名称"
              rules={[{ required: true, whitespace: true, max: 120 }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="brandPrimaryColor"
              label="品牌主色"
              extra="填写 #RRGGBB；留空使用默认主题色。"
            >
              <Input placeholder="#2563eb" />
            </Form.Item>
          </div>
          <Form.Item name="logoUrl" label="站点 Logo">
            <AssetImageField previewAlt="站点 Logo" />
          </Form.Item>
          <Form.Item name="faviconUrl" label="站点 Favicon">
            <AssetImageField previewAlt="站点 Favicon" />
          </Form.Item>
        </Card>
        <Card title="顶部导航" style={{ marginTop: 24 }}>
          <Form.List name="headerNavigation">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Card
                    key={field.key}
                    size="small"
                    title={`一级菜单 ${field.name + 1}`}
                    style={{ marginBottom: 16 }}
                    extra={
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined aria-hidden="true" />}
                        aria-label={`删除一级菜单 ${field.name + 1}`}
                        onClick={() => remove(field.name)}
                      />
                    }
                  >
                    <div className="admin-form-grid">
                      <Form.Item
                        name={[field.name, 'label']}
                        label="一级菜单名称"
                        rules={[{ required: true, whitespace: true, max: 60 }]}
                      >
                        <Input />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'url']}
                        label="一级菜单链接"
                        extra="有二级菜单时可留空。"
                      >
                        <Input />
                      </Form.Item>
                    </div>
                    <Form.Item
                      name={[field.name, 'openInNewTab']}
                      label="新窗口打开"
                      valuePropName="checked"
                    >
                      <Switch />
                    </Form.Item>
                    <Form.List name={[field.name, 'children']}>
                      {(children, operations) => (
                        <>
                          {children.map((child) => (
                            <Card
                              key={child.key}
                              size="small"
                              title={`二级菜单 ${child.name + 1}`}
                              style={{ marginBottom: 12 }}
                              extra={
                                <Button
                                  danger
                                  type="text"
                                  icon={<DeleteOutlined aria-hidden="true" />}
                                  aria-label={`删除二级菜单 ${child.name + 1}`}
                                  onClick={() => operations.remove(child.name)}
                                />
                              }
                            >
                              <div className="admin-form-grid">
                                <Form.Item
                                  name={[child.name, 'label']}
                                  label="二级菜单名称"
                                  rules={[{ required: true, whitespace: true, max: 60 }]}
                                >
                                  <Input />
                                </Form.Item>
                                <Form.Item
                                  name={[child.name, 'url']}
                                  label="二级菜单链接"
                                  rules={[{ required: true }]}
                                >
                                  <Input />
                                </Form.Item>
                              </div>
                              <Form.Item
                                name={[child.name, 'openInNewTab']}
                                label="新窗口打开"
                                valuePropName="checked"
                              >
                                <Switch />
                              </Form.Item>
                            </Card>
                          ))}
                          <Button
                            icon={<PlusOutlined aria-hidden="true" />}
                            disabled={children.length >= 12}
                            onClick={() =>
                              operations.add({ label: '', url: '', openInNewTab: false })
                            }
                          >
                            添加二级菜单
                          </Button>
                        </>
                      )}
                    </Form.List>
                  </Card>
                ))}
                <Button
                  icon={<PlusOutlined aria-hidden="true" />}
                  disabled={fields.length >= 12}
                  onClick={() => add({ label: '', url: '', openInNewTab: false, children: [] })}
                >
                  添加一级菜单
                </Button>
              </>
            )}
          </Form.List>
        </Card>
        <Card title="页脚" style={{ marginTop: 24 }}>
          <Form.Item
            name="footerCopyright"
            label="页脚版权"
            extra="使用 {year} 自动显示当前年份。"
            rules={[{ required: true, whitespace: true, max: 255 }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="filingInfo" label="备案信息">
            <Input maxLength={255} />
          </Form.Item>
          <Form.List name="footerLinks">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Card
                    key={field.key}
                    size="small"
                    title={`页脚链接 ${field.name + 1}`}
                    style={{ marginBottom: 12 }}
                    extra={
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined aria-hidden="true" />}
                        aria-label={`删除页脚链接 ${field.name + 1}`}
                        onClick={() => remove(field.name)}
                      />
                    }
                  >
                    <div className="admin-form-grid">
                      <Form.Item
                        name={[field.name, 'label']}
                        label="链接名称"
                        rules={[{ required: true, whitespace: true, max: 60 }]}
                      >
                        <Input />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'url']}
                        label="链接地址"
                        rules={[{ required: true }]}
                      >
                        <Input />
                      </Form.Item>
                    </div>
                    <Form.Item
                      name={[field.name, 'openInNewTab']}
                      label="新窗口打开"
                      valuePropName="checked"
                    >
                      <Switch />
                    </Form.Item>
                  </Card>
                ))}
                <Button
                  icon={<PlusOutlined aria-hidden="true" />}
                  disabled={fields.length >= 12}
                  onClick={() => add({ label: '', url: '', openInNewTab: false })}
                >
                  添加页脚链接
                </Button>
              </>
            )}
          </Form.List>
        </Card>
        <FormActions
          hint={
            dirty ? (
              '有未保存的修改'
            ) : (
              <Typography.Text type="secondary">保存后同步到公开站点</Typography.Text>
            )
          }
        >
          <Flex gap={8}>
            <Button
              type="primary"
              htmlType="submit"
              loading={save.isPending}
              disabled={!dirty || clear.isPending}
            >
              保存品牌与页脚
            </Button>
            <Button
              danger
              disabled={save.isPending || clear.isPending}
              onClick={() => {
                modal.confirm({
                  title: '重置品牌与页脚配置？',
                  content:
                    '这会删除数据库中的站点品牌设置，并恢复默认站点名称、默认 footer 菜单以及默认 favicon。',
                  okText: '确认重置',
                  cancelText: '取消',
                  okButtonProps: { danger: true },
                  onOk: () => clear.mutateAsync(),
                });
              }}
            >
              重置配置
            </Button>
          </Flex>
        </FormActions>
      </Form>
    </AsyncState>
  );
}
