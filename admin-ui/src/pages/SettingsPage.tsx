import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import {
  clearOpenRouterSettings,
  clearQiniuSettings,
  clearSmtpSettings,
  getAiProviders,
  getOpenRouterSettings,
  getQiniuSettings,
  getSmtpSettings,
  previewOpenRouterChatCompletion,
  previewOpenRouterModels,
  sendSmtpTestEmail,
  testOpenRouterSettings,
  testQiniuSettings,
  upsertOpenRouterSettings,
  upsertQiniuSettings,
  upsertSmtpSettings
} from '@/api/settings';
import type { AiChatCompletionResult, AiModelSummary, OpenRouterTestConnectionResult } from '@/api/types';
import { ConfirmActionDialog } from '@/components/shared/ConfirmActionDialog';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

const openrouterSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().url('请输入有效链接').or(z.literal('')),
  siteUrl: z.string().url('请输入有效链接').or(z.literal('')),
  siteName: z.string().optional(),
  defaultModel: z.string().optional()
});

const testEmailSchema = z.string().trim().email('请输入有效的测试收件邮箱');
const testSubjectSchema = z.string().trim().min(1, '请输入测试邮件主题').max(200, '主题不能超过 200 个字符');
const testBodySchema = z.string().trim().min(1, '请输入测试邮件正文').max(10_000, '正文不能超过 10000 个字符');

type SmtpValues = z.infer<typeof smtpSchema>;
type QiniuValues = z.infer<typeof qiniuSchema>;
type OpenRouterValues = z.infer<typeof openrouterSchema>;

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

