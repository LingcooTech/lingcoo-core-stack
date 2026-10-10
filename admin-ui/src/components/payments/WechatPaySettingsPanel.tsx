import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Flex, Form, Input, Switch, Tag, Typography } from 'antd';
import {
  WechatPaySettingsSchema,
  type PaymentProviderConfig,
  type PaymentSettingsOverview,
  type WechatPaySettings,
} from '@lingcoo/contracts/models';
import { upsertWechatSettings } from '@/api/payments';
import { StatusTag } from '@/components/admin/StatusTag';
import { FormActions } from '@/components/admin/PageContainer';
import { parseSettingsForm, useSettingsForm } from '@/lib/settings-form';
const fields = [
  [
    'enabled',
    '启用微信支付',
    '启用后可创建新的微信支付订单；关闭后，已有订单仍可接收通知、查询和退款。',
  ],
  ['appId', '支付应用标识', '与微信支付商户号绑定的 AppID，用于 Stack 扫码支付。'],
  ['mchId', '微信支付商户号', '微信支付分配的普通商户号。'],
  ['merchantSerial', '商户接口证书序列号', '与商户 API 证书私钥配套使用的证书序列号。'],
  [
    'privateKeyPem',
    '商户接口证书私钥',
    '上传 apiclient_key.pem，用于 APIv3 请求签名；加密保存且永不回显。',
  ],
  ['apiV3Key', '第三版支付接口密钥', '32 字节 APIv3 密钥，用于解密支付回调；加密保存且永不回显。'],
  ['publicKeyId', '微信支付公钥标识', '微信支付公钥模式下的平台公钥 ID，用于响应与回调验签。'],
  ['publicKeyPem', '微信支付公钥', '上传 PEM 格式平台公钥，用于验签；兼容现有平台证书配置。'],
  ['notifyUrl', '支付回调地址', '必须是公网可访问的 HTTPS 地址。留空时按平台访问地址自动生成。'],
] as const;
const secretFields = new Set<keyof WechatPaySettings>([
  'apiV3Key',
  'privateKeyPem',
  'publicKeyPem',
]);

