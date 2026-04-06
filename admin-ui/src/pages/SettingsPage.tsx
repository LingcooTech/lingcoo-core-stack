import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import {
  clearQiniuSettings,
  clearSmtpSettings,
  getQiniuSettings,
  getSmtpSettings,
  sendSmtpTestEmail,
  testQiniuSettings,
  upsertQiniuSettings,
  upsertSmtpSettings
} from '@/api/settings';
import { ConfirmActionDialog } from '@/components/shared/ConfirmActionDialog';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const smtpSchema = z.object({
  host: z.string().optional(),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  from: z.string().email('请输入有效邮箱').or(z.literal(''))
});

const qiniuSchema = z.object({
  accessKey: z.string().optional(),
  secretKey: z.string().optional(),
  bucketName: z.string().optional(),
  publicBaseUrl: z.string().url('请输入有效链接').or(z.literal('')),
  uploadHost: z.string().url('请输入有效链接').or(z.literal('')),
  defaultPrefix: z.string().optional()
});

const testEmailSchema = z.string().trim().email('请输入有效的测试收件邮箱');
const testSubjectSchema = z.string().trim().min(1, '请输入测试邮件主题').max(200, '主题不能超过 200 个字符');
const testBodySchema = z.string().trim().min(1, '请输入测试邮件正文').max(10_000, '正文不能超过 10000 个字符');

type SmtpValues = z.infer<typeof smtpSchema>;
type QiniuValues = z.infer<typeof qiniuSchema>;

function buildSmtpPayload(values: SmtpValues, options: { includePassword: boolean }) {
  const host = values.host?.trim();
  const user = values.user?.trim();
  const password = values.password?.trim();
  const from = values.from?.trim();

  return {
    ...(host ? { host } : {}),
    port: values.port,
    secure: Boolean(values.secure),
    ...(user ? { user } : {}),
    ...(options.includePassword && password ? { password } : {}),
    ...(from ? { from } : {})
  };
}

