import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { App, Alert, Button, Card, Flex, Form, Input, Modal, Switch, Tabs, Tag } from 'antd';
import { z } from 'zod';
import type { PaymentProviderConfig } from '@lingcoo/contracts/models';
import { clearProviderSettings, getPaymentSettings, upsertAlipaySettings } from '@/api/payments';
import { WechatPaySettingsPanel } from '@/components/payments/WechatPaySettingsPanel';
import { PageContainer, FormActions } from '@/components/admin/PageContainer';
import { parseSettingsForm, useSettingsForm } from '@/lib/settings-form';
import { useAuth } from '@/lib/auth';
import { hasPermission, normalizeRole } from '@/lib/rbac';
const alipaySchema = z.object({
  appId: z.string().optional(),
  privateKeyPem: z.string().optional(),
  publicKeyPem: z.string().optional(),
  f2fPay: z.boolean().optional(),
});
export function PaymentsPage() {
  const qc = useQueryClient(),
    { message } = App.useApp(),
    [modal, context] = Modal.useModal();
  const { user } = useAuth();
  const canManage = hasPermission(normalizeRole(user?.role), 'payments.manage');
  const [revision, setRevision] = useState({ wechat_pay: 0, alipay: 0 });
  const query = useQuery({ queryKey: ['payment-settings'], queryFn: getPaymentSettings });
  const clear = useMutation({
    mutationFn: clearProviderSettings,
    onSuccess: async (_, provider) => {
      await qc.invalidateQueries({ queryKey: ['payment-settings'] });
      setRevision((value) => ({ ...value, [provider]: value[provider] + 1 }));
      void message.success(`${provider === 'wechat_pay' ? '微信支付' : '支付宝'}数据库配置已清空`);
    },
    onError: (error) => {
      void message.error(error.message);
    },
  });
  const confirmClear = (provider: 'wechat_pay' | 'alipay') => {
    modal.confirm({
      title: provider === 'wechat_pay' ? '确认清除本组后台配置？' : '确认清空支付配置？',
      content:
        provider === 'wechat_pay'
          ? '将清除本组已保存的后台配置和未保存修改。若配置了环境变量，将恢复使用环境变量；若需停止新支付，请关闭“启用微信支付”并保存。'
          : '将清空支付宝数据库配置；若存在环境变量回退，运行时仍可能继续生效。',
      okText: '清空配置',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => clear.mutateAsync(provider),
    });
  };
  return (
    <PageContainer title="支付配置" width="form">
      {context}
      {query.error ? (
        <Alert
          showIcon
          type="error"
          title="支付设置加载失败，请重试后再编辑。"
          description={query.error.message}
          action={<Button onClick={() => void query.refetch()}>重新加载</Button>}
        />
      ) : (
        <Card loading={query.isPending}>
          {query.data && (
            <Tabs
              defaultActiveKey="wechat"
              items={[
                {
                  key: 'wechat',
                  label: '微信支付',
                  forceRender: true,
                  children: (
                    <WechatPaySettingsPanel
                      key={revision.wechat_pay}
                      settings={query.data.items.find((item) => item.code === 'wechat_pay')}
                      canManage={canManage}
                      isClearing={clear.isPending}
                      onClear={() => confirmClear('wechat_pay')}
                    />
                  ),
                },
                {
                  key: 'alipay',
                  label: '支付宝',
                  children: (
                    <AlipayPanel
                      key={revision.alipay}
                      settings={query.data.items.find((item) => item.code === 'alipay')}
                      canManage={canManage}
                      clearing={clear.isPending}
                      onClear={() => confirmClear('alipay')}
                    />
                  ),
                },
              ]}
            />
          )}
        </Card>
      )}
    </PageContainer>
  );
}
function AlipayPanel({
  settings,
  canManage,
  clearing,
  onClear,
}: {
  settings?: PaymentProviderConfig;
  canManage: boolean;
  clearing: boolean;
  onClear(): void;
}) {
  const qc = useQueryClient(),
    { message } = App.useApp();
  const { form, dirty, reset } = useSettingsForm({
    appId: String(settings?.values.appId ?? ''),
    privateKeyPem: '',
    publicKeyPem: '',
    f2fPay: Boolean(settings?.values.f2fPay),
  });
  const mutation = useMutation({
    mutationFn: upsertAlipaySettings,
    onSuccess: async () => {
      const saved = await getPaymentSettings();
      const alipay = saved.items.find((item) => item.code === 'alipay');
      reset({
        appId: String(alipay?.values.appId ?? ''),
        privateKeyPem: '',
        publicKeyPem: '',
        f2fPay: Boolean(alipay?.values.f2fPay),
      });
      qc.setQueryData(['payment-settings'], saved);
      void message.success('支付宝配置已保存');
    },
    onError: (error) => {
      void message.error(error.message);
    },
  });
  return (
    <Form
      name="alipay"
      form={form}
      layout="vertical"
      disabled={!canManage || mutation.isPending || clearing}
      onFinish={(values) => {
        try {
          mutation.mutate(parseSettingsForm(alipaySchema, values, form));
        } catch {
          /* Form displays validation errors. */
        }
      }}
    >
      <Flex wrap gap={12} style={{ marginBottom: 24 }}>
        <Tag color={settings?.configured ? 'success' : 'warning'}>
          {settings?.configured ? '配置完成' : '配置不完整'}
        </Tag>
        <Tag>
          来源:{' '}
          {settings?.source === 'database'
            ? '数据库'
            : settings?.source === 'env'
              ? '环境变量'
              : '未配置'}
        </Tag>
      </Flex>
      <Form.Item name="appId" label="应用 AppID">
        <Input placeholder="2021..." />
      </Form.Item>
      <Form.Item
        name="privateKeyPem"
        label="应用私钥 (PEM)"
        extra="留空保持原值；新值加密保存且永不回显。"
      >
        <Input.TextArea
          rows={4}
          autoComplete="off"
          placeholder={
            settings?.secrets.privateKeyPem?.configured
              ? '已保存，留空保持不变'
              : '粘贴 PEM 格式私钥'
          }
        />
      </Form.Item>
      <Form.Item name="publicKeyPem" label="支付宝公钥 (PEM)">
        <Input.TextArea
          rows={4}
          placeholder={
            settings?.secrets.publicKeyPem?.configured
              ? '已保存，留空保持不变'
              : '粘贴 PEM 格式公钥'
          }
        />
      </Form.Item>
      <Form.Item
        name="f2fPay"
        label="启用当面付 (F2F Pay)"
        valuePropName="checked"
        extra="启用支付宝当面付扫码支付。"
      >
        <Switch />
      </Form.Item>
      {mutation.error && <Alert type="error" showIcon title={mutation.error.message} />}
      <FormActions hint={dirty ? '有未保存的修改' : '修改后统一保存'}>
        <Button
          type="primary"
          htmlType="submit"
          disabled={!dirty || !canManage || clearing}
          loading={mutation.isPending}
        >
          保存支付宝配置
        </Button>
        <Button
          danger
          disabled={!canManage || mutation.isPending || clearing || settings?.source !== 'database'}
          onClick={onClear}
        >
          清空配置
        </Button>
      </FormActions>
    </Form>
  );
}