function PemFileInput({
  name,
  value = '',
  configured,
  disabled,
  onChange,
  id,
}: {
  name: 'privateKeyPem' | 'publicKeyPem';
  value?: string;
  configured: boolean;
  disabled: boolean;
  onChange?: (value: string) => void;
  id?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState(''),
    [error, setError] = useState('');
  const readFile = async (file?: File) => {
    if (!file) return;
    try {
      if (!file.name.toLowerCase().endsWith('.pem')) throw new Error('请选择 .pem 格式文件');
      if (file.size > 20_000) throw new Error('PEM 文件不能超过 20KB');
      const content = await file.text();
      const checked = WechatPaySettingsSchema.shape[name].safeParse(content);
      if (!checked.success)
        throw new Error(checked.error.issues[0]?.message ?? '文件内容不是有效的 PEM 格式');
      setError('');
      setFileName(file.name);
      onChange?.(content);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '读取 PEM 文件失败，请重试');
    }
  };
  return (
    <div>
      <input
        ref={inputRef}
        id={id ?? `wechat-${name}`}
        name={name}
        type="file"
        hidden
        accept=".pem,application/x-pem-file,text/plain"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          void readFile(file);
        }}
      />
      <Flex wrap gap={12} align="center">
        <Button disabled={disabled} onClick={() => inputRef.current?.click()}>
          上传 PEM 文件
        </Button>
        <Typography.Text type="secondary">
          {value
            ? `已读取 ${fileName}，保存本组设置后加密保存`
            : configured
              ? '已配置；上传新文件可替换'
              : '请选择 PEM 文件'}
        </Typography.Text>
        {value && (
          <Button
            type="text"
            disabled={disabled}
            onClick={() => {
              onChange?.('');
              setError('');
            }}
          >
            取消替换
          </Button>
        )}
      </Flex>
      {error && <Alert type="error" title={error} showIcon />}
    </div>
  );
}
function baseline(settings: PaymentProviderConfig | undefined): WechatPaySettings {
  return Object.fromEntries(
    fields.map(([name]) => [
      name,
      name === 'enabled'
        ? Boolean(settings?.values.enabled)
        : secretFields.has(name)
          ? ''
          : String(settings?.values[name] ?? ''),
    ]),
  );
}
export function WechatPaySettingsPanel({
  settings,
  canManage,
  isClearing,
  onClear,
}: {
  settings: PaymentProviderConfig | undefined;
  canManage: boolean;
  isClearing: boolean;
  onClear: () => void;
}) {
  const qc = useQueryClient(),
    { message } = App.useApp();
  const base = baseline(settings);
  const { form, reset } = useSettingsForm(base);
  const watched = Form.useWatch([], { form, preserve: true }) as WechatPaySettings | undefined;
  const draft = Object.fromEntries(
    fields
      .filter(([name]) => (watched?.[name] ?? base[name]) !== base[name])
      .map(([name]) => [name, watched?.[name]]),
  );
  const pendingCount = Object.keys(draft).length;
  const mutation = useMutation({
    mutationFn: upsertWechatSettings,
    onSuccess: (saved) => {
      reset(baseline(saved));
      qc.setQueryData<PaymentSettingsOverview>(
        ['payment-settings'],
        (current) =>
          current && {
            items: current.items.map((item) => (item.code === 'wechat_pay' ? saved : item)),
          },
      );
      void message.success('微信支付设置已保存');
      void qc.invalidateQueries({ queryKey: ['payment-settings'] });
    },
    onError: (error) => {
      void message.error(error.message);
    },
  });
  const disabled = !canManage || mutation.isPending || isClearing;
  const source =
    settings?.source === 'database'
      ? '后台配置'
      : settings?.source === 'env'
        ? '环境变量'
        : '默认值';
  const configuredCount = fields.filter(
    ([name]) =>
      name === 'enabled' ||
      (secretFields.has(name)
        ? settings?.secrets[name]?.configured
        : Boolean(settings?.values[name])),
  ).length;
  return (
    <Form
      form={form}
      name="wechat"
      layout="vertical"
      disabled={disabled}
      onValuesChange={() => mutation.reset()}
      onFinish={() => {
        if (disabled || pendingCount === 0) return;
        try {
          mutation.mutate(parseSettingsForm(WechatPaySettingsSchema, draft, form));
        } catch {
          /* Field errors are displayed by Form. */
        }
      }}
    >
      <Flex gap={12} wrap align="center" style={{ marginBottom: 16 }}>
        <StatusTag
          tone={settings?.configured ? 'ok' : 'warn'}
          label={settings?.configured ? '配置完整' : '配置未完成'}
        />
        <StatusTag
          tone={settings?.values.enabled ? 'ok' : 'neutral'}
          label={settings?.values.enabled ? '已启用' : '未启用'}
        />
        <Typography.Text type="secondary">
          已配置 {configuredCount}/{fields.length} · 来源：{source}
        </Typography.Text>
      </Flex>
      <Typography.Paragraph type="secondary">
        后台配置优先于环境变量。敏感项仅显示配置状态；留空保留原值，上传新文件或输入完整新值后统一保存。
      </Typography.Paragraph>
      {!canManage && (
        <Alert type="info" title="当前账号仅可查看支付设置。" style={{ marginBottom: 16 }} />
      )}
      <div className="admin-form-grid">
        {fields.map(([name, label, description]) => {
          const isPem = name === 'privateKeyPem' || name === 'publicKeyPem';
          return (
            <Form.Item
              key={name}
              name={name}
              htmlFor={`wechat-${name}`}
              valuePropName={name === 'enabled' ? 'checked' : 'value'}
              style={isPem || name === 'notifyUrl' ? { gridColumn: '1 / -1' } : undefined}
              label={
                <span>
                  {label}{' '}
                  <span aria-hidden="true">
                    <Tag>{source}</Tag>
                    {secretFields.has(name) && <Tag color="red">敏感配置</Tag>}
                    {draft[name] !== undefined && <Tag color="warning">未保存</Tag>}
                  </span>
                </span>
              }
              extra={description}
            >
              {name === 'enabled' ? (
                <Switch id="wechat-enabled" aria-label={label} disabled={disabled} />
              ) : isPem ? (
                <PemFileInput
                  id={`wechat-${name}`}
                  name={name}
                  configured={Boolean(settings?.secrets[name]?.configured)}
                  disabled={disabled}
                />
              ) : name === 'apiV3Key' ? (
                <Input.Password
                  id={`wechat-${name}`}
                  name={name}
                  autoComplete="new-password"
                  placeholder={
                    settings?.secrets[name]?.configured ? '已配置；输入完整新值以替换' : undefined
                  }
                />
              ) : (
                <Input
                  id={`wechat-${name}`}
                  name={name}
                  type={name === 'notifyUrl' ? 'url' : 'text'}
                  autoComplete="off"
                  placeholder={
                    name === 'appId'
                      ? 'wx0123456789abcdef'
                      : name === 'publicKeyId'
                        ? 'PUB_KEY_ID_…'
                        : undefined
                  }
                />
              )}
            </Form.Item>
          );
        })}
      </div>
      {mutation.error && (
        <Alert type="error" showIcon title={`${mutation.error.message}；待保存内容已保留`} />
      )}
      <FormActions
        hint={
          pendingCount > 0
            ? `有 ${pendingCount} 项待保存；填写完成后统一保存。`
            : '修改设置后统一保存。'
        }
      >
        <Button
          type="primary"
          htmlType="submit"
          disabled={disabled || pendingCount === 0}
          loading={mutation.isPending}
        >
          保存微信支付设置
        </Button>
        <Button danger disabled={disabled || settings?.source !== 'database'} onClick={onClear}>
          清除本组后台配置
        </Button>
      </FormActions>
    </Form>
  );
}
