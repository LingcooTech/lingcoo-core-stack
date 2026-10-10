import { SMTP_FIELDS } from './integration-definitions';
import { RotateSecretsButton } from '@/components/settings/RotateSecretsButton';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { toast } from 'sonner';
import type { SmtpSettingsOverview } from '@/api/types';
import {
  clearSmtpSettings,
  getSmtpSettings,
  sendSmtpTestEmail,
  testSmtpConnection,
  upsertSmtpSettings,
} from '@/api/settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmActionDialog } from '@/components/shared/ConfirmActionDialog';
import { IntegrationFields, IntegrationHeader } from './IntegrationFields';
const schema = z.object({
  transport: z.enum(['capture', 'smtp']),
  host: z.string().trim().max(255),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().trim().max(255),
  password: z.string().max(255),
  from: z.union([z.email(), z.literal('')]),
  fromName: z.string().trim().max(120),
});
export function SmtpSettingsPanel() {
  const query = useQuery({ queryKey: ['system-settings', 'smtp'], queryFn: getSmtpSettings });
  if (query.isPending) return <p role="status">加载邮件服务设置…</p>;
  if (query.error) return <p role="alert">{query.error.message}</p>;
  return query.data ? (
    <SettingsForm key={JSON.stringify(query.data)} overview={query.data} />
  ) : null;
}
function SettingsForm({ overview }: { overview: SmtpSettingsOverview }) {
  const qc = useQueryClient();
  const initial = {
    ...overview.values,
    transport: overview.values.transport ?? 'smtp',
    fromName: overview.values.fromName ?? 'Stack',
    password: '',
  };
  const [values, setValues] = useState(initial),
    [clearOpen, setClearOpen] = useState(false);
  const [to, setTo] = useState(''),
    [subject, setSubject] = useState('Stack 测试邮件'),
    [text, setText] = useState('这是一封用于验证邮件服务的测试邮件。');
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const payload = () => {
    const parsed = schema.safeParse(values);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? '请检查邮件设置');
    return parsed.data;
  };
  const mutation = useMutation({
    mutationFn: async (action: 'save' | 'test' | 'send' | 'clear') => {
      if (action === 'clear') return clearSmtpSettings();
      const input = payload();
      if (action === 'save') return upsertSmtpSettings(input);
      if (action === 'test') return testSmtpConnection(input);
      const parsed = z
        .object({
          to: z.email('请输入有效的测试收件邮箱'),
          subject: z.string().trim().min(1).max(200),
          text: z.string().trim().min(1).max(10000),
        })
        .parse({ to, subject, text });
      return sendSmtpTestEmail({ ...input, ...parsed });
    },
    onSuccess: async (result, action) => {
      toast.success(
        action === 'test'
          ? 'SMTP 连接和认证成功；未发送邮件'
          : action === 'send'
            ? result && 'simulated' in result && result.simulated
              ? '测试邮件已捕获，未向外发送'
              : '测试邮件已发送'
            : action === 'clear'
              ? '后台邮件配置已清除'
              : '邮件服务配置已保存',
      );
      if (action === 'save' || action === 'clear') {
        setClearOpen(false);
        await qc.invalidateQueries({ queryKey: ['system-settings', 'smtp'] });
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const count = SMTP_FIELDS.filter((f) =>
    f.control === 'secret'
      ? overview.secrets.password.configured
      : typeof overview.values[f.key as keyof typeof overview.values] === 'boolean' ||
        Boolean(overview.values[f.key as keyof typeof overview.values]),
  ).length;
  return (
    <section className="space-y-5 p-6">
      <IntegrationHeader
        title="邮件服务"
        description="SMTP 发信身份、传输安全和投递模式。"
        count={count}
      >
        <RotateSecretsButton disabled={dirty || mutation.isPending} />
      </IntegrationHeader>
      <IntegrationFields
        prefix="smtp"
        fields={SMTP_FIELDS}
        values={values}
        source={overview.source}
        secrets={{ password: overview.secrets.password.configured }}
        disabled={mutation.isPending}
        onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
      />
      {values.transport === 'capture' && (
        <p role="status" className="text-sm text-amber-700">
          测试捕获模式不会向外发送邮件。生产注册验证、密码找回和告警需要选择邮件服务器投递。
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button disabled={!dirty || mutation.isPending} onClick={() => mutation.mutate('save')}>
          保存配置
        </Button>
        <Button
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate('test')}
        >
          测试 SMTP 连接
        </Button>
        <Button
          variant="outline"
          disabled={overview.source !== 'database' || mutation.isPending}
          onClick={() => setClearOpen(true)}
        >
          清除配置
        </Button>
      </div>
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-medium">发送测试邮件</summary>
        <div className="mt-4 space-y-3">
          <Label htmlFor="smtp-test-to">测试收件邮箱</Label>
          <Input
            id="smtp-test-to"
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <Label htmlFor="smtp-test-subject">测试邮件主题</Label>
          <Input
            id="smtp-test-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <Label htmlFor="smtp-test-text">测试邮件正文</Label>
          <Textarea id="smtp-test-text" value={text} onChange={(e) => setText(e.target.value)} />
          <Button
            variant="secondary"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate('send')}
          >
            发送测试邮件
          </Button>
          <p className="text-xs text-muted-foreground">
            连接测试不发信；此操作使用当前表单配置。Capture 模式只模拟成功。
          </p>
        </div>
      </details>
      <ConfirmActionDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="清除邮件服务后台配置？"
        description="配置将回退到环境变量；若没有可用的 SMTP，邮件验证和找回密码将无法发信。"
        confirmText="清除配置"
        confirmVariant="destructive"
        isConfirming={mutation.isPending}
        onConfirm={() => mutation.mutate('clear')}
      />
    </section>
  );
}
