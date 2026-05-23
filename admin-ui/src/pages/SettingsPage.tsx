import { Plus, Trash2 } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import {
  clearContentImportSettings,
  clearOpenRouterSettings,
  clearPublicPagesSettings,
  clearQiniuSettings,
  clearSiteSettings,
  clearSmtpSettings,
  getContentImportSettings,
  getAiProviders,
  getOpenRouterSettings,
  getPublicPagesSettings,
  getQiniuSettings,
  getSiteSettings,
  getSmtpSettings,
  previewOpenRouterChatCompletion,
  previewOpenRouterModels,
  sendSmtpTestEmail,
  testNotionImportSettings,
  testWordPressImportSettings,
  testOpenRouterSettings,
  testQiniuSettings,
  upsertContentImportSettings,
  upsertOpenRouterSettings,
  upsertPublicPagesSettings,
  upsertQiniuSettings,
  upsertSiteSettings,
  upsertSmtpSettings,
} from '@/api/settings';
import type {
  AiChatCompletionResult,
  AiModelSummary,
  ContentImportNotionTestResult,
  ContentImportWordPressTestResult,
  OpenRouterTestConnectionResult,
} from '@/api/types';
import { ConfirmActionDialog } from '@/components/shared/ConfirmActionDialog';
import { QiniuImageField } from '@/components/shared/QiniuImageField';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

const smtpSchema = z.object({
  host: z.string().optional(),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  from: z.string().email('请输入有效邮箱').or(z.literal('')),
});

const optionalUrlField = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : value),
  z.union([z.string().url('请输入有效链接'), z.literal('')]),
);

const qiniuSchema = z.object({
  accessKey: z.string().optional(),
  secretKey: z.string().optional(),
  bucketName: z.string().optional(),
  publicBaseUrl: optionalUrlField,
  uploadHost: optionalUrlField,
  defaultPrefix: z.string().optional(),
});

const optionalSiteLinkField = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : value),
  z
    .union([
      z.string().startsWith('/'),
      z.string().url('请输入有效链接'),
      z.string().startsWith('mailto:'),
      z.string().startsWith('tel:'),
      z.literal(''),
    ])
    .refine((value) => Boolean(value) || value === '', '请输入有效链接'),
);

const siteLinkSchema = z.object({
  label: z.string().trim().min(1, '请输入链接名称').max(60, '名称不能超过 60 个字符'),
  url: optionalSiteLinkField.refine((value) => Boolean(value), '请输入链接地址'),
  openInNewTab: z.boolean().optional(),
});

const siteNavigationChildSchema = siteLinkSchema;

const siteNavigationItemSchema = z
  .object({
    label: z.string().trim().min(1, '请输入一级菜单名称').max(60, '名称不能超过 60 个字符'),
    url: optionalSiteLinkField,
    openInNewTab: z.boolean().optional(),
    children: z.array(siteNavigationChildSchema).max(12, '二级菜单最多 12 项'),
  })
  .refine(
    (value) => Boolean(value.url) || value.children.length > 0,
    '一级菜单至少配置链接或一个二级菜单',
  );

const siteSchema = z.object({
  siteName: z.string().trim().min(1, '请输入站点名称').max(120, '站点名称不能超过 120 个字符'),
  logoUrl: optionalSiteLinkField,
  faviconUrl: optionalSiteLinkField,
  brandPrimaryColor: z
    .string()
    .trim()
    .regex(/^(#[0-9a-fA-F]{6}|)$/, '请输入 #RRGGBB 形式的颜色值或留空'),
  headerNavigation: z.array(siteNavigationItemSchema).max(12, '顶部导航最多保留 12 项'),
  footerCopyright: z
    .string()
    .trim()
    .min(1, '请输入页脚版权')
    .max(255, '页脚版权不能超过 255 个字符'),
  filingInfo: z.string().trim().max(255, '备案信息不能超过 255 个字符'),
  footerLinks: z.array(siteLinkSchema).max(12, '最多保留 12 个页脚链接'),
});

const openrouterSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: optionalUrlField,
  siteUrl: optionalUrlField,
  siteName: z.string().optional(),
  defaultModel: z.string().optional(),
});

const contentImportSchema = z.object({
  wordpressSiteUrl: optionalUrlField,
  wordpressUsername: z.string().optional(),
  wordpressAppPassword: z.string().optional(),
  notionApiToken: z.string().optional(),
});

const hubContentSchema = z.object({
  eyebrow: z.string().trim().max(60, '不能超过 60 个字符').optional(),
  title: z.string().trim().max(120, '不能超过 120 个字符').optional(),
  description: z.string().trim().max(500, '不能超过 500 个字符').optional(),
});

const publicPagesSchema = z.object({
  contentHub: hubContentSchema,
  docsHub: hubContentSchema,
});

const testEmailSchema = z.string().trim().email('请输入有效的测试收件邮箱');
const testSubjectSchema = z
  .string()
  .trim()
  .min(1, '请输入测试邮件主题')
  .max(200, '主题不能超过 200 个字符');
const testBodySchema = z
  .string()
  .trim()
  .min(1, '请输入测试邮件正文')
  .max(10_000, '正文不能超过 10000 个字符');

type SmtpValues = z.infer<typeof smtpSchema>;
type QiniuValues = z.infer<typeof qiniuSchema>;
type SiteValues = z.infer<typeof siteSchema>;
type OpenRouterValues = z.infer<typeof openrouterSchema>;
type ContentImportValues = z.infer<typeof contentImportSchema>;
type PublicPagesValues = z.infer<typeof publicPagesSchema>;

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
    ...(from ? { from } : {}),
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
    ...(defaultPrefix ? { defaultPrefix } : {}),
  };
}

function buildSitePayload(values: SiteValues) {
  return {
    siteName: values.siteName.trim(),
    logoUrl: values.logoUrl.trim(),
    faviconUrl: values.faviconUrl.trim(),
    brandPrimaryColor: values.brandPrimaryColor.trim(),
    headerNavigation: values.headerNavigation.map((item) => ({
      label: item.label.trim(),
      url: item.url.trim(),
      openInNewTab: Boolean(item.openInNewTab),
      children: item.children.map((child) => ({
        label: child.label.trim(),
        url: child.url.trim(),
        openInNewTab: Boolean(child.openInNewTab),
      })),
    })),
    footerCopyright: values.footerCopyright.trim(),
    filingInfo: values.filingInfo.trim(),
    footerLinks: values.footerLinks.map((item) => ({
      label: item.label.trim(),
      url: item.url.trim(),
      openInNewTab: Boolean(item.openInNewTab),
    })),
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
    ...(defaultModel ? { defaultModel } : {}),
  };
}