function buildOpenRouterPayload(values: OpenRouterValues, options: { includeApiKey: boolean }) {
  const apiKey = values.apiKey?.trim();
  const baseUrl = values.baseUrl?.trim();
  const siteUrl = values.siteUrl?.trim();
  const siteName = values.siteName?.trim();
  const defaultModel = values.defaultModel?.trim();

  return {
    ...(options.includeApiKey && apiKey ? { apiKey } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    ...(siteUrl ? { siteUrl } : {}),
    ...(siteName ? { siteName } : {}),
    ...(defaultModel ? { defaultModel } : {})
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

function formatCompactNumber(value: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return '—';
  }

  return new Intl.NumberFormat('en-US').format(value);
}

function formatPricePerMillion(value: string | null) {
  if (!value) {
    return '—';
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return `$${(parsed * 1_000_000).toFixed(2)} / 1M`;
}

function formatModelOptionLabel(model: AiModelSummary) {
  const name = model.name || model.id;
  const context = formatCompactNumber(model.contextLength);
  const promptPrice = formatPricePerMillion(model.promptPricing);
  return `${name} [${context}] ${promptPrice}`;
}

function formatModalities(values: string[]) {
  return values.length ? values.join(', ') : '—';
}

export function SettingsPage() {
  const qc = useQueryClient();
  const [clearSmtpOpen, setClearSmtpOpen] = useState(false);
  const [clearQiniuOpen, setClearQiniuOpen] = useState(false);
  const [clearOpenRouterOpen, setClearOpenRouterOpen] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testSubject, setTestSubject] = useState('fd-core-stack SMTP 测试邮件');
  const [testBody, setTestBody] = useState(
    ['这是一封来自 fd-core-stack 的测试邮件。', '', '如果你收到了这封邮件，说明当前 SMTP 配置已经可以正常发送邮件。'].join('\n')
  );
  const [openrouterModels, setOpenrouterModels] = useState<AiModelSummary[]>([]);
  const [openrouterModelsLoaded, setOpenrouterModelsLoaded] = useState(false);
  const [openrouterConnectionResult, setOpenrouterConnectionResult] = useState<OpenRouterTestConnectionResult | null>(null);
  const [openrouterTestMessage, setOpenrouterTestMessage] = useState('Hello, translate this to Chinese.');
  const [openrouterChatResult, setOpenrouterChatResult] = useState<AiChatCompletionResult | null>(null);

  const { data: aiProvidersData } = useQuery({
    queryKey: ['admin-ai-providers'],
    queryFn: getAiProviders
  });

  const { data: smtpData, isLoading: smtpLoading } = useQuery({
    queryKey: ['system-settings', 'smtp'],
    queryFn: getSmtpSettings
  });

  const { data: qiniuData, isLoading: qiniuLoading } = useQuery({
    queryKey: ['system-settings', 'qiniu'],
    queryFn: getQiniuSettings
  });

  const { data: openrouterData, isLoading: openrouterLoading } = useQuery({
    queryKey: ['system-settings', 'ai', 'openrouter'],
    queryFn: getOpenRouterSettings
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

  const openrouterForm = useForm<OpenRouterValues>({
    resolver: zodResolver(openrouterSchema),
    defaultValues: {
      apiKey: '',
      baseUrl: 'https://openrouter.ai/api/v1',
      siteUrl: '',
      siteName: 'fd-core-stack',
      defaultModel: ''
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

  useEffect(() => {
    if (!openrouterData) {
      return;
    }

    openrouterForm.reset({
      apiKey: '',
      baseUrl: openrouterData.values.baseUrl,
      siteUrl: openrouterData.values.siteUrl,
      siteName: openrouterData.values.siteName,
      defaultModel: openrouterData.values.defaultModel
    });
  }, [openrouterData, openrouterForm]);

  const buildCurrentOpenRouterPayload = () =>
    buildOpenRouterPayload(openrouterForm.getValues(), {
      includeApiKey: Boolean(openrouterForm.formState.dirtyFields.apiKey)
    });

  const selectedOpenRouterModelId = openrouterForm.watch('defaultModel');
  const selectedOpenRouterModel = openrouterModels.find((item) => item.id === selectedOpenRouterModelId) ?? null;
  const hasSelectedOpenRouterModelOption =
    !selectedOpenRouterModelId || openrouterModels.some((item) => item.id === selectedOpenRouterModelId);

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

  const saveOpenRouterMutation = useMutation({
    mutationFn: upsertOpenRouterSettings,
    onSuccess: async (result) => {
      toast.success('OpenRouter 配置已保存');
      qc.setQueryData(['system-settings', 'ai', 'openrouter'], result);
      openrouterForm.reset({
        apiKey: '',
        baseUrl: result.values.baseUrl,
        siteUrl: result.values.siteUrl,
        siteName: result.values.siteName,
        defaultModel: result.values.defaultModel
      });
      setOpenrouterModelsLoaded(false);
      await qc.invalidateQueries({ queryKey: ['admin-ai-providers'] });
      previewOpenRouterModelsMutation.mutate({
        baseUrl: result.values.baseUrl,
        siteUrl: result.values.siteUrl,
        siteName: result.values.siteName,
        defaultModel: result.values.defaultModel
      });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '保存失败')
  });

  const clearOpenRouterMutation = useMutation({
    mutationFn: clearOpenRouterSettings,
    onSuccess: async () => {
      toast.success('数据库中的 OpenRouter 配置已清空');
      setClearOpenRouterOpen(false);
      setOpenrouterModels([]);
      setOpenrouterModelsLoaded(false);
      setOpenrouterConnectionResult(null);
      setOpenrouterChatResult(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['system-settings', 'ai', 'openrouter'] }),
        qc.invalidateQueries({ queryKey: ['admin-ai-providers'] })
      ]);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '清空失败')
  });

  const previewOpenRouterModelsMutation = useMutation({
    mutationFn: previewOpenRouterModels,
    onMutate: () => {
      setOpenrouterChatResult(null);
    },
    onSuccess: (result) => {
      setOpenrouterModels(result.items);
      setOpenrouterModelsLoaded(true);
      if (!result.items.length) {
        toast.warning('当前配置下没有拉取到可用模型');
      }
    },
    onError: (err) => {
      setOpenrouterModelsLoaded(true);
      setOpenrouterModels([]);
      toast.error(err instanceof Error ? err.message : '拉取模型列表失败');
    }
  });

  const testOpenRouterMutation = useMutation({
    mutationFn: testOpenRouterSettings,
    onSuccess: (result) => {
      setOpenrouterConnectionResult(result);
      toast.success(`OpenRouter 连接成功，共发现 ${result.modelCount} 个模型`);
      previewOpenRouterModelsMutation.mutate(buildCurrentOpenRouterPayload());
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '测试连接失败')
  });

  const previewOpenRouterChatMutation = useMutation({
    mutationFn: previewOpenRouterChatCompletion,
    onMutate: () => {
      setOpenrouterChatResult(null);
    },
    onSuccess: (result) => {
      setOpenrouterChatResult(result);
    },
    onError: (err) => {
      setOpenrouterChatResult(null);
      toast.error(err instanceof Error ? err.message : '对话测试失败');
    }
  });

  useEffect(() => {
    if (!openrouterData?.configured || previewOpenRouterModelsMutation.isPending || openrouterModelsLoaded) {
      return;
    }

    previewOpenRouterModelsMutation.mutate(
      buildOpenRouterPayload(
        {
          apiKey: '',
          baseUrl: openrouterData.values.baseUrl,
          siteUrl: openrouterData.values.siteUrl,
          siteName: openrouterData.values.siteName,
          defaultModel: openrouterData.values.defaultModel
        },
        { includeApiKey: false }
      )
    );
  }, [openrouterData, openrouterModelsLoaded, previewOpenRouterModelsMutation]);

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

  const handleTestOpenRouter = openrouterForm.handleSubmit((values) => {
    testOpenRouterMutation.mutate(
      buildOpenRouterPayload(values, { includeApiKey: Boolean(openrouterForm.formState.dirtyFields.apiKey) })
    );
  });

  const handleLoadOpenRouterModels = openrouterForm.handleSubmit((values) => {
    previewOpenRouterModelsMutation.mutate(
      buildOpenRouterPayload(values, { includeApiKey: Boolean(openrouterForm.formState.dirtyFields.apiKey) })
    );
  });

  const handleRunOpenRouterChatTest = openrouterForm.handleSubmit((values) => {
    const message = openrouterTestMessage.trim();
    if (!message) {
      toast.error('请输入测试消息');
      return;
    }

    const model = values.defaultModel?.trim();
    if (!model) {
      toast.error('请先拉取模型列表并选择默认模型');
      return;
    }

    previewOpenRouterChatMutation.mutate({
      ...buildOpenRouterPayload(values, { includeApiKey: Boolean(openrouterForm.formState.dirtyFields.apiKey) }),
      model,
      messages: [
        {
          role: 'user',
          content: message
        }
      ],
      maxTokens: 400
    });
  });

  const configuredAiProviders = aiProvidersData?.items.filter((item) => item.configured).length ?? (openrouterData?.configured ? 1 : 0);
  const totalAiProviders = aiProvidersData?.items.length ?? 1;

  return (
    <div>
      <SectionHeader sectionKey="settings" />
      <div className="space-y-6 p-6">
        <Tabs defaultValue="smtp" className="max-w-3xl space-y-5">
          <div className="rounded-3xl border border-border bg-white p-6 shadow-sm">
            <div className="space-y-3">
              <div>
                <h2 className="text-lg font-black text-foreground">系统设置</h2>
                <p className="mt-1 text-sm text-muted-foreground">把系统能力按 SMTP、云存储和 AI Hub 分组管理，减少长页面滚动。</p>
              </div>
              <TabsList className="h-auto w-full justify-start gap-1 rounded-2xl bg-muted/70 p-1">
                <TabsTrigger value="smtp" className="min-w-[108px] rounded-xl">
                  SMTP
                </TabsTrigger>
                <TabsTrigger value="qiniu" className="min-w-[108px] rounded-xl">
                  七牛云
                </TabsTrigger>
                <TabsTrigger value="ai" className="min-w-[108px] rounded-xl">
                  AI Hub
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          <TabsContent value="smtp" className="mt-0">
            <div className="space-y-5 rounded-3xl border border-border bg-white p-6 shadow-sm">
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
          </TabsContent>

          <TabsContent value="qiniu" className="mt-0">
            <div className="space-y-5 rounded-3xl border border-border bg-white p-6 shadow-sm">
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
          </TabsContent>

          <TabsContent value="ai" className="mt-0">
            <div className="space-y-5 rounded-3xl border border-border bg-white p-6 shadow-sm">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-muted/40 p-4">
                  <StatusPill
                    tone={configuredAiProviders > 0 ? 'ok' : 'neutral'}
                    label={`AI Providers ${configuredAiProviders}/${totalAiProviders}`}
                  />
                  <StatusPill
                    tone={openrouterData?.configured ? 'ok' : 'neutral'}
                    label={openrouterData?.configured ? 'OpenRouter 已配置' : 'OpenRouter 未配置'}
                  />
                  <StatusPill
                    tone={openrouterData?.source === 'database' ? 'ok' : openrouterData?.source === 'env' ? 'warn' : 'neutral'}
                    label={`来源: ${sourceLabel(openrouterData?.source ?? 'none')}`}
                  />
                </div>
                <div>
                  <h2 className="text-lg font-black text-foreground">AI API Hub</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    先接入 OpenRouter 作为第一个模型 Provider。后续新增其他服务商时，继续沿用同一套 Hub 结构和接口。
                  </p>
                </div>
              </div>

              {openrouterLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, index) => (
                    <div key={index} className="h-10 animate-pulse rounded-xl bg-muted" />
                  ))}
                </div>
              ) : (
                <Form {...openrouterForm}>
                  <form
                    onSubmit={openrouterForm.handleSubmit((values) =>
                      saveOpenRouterMutation.mutate(
                        buildOpenRouterPayload(values, { includeApiKey: Boolean(openrouterForm.formState.dirtyFields.apiKey) })
                      )
                    )}
                    className="space-y-5"
                  >
                    <div className="rounded-2xl border border-border bg-slate-50/70 p-4">
                      <div className="space-y-1">
                        <h3 className="text-sm font-black text-foreground">OpenRouter Provider</h3>
                        <p className="text-sm text-muted-foreground">
                          先保存或测试 API Key，再拉取模型列表，最后从下拉框里选择默认模型。这样不需要手填 model id。
                        </p>
                      </div>
                    </div>

                    <FormField
                      control={openrouterForm.control}
                      name="apiKey"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>OpenRouter API Key</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              autoComplete="new-password"
                              placeholder={openrouterData?.secrets.apiKey.configured ? '已保存，留空保持不变' : '请输入 OpenRouter API Key'}
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>API Key 会加密存储在数据库中，由中台统一代理模型调用。</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" disabled={saveOpenRouterMutation.isPending}>
                        {saveOpenRouterMutation.isPending ? '保存中...' : '保存 OpenRouter 配置'}
                      </Button>
                      <Button type="button" variant="secondary" disabled={testOpenRouterMutation.isPending} onClick={handleTestOpenRouter}>
                        {testOpenRouterMutation.isPending ? '测试中...' : '测试连接'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={previewOpenRouterModelsMutation.isPending}
                        onClick={handleLoadOpenRouterModels}
                      >
                        {previewOpenRouterModelsMutation.isPending ? '拉取中...' : '拉取模型列表'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={clearOpenRouterMutation.isPending}
                        onClick={() => setClearOpenRouterOpen(true)}
                      >
                        清空数据库配置
                      </Button>
                    </div>

                    {openrouterConnectionResult ? (
                      <div className="rounded-2xl border border-border bg-white p-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <StatusPill tone="ok" label="连接成功" />
                          <StatusPill tone="info" label={`${openrouterConnectionResult.modelCount} 个模型`} />
                          <StatusPill
                            tone={openrouterConnectionResult.defaultModel ? 'info' : 'neutral'}
                            label={openrouterConnectionResult.defaultModel ? `当前默认模型: ${openrouterConnectionResult.defaultModel}` : '当前未设置默认模型'}
                          />
                        </div>
                        {openrouterConnectionResult.sampleModels.length ? (
                          <div className="mt-3">
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Sample Models</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {openrouterConnectionResult.sampleModels.map((item) => (
                                <span key={item} className="rounded-full border border-border bg-slate-50 px-3 py-1 text-xs text-muted-foreground">
                                  {item}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="space-y-4 rounded-2xl border border-border bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-black text-foreground">默认模型</h3>
                          <p className="text-sm text-muted-foreground">
                            拉取到模型列表后，在这里选择 OpenRouter 的默认模型。
                          </p>
                        </div>
                        {openrouterModelsLoaded ? (
                          <StatusPill tone={openrouterModels.length ? 'info' : 'neutral'} label={`${openrouterModels.length} 个模型`} />
                        ) : null}
                      </div>

                      <FormField
                        control={openrouterForm.control}
                        name="defaultModel"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>默认模型</FormLabel>
                            <Select value={field.value || '__unset__'} onValueChange={(value) => field.onChange(value === '__unset__' ? '' : value)}>
                              <FormControl>
                                <SelectTrigger disabled={previewOpenRouterModelsMutation.isPending || (!openrouterModels.length && !field.value)}>
                                  <SelectValue placeholder={openrouterModels.length ? '选择默认模型' : '请先保存 API Key 或拉取模型列表'} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="__unset__">暂不设置默认模型</SelectItem>
                                {!hasSelectedOpenRouterModelOption && field.value ? (
                                  <SelectItem value={field.value}>当前已保存模型（当前列表中未返回）</SelectItem>
                                ) : null}
                                {openrouterModels.map((model) => (
                                  <SelectItem key={model.id} value={model.id}>
                                    {formatModelOptionLabel(model)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              {openrouterModels.length
                                ? '选择后点击“保存 OpenRouter 配置”即可持久化到中台。'
                                : '当前还没有可选模型。先点击“测试连接”或“拉取模型列表”。'}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {selectedOpenRouterModel ? (
                        <div className="rounded-2xl border border-border bg-slate-50/70 p-4 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-black text-foreground">{selectedOpenRouterModel.name || selectedOpenRouterModel.id}</p>
                              <p className="text-xs font-mono text-muted-foreground">{selectedOpenRouterModel.id}</p>
                            </div>
                            <StatusPill tone="info" label={selectedOpenRouterModel.modality || 'text'} />
                          </div>
                          {selectedOpenRouterModel.description ? (
                            <p className="mt-3 text-sm text-muted-foreground">{selectedOpenRouterModel.description}</p>
                          ) : null}
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <div className="rounded-xl border border-border bg-white px-3 py-2">
                              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Context</p>
                              <p className="mt-1 text-sm font-semibold text-foreground">{formatCompactNumber(selectedOpenRouterModel.contextLength)} tokens</p>
                            </div>
                            <div className="rounded-xl border border-border bg-white px-3 py-2">
                              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Max Output</p>
                              <p className="mt-1 text-sm font-semibold text-foreground">{formatCompactNumber(selectedOpenRouterModel.maxCompletionTokens)} tokens</p>
                            </div>
                            <div className="rounded-xl border border-border bg-white px-3 py-2">
                              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Prompt Pricing</p>
                              <p className="mt-1 text-sm font-semibold text-foreground">{formatPricePerMillion(selectedOpenRouterModel.promptPricing)}</p>
                            </div>
                            <div className="rounded-xl border border-border bg-white px-3 py-2">
                              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Completion Pricing</p>
                              <p className="mt-1 text-sm font-semibold text-foreground">{formatPricePerMillion(selectedOpenRouterModel.completionPricing)}</p>
                            </div>
                            <div className="rounded-xl border border-border bg-white px-3 py-2">
                              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Input Modalities</p>
                              <p className="mt-1 text-sm font-semibold text-foreground">{formatModalities(selectedOpenRouterModel.inputModalities)}</p>
                            </div>
                            <div className="rounded-xl border border-border bg-white px-3 py-2">
                              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Output Modalities</p>
                              <p className="mt-1 text-sm font-semibold text-foreground">{formatModalities(selectedOpenRouterModel.outputModalities)}</p>
                            </div>
                          </div>
                        </div>
                      ) : openrouterModelsLoaded ? (
                        <div className="rounded-2xl border border-dashed border-border bg-slate-50/50 px-4 py-5 text-sm text-muted-foreground">
                          {openrouterModels.length
                            ? '模型列表已加载，但你还没有选择默认模型。'
                            : '当前配置下没有拉取到模型列表，请检查 API Key 或 Base URL。'}
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-4 rounded-2xl border border-border bg-white p-4">
                      <div>
                        <h3 className="text-sm font-black text-foreground">模型对话测试</h3>
                        <p className="text-sm text-muted-foreground">
                          使用当前表单中的 OpenRouter 配置直接发一条测试消息，确认模型调用链和默认模型是否正常。
                        </p>
                      </div>
                      <Textarea
                        value={openrouterTestMessage}
                        onChange={(event) => setOpenrouterTestMessage(event.target.value)}
                        placeholder="输入测试消息，例如：Hello, translate this to Chinese."
                        className="min-h-[120px]"
                      />
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={previewOpenRouterChatMutation.isPending || !selectedOpenRouterModelId}
                          onClick={handleRunOpenRouterChatTest}
                        >
                          {previewOpenRouterChatMutation.isPending ? '发送中...' : '发送测试'}
                        </Button>
                      </div>
                      {openrouterChatResult ? (
                        <div className="rounded-2xl border border-border bg-slate-50/70 p-4">
                          <div className="flex flex-wrap items-center gap-3">
                            <StatusPill tone="ok" label={openrouterChatResult.model} />
                            <StatusPill
                              tone="info"
                              label={`Prompt ${openrouterChatResult.usage.promptTokens ?? 0} / Completion ${openrouterChatResult.usage.completionTokens ?? 0}`}
                            />
                          </div>
                          <ScrollArea className="mt-4 h-[220px] rounded-2xl border border-border bg-white">
                            <div className="space-y-3 p-4 text-sm">
                              <p className="whitespace-pre-wrap leading-6 text-foreground">{openrouterChatResult.content}</p>
                              {openrouterChatResult.finishReason ? (
                                <p className="text-xs text-muted-foreground">Finish reason: {openrouterChatResult.finishReason}</p>
                              ) : null}
                            </div>
                          </ScrollArea>
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-4 rounded-2xl border border-border bg-white p-4">
                      <div>
                        <h3 className="text-sm font-black text-foreground">高级设置</h3>
                        <p className="text-sm text-muted-foreground">
                          大多数场景保持默认即可。只有需要自定义请求头或切换代理地址时，再修改这里。
                        </p>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <FormField
                          control={openrouterForm.control}
                          name="baseUrl"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>API Base URL</FormLabel>
                              <FormControl>
                                <Input placeholder="https://openrouter.ai/api/v1" {...field} />
                              </FormControl>
                              <FormDescription>默认保持 OpenRouter 官方 API 地址即可。</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={openrouterForm.control}
                          name="siteUrl"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Site URL / HTTP-Referer</FormLabel>
                              <FormControl>
                                <Input placeholder="https://stack.futuredecade.com" {...field} />
                              </FormControl>
                              <FormDescription>作为 OpenRouter 请求头中的 `HTTP-Referer`。</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={openrouterForm.control}
                          name="siteName"
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel>Site Name / X-Title</FormLabel>
                              <FormControl>
                                <Input placeholder="fd-core-stack" {...field} />
                              </FormControl>
                              <FormDescription>作为 OpenRouter 请求头中的 `X-Title`。</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </form>
                </Form>
              )}
            </div>
          </TabsContent>
        </Tabs>
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

      <ConfirmActionDialog
        open={clearOpenRouterOpen}
        onOpenChange={setClearOpenRouterOpen}
        title="清空 OpenRouter 数据库配置？"
        description="这会删除数据库中的 OpenRouter 设置。清空后 AI API Hub 会回退到环境变量；如果环境变量也没有配置，中台将无法继续代理 OpenRouter 模型请求。"
        confirmText={clearOpenRouterMutation.isPending ? '清空中...' : '确认清空'}
        confirmVariant="destructive"
        isConfirming={clearOpenRouterMutation.isPending}
        onConfirm={() => clearOpenRouterMutation.mutate()}
      />
    </div>
  );
}
