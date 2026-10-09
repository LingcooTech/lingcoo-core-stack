import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  WechatPaySettingsSchema,
  type PaymentProviderConfig,
  type PaymentSettingsOverview,
  type WechatPaySettings,
} from '@lingcoo/contracts/models';
import { toast } from 'sonner';
import { upsertWechatSettings } from '@/api/payments';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { StatusPill } from '@/components/shared/StatusPill';

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
  value,
  configured,
  disabled,
  onChange,
}: {
  name: 'privateKeyPem' | 'publicKeyPem';
  value: string;
  configured: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
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
      onChange(content);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '读取 PEM 文件失败，请重试');
    }
  };
  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        id={`wechat-${name}`}
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
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          上传 PEM 文件
        </Button>
        <span className="text-sm break-all text-muted-foreground">
          {value
            ? `已读取 ${fileName}，保存本组设置后加密保存`
            : configured
              ? '已配置；上传新文件可替换'
              : '请选择 PEM 文件'}
        </span>
        {value && (
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            onClick={() => {
              onChange('');
              setError('');
            }}
          >
            取消替换
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
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
  const qc = useQueryClient();
  const [draft, setDraft] = useState<WechatPaySettings>({});
  const [errors, setErrors] = useState<Partial<Record<keyof WechatPaySettings, string>>>({});
  const mutation = useMutation({
    mutationFn: upsertWechatSettings,
    onSuccess: (saved) => {
      qc.setQueryData<PaymentSettingsOverview>(
        ['payment-settings'],
        (current) =>
          current && {
            items: current.items.map((item) => (item.code === 'wechat_pay' ? saved : item)),
          },
      );
      setDraft({});
      setErrors({});
      toast.success('微信支付设置已保存');
      void qc.invalidateQueries({ queryKey: ['payment-settings'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '保存失败'),
  });
  const disabled = !canManage || mutation.isPending || isClearing;
  const source =
    settings?.source === 'database'
      ? '后台配置'
      : settings?.source === 'env'
        ? '环境变量'
        : '默认值';
  const baseValue = (name: keyof WechatPaySettings): string | boolean =>
    name === 'enabled'
      ? Boolean(settings?.values.enabled)
      : secretFields.has(name)
        ? ''
        : String(settings?.values[name] ?? '');
  const change = (name: keyof WechatPaySettings, value: string | boolean) => {
    setDraft((current) => {
      const next = { ...current, [name]: value };
      if (value === baseValue(name)) delete next[name];
      return next;
    });
    setErrors((current) => ({ ...current, [name]: undefined }));
    mutation.reset();
  };
  const pendingCount = Object.keys(draft).length;
  const configuredCount = fields.filter(
    ([name]) =>
      name === 'enabled' ||
      (secretFields.has(name)
        ? settings?.secrets[name]?.configured
        : Boolean(settings?.values[name])),
  ).length;

  return (
    <form
      className="max-w-4xl space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled || pendingCount === 0) return;
        const checked = WechatPaySettingsSchema.safeParse(draft);
        if (!checked.success) {
          setErrors(
            Object.fromEntries(checked.error.issues.map((issue) => [issue.path[0], issue.message])),
          );
          return;
        }
        mutation.mutate(checked.data);
      }}
    >
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/50 p-4">
        <StatusPill
          tone={settings?.configured ? 'ok' : 'warn'}
          label={settings?.configured ? '配置完整' : '配置未完成'}
        />
        <StatusPill
          tone={settings?.values.enabled ? 'ok' : 'neutral'}
          label={settings?.values.enabled ? '已启用' : '未启用'}
        />
        <span className="text-sm text-muted-foreground">
          已配置 {configuredCount}/{fields.length} · 来源：{source}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        后台配置优先于环境变量。敏感项仅显示配置状态；留空保留原值，上传新文件或输入完整新值后统一保存。
      </p>
      {!canManage && (
        <p role="status" className="text-sm text-muted-foreground">
          当前账号仅可查看支付设置。
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {fields.map(([name, label, description]) => {
          const isPem = name === 'privateKeyPem' || name === 'publicKeyPem';
          const value = draft[name] ?? baseValue(name);
          return (
            <section
              key={name}
              className={`space-y-3 rounded-lg border border-border p-4 ${isPem || name === 'notifyUrl' ? 'md:col-span-2' : ''}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor={`wechat-${name}`} className="text-sm font-medium">
                  {label}
                </label>
                <span className="text-xs text-muted-foreground">{source}</span>
                {secretFields.has(name) && (
                  <span className="text-xs text-muted-foreground">敏感配置</span>
                )}
                {draft[name] !== undefined && <StatusPill tone="warn" label="未保存" />}
              </div>
              <p
                id={`wechat-${name}-description`}
                className="text-sm leading-relaxed text-muted-foreground"
              >
                {description}
              </p>
              {name === 'enabled' ? (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="wechat-enabled"
                    checked={Boolean(value)}
                    disabled={disabled}
                    onCheckedChange={(checked) => change(name, checked === true)}
                    aria-describedby={`wechat-${name}-description`}
                  />
                  <span className="text-sm">{value ? '开启' : '关闭'}</span>
                </div>
              ) : isPem ? (
                <PemFileInput
                  name={name}
                  value={String(value)}
                  configured={Boolean(settings?.secrets[name]?.configured)}
                  disabled={disabled}
                  onChange={(content) => change(name, content)}
                />
              ) : (
                <Input
                  id={`wechat-${name}`}
                  name={name}
                  type={name === 'apiV3Key' ? 'password' : name === 'notifyUrl' ? 'url' : 'text'}
                  autoComplete={name === 'apiV3Key' ? 'new-password' : 'off'}
                  value={String(value)}
                  disabled={disabled}
                  placeholder={
                    name === 'apiV3Key' && settings?.secrets[name]?.configured
                      ? '已配置；输入完整新值以替换'
                      : name === 'appId'
                        ? 'wx0123456789abcdef'
                        : name === 'publicKeyId'
                          ? 'PUB_KEY_ID_…'
                          : undefined
                  }
                  onChange={(event) => change(name, event.target.value)}
                  aria-invalid={Boolean(errors[name])}
                  aria-describedby={`wechat-${name}-description`}
                />
              )}
              {errors[name] && (
                <p role="alert" className="text-sm text-destructive">
                  {errors[name]}
                </p>
              )}
            </section>
          );
        })}
      </div>
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error instanceof Error ? mutation.error.message : '保存失败，请重试'}
          ；待保存内容已保留。
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-4">
        <p role="status" className="text-sm text-muted-foreground">
          {pendingCount > 0
            ? `有 ${pendingCount} 项待保存；填写完成后统一保存。`
            : '修改设置后统一保存。'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={disabled || pendingCount === 0}>
            {mutation.isPending ? '保存中…' : '保存微信支付设置'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || settings?.source !== 'database'}
            onClick={onClear}
          >
            清除本组后台配置
          </Button>
        </div>
      </div>
    </form>
  );
}