function buildContentImportPayload(
  values: ContentImportValues,
  options: { includeWordPressPassword: boolean; includeNotionToken: boolean },
) {
  const wordpressSiteUrl = values.wordpressSiteUrl?.trim();
  const wordpressUsername = values.wordpressUsername?.trim();
  const wordpressAppPassword = values.wordpressAppPassword?.trim();
  const notionApiToken = values.notionApiToken?.trim();

  return {
    wordpress: {
      ...(wordpressSiteUrl ? { siteUrl: wordpressSiteUrl } : {}),
      ...(wordpressUsername ? { username: wordpressUsername } : {}),
      ...(options.includeWordPressPassword && wordpressAppPassword
        ? { appPassword: wordpressAppPassword }
        : {}),
    },
    notion: {
      ...(options.includeNotionToken && notionApiToken ? { apiToken: notionApiToken } : {}),
    },
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

const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

export function SettingsPage() {
  const qc = useQueryClient();
  const [clearSiteOpen, setClearSiteOpen] = useState(false);
  const [clearSmtpOpen, setClearSmtpOpen] = useState(false);
  const [clearQiniuOpen, setClearQiniuOpen] = useState(false);
  const [clearOpenRouterOpen, setClearOpenRouterOpen] = useState(false);
  const [clearContentImportOpen, setClearContentImportOpen] = useState(false);
  const [clearPublicPagesOpen, setClearPublicPagesOpen] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testSubject, setTestSubject] = useState('fd-core-stack SMTP 测试邮件');
  const [testBody, setTestBody] = useState(
    [
      '这是一封来自 fd-core-stack 的测试邮件。',
      '',
      '如果你收到了这封邮件，说明当前 SMTP 配置已经可以正常发送邮件。',
    ].join('\n'),
  );
  const [openrouterModels, setOpenrouterModels] = useState<AiModelSummary[]>([]);
  const [openrouterModelsLoaded, setOpenrouterModelsLoaded] = useState(false);
  const [openrouterConnectionResult, setOpenrouterConnectionResult] =
    useState<OpenRouterTestConnectionResult | null>(null);
  const [wordpressConnectionResult, setWordpressConnectionResult] =
    useState<ContentImportWordPressTestResult | null>(null);
  const [notionConnectionResult, setNotionConnectionResult] =
    useState<ContentImportNotionTestResult | null>(null);
  const [openrouterTestMessage, setOpenrouterTestMessage] = useState(
    'Hello, translate this to Chinese.',
  );
  const [openrouterChatResult, setOpenrouterChatResult] = useState<AiChatCompletionResult | null>(
    null,
  );

  const { data: aiProvidersData } = useQuery({
    queryKey: ['admin-ai-providers'],
    queryFn: getAiProviders,
  });

  const { data: smtpData, isLoading: smtpLoading } = useQuery({
    queryKey: ['system-settings', 'smtp'],
    queryFn: getSmtpSettings,
  });

  const { data: siteData, isLoading: siteLoading } = useQuery({
    queryKey: ['system-settings', 'site'],
    queryFn: getSiteSettings,
  });

  const { data: contentImportData, isLoading: contentImportLoading } = useQuery({
    queryKey: ['system-settings', 'content-import'],
    queryFn: getContentImportSettings,
  });

  const { data: qiniuData, isLoading: qiniuLoading } = useQuery({
    queryKey: ['system-settings', 'qiniu'],
    queryFn: getQiniuSettings,
  });

  const { data: openrouterData, isLoading: openrouterLoading } = useQuery({
    queryKey: ['system-settings', 'ai', 'openrouter'],
    queryFn: getOpenRouterSettings,
  });

  const { data: publicPagesData, isLoading: publicPagesLoading } = useQuery({
    queryKey: ['system-settings', 'public-pages'],
    queryFn: getPublicPagesSettings,
  });

  const smtpForm = useForm<SmtpValues>({
    resolver: zodResolver(smtpSchema),
    defaultValues: {
      host: '',
      port: 465,
      secure: true,
      user: '',
      password: '',
      from: '',
    },
  });

  const qiniuForm = useForm<QiniuValues>({
    resolver: zodResolver(qiniuSchema),
    defaultValues: {
      accessKey: '',
      secretKey: '',
      bucketName: '',
      publicBaseUrl: '',
      uploadHost: 'https://upload.qiniup.com',
      defaultPrefix: '',
    },
  });

  const siteForm = useForm<SiteValues>({
    resolver: zodResolver(siteSchema),
    defaultValues: {
      siteName: 'FD Stack',
      logoUrl: '',
      faviconUrl: '',
      brandPrimaryColor: '',
      headerNavigation: [],
      footerCopyright: '© {year} FutureDecade. All rights reserved.',
      filingInfo: '',
      footerLinks: [],
    },
  });

  const headerNavigation = siteForm.watch('headerNavigation') ?? [];
  const {
    fields: siteLinkFields,
    append: appendSiteLink,
    remove: removeSiteLink,
  } = useFieldArray({
    control: siteForm.control,
    name: 'footerLinks',
  });

  const appendHeaderNavigation = () => {
    siteForm.setValue(
      'headerNavigation',
      [...headerNavigation, { label: '', url: '', openInNewTab: false, children: [] }],
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const removeHeaderNavigation = (index: number) => {
    siteForm.setValue(
      'headerNavigation',
      headerNavigation.filter((_, itemIndex) => itemIndex !== index),
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const appendHeaderNavigationChild = (index: number) => {
    siteForm.setValue(
      'headerNavigation',
      headerNavigation.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              children: [...item.children, { label: '', url: '', openInNewTab: false }],
            }
          : item,
      ),
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const removeHeaderNavigationChild = (parentIndex: number, childIndex: number) => {
    siteForm.setValue(
      'headerNavigation',
      headerNavigation.map((item, itemIndex) =>
        itemIndex === parentIndex
          ? {
              ...item,
              children: item.children.filter(
                (_, currentChildIndex) => currentChildIndex !== childIndex,
              ),
            }
          : item,
      ),
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const openrouterForm = useForm<OpenRouterValues>({
    resolver: zodResolver(openrouterSchema),
    defaultValues: {
      apiKey: '',
      baseUrl: OPENROUTER_DEFAULT_BASE_URL,
      siteUrl: '',
      siteName: 'fd-core-stack',
      defaultModel: '',
    },
  });

  const contentImportForm = useForm<ContentImportValues>({
    resolver: zodResolver(contentImportSchema),
    defaultValues: {
      wordpressSiteUrl: '',
      wordpressUsername: '',
      wordpressAppPassword: '',
      notionApiToken: '',
    },
  });

  const publicPagesForm = useForm<PublicPagesValues>({
    resolver: zodResolver(publicPagesSchema),
    defaultValues: {
      contentHub: { eyebrow: '', title: '', description: '' },
      docsHub: { eyebrow: '', title: '', description: '' },
    },
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
      from: smtpData.values.from,
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
      defaultPrefix: qiniuData.values.defaultPrefix,
    });
  }, [qiniuData, qiniuForm]);

  useEffect(() => {
    if (!siteData) {
      return;
    }

    siteForm.reset({
      siteName: siteData.values.siteName,
      logoUrl: siteData.values.logoUrl,
      faviconUrl: siteData.values.faviconUrl,
      brandPrimaryColor: siteData.values.brandPrimaryColor ?? '',
      headerNavigation: siteData.values.headerNavigation,
      footerCopyright: siteData.values.footerCopyright,
      filingInfo: siteData.values.filingInfo,
      footerLinks: siteData.values.footerLinks,
    });
  }, [siteData, siteForm]);

  useEffect(() => {
    if (!contentImportData) {
      return;
    }

    contentImportForm.reset({
      wordpressSiteUrl: contentImportData.values.wordpress.siteUrl,
      wordpressUsername: contentImportData.values.wordpress.username,
      wordpressAppPassword: '',
      notionApiToken: '',
    });
  }, [contentImportData, contentImportForm]);

  useEffect(() => {
    if (!publicPagesData) {
      return;
    }

    publicPagesForm.reset({
      contentHub: { ...publicPagesData.values.contentHub },
      docsHub: { ...publicPagesData.values.docsHub },
    });
  }, [publicPagesData, publicPagesForm]);

  useEffect(() => {
    if (!openrouterData) {
      return;
    }

    openrouterForm.reset({
      apiKey: '',
      baseUrl: OPENROUTER_DEFAULT_BASE_URL,
      siteUrl: openrouterData.values.siteUrl,
      siteName: openrouterData.values.siteName,
      defaultModel: openrouterData.values.defaultModel,
    });
  }, [openrouterData, openrouterForm]);

  const buildManagedOpenRouterPayload = (values: OpenRouterValues) =>
    buildOpenRouterPayload(
      {
        ...values,
        baseUrl: OPENROUTER_DEFAULT_BASE_URL,
      },
      {
        includeApiKey: Boolean(openrouterForm.formState.dirtyFields.apiKey),
      },
    );

  const buildCurrentOpenRouterPayload = () =>
    buildManagedOpenRouterPayload(openrouterForm.getValues());

  const selectedOpenRouterModelId = openrouterForm.watch('defaultModel');
  const selectedOpenRouterModel =
    openrouterModels.find((item) => item.id === selectedOpenRouterModelId) ?? null;
  const hasSelectedOpenRouterModelOption =
    !selectedOpenRouterModelId ||
    openrouterModels.some((item) => item.id === selectedOpenRouterModelId);

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
        from: result.values.from,
      });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '保存失败'),
  });

  const clearSmtpMutation = useMutation({
    mutationFn: clearSmtpSettings,
    onSuccess: async () => {
      toast.success('数据库中的 SMTP 配置已清空');
      setClearSmtpOpen(false);
      await qc.invalidateQueries({ queryKey: ['system-settings', 'smtp'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '清空失败'),
  });

  const testSmtpMutation = useMutation({
    mutationFn: sendSmtpTestEmail,
    onSuccess: (result) => {
      toast.success(`测试邮件已发送到 ${result.to}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '发送测试邮件失败'),
  });

  const saveSiteMutation = useMutation({
    mutationFn: upsertSiteSettings,
    onSuccess: (result) => {
      toast.success('站点品牌与页脚设置已保存');
      qc.setQueryData(['system-settings', 'site'], result);
      qc.setQueryData(['public-site-settings'], result.values);
      siteForm.reset({
        siteName: result.values.siteName,
        logoUrl: result.values.logoUrl,
        faviconUrl: result.values.faviconUrl,
        brandPrimaryColor: result.values.brandPrimaryColor ?? '',
        headerNavigation: result.values.headerNavigation,
        footerCopyright: result.values.footerCopyright,
        filingInfo: result.values.filingInfo,
        footerLinks: result.values.footerLinks,
      });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '保存失败'),
  });

  const clearSiteMutation = useMutation({
    mutationFn: clearSiteSettings,
    onSuccess: async () => {
      toast.success('站点品牌与页脚设置已重置');
      setClearSiteOpen(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['system-settings', 'site'] }),
        qc.invalidateQueries({ queryKey: ['public-site-settings'] }),
      ]);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '重置失败'),
  });

  const savePublicPagesMutation = useMutation({
    mutationFn: upsertPublicPagesSettings,
    onSuccess: async (result) => {
      toast.success('公共页面文案已保存');
      qc.setQueryData(['system-settings', 'public-pages'], result);
      await qc.invalidateQueries({ queryKey: ['public-site-settings'] });
      publicPagesForm.reset({
        contentHub: { ...result.values.contentHub },
        docsHub: { ...result.values.docsHub },
      });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '保存失败'),
  });

  const clearPublicPagesMutation = useMutation({
    mutationFn: clearPublicPagesSettings,
    onSuccess: async () => {
      toast.success('公共页面文案已重置为默认值');
      setClearPublicPagesOpen(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['system-settings', 'public-pages'] }),
        qc.invalidateQueries({ queryKey: ['public-site-settings'] }),
      ]);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '重置失败'),
  });

  const saveContentImportMutation = useMutation({
    mutationFn: upsertContentImportSettings,
    onSuccess: (result) => {
      toast.success('内容导入配置已保存');
      qc.setQueryData(['system-settings', 'content-import'], result);
      contentImportForm.reset({
        wordpressSiteUrl: result.values.wordpress.siteUrl,
        wordpressUsername: result.values.wordpress.username,
        wordpressAppPassword: '',
        notionApiToken: '',
      });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '保存失败'),
  });

  const clearContentImportMutation = useMutation({
    mutationFn: clearContentImportSettings,
    onSuccess: async () => {
      toast.success('数据库中的内容导入配置已清空');
      setClearContentImportOpen(false);
      setWordpressConnectionResult(null);
      setNotionConnectionResult(null);
      await qc.invalidateQueries({ queryKey: ['system-settings', 'content-import'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '清空失败'),
  });

  const testWordPressImportMutation = useMutation({
    mutationFn: testWordPressImportSettings,
    onSuccess: (result) => {
      setWordpressConnectionResult(result);
      toast.success(
        `WordPress 连接成功：${result.mode === 'authenticated' ? '已认证' : '公开访问'}`,
      );
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '测试连接失败'),
  });

  const testNotionImportMutation = useMutation({
    mutationFn: testNotionImportSettings,
    onSuccess: (result) => {
      setNotionConnectionResult(result);
      toast.success('Notion 连接成功');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '测试连接失败'),
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
        defaultPrefix: result.values.defaultPrefix,
      });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '保存失败'),
  });

  const clearQiniuMutation = useMutation({
    mutationFn: clearQiniuSettings,
    onSuccess: async () => {
      toast.success('数据库中的七牛云配置已清空');
      setClearQiniuOpen(false);
      await qc.invalidateQueries({ queryKey: ['system-settings', 'qiniu'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '清空失败'),
  });

  const testQiniuMutation = useMutation({
    mutationFn: testQiniuSettings,
    onSuccess: (result) => {
      toast.success(`七牛云连接成功，Bucket: ${result.bucketName}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '测试连接失败'),
  });

  const saveOpenRouterMutation = useMutation({
    mutationFn: upsertOpenRouterSettings,
    onSuccess: async (result) => {
      toast.success('OpenRouter 配置已保存');
      qc.setQueryData(['system-settings', 'ai', 'openrouter'], result);
      openrouterForm.reset({
        apiKey: '',
        baseUrl: OPENROUTER_DEFAULT_BASE_URL,
        siteUrl: result.values.siteUrl,
        siteName: result.values.siteName,
        defaultModel: result.values.defaultModel,
      });
      setOpenrouterModelsLoaded(false);
      await qc.invalidateQueries({ queryKey: ['admin-ai-providers'] });
      previewOpenRouterModelsMutation.mutate(
        buildManagedOpenRouterPayload({
          apiKey: '',
          baseUrl: OPENROUTER_DEFAULT_BASE_URL,
          siteUrl: result.values.siteUrl,
          siteName: result.values.siteName,
          defaultModel: result.values.defaultModel,
        }),
      );
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '保存失败'),
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
        qc.invalidateQueries({ queryKey: ['admin-ai-providers'] }),
      ]);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '清空失败'),
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
    },
  });

  const testOpenRouterMutation = useMutation({
    mutationFn: testOpenRouterSettings,
    onSuccess: (result) => {
      setOpenrouterConnectionResult(result);
      toast.success(`OpenRouter 连接成功，共发现 ${result.modelCount} 个模型`);
      previewOpenRouterModelsMutation.mutate(buildCurrentOpenRouterPayload());
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '测试连接失败'),
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
    },
  });

  useEffect(() => {
    if (
      !openrouterData?.configured ||
      previewOpenRouterModelsMutation.isPending ||
      openrouterModelsLoaded
    ) {
      return;
    }

    previewOpenRouterModelsMutation.mutate(
      buildManagedOpenRouterPayload({
        apiKey: '',
        baseUrl: OPENROUTER_DEFAULT_BASE_URL,
        siteUrl: openrouterData.values.siteUrl,
        siteName: openrouterData.values.siteName,
        defaultModel: openrouterData.values.defaultModel,
      }),
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
      ...buildSmtpPayload(values, {
        includePassword: Boolean(smtpForm.formState.dirtyFields.password),
      }),
      to: parsedTo.data,
      subject: parsedSubject.data,
      text: parsedBody.data,
    });
  });

  const handleTestQiniu = qiniuForm.handleSubmit((values) => {
    testQiniuMutation.mutate(
      buildQiniuPayload(values, {
        includeSecretKey: Boolean(qiniuForm.formState.dirtyFields.secretKey),
      }),
    );
  });

  const handleTestOpenRouter = openrouterForm.handleSubmit((values) => {
    testOpenRouterMutation.mutate(buildManagedOpenRouterPayload(values));
  });

  const handleLoadOpenRouterModels = openrouterForm.handleSubmit((values) => {
    previewOpenRouterModelsMutation.mutate(buildManagedOpenRouterPayload(values));
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
      ...buildManagedOpenRouterPayload(values),
      model,
      messages: [
        {
          role: 'user',
          content: message,
        },
      ],
      maxTokens: 400,
    });
  });

  const configuredAiProviders =
    aiProvidersData?.items.filter((item) => item.configured).length ??
    (openrouterData?.configured ? 1 : 0);
  const totalAiProviders = aiProvidersData?.items.length ?? 1;
  const handleTestWordPressImport = contentImportForm.handleSubmit((values) => {
    testWordPressImportMutation.mutate({
      siteUrl: values.wordpressSiteUrl?.trim(),
      username: values.wordpressUsername?.trim(),
      appPassword: values.wordpressAppPassword?.trim(),
    });
  });

  const handleTestNotionImport = contentImportForm.handleSubmit((values) => {
    testNotionImportMutation.mutate({
      apiToken: values.notionApiToken?.trim(),
    });
  });

  return (
    <div>
      <SectionHeader sectionKey="settings" />
      <div className="space-y-6 p-6">
        <Tabs defaultValue="site" className="max-w-5xl space-y-5">
          <div className="border-border bg-card rounded-lg border p-6 shadow-sm">
            <div className="space-y-3">
              <h2 className="text-foreground text-lg font-semibold">系统设置</h2>
              <TabsList className="bg-muted/70 h-auto w-full justify-start gap-1 rounded-lg p-1">
                <TabsTrigger value="site" className="min-w-[108px] rounded-md">
                  品牌与页脚
                </TabsTrigger>
                <TabsTrigger value="public-pages" className="min-w-[108px] rounded-md">
                  公共页面
                </TabsTrigger>
                <TabsTrigger value="smtp" className="min-w-[108px] rounded-md">
                  SMTP
                </TabsTrigger>
                <TabsTrigger value="qiniu" className="min-w-[108px] rounded-md">
                  七牛云
                </TabsTrigger>
                <TabsTrigger value="content" className="min-w-[108px] rounded-md">
                  内容导入
                </TabsTrigger>
                <TabsTrigger value="ai" className="min-w-[108px] rounded-md">
                  AI Hub
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          <TabsContent value="site" className="mt-0">
            <div className="border-border bg-card space-y-5 rounded-lg border p-6 shadow-sm">
              <div className="space-y-3">
                <div className="border-border bg-muted/40 flex flex-wrap items-center gap-3 rounded-lg border p-4">
                  <StatusPill
                    tone={siteData?.configured ? 'ok' : 'neutral'}
                    label={siteData?.configured ? '品牌设置已自定义' : '使用默认站点展示'}
                  />
                  <StatusPill
                    tone={siteData?.source === 'database' ? 'ok' : 'neutral'}
                    label={`来源: ${siteData?.source === 'database' ? '数据库' : '默认值'}`}
                  />
                </div>
                <h2 className="text-foreground text-lg font-semibold">品牌与页脚</h2>
              </div>

              {siteLoading ? (
                <div className="space-y-3">
                  {[...Array(6)].map((_, index) => (
                    <div key={index} className="bg-muted h-10 animate-pulse rounded-md" />
                  ))}
                </div>
              ) : (
                <Form {...siteForm}>
                  <form
                    onSubmit={siteForm.handleSubmit((values) =>
                      saveSiteMutation.mutate(buildSitePayload(values)),
                    )}
                    className="space-y-6"
                  >
                    <div className="grid gap-6 lg:grid-cols-2">
                      <FormField
                        control={siteForm.control}
                        name="siteName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>站点名称</FormLabel>
                            <FormControl>
                              <Input placeholder="FD Stack" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={siteForm.control}
                        name="footerCopyright"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>页脚版权</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="© {year} FutureDecade. All rights reserved."
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={siteForm.control}
                      name="filingInfo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>备案信息</FormLabel>
                          <FormControl>
                            <Input placeholder="例如：浙ICP备12345678号-1" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid gap-6 lg:grid-cols-2">
                      <FormField
                        control={siteForm.control}
                        name="logoUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Logo</FormLabel>
                            <FormControl>
                              <QiniuImageField
                                value={field.value}
                                onChange={field.onChange}
                                defaultPrefix="site-assets/logo"
                                previewAlt="site logo"
                                previewClassName="h-20 w-40 rounded-md border bg-card object-contain p-2"
                                dialogTitle="选择站点 Logo"
                                dialogDescription="支持从七牛云已有图片中选择，或直接上传新的站点 Logo。"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={siteForm.control}
                        name="faviconUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Favicon</FormLabel>
                            <FormControl>
                              <QiniuImageField
                                value={field.value}
                                onChange={field.onChange}
                                defaultPrefix="site-assets/favicon"
                                previewAlt="site favicon"
                                previewClassName="h-16 w-16 rounded-md border bg-card object-contain p-2"
                                dialogTitle="选择站点 Favicon"
                                dialogDescription="建议上传方形透明背景图标，保存后会同步到浏览器标签页图标。"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={siteForm.control}
                      name="brandPrimaryColor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>品牌主色</FormLabel>
                          <FormControl>
                            <div className="flex items-center gap-3">
                              <input
                                type="color"
                                value={field.value || '#000000'}
                                onChange={(event) => field.onChange(event.target.value)}
                                aria-label="选择品牌主色"
                                className="border-border bg-card h-10 w-10 shrink-0 cursor-pointer rounded-md border p-1"
                              />
                              <Input
                                placeholder="#000000（留空使用系统默认）"
                                value={field.value}
                                onChange={(event) => field.onChange(event.target.value)}
                                className="max-w-[220px] font-mono text-[13px]"
                              />
                              {field.value && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => field.onChange('')}
                                >
                                  重置
                                </Button>
                              )}
                            </div>
                          </FormControl>
                          <p className="text-muted-foreground text-[12px] leading-5">
                            填入 #RRGGBB 形式的十六进制颜色，会作为前后台 primary
                            色注入到所有页面；留空则使用系统默认。
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="border-border bg-muted/70 space-y-4 rounded-lg border p-4">
                      <div className="flex items-center justify-between gap-4">
                        <h3 className="text-foreground text-sm font-semibold">顶部导航菜单</h3>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={appendHeaderNavigation}
                          disabled={headerNavigation.length >= 12}
                        >
                          <Plus className="h-4 w-4" />
                          新增一级菜单
                        </Button>
                      </div>

                      <div className="space-y-3">
                        {headerNavigation.map((item, index) => (
                          <div
                            key={`site-nav-${index}`}
                            className="border-border bg-card rounded-lg border p-4"
                          >
                            <div className="grid gap-4 lg:grid-cols-[minmax(0,180px),minmax(0,1fr),auto] lg:items-start">
                              <div className="space-y-2">
                                <FormLabel>一级菜单名称</FormLabel>
                                <Input
                                  placeholder="应用中心"
                                  {...siteForm.register(`headerNavigation.${index}.label`)}
                                />
                                <p className="text-destructive text-xs">
                                  {
                                    siteForm.formState.errors.headerNavigation?.[index]?.label
                                      ?.message
                                  }
                                </p>
                              </div>

                              <div className="space-y-2">
                                <FormLabel>一级菜单链接</FormLabel>
                                <Input
                                  placeholder="/ or https://...，有二级菜单时可留空"
                                  {...siteForm.register(`headerNavigation.${index}.url`)}
                                />
                                <p className="text-destructive text-xs">
                                  {
                                    siteForm.formState.errors.headerNavigation?.[index]?.url
                                      ?.message
                                  }
                                </p>
                              </div>

                              <div className="space-y-3">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeHeaderNavigation(index)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  删除
                                </Button>
                                <FormField
                                  control={siteForm.control}
                                  name={`headerNavigation.${index}.openInNewTab`}
                                  render={({ field }) => (
                                    <FormItem className="border-border bg-muted flex items-center gap-3 rounded-md border px-3 py-2">
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value}
                                          onCheckedChange={field.onChange}
                                        />
                                      </FormControl>
                                      <div>
                                        <FormLabel className="cursor-pointer text-sm">
                                          新窗口打开
                                        </FormLabel>
                                      </div>
                                    </FormItem>
                                  )}
                                />
                              </div>
                            </div>

                            <div className="border-border bg-muted/60 mt-4 space-y-3 rounded-lg border border-dashed p-4">
                              <div className="flex items-center justify-between gap-4">
                                <p className="text-foreground text-sm font-semibold">
                                  二级下拉菜单
                                </p>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => appendHeaderNavigationChild(index)}
                                  disabled={(item.children?.length ?? 0) >= 12}
                                >
                                  <Plus className="h-4 w-4" />
                                  新增二级菜单
                                </Button>
                              </div>

                              {(item.children ?? []).length ? (
                                <div className="space-y-3">
                                  {item.children.map((_, childIndex) => (
                                    <div
                                      key={`site-nav-${index}-child-${childIndex}`}
                                      className="border-border bg-card grid gap-4 rounded-lg border p-4 lg:grid-cols-[minmax(0,160px),minmax(0,1fr),auto] lg:items-start"
                                    >
                                      <div className="space-y-2">
                                        <FormLabel>二级菜单名称</FormLabel>
                                        <Input
                                          placeholder="购买授权"
                                          {...siteForm.register(
                                            `headerNavigation.${index}.children.${childIndex}.label`,
                                          )}
                                        />
                                        <p className="text-destructive text-xs">
                                          {
                                            siteForm.formState.errors.headerNavigation?.[index]
                                              ?.children?.[childIndex]?.label?.message
                                          }
                                        </p>
                                      </div>

                                      <div className="space-y-2">
                                        <FormLabel>二级菜单链接</FormLabel>
                                        <Input
                                          placeholder="/ or https://..."
                                          {...siteForm.register(
                                            `headerNavigation.${index}.children.${childIndex}.url`,
                                          )}
                                        />
                                        <p className="text-destructive text-xs">
                                          {
                                            siteForm.formState.errors.headerNavigation?.[index]
                                              ?.children?.[childIndex]?.url?.message
                                          }
                                        </p>
                                      </div>

                                      <div className="space-y-3">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            removeHeaderNavigationChild(index, childIndex)
                                          }
                                        >
                                          <Trash2 className="h-4 w-4" />
                                          删除
                                        </Button>
                                        <FormField
                                          control={siteForm.control}
                                          name={`headerNavigation.${index}.children.${childIndex}.openInNewTab`}
                                          render={({ field }) => (
                                            <FormItem className="border-border bg-muted flex items-center gap-3 rounded-md border px-3 py-2">
                                              <FormControl>
                                                <Checkbox
                                                  checked={field.value}
                                                  onCheckedChange={field.onChange}
                                                />
                                              </FormControl>
                                              <div>
                                                <FormLabel className="cursor-pointer text-sm">
                                                  新窗口打开
                                                </FormLabel>
                                              </div>
                                            </FormItem>
                                          )}
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>

                            {typeof siteForm.formState.errors.headerNavigation?.[index]?.message ===
                            'string' ? (
                              <p className="text-destructive mt-3 text-xs">
                                {siteForm.formState.errors.headerNavigation[index]?.message}
                              </p>
                            ) : null}
                          </div>
                        ))}

                        {typeof siteForm.formState.errors.headerNavigation?.message === 'string' ? (
                          <p className="text-destructive text-sm">
                            {siteForm.formState.errors.headerNavigation.message}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="border-border bg-muted/70 space-y-4 rounded-lg border p-4">
                      <div className="flex items-center justify-between gap-4">
                        <h3 className="text-foreground text-sm font-semibold">Footer 菜单链接</h3>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            appendSiteLink({ label: '', url: '', openInNewTab: false })
                          }
                          disabled={siteLinkFields.length >= 12}
                        >
                          <Plus className="h-4 w-4" />
                          新增链接
                        </Button>
                      </div>

                      <div className="space-y-3">
                        {siteLinkFields.map((field, index) => (
                          <div
                            key={field.id}
                            className="border-border bg-card rounded-lg border p-4"
                          >
                            <div className="grid gap-4 lg:grid-cols-[minmax(0,180px),minmax(0,1fr),auto] lg:items-start">
                              <div className="space-y-2">
                                <FormLabel>名称</FormLabel>
                                <Input
                                  placeholder="应用中心"
                                  {...siteForm.register(`footerLinks.${index}.label`)}
                                />
                                <p className="text-destructive text-xs">
                                  {siteForm.formState.errors.footerLinks?.[index]?.label?.message}
                                </p>
                              </div>

                              <div className="space-y-2">
                                <FormLabel>链接</FormLabel>
                                <Input
                                  placeholder="/ or https://..."
                                  {...siteForm.register(`footerLinks.${index}.url`)}
                                />
                                <p className="text-destructive text-xs">
                                  {siteForm.formState.errors.footerLinks?.[index]?.url?.message}
                                </p>
                              </div>

                              <div className="space-y-3">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeSiteLink(index)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  删除
                                </Button>
                                <FormField
                                  control={siteForm.control}
                                  name={`footerLinks.${index}.openInNewTab`}
                                  render={({ field }) => (
                                    <FormItem className="border-border bg-muted flex items-center gap-3 rounded-md border px-3 py-2">
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value}
                                          onCheckedChange={field.onChange}
                                        />
                                      </FormControl>
                                      <div>
                                        <FormLabel className="cursor-pointer text-sm">
                                          新窗口打开
                                        </FormLabel>
                                      </div>
                                    </FormItem>
                                  )}
                                />
                              </div>
                            </div>
                          </div>
                        ))}

                        {typeof siteForm.formState.errors.footerLinks?.message === 'string' ? (
                          <p className="text-destructive text-sm">
                            {siteForm.formState.errors.footerLinks.message}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" disabled={saveSiteMutation.isPending}>
                        {saveSiteMutation.isPending ? '保存中...' : '保存品牌与页脚'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={clearSiteMutation.isPending}
                        onClick={() => setClearSiteOpen(true)}
                      >
                        重置为默认配置
                      </Button>
                    </div>
                  </form>
                </Form>
              )}
            </div>
          </TabsContent>

          <TabsContent value="public-pages" className="mt-0">
            <div className="border-border bg-card space-y-5 rounded-lg border p-6 shadow-sm">
              <div className="space-y-3">
                <div className="border-border bg-muted/40 flex flex-wrap items-center gap-3 rounded-lg border p-4">
                  <StatusPill
                    tone={publicPagesData?.configured ? 'ok' : 'neutral'}
                    label={publicPagesData?.configured ? '公共页面文案已自定义' : '使用默认文案'}
                  />
                  <StatusPill
                    tone={publicPagesData?.source === 'database' ? 'ok' : 'neutral'}
                    label={`来源: ${publicPagesData?.source === 'database' ? '数据库' : '默认值'}`}
                  />
                </div>
                <h2 className="text-foreground text-lg font-semibold">内容中心 / 文档中心 文案</h2>
                <p className="text-muted-foreground text-sm">
                  配置消费侧「内容中心」「文档中心」Hub
                  页头部展示的栏目标签、主标题与副标题描述。留空则使用系统默认值。
                </p>
              </div>

              {publicPagesLoading ? (
                <div className="space-y-3">
                  {[...Array(6)].map((_, index) => (
                    <div key={index} className="bg-muted h-10 animate-pulse rounded-md" />
                  ))}
                </div>
              ) : (
                <Form {...publicPagesForm}>
                  <form
                    onSubmit={publicPagesForm.handleSubmit((values) =>
                      savePublicPagesMutation.mutate({
                        contentHub: {
                          eyebrow: values.contentHub?.eyebrow?.trim() || '',
                          title: values.contentHub?.title?.trim() || '',
                          description: values.contentHub?.description?.trim() || '',
                        },
                        docsHub: {
                          eyebrow: values.docsHub?.eyebrow?.trim() || '',
                          title: values.docsHub?.title?.trim() || '',
                          description: values.docsHub?.description?.trim() || '',
                        },
                      }),
                    )}
                    className="space-y-6"
                  >
                    <div className="border-border space-y-4 rounded-lg border p-5">
                      <div>
                        <h3 className="text-foreground text-base font-semibold">内容中心 Hub</h3>
                        <p className="text-muted-foreground mt-1 text-xs">
                          访问路径：
                          <code className="bg-muted/60 rounded px-1 py-0.5">/content</code>
                        </p>
                      </div>

                      <FormField
                        control={publicPagesForm.control}
                        name="contentHub.eyebrow"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>栏目标签（Eyebrow）</FormLabel>
                            <FormControl>
                              <Input placeholder="内容中心" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={publicPagesForm.control}
                        name="contentHub.title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>主标题</FormLabel>
                            <FormControl>
                              <Input placeholder="文章、观点与教程" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={publicPagesForm.control}
                        name="contentHub.description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>副标题描述</FormLabel>
                            <FormControl>
                              <Textarea
                                rows={3}
                                placeholder="汇集产品动态、观点文章、操作教程与最佳实践..."
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="border-border space-y-4 rounded-lg border p-5">
                      <div>
                        <h3 className="text-foreground text-base font-semibold">文档中心 Hub</h3>
                        <p className="text-muted-foreground mt-1 text-xs">
                          访问路径：<code className="bg-muted/60 rounded px-1 py-0.5">/docs</code>
                        </p>
                      </div>

                      <FormField
                        control={publicPagesForm.control}
                        name="docsHub.eyebrow"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>栏目标签（Eyebrow）</FormLabel>
                            <FormControl>
                              <Input placeholder="文档中心" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={publicPagesForm.control}
                        name="docsHub.title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>主标题</FormLabel>
                            <FormControl>
                              <Input placeholder="产品文档与开发指南" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={publicPagesForm.control}
                        name="docsHub.description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>副标题描述</FormLabel>
                            <FormControl>
                              <Textarea
                                rows={3}
                                placeholder="统一汇集 fd-core-stack 本身以及各应用的产品文档、接入说明..."
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" disabled={savePublicPagesMutation.isPending}>
                        {savePublicPagesMutation.isPending ? '保存中...' : '保存公共页面文案'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setClearPublicPagesOpen(true)}
                        disabled={!publicPagesData?.configured}
                      >
                        重置为默认值
                      </Button>
                    </div>
                  </form>
                </Form>
              )}
            </div>
          </TabsContent>

          <TabsContent value="smtp" className="mt-0">
            <div className="border-border bg-card space-y-5 rounded-lg border p-6 shadow-sm">
              <div className="space-y-3">
                <div className="border-border bg-muted/40 flex flex-wrap items-center gap-3 rounded-lg border p-4">
                  <StatusPill
                    tone={smtpData?.configured ? 'ok' : 'neutral'}
                    label={smtpData?.configured ? 'SMTP 已配置' : 'SMTP 未配置'}
                  />
                  <StatusPill
                    tone={
                      smtpData?.source === 'database'
                        ? 'ok'
                        : smtpData?.source === 'env'
                          ? 'warn'
                          : 'neutral'
                    }
                    label={`来源: ${sourceLabel(smtpData?.source ?? 'none')}`}
                  />
                </div>
                <h2 className="text-foreground text-lg font-semibold">SMTP 配置</h2>
              </div>

              {smtpLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, index) => (
                    <div key={index} className="bg-muted h-10 animate-pulse rounded-md" />
                  ))}
                </div>
              ) : (
                <Form {...smtpForm}>
                  <form
                    onSubmit={smtpForm.handleSubmit((values) =>
                      saveSmtpMutation.mutate(
                        buildSmtpPayload(values, {
                          includePassword: Boolean(smtpForm.formState.dirtyFields.password),
                        }),
                      ),
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
                              placeholder={
                                smtpData?.secrets.password.configured
                                  ? '已保存，留空保持不变'
                                  : '请输入 SMTP 密码'
                              }
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={smtpForm.control}
                      name="secure"
                      render={({ field }) => (
                        <FormItem className="border-border bg-muted flex items-center gap-3 rounded-md border px-4 py-3">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <FormLabel className="cursor-pointer">启用 SSL/TLS</FormLabel>
                        </FormItem>
                      )}
                    />

                    <div className="flex gap-2">
                      <Button type="submit" disabled={saveSmtpMutation.isPending}>
                        {saveSmtpMutation.isPending ? '保存中...' : '保存 SMTP 配置'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={clearSmtpMutation.isPending}
                        onClick={() => setClearSmtpOpen(true)}
                      >
                        清空数据库配置
                      </Button>
                    </div>

                    <div className="border-border bg-muted/70 rounded-lg border p-4">
                      <h3 className="text-foreground text-sm font-semibold">发送测试邮件</h3>
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
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={testSmtpMutation.isPending}
                          onClick={handleSendTestEmail}
                        >
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
            <div className="border-border bg-card space-y-5 rounded-lg border p-6 shadow-sm">
              <div className="space-y-3">
                <div className="border-border bg-muted/40 flex flex-wrap items-center gap-3 rounded-lg border p-4">
                  <StatusPill
                    tone={qiniuData?.configured ? 'ok' : 'neutral'}
                    label={qiniuData?.configured ? '七牛云已配置' : '七牛云未配置'}
                  />
                  <StatusPill
                    tone={
                      qiniuData?.source === 'database'
                        ? 'ok'
                        : qiniuData?.source === 'env'
                          ? 'warn'
                          : 'neutral'
                    }
                    label={`来源: ${sourceLabel(qiniuData?.source ?? 'none')}`}
                  />
                </div>
                <h2 className="text-foreground text-lg font-semibold">七牛云存储</h2>
              </div>

              {qiniuLoading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, index) => (
                    <div key={index} className="bg-muted h-10 animate-pulse rounded-md" />
                  ))}
                </div>
              ) : (
                <Form {...qiniuForm}>
                  <form
                    onSubmit={qiniuForm.handleSubmit((values) =>
                      saveQiniuMutation.mutate(
                        buildQiniuPayload(values, {
                          includeSecretKey: Boolean(qiniuForm.formState.dirtyFields.secretKey),
                        }),
                      ),
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
                              placeholder={
                                qiniuData?.secrets.secretKey.configured
                                  ? '已保存，留空保持不变'
                                  : '请输入 Secret Key'
                              }
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" disabled={saveQiniuMutation.isPending}>
                        {saveQiniuMutation.isPending ? '保存中...' : '保存七牛云配置'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={testQiniuMutation.isPending}
                        onClick={handleTestQiniu}
                      >
                        {testQiniuMutation.isPending ? '测试中...' : '测试连接'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={clearQiniuMutation.isPending}
                        onClick={() => setClearQiniuOpen(true)}
                      >
                        清空数据库配置
                      </Button>
                    </div>
                  </form>
                </Form>
              )}
            </div>
          </TabsContent>

          <TabsContent value="content" className="mt-0">
            <div className="border-border bg-card space-y-5 rounded-lg border p-6 shadow-sm">
              <div className="space-y-3">
                <div className="border-border bg-muted/40 flex flex-wrap items-center gap-3 rounded-lg border p-4">
                  <StatusPill
                    tone={contentImportData?.configured ? 'ok' : 'neutral'}
                    label={contentImportData?.configured ? '导入配置已保存' : '尚未配置导入连接'}
                  />
                  <StatusPill
                    tone={contentImportData?.source === 'database' ? 'ok' : 'neutral'}
                    label={`来源: ${contentImportData?.source === 'database' ? '数据库' : '未配置'}`}
                  />
                </div>
                <h2 className="text-foreground text-lg font-semibold">内容导入连接</h2>
              </div>

              {contentImportLoading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, index) => (
                    <div key={index} className="bg-muted h-10 animate-pulse rounded-md" />
                  ))}
                </div>
              ) : (
                <Form {...contentImportForm}>
                  <form
                    onSubmit={contentImportForm.handleSubmit((values) =>
                      saveContentImportMutation.mutate(
                        buildContentImportPayload(values, {
                          includeWordPressPassword: Boolean(
                            contentImportForm.formState.dirtyFields.wordpressAppPassword,
                          ),
                          includeNotionToken: Boolean(
                            contentImportForm.formState.dirtyFields.notionApiToken,
                          ),
                        }),
                      ),
                    )}
                    className="space-y-6"
                  >
                    <div className="grid gap-6 xl:grid-cols-2">
                      <div className="border-border bg-muted/70 space-y-4 rounded-lg border p-4">
                        <div className="space-y-1">
                          <h3 className="text-foreground text-sm font-semibold">WordPress</h3>
                          <p className="text-muted-foreground text-xs">
                            用于内容管理页面按文章 URL 导入 WordPress 文章。
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>站点 URL</Label>
                          <Input
                            placeholder="https://your-site.com"
                            {...contentImportForm.register('wordpressSiteUrl')}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>用户名</Label>
                          <Input
                            placeholder="可选，用于受保护 REST API"
                            {...contentImportForm.register('wordpressUsername')}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>应用密码</Label>
                          <Input
                            type="password"
                            placeholder="可选"
                            {...contentImportForm.register('wordpressAppPassword')}
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleTestWordPressImport}
                            disabled={testWordPressImportMutation.isPending}
                          >
                            {testWordPressImportMutation.isPending ? '测试中...' : '测试连接'}
                          </Button>
                          {wordpressConnectionResult ? (
                            <StatusPill
                              tone="ok"
                              label={
                                wordpressConnectionResult.mode === 'authenticated'
                                  ? `已认证: ${wordpressConnectionResult.account ?? '当前账户'}`
                                  : '公开访问可用'
                              }
                            />
                          ) : null}
                        </div>
                      </div>

                      <div className="border-border bg-muted/70 space-y-4 rounded-lg border p-4">
                        <div className="space-y-1">
                          <h3 className="text-foreground text-sm font-semibold">Notion</h3>
                          <p className="text-muted-foreground text-xs">
                            用于内容管理页面按页面 URL 导入 Notion 页面。
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>API Token</Label>
                          <Input
                            type="password"
                            placeholder="secret_xxx / ntn_xxx"
                            {...contentImportForm.register('notionApiToken')}
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleTestNotionImport}
                            disabled={testNotionImportMutation.isPending}
                          >
                            {testNotionImportMutation.isPending ? '测试中...' : '测试连接'}
                          </Button>
                          {notionConnectionResult ? (
                            <StatusPill
                              tone="ok"
                              label={
                                notionConnectionResult.workspace ||
                                notionConnectionResult.userName ||
                                '连接成功'
                              }
                            />
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" disabled={saveContentImportMutation.isPending}>
                        {saveContentImportMutation.isPending ? '保存中...' : '保存内容导入配置'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={clearContentImportMutation.isPending}
                        onClick={() => setClearContentImportOpen(true)}
                      >
                        清空配置
                      </Button>
                    </div>
                  </form>
                </Form>
              )}
            </div>
          </TabsContent>

          <TabsContent value="ai" className="mt-0">
            <div className="border-border bg-card space-y-5 rounded-lg border p-6 shadow-sm">
              <div className="space-y-3">
                <div className="border-border bg-muted/40 flex flex-wrap items-center gap-3 rounded-lg border p-4">
                  <StatusPill
                    tone={configuredAiProviders > 0 ? 'ok' : 'neutral'}
                    label={`AI Providers ${configuredAiProviders}/${totalAiProviders}`}
                  />
                  <StatusPill
                    tone={openrouterData?.configured ? 'ok' : 'neutral'}
                    label={openrouterData?.configured ? 'OpenRouter 已配置' : 'OpenRouter 未配置'}
                  />
                  <StatusPill
                    tone={
                      openrouterData?.source === 'database'
                        ? 'ok'
                        : openrouterData?.source === 'env'
                          ? 'warn'
                          : 'neutral'
                    }
                    label={`来源: ${sourceLabel(openrouterData?.source ?? 'none')}`}
                  />
                </div>
                <h2 className="text-foreground text-lg font-semibold">AI API Hub</h2>
              </div>

              {openrouterLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, index) => (
                    <div key={index} className="bg-muted h-10 animate-pulse rounded-md" />
                  ))}
                </div>
              ) : (
                <Form {...openrouterForm}>
                  <form
                    onSubmit={openrouterForm.handleSubmit((values) =>
                      saveOpenRouterMutation.mutate(buildManagedOpenRouterPayload(values)),
                    )}
                    className="space-y-5"
                  >
                    <div className="border-border bg-muted/70 rounded-lg border p-4">
                      <h3 className="text-foreground text-sm font-semibold">OpenRouter</h3>
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
                              placeholder={
                                openrouterData?.secrets.apiKey.configured
                                  ? '已保存，留空保持不变'
                                  : '请输入 OpenRouter API Key'
                              }
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" disabled={saveOpenRouterMutation.isPending}>
                        {saveOpenRouterMutation.isPending ? '保存中...' : '保存 OpenRouter 配置'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={testOpenRouterMutation.isPending}
                        onClick={handleTestOpenRouter}
                      >
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
                      <div className="border-border bg-card rounded-lg border p-4">
                        <div className="flex flex-wrap items-center gap-3">
                          <StatusPill tone="ok" label="连接成功" />
                          <StatusPill
                            tone="info"
                            label={`${openrouterConnectionResult.modelCount} 个模型`}
                          />
                          <StatusPill
                            tone={openrouterConnectionResult.defaultModel ? 'info' : 'neutral'}
                            label={
                              openrouterConnectionResult.defaultModel
                                ? `当前默认模型: ${openrouterConnectionResult.defaultModel}`
                                : '当前未设置默认模型'
                            }
                          />
                        </div>
                        {openrouterConnectionResult.sampleModels.length ? (
                          <div className="mt-3">
                            <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                              示例模型
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {openrouterConnectionResult.sampleModels.map((item) => (
                                <span
                                  key={item}
                                  className="border-border bg-muted text-muted-foreground rounded-full border px-3 py-1 text-xs"
                                >
                                  {item}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="border-border bg-card space-y-4 rounded-lg border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="text-foreground text-sm font-semibold">默认模型</h3>
                        {openrouterModelsLoaded ? (
                          <StatusPill
                            tone={openrouterModels.length ? 'info' : 'neutral'}
                            label={`${openrouterModels.length} 个模型`}
                          />
                        ) : null}
                      </div>

                      <FormField
                        control={openrouterForm.control}
                        name="defaultModel"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>默认模型</FormLabel>
                            <Select
                              value={field.value || '__unset__'}
                              onValueChange={(value) =>
                                field.onChange(value === '__unset__' ? '' : value)
                              }
                            >
                              <FormControl>
                                <SelectTrigger
                                  disabled={
                                    previewOpenRouterModelsMutation.isPending ||
                                    (!openrouterModels.length && !field.value)
                                  }
                                >
                                  <SelectValue
                                    placeholder={
                                      openrouterModels.length ? '选择默认模型' : '先拉取模型列表'
                                    }
                                  />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="__unset__">暂不设置默认模型</SelectItem>
                                {!hasSelectedOpenRouterModelOption && field.value ? (
                                  <SelectItem value={field.value}>
                                    当前已保存模型（当前列表中未返回）
                                  </SelectItem>
                                ) : null}
                                {openrouterModels.map((model) => (
                                  <SelectItem key={model.id} value={model.id}>
                                    {formatModelOptionLabel(model)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {selectedOpenRouterModel ? (
                        <div className="border-border bg-muted/70 rounded-lg border p-4 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-foreground font-semibold">
                                {selectedOpenRouterModel.name || selectedOpenRouterModel.id}
                              </p>
                              <p className="text-muted-foreground font-mono text-xs">
                                {selectedOpenRouterModel.id}
                              </p>
                            </div>
                            <StatusPill
                              tone="info"
                              label={selectedOpenRouterModel.modality || 'text'}
                            />
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <div className="border-border bg-card rounded-md border px-3 py-2">
                              <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
                                上下文
                              </p>
                              <p className="text-foreground mt-1 text-sm font-semibold">
                                {formatCompactNumber(selectedOpenRouterModel.contextLength)} tokens
                              </p>
                            </div>
                            <div className="border-border bg-card rounded-md border px-3 py-2">
                              <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
                                最大输出
                              </p>
                              <p className="text-foreground mt-1 text-sm font-semibold">
                                {formatCompactNumber(selectedOpenRouterModel.maxCompletionTokens)}{' '}
                                tokens
                              </p>
                            </div>
                            <div className="border-border bg-card rounded-md border px-3 py-2">
                              <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
                                输入价格
                              </p>
                              <p className="text-foreground mt-1 text-sm font-semibold">
                                {formatPricePerMillion(selectedOpenRouterModel.promptPricing)}
                              </p>
                            </div>
                            <div className="border-border bg-card rounded-md border px-3 py-2">
                              <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
                                输出价格
                              </p>
                              <p className="text-foreground mt-1 text-sm font-semibold">
                                {formatPricePerMillion(selectedOpenRouterModel.completionPricing)}
                              </p>
                            </div>
                            <div className="border-border bg-card rounded-md border px-3 py-2">
                              <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
                                输入模态
                              </p>
                              <p className="text-foreground mt-1 text-sm font-semibold">
                                {formatModalities(selectedOpenRouterModel.inputModalities)}
                              </p>
                            </div>
                            <div className="border-border bg-card rounded-md border px-3 py-2">
                              <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
                                输出模态
                              </p>
                              <p className="text-foreground mt-1 text-sm font-semibold">
                                {formatModalities(selectedOpenRouterModel.outputModalities)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="border-border bg-card space-y-4 rounded-lg border p-4">
                      <h3 className="text-foreground text-sm font-semibold">模型测试</h3>
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
                          disabled={
                            previewOpenRouterChatMutation.isPending || !selectedOpenRouterModelId
                          }
                          onClick={handleRunOpenRouterChatTest}
                        >
                          {previewOpenRouterChatMutation.isPending ? '发送中...' : '发送测试'}
                        </Button>
                      </div>
                      {openrouterChatResult ? (
                        <div className="border-border bg-muted/70 rounded-lg border p-4">
                          <div className="flex flex-wrap items-center gap-3">
                            <StatusPill tone="ok" label={openrouterChatResult.model} />
                            <StatusPill
                              tone="info"
                              label={`Prompt ${openrouterChatResult.usage.promptTokens ?? 0} / Completion ${openrouterChatResult.usage.completionTokens ?? 0}`}
                            />
                          </div>
                          <ScrollArea className="border-border bg-card mt-4 h-[220px] rounded-lg border">
                            <div className="space-y-3 p-4 text-sm">
                              <p className="text-foreground whitespace-pre-wrap leading-6">
                                {openrouterChatResult.content}
                              </p>
                              {openrouterChatResult.finishReason ? (
                                <p className="text-muted-foreground text-xs">
                                  结束原因：{openrouterChatResult.finishReason}
                                </p>
                              ) : null}
                            </div>
                          </ScrollArea>
                        </div>
                      ) : null}
                    </div>
                  </form>
                </Form>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <ConfirmActionDialog
        open={clearSiteOpen}
        onOpenChange={setClearSiteOpen}
        title="重置品牌与页脚配置？"
        description="这会删除数据库中的站点品牌设置，并恢复默认站点名称、默认 footer 菜单以及默认 favicon。"
        confirmText={clearSiteMutation.isPending ? '重置中...' : '确认重置'}
        confirmVariant="destructive"
        isConfirming={clearSiteMutation.isPending}
        onConfirm={() => clearSiteMutation.mutate()}
      />

      <ConfirmActionDialog
        open={clearPublicPagesOpen}
        onOpenChange={setClearPublicPagesOpen}
        title="重置公共页面文案？"
        description="这会清空数据库中的内容中心 / 文档中心 Hub 文案配置，并恢复系统默认文案。"
        confirmText={clearPublicPagesMutation.isPending ? '重置中...' : '确认重置'}
        confirmVariant="destructive"
        isConfirming={clearPublicPagesMutation.isPending}
        onConfirm={() => clearPublicPagesMutation.mutate()}
      />

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
      <ConfirmActionDialog
        open={clearContentImportOpen}
        onOpenChange={setClearContentImportOpen}
        title="清空内容导入配置"
        description="这会删除数据库中的 WordPress / Notion 导入连接配置。之后内容管理页将无法直接导入对应内容，直到重新配置。"
        confirmText={clearContentImportMutation.isPending ? '清空中...' : '确认清空'}
        onConfirm={() => clearContentImportMutation.mutate()}
      />
    </div>
  );
}
