import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { clearSmtpSettings, getSmtpSettings, sendSmtpTestEmail, upsertSmtpSettings } from '@/api/settings';
import { ConfirmActionDialog } from '@/components/shared/ConfirmActionDialog';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

const smtpSchema = z.object({
  host: z.string().optional(),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  from: z.string().email('请输入有效邮箱').or(z.literal(''))
});

const testEmailSchema = z.string().trim().email('请输入有效的测试收件邮箱');

type SmtpValues = z.infer<typeof smtpSchema>;

function sourceLabel(source: 'database' | 'env' | 'none') {
  if (source === 'database') {
    return '数据库';
  }

  if (source === 'env') {
    return '环境变量';
  }

  return '未配置';
}

export function SettingsPage() {
  const qc = useQueryClient();
  const [clearOpen, setClearOpen] = useState(false);
  const [testTo, setTestTo] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['system-settings', 'smtp'],
    queryFn: getSmtpSettings
  });

  const form = useForm<SmtpValues>({
    resolver: zodResolver(smtpSchema),
    defaultValues: {
      host: '',
      port: 465,
      secure: true,
      user: '',
      password: '',
      from: ''
    }
  });

  useEffect(() => {
    if (!data) {
      return;
    }

    form.reset({
      host: data.values.host,
      port: data.values.port,
      secure: data.values.secure,
      user: data.values.user,
      password: '',
      from: data.values.from
    });
  }, [data, form]);

  const saveMutation = useMutation({
    mutationFn: upsertSmtpSettings,
    onSuccess: (result) => {
      toast.success('SMTP 配置已保存');
      qc.setQueryData(['system-settings', 'smtp'], result);
      form.reset({
        host: result.values.host,
        port: result.values.port,
        secure: result.values.secure,
        user: result.values.user,
        password: '',
        from: result.values.from
      });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '保存失败')
  });

  const clearMutation = useMutation({
    mutationFn: clearSmtpSettings,
    onSuccess: async () => {
      toast.success('数据库中的 SMTP 配置已清空');
      setClearOpen(false);
      await qc.invalidateQueries({ queryKey: ['system-settings', 'smtp'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '清空失败')
  });

  const testMutation = useMutation({
    mutationFn: sendSmtpTestEmail,
    onSuccess: (result) => {
      toast.success(`测试邮件已发送到 ${result.to}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '发送测试邮件失败')
  });

  const handleSendTestEmail = form.handleSubmit((values) => {
    const parsed = testEmailSchema.safeParse(testTo);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? '请输入有效的测试收件邮箱');
      return;
    }

    testMutation.mutate({
      ...values,
      to: parsed.data
    });
  });

  return (
    <div>
      <SectionHeader sectionKey="settings" />
      <div className="p-6">
        <div className="max-w-3xl space-y-5 rounded-3xl border border-border bg-white p-6 shadow-sm">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-muted/40 p-4">
              <StatusPill tone={data?.configured ? 'ok' : 'neutral'} label={data?.configured ? 'SMTP 已配置' : 'SMTP 未配置'} />
              <StatusPill
                tone={data?.source === 'database' ? 'ok' : data?.source === 'env' ? 'warn' : 'neutral'}
                label={`来源: ${sourceLabel(data?.source ?? 'none')}`}
              />
            </div>
            <div>
              <h2 className="text-lg font-black text-foreground">SMTP 配置</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                用于注册验证码、邮箱验证和找回密码邮件。数据库配置会优先生效，并覆盖环境变量读取结果。
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, index) => (
                <div key={index} className="h-10 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))} className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="host"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SMTP Host</FormLabel>
                        <FormControl>
                          <Input placeholder="smtp.example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="port"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>端口</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={65535}
                            value={field.value}
                            onChange={(event) => field.onChange(event.target.value)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="user"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>用户名</FormLabel>
                        <FormControl>
                          <Input placeholder="mailer@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="from"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>发件人邮箱</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="noreply@example.com" {...field} />
                        </FormControl>
                        <FormDescription>留空时会回退到环境变量或默认值。</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SMTP Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder={data?.secrets.password.configured ? '已保存，留空保持不变' : '请输入 SMTP 密码'}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>密码会加密存储在数据库中。</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="secure"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-3 rounded-xl border border-border bg-slate-50 px-4 py-3">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <div>
                        <FormLabel className="cursor-pointer">启用 SSL/TLS</FormLabel>
                        <FormDescription>465 端口通常启用，587 端口通常关闭并由服务器升级连接。</FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                <div className="flex gap-2">
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? '保存中...' : '保存 SMTP 配置'}
                  </Button>
                  <Button type="button" variant="outline" disabled={clearMutation.isPending} onClick={() => setClearOpen(true)}>
                    清空数据库配置
                  </Button>
                </div>

                <div className="rounded-2xl border border-border bg-slate-50/70 p-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-black text-foreground">发送测试邮件</h3>
                    <p className="text-sm text-muted-foreground">
                      使用当前表单中的 SMTP 参数发送一封测试邮件，不会自动保存本页改动。
                    </p>
                  </div>
                  <div className="mt-4 flex flex-col gap-3 md:flex-row">
                    <Input
                      type="email"
                      value={testTo}
                      onChange={(event) => setTestTo(event.target.value)}
                      placeholder="test@example.com"
                    />
                    <Button type="button" variant="secondary" disabled={testMutation.isPending} onClick={handleSendTestEmail}>
                      {testMutation.isPending ? '发送中...' : '发送测试邮件'}
                    </Button>
                  </div>
                </div>
              </form>
            </Form>
          )}
        </div>
      </div>

      <ConfirmActionDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="清空 SMTP 数据库配置？"
        description="这会删除数据库中的 SMTP 设置。清空后系统将回退到环境变量配置；如果环境变量也没有配置，注册验证和找回密码邮件会失效。"
        confirmText={clearMutation.isPending ? '清空中...' : '确认清空'}
        confirmVariant="destructive"
        isConfirming={clearMutation.isPending}
        onConfirm={() => clearMutation.mutate()}
      />
    </div>
  );
}