function buildQiniuPayload(values: QiniuValues, options: { includeSecretKey: boolean }) {
  const accessKey = values.accessKey?.trim();
  const secretKey = values.secretKey?.trim();
  const bucketName = values.bucketName?.trim();
  const publicBaseUrl = values.publicBaseUrl?.trim();
  const uploadHost = values.uploadHost?.trim();
  const defaultPrefix = values.defaultPrefix?.trim();

  return {
    ...(accessKey ? { accessKey } : {}),
    ...(options.includeSecretKey && secretKey ? { secretKey } : {}),
    ...(bucketName ? { bucketName } : {}),
    ...(publicBaseUrl ? { publicBaseUrl } : {}),
    ...(uploadHost ? { uploadHost } : {}),
    ...(defaultPrefix ? { defaultPrefix } : {})
  };
}

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
  const [clearSmtpOpen, setClearSmtpOpen] = useState(false);
  const [clearQiniuOpen, setClearQiniuOpen] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testSubject, setTestSubject] = useState('fd-core-stack SMTP 测试邮件');
  const [testBody, setTestBody] = useState(
    ['这是一封来自 fd-core-stack 的测试邮件。', '', '如果你收到了这封邮件，说明当前 SMTP 配置已经可以正常发送邮件。'].join('\n')
  );

  const { data: smtpData, isLoading: smtpLoading } = useQuery({
    queryKey: ['system-settings', 'smtp'],
    queryFn: getSmtpSettings
  });

  const { data: qiniuData, isLoading: qiniuLoading } = useQuery({
    queryKey: ['system-settings', 'qiniu'],
    queryFn: getQiniuSettings
  });

  const smtpForm = useForm<SmtpValues>({
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

  const qiniuForm = useForm<QiniuValues>({
    resolver: zodResolver(qiniuSchema),
    defaultValues: {
      accessKey: '',
      secretKey: '',
      bucketName: '',
      publicBaseUrl: '',
      uploadHost: 'https://upload.qiniup.com',
      defaultPrefix: ''
    }
  });

  useEffect(() => {
    if (!smtpData) {
      return;
    }

    smtpForm.reset({
      host: smtpData.values.host,
      port: smtpData.values.port,
      secure: smtpData.values.secure,
      user: smtpData.values.user,
      password: '',
      from: smtpData.values.from
    });
  }, [smtpData, smtpForm]);

  useEffect(() => {
    if (!qiniuData) {
      return;
    }

    qiniuForm.reset({
      accessKey: qiniuData.values.accessKey,
      secretKey: '',
      bucketName: qiniuData.values.bucketName,
      publicBaseUrl: qiniuData.values.publicBaseUrl,
      uploadHost: qiniuData.values.uploadHost,
      defaultPrefix: qiniuData.values.defaultPrefix
    });
  }, [qiniuData, qiniuForm]);

  const saveSmtpMutation = useMutation({
    mutationFn: upsertSmtpSettings,
    onSuccess: (result) => {
      toast.success('SMTP 配置已保存');
      qc.setQueryData(['system-settings', 'smtp'], result);
      smtpForm.reset({
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

  const clearSmtpMutation = useMutation({
    mutationFn: clearSmtpSettings,
    onSuccess: async () => {
      toast.success('数据库中的 SMTP 配置已清空');
      setClearSmtpOpen(false);
      await qc.invalidateQueries({ queryKey: ['system-settings', 'smtp'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '清空失败')
  });

  const testSmtpMutation = useMutation({
    mutationFn: sendSmtpTestEmail,
    onSuccess: (result) => {
      toast.success(`测试邮件已发送到 ${result.to}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '发送测试邮件失败')
  });

  const saveQiniuMutation = useMutation({
    mutationFn: upsertQiniuSettings,
    onSuccess: (result) => {
      toast.success('七牛云配置已保存');
      qc.setQueryData(['system-settings', 'qiniu'], result);
      qiniuForm.reset({
        accessKey: result.values.accessKey,
        secretKey: '',
        bucketName: result.values.bucketName,
        publicBaseUrl: result.values.publicBaseUrl,
        uploadHost: result.values.uploadHost,
        defaultPrefix: result.values.defaultPrefix
      });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '保存失败')
  });

  const clearQiniuMutation = useMutation({
    mutationFn: clearQiniuSettings,
    onSuccess: async () => {
      toast.success('数据库中的七牛云配置已清空');
      setClearQiniuOpen(false);
      await qc.invalidateQueries({ queryKey: ['system-settings', 'qiniu'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '清空失败')
  });

  const testQiniuMutation = useMutation({
    mutationFn: testQiniuSettings,
    onSuccess: (result) => {
      toast.success(`七牛云连接成功，Bucket: ${result.bucketName}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '测试连接失败')
  });

  const handleSendTestEmail = smtpForm.handleSubmit((values) => {
    const parsedTo = testEmailSchema.safeParse(testTo);
    if (!parsedTo.success) {
      toast.error(parsedTo.error.issues[0]?.message ?? '请输入有效的测试收件邮箱');
      return;
    }

    const parsedSubject = testSubjectSchema.safeParse(testSubject);
    if (!parsedSubject.success) {
      toast.error(parsedSubject.error.issues[0]?.message ?? '请输入测试邮件主题');
      return;
    }

    const parsedBody = testBodySchema.safeParse(testBody);
    if (!parsedBody.success) {
      toast.error(parsedBody.error.issues[0]?.message ?? '请输入测试邮件正文');
      return;
    }

    testSmtpMutation.mutate({
      ...buildSmtpPayload(values, { includePassword: Boolean(smtpForm.formState.dirtyFields.password) }),
      to: parsedTo.data,
      subject: parsedSubject.data,
      text: parsedBody.data
    });
  });

  const handleTestQiniu = qiniuForm.handleSubmit((values) => {
    testQiniuMutation.mutate(
      buildQiniuPayload(values, { includeSecretKey: Boolean(qiniuForm.formState.dirtyFields.secretKey) })
    );
  });

  return (
    <div>
      <SectionHeader sectionKey="settings" />
      <div className="space-y-6 p-6">
        <div className="max-w-3xl space-y-5 rounded-3xl border border-border bg-white p-6 shadow-sm">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-muted/40 p-4">
              <StatusPill tone={smtpData?.configured ? 'ok' : 'neutral'} label={smtpData?.configured ? 'SMTP 已配置' : 'SMTP 未配置'} />
              <StatusPill
                tone={smtpData?.source === 'database' ? 'ok' : smtpData?.source === 'env' ? 'warn' : 'neutral'}
                label={`来源: ${sourceLabel(smtpData?.source ?? 'none')}`}
              />
            </div>
            <div>
              <h2 className="text-lg font-black text-foreground">SMTP 配置</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                用于注册验证码、邮箱验证和找回密码邮件。数据库配置会优先生效，并覆盖环境变量读取结果。
              </p>
            </div>
          </div>

          {smtpLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, index) => (
                <div key={index} className="h-10 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : (
            <Form {...smtpForm}>
              <form
                onSubmit={smtpForm.handleSubmit((values) =>
                  saveSmtpMutation.mutate(
                    buildSmtpPayload(values, { includePassword: Boolean(smtpForm.formState.dirtyFields.password) })
                  )
                )}
                className="space-y-5"
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={smtpForm.control}
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
                    control={smtpForm.control}
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
                    control={smtpForm.control}
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
                    control={smtpForm.control}
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
                  control={smtpForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SMTP Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          autoComplete="new-password"
                          placeholder={smtpData?.secrets.password.configured ? '已保存，留空保持不变' : '请输入 SMTP 密码'}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>密码会加密存储在数据库中。</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={smtpForm.control}
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
                  <Button type="submit" disabled={saveSmtpMutation.isPending}>
                    {saveSmtpMutation.isPending ? '保存中...' : '保存 SMTP 配置'}
                  </Button>
                  <Button type="button" variant="outline" disabled={clearSmtpMutation.isPending} onClick={() => setClearSmtpOpen(true)}>
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
                  </div>
                  <div className="mt-3">
                    <Input
                      value={testSubject}
                      onChange={(event) => setTestSubject(event.target.value)}
                      placeholder="测试邮件主题"
                    />
                  </div>
                  <div className="mt-3">
                    <Textarea
                      value={testBody}
                      onChange={(event) => setTestBody(event.target.value)}
                      placeholder="测试邮件正文"
                      className="min-h-[140px]"
                    />
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button type="button" variant="secondary" disabled={testSmtpMutation.isPending} onClick={handleSendTestEmail}>
                      {testSmtpMutation.isPending ? '发送中...' : '发送测试邮件'}
                    </Button>
                  </div>
                </div>
              </form>
            </Form>
          )}
        </div>

        <div className="max-w-3xl space-y-5 rounded-3xl border border-border bg-white p-6 shadow-sm">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-muted/40 p-4">
              <StatusPill tone={qiniuData?.configured ? 'ok' : 'neutral'} label={qiniuData?.configured ? '七牛云已配置' : '七牛云未配置'} />
              <StatusPill
                tone={qiniuData?.source === 'database' ? 'ok' : qiniuData?.source === 'env' ? 'warn' : 'neutral'}
                label={`来源: ${sourceLabel(qiniuData?.source ?? 'none')}`}
              />
            </div>
            <div>
              <h2 className="text-lg font-black text-foreground">七牛云存储</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                用于应用图标、封面和截图的直接上传与图片选择。保存后，应用编辑页会出现云存储上传/选择入口。
              </p>
            </div>
          </div>

          {qiniuLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="h-10 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : (
            <Form {...qiniuForm}>
              <form
                onSubmit={qiniuForm.handleSubmit((values) =>
                  saveQiniuMutation.mutate(
                    buildQiniuPayload(values, { includeSecretKey: Boolean(qiniuForm.formState.dirtyFields.secretKey) })
                  )
                )}
                className="space-y-5"
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={qiniuForm.control}
                    name="accessKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Access Key</FormLabel>
                        <FormControl>
                          <Input placeholder="Qiniu Access Key" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={qiniuForm.control}
                    name="bucketName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bucket</FormLabel>
                        <FormControl>
                          <Input placeholder="bucket-name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={qiniuForm.control}
                    name="publicBaseUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>公共访问域名</FormLabel>
                        <FormControl>
                          <Input placeholder="https://cdn.example.com" {...field} />
                        </FormControl>
                        <FormDescription>用于图片预览和把已选图片 URL 回填到应用表单。</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={qiniuForm.control}
                    name="uploadHost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>上传域名</FormLabel>
                        <FormControl>
                          <Input placeholder="https://upload.qiniup.com" {...field} />
                        </FormControl>
                        <FormDescription>大多数标准 Bucket 维持默认值即可。</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={qiniuForm.control}
                  name="defaultPrefix"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>默认目录前缀</FormLabel>
                      <FormControl>
                        <Input placeholder="apps" {...field} />
                      </FormControl>
                      <FormDescription>例如填 `apps`，上传文件时会自动落到 `apps/...` 目录下。</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={qiniuForm.control}
                  name="secretKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Secret Key</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          autoComplete="new-password"
                          placeholder={qiniuData?.secrets.secretKey.configured ? '已保存，留空保持不变' : '请输入 Secret Key'}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>Secret Key 会加密存储在数据库中。</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={saveQiniuMutation.isPending}>
                    {saveQiniuMutation.isPending ? '保存中...' : '保存七牛云配置'}
                  </Button>
                  <Button type="button" variant="secondary" disabled={testQiniuMutation.isPending} onClick={handleTestQiniu}>
                    {testQiniuMutation.isPending ? '测试中...' : '测试连接'}
                  </Button>
                  <Button type="button" variant="outline" disabled={clearQiniuMutation.isPending} onClick={() => setClearQiniuOpen(true)}>
                    清空数据库配置
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </div>
      </div>

      <ConfirmActionDialog
        open={clearSmtpOpen}
        onOpenChange={setClearSmtpOpen}
        title="清空 SMTP 数据库配置？"
        description="这会删除数据库中的 SMTP 设置。清空后系统将回退到环境变量配置；如果环境变量也没有配置，注册验证和找回密码邮件会失效。"
        confirmText={clearSmtpMutation.isPending ? '清空中...' : '确认清空'}
        confirmVariant="destructive"
        isConfirming={clearSmtpMutation.isPending}
        onConfirm={() => clearSmtpMutation.mutate()}
      />

      <ConfirmActionDialog
        open={clearQiniuOpen}
        onOpenChange={setClearQiniuOpen}
        title="清空七牛云数据库配置？"
        description="这会删除数据库中的七牛云设置。清空后应用编辑页里的云存储上传和图片选择会失效，并回退到手动 URL 方式。"
        confirmText={clearQiniuMutation.isPending ? '清空中...' : '确认清空'}
        confirmVariant="destructive"
        isConfirming={clearQiniuMutation.isPending}
        onConfirm={() => clearQiniuMutation.mutate()}
      />
    </div>
  );
}
