import { SmtpSettingsPanel } from '@/components/settings/SmtpSettingsPanel';
import { StorageSettingsPanel } from '@/components/storage/StorageSettingsPanel';
import { handleAsync } from '@/lib/async-events';
import { Plus, Search, Trash2 } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { useLocation } from 'react-router-dom';

import {
  clearContentImportSettings,
  clearOpenRouterSettings,
  clearPublicPagesSettings,
  clearSiteSettings,
  getContentImportSettings,
  getAiProviders,
  getOpenRouterSettings,
  getPublicPagesSettings,
  getSiteSettings,
  previewOpenRouterChatCompletion,
  previewOpenRouterModels,
  testNotionImportSettings,
  testWordPressImportSettings,
  testOpenRouterSettings,
  upsertContentImportSettings,
  upsertOpenRouterSettings,
  upsertPublicPagesSettings,
  upsertSiteSettings,
} from '@/api/settings';
import type {
  AiChatCompletionResult,
  AiModelSummary,
  ContentImportNotionTestResult,
  ContentImportWordPressTestResult,
  OpenRouterTestConnectionResult,
} from '@/api/types';
import { ConfirmActionDialog } from '@/components/shared/ConfirmActionDialog';
import { AssetImageField } from '@/components/storage/AssetImageField';
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

const optionalUrlField = z.preprocess(
  (value: string) => (typeof value === 'string' ? value.trim() : value),
  z.union([z.string().url('请输入有效链接'), z.literal('')]),
);

const optionalSiteLinkField = z.preprocess(
  (value: string) => (typeof value === 'string' ? value.trim() : value),
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

type SiteValues = z.infer<typeof siteSchema>;
type OpenRouterValues = z.infer<typeof openrouterSchema>;
type ContentImportValues = z.infer<typeof contentImportSchema>;
type PublicPagesValues = z.infer<typeof publicPagesSchema>;

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
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(() =>
    ['storage', 'smtp'].includes(new URLSearchParams(location.search).get('tab') ?? '')
      ? new URLSearchParams(location.search).get('tab')!
      : 'site',
  );
  useEffect(() => {
    const tab = new URLSearchParams(location.search).get('tab');
    if (tab === 'storage' || tab === 'smtp') setActiveTab(tab);
  }, [location.search]);
  const [settingsQuery, setSettingsQuery] = useState('');
  const [clearSiteOpen, setClearSiteOpen] = useState(false);
  const [clearOpenRouterOpen, setClearOpenRouterOpen] = useState(false);
  const [clearContentImportOpen, setClearContentImportOpen] = useState(false);
  const [clearPublicPagesOpen, setClearPublicPagesOpen] = useState(false);
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

  const { data: siteData, isLoading: siteLoading } = useQuery({
    queryKey: ['system-settings', 'site'],
    queryFn: getSiteSettings,
  });

  const { data: contentImportData, isLoading: contentImportLoading } = useQuery({
    queryKey: ['system-settings', 'content-import'],
    queryFn: getContentImportSettings,
  });

  const { data: openrouterData, isLoading: openrouterLoading } = useQuery({
    queryKey: ['system-settings', 'ai', 'openrouter'],
    queryFn: getOpenRouterSettings,
  });

  const { data: publicPagesData, isLoading: publicPagesLoading } = useQuery({
    queryKey: ['system-settings', 'public-pages'],
    queryFn: getPublicPagesSettings,
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

  const buildManagedOpenRouterPayload = useCallback(
    (values: OpenRouterValues) =>
      buildOpenRouterPayload(
        {
          ...values,
          baseUrl: OPENROUTER_DEFAULT_BASE_URL,
        },
        {
          includeApiKey: Boolean(openrouterForm.formState.dirtyFields.apiKey),
        },
      ),
    [openrouterForm.formState.dirtyFields.apiKey],
  );

  const buildCurrentOpenRouterPayload = () =>
    buildManagedOpenRouterPayload(openrouterForm.getValues());

  const selectedOpenRouterModelId = openrouterForm.watch('defaultModel');
  const selectedOpenRouterModel =
    openrouterModels.find((item) => item.id === selectedOpenRouterModelId) ?? null;
  const hasSelectedOpenRouterModelOption =
    !selectedOpenRouterModelId ||
    openrouterModels.some((item) => item.id === selectedOpenRouterModelId);

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
  }, [
    openrouterData,
    openrouterModelsLoaded,
    previewOpenRouterModelsMutation,
    buildManagedOpenRouterPayload,
  ]);

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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="max-w-5xl space-y-5">
          <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-foreground">系统设置</h2>
                <SettingsSearch
                  query={settingsQuery}
                  onQueryChange={setSettingsQuery}
                  onJump={(tab) => {
                    setActiveTab(tab);
                    setSettingsQuery('');
                  }}
                />
              </div>
              <TabsList className="h-auto w-full justify-start gap-1 rounded-lg bg-muted/70 p-1">
                <TabsTrigger value="site" className="min-w-[108px] rounded-md">
                  品牌与页脚
                </TabsTrigger>
                <TabsTrigger value="public-pages" className="min-w-[108px] rounded-md">
                  公共页面
                </TabsTrigger>
                <TabsTrigger value="smtp" className="min-w-[108px] rounded-md">
                  邮件服务
                </TabsTrigger>
                <TabsTrigger value="storage" className="min-w-[108px] rounded-md">
                  文件存储
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
            <div className="space-y-5 rounded-lg border border-border bg-card p-6 shadow-sm">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 p-4">
                  <StatusPill
                    tone={siteData?.configured ? 'ok' : 'neutral'}
                    label={siteData?.configured ? '品牌设置已自定义' : '使用默认站点展示'}
                  />
                  <StatusPill
                    tone={siteData?.source === 'database' ? 'ok' : 'neutral'}
                    label={`来源: ${siteData?.source === 'database' ? '数据库' : '默认值'}`}
                  />
                </div>
                <h2 className="text-lg font-semibold text-foreground">品牌与页脚</h2>
              </div>

              {siteLoading ? (
                <div className="space-y-3">
                  {[...Array(6)].map((_, index) => (
                    <div key={index} className="h-10 animate-pulse rounded-md bg-muted" />
                  ))}
                </div>
              ) : (
                <Form {...siteForm}>
                  <form
                    onSubmit={handleAsync(
                      siteForm.handleSubmit((values) =>
                        saveSiteMutation.mutate(buildSitePayload(values)),
                      ),
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
                              <AssetImageField
                                value={field.value}
                                onChange={field.onChange}
                                defaultPrefix="site-assets/logo"
                                previewAlt="site logo"
                                previewClassName="h-20 w-40 rounded-md border bg-card object-contain p-2"
                                dialogTitle="选择站点 Logo"
                                dialogDescription="从营销素材选择图片，或直接上传新的站点 Logo。"
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
                              <AssetImageField
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
                                className="h-10 w-10 shrink-0 cursor-pointer rounded-md border border-border bg-card p-1"
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
                          <p className="text-[12px] leading-5 text-muted-foreground">
                            填入 #RRGGBB 形式的十六进制颜色，会作为前后台 primary
                            色注入到所有页面；留空则使用系统默认。
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-4 rounded-lg border border-border bg-muted/70 p-4">
                      <div className="flex items-center justify-between gap-4">
                        <h3 className="text-sm font-semibold text-foreground">顶部导航菜单</h3>
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
                            className="rounded-lg border border-border bg-card p-4"
                          >
                            <div className="grid gap-4 lg:grid-cols-[minmax(0,180px),minmax(0,1fr),auto] lg:items-start">
                              <div className="space-y-2">
                                <FormLabel>一级菜单名称</FormLabel>
                                <Input
                                  placeholder="应用中心"
                                  {...siteForm.register(`headerNavigation.${index}.label`)}
                                />
                                <p className="text-xs text-destructive">
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
                                <p className="text-xs text-destructive">
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
                                    <FormItem className="flex items-center gap-3 rounded-md border border-border bg-muted px-3 py-2">
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

                            <div className="mt-4 space-y-3 rounded-lg border border-dashed border-border bg-muted/60 p-4">
                              <div className="flex items-center justify-between gap-4">
                                <p className="text-sm font-semibold text-foreground">
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
                                      className="grid gap-4 rounded-lg border border-border bg-card p-4 lg:grid-cols-[minmax(0,160px),minmax(0,1fr),auto] lg:items-start"
                                    >
                                      <div className="space-y-2">
                                        <FormLabel>二级菜单名称</FormLabel>
                                        <Input
                                          placeholder="购买授权"
                                          {...siteForm.register(
                                            `headerNavigation.${index}.children.${childIndex}.label`,
                                          )}
                                        />
                                        <p className="text-xs text-destructive">
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
                                        <p className="text-xs text-destructive">
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
                                            <FormItem className="flex items-center gap-3 rounded-md border border-border bg-muted px-3 py-2">
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
                              <p className="mt-3 text-xs text-destructive">
                                {siteForm.formState.errors.headerNavigation[index]?.message}
                              </p>
                            ) : null}
                          </div>
                        ))}

                        {typeof siteForm.formState.errors.headerNavigation?.message === 'string' ? (
                          <p className="text-sm text-destructive">
                            {siteForm.formState.errors.headerNavigation.message}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-4 rounded-lg border border-border bg-muted/70 p-4">
                      <div className="flex items-center justify-between gap-4">
                        <h3 className="text-sm font-semibold text-foreground">Footer 菜单链接</h3>
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
                            className="rounded-lg border border-border bg-card p-4"
                          >
                            <div className="grid gap-4 lg:grid-cols-[minmax(0,180px),minmax(0,1fr),auto] lg:items-start">
                              <div className="space-y-2">
                                <FormLabel>名称</FormLabel>
                                <Input
                                  placeholder="应用中心"
                                  {...siteForm.register(`footerLinks.${index}.label`)}
                                />
                                <p className="text-xs text-destructive">
                                  {siteForm.formState.errors.footerLinks?.[index]?.label?.message}
                                </p>
                              </div>

                              <div className="space-y-2">
                                <FormLabel>链接</FormLabel>
                                <Input
                                  placeholder="/ or https://..."
                                  {...siteForm.register(`footerLinks.${index}.url`)}
                                />
                                <p className="text-xs text-destructive">
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
                                    <FormItem className="flex items-center gap-3 rounded-md border border-border bg-muted px-3 py-2">
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
                          <p className="text-sm text-destructive">
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
            <div className="space-y-5 rounded-lg border border-border bg-card p-6 shadow-sm">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 p-4">
                  <StatusPill
                    tone={publicPagesData?.configured ? 'ok' : 'neutral'}
                    label={publicPagesData?.configured ? '公共页面文案已自定义' : '使用默认文案'}
                  />
                  <StatusPill
                    tone={publicPagesData?.source === 'database' ? 'ok' : 'neutral'}
                    label={`来源: ${publicPagesData?.source === 'database' ? '数据库' : '默认值'}`}
                  />
                </div>
                <h2 className="text-lg font-semibold text-foreground">内容中心 / 文档中心 文案</h2>
                <p className="text-sm text-muted-foreground">
                  配置消费侧「内容中心」「文档中心」Hub
                  页头部展示的栏目标签、主标题与副标题描述。留空则使用系统默认值。
                </p>
              </div>

              {publicPagesLoading ? (
                <div className="space-y-3">
                  {[...Array(6)].map((_, index) => (
                    <div key={index} className="h-10 animate-pulse rounded-md bg-muted" />
                  ))}
                </div>
              ) : (
                <Form {...publicPagesForm}>
                  <form
                    onSubmit={handleAsync(
                      publicPagesForm.handleSubmit((values) =>
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
                      ),
                    )}
                    className="space-y-6"
                  >
                    <div className="space-y-4 rounded-lg border border-border p-5">
                      <div>
                        <h3 className="text-base font-semibold text-foreground">内容中心 Hub</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          访问路径：
                          <code className="rounded bg-muted/60 px-1 py-0.5">/content</code>
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

                    <div className="space-y-4 rounded-lg border border-border p-5">
                      <div>
                        <h3 className="text-base font-semibold text-foreground">文档中心 Hub</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          访问路径：<code className="rounded bg-muted/60 px-1 py-0.5">/docs</code>
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
            <SmtpSettingsPanel />
          </TabsContent>

          <TabsContent value="storage" className="mt-0">
            <StorageSettingsPanel />
          </TabsContent>

          <TabsContent value="content" className="mt-0">
            <div className="space-y-5 rounded-lg border border-border bg-card p-6 shadow-sm">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 p-4">
                  <StatusPill
                    tone={contentImportData?.configured ? 'ok' : 'neutral'}
                    label={contentImportData?.configured ? '导入配置已保存' : '尚未配置导入连接'}
                  />
                  <StatusPill
                    tone={contentImportData?.source === 'database' ? 'ok' : 'neutral'}
                    label={`来源: ${contentImportData?.source === 'database' ? '数据库' : '未配置'}`}
                  />
                </div>
                <h2 className="text-lg font-semibold text-foreground">内容导入连接</h2>
              </div>

              {contentImportLoading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, index) => (
                    <div key={index} className="h-10 animate-pulse rounded-md bg-muted" />
                  ))}
                </div>
              ) : (
                <Form {...contentImportForm}>
                  <form
                    onSubmit={handleAsync(
                      contentImportForm.handleSubmit((values) =>
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
                      ),
                    )}
                    className="space-y-6"
                  >
                    <div className="grid gap-6 xl:grid-cols-2">
                      <div className="space-y-4 rounded-lg border border-border bg-muted/70 p-4">
                        <div className="space-y-1">
                          <h3 className="text-sm font-semibold text-foreground">WordPress</h3>
                          <p className="text-xs text-muted-foreground">
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
                            onClick={handleAsync(handleTestWordPressImport)}
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

                      <div className="space-y-4 rounded-lg border border-border bg-muted/70 p-4">
                        <div className="space-y-1">
                          <h3 className="text-sm font-semibold text-foreground">Notion</h3>
                          <p className="text-xs text-muted-foreground">
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
                            onClick={handleAsync(handleTestNotionImport)}
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
            <div className="space-y-5 rounded-lg border border-border bg-card p-6 shadow-sm">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 p-4">
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
                <h2 className="text-lg font-semibold text-foreground">AI API Hub</h2>
              </div>

              {openrouterLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, index) => (
                    <div key={index} className="h-10 animate-pulse rounded-md bg-muted" />
                  ))}
                </div>
              ) : (
                <Form {...openrouterForm}>
                  <form
                    onSubmit={handleAsync(
                      openrouterForm.handleSubmit((values) =>
                        saveOpenRouterMutation.mutate(buildManagedOpenRouterPayload(values)),
                      ),
                    )}
                    className="space-y-5"
                  >
                    <div className="rounded-lg border border-border bg-muted/70 p-4">
                      <h3 className="text-sm font-semibold text-foreground">OpenRouter</h3>
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
                        onClick={handleAsync(handleTestOpenRouter)}
                      >
                        {testOpenRouterMutation.isPending ? '测试中...' : '测试连接'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={previewOpenRouterModelsMutation.isPending}
                        onClick={handleAsync(handleLoadOpenRouterModels)}
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
                      <div className="rounded-lg border border-border bg-card p-4">
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
                            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                              示例模型
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {openrouterConnectionResult.sampleModels.map((item) => (
                                <span
                                  key={item}
                                  className="rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground"
                                >
                                  {item}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-foreground">默认模型</h3>
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
                        <div className="rounded-lg border border-border bg-muted/70 p-4 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-semibold text-foreground">
                                {selectedOpenRouterModel.name || selectedOpenRouterModel.id}
                              </p>
                              <p className="font-mono text-xs text-muted-foreground">
                                {selectedOpenRouterModel.id}
                              </p>
                            </div>
                            <StatusPill
                              tone="info"
                              label={selectedOpenRouterModel.modality || 'text'}
                            />
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <div className="rounded-md border border-border bg-card px-3 py-2">
                              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                                上下文
                              </p>
                              <p className="mt-1 text-sm font-semibold text-foreground">
                                {formatCompactNumber(selectedOpenRouterModel.contextLength)} tokens
                              </p>
                            </div>
                            <div className="rounded-md border border-border bg-card px-3 py-2">
                              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                                最大输出
                              </p>
                              <p className="mt-1 text-sm font-semibold text-foreground">
                                {formatCompactNumber(selectedOpenRouterModel.maxCompletionTokens)}{' '}
                                tokens
                              </p>
                            </div>
                            <div className="rounded-md border border-border bg-card px-3 py-2">
                              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                                输入价格
                              </p>
                              <p className="mt-1 text-sm font-semibold text-foreground">
                                {formatPricePerMillion(selectedOpenRouterModel.promptPricing)}
                              </p>
                            </div>
                            <div className="rounded-md border border-border bg-card px-3 py-2">
                              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                                输出价格
                              </p>
                              <p className="mt-1 text-sm font-semibold text-foreground">
                                {formatPricePerMillion(selectedOpenRouterModel.completionPricing)}
                              </p>
                            </div>
                            <div className="rounded-md border border-border bg-card px-3 py-2">
                              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                                输入模态
                              </p>
                              <p className="mt-1 text-sm font-semibold text-foreground">
                                {formatModalities(selectedOpenRouterModel.inputModalities)}
                              </p>
                            </div>
                            <div className="rounded-md border border-border bg-card px-3 py-2">
                              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                                输出模态
                              </p>
                              <p className="mt-1 text-sm font-semibold text-foreground">
                                {formatModalities(selectedOpenRouterModel.outputModalities)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
                      <h3 className="text-sm font-semibold text-foreground">模型测试</h3>
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
                          onClick={handleAsync(handleRunOpenRouterChatTest)}
                        >
                          {previewOpenRouterChatMutation.isPending ? '发送中...' : '发送测试'}
                        </Button>
                      </div>
                      {openrouterChatResult ? (
                        <div className="rounded-lg border border-border bg-muted/70 p-4">
                          <div className="flex flex-wrap items-center gap-3">
                            <StatusPill tone="ok" label={openrouterChatResult.model} />
                            <StatusPill
                              tone="info"
                              label={`Prompt ${openrouterChatResult.usage.promptTokens ?? 0} / Completion ${openrouterChatResult.usage.completionTokens ?? 0}`}
                            />
                          </div>
                          <ScrollArea className="mt-4 h-[220px] rounded-lg border border-border bg-card">
                            <div className="space-y-3 p-4 text-sm">
                              <p className="leading-6 whitespace-pre-wrap text-foreground">
                                {openrouterChatResult.content}
                              </p>
                              {openrouterChatResult.finishReason ? (
                                <p className="text-xs text-muted-foreground">
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

interface SettingsSearchHit {
  tab: string;
  tabLabel: string;
  field: string;
  keywords: string[];
}

const SETTINGS_SEARCH_INDEX: SettingsSearchHit[] = [
  { tab: 'site', tabLabel: '品牌与页脚', field: '站点名称', keywords: ['站点', 'name', '名称'] },
  {
    tab: 'site',
    tabLabel: '品牌与页脚',
    field: 'Logo / Favicon',
    keywords: ['logo', 'favicon', '图标', '徽标'],
  },
  {
    tab: 'site',
    tabLabel: '品牌与页脚',
    field: '主题色',
    keywords: ['颜色', 'color', '主题色', '品牌色'],
  },
  {
    tab: 'site',
    tabLabel: '品牌与页脚',
    field: '导航菜单',
    keywords: ['导航', 'navigation', '菜单', '顶栏'],
  },
  {
    tab: 'site',
    tabLabel: '品牌与页脚',
    field: '页脚',
    keywords: ['footer', '页脚', '版权', 'beian', '备案'],
  },
  {
    tab: 'public-pages',
    tabLabel: '公共页面',
    field: '内容中心 Hub',
    keywords: ['内容中心', 'hub', '文章', '观点'],
  },
  {
    tab: 'public-pages',
    tabLabel: '公共页面',
    field: '文档中心 Hub',
    keywords: ['文档中心', 'docs hub', '产品文档'],
  },
  {
    tab: 'smtp',
    tabLabel: '邮件服务',
    field: 'SMTP 主机 / 端口',
    keywords: ['smtp', '邮件', '邮箱', 'host', 'port', '发件'],
  },
  {
    tab: 'smtp',
    tabLabel: '邮件服务',
    field: '发送测试邮件',
    keywords: ['测试邮件', 'test', '发件人'],
  },
  {
    tab: 'storage',
    tabLabel: '文件存储',
    field: 'S3 兼容存储',
    keywords: ['七牛', 'qiniu', '存储', '媒体', 'oss', '上传'],
  },
  {
    tab: 'content',
    tabLabel: '内容导入',
    field: 'WordPress 连接',
    keywords: ['wordpress', 'wp', '导入'],
  },
  { tab: 'content', tabLabel: '内容导入', field: 'Notion 连接', keywords: ['notion', '笔记'] },
  {
    tab: 'content',
    tabLabel: '内容导入',
    field: '微信公众号',
    keywords: ['微信', '公众号', 'wechat', 'mp'],
  },
  {
    tab: 'ai',
    tabLabel: 'AI Hub',
    field: 'OpenRouter / Provider',
    keywords: ['ai', 'openrouter', 'provider', 'gpt', 'claude', 'gemini', 'model', 'llm'],
  },
];

function SettingsSearch({
  query,
  onQueryChange,
  onJump,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onJump: (tab: string) => void;
}) {
  const trimmed = query.trim().toLowerCase();
  const hits =
    trimmed.length > 0
      ? SETTINGS_SEARCH_INDEX.filter((h) => {
          const haystack = [h.field, h.tabLabel, ...h.keywords].join(' ').toLowerCase();
          return haystack.includes(trimmed);
        }).slice(0, 8)
      : [];

  return (
    <div className="relative w-full max-w-[320px]">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
      <Input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="搜索设置项…"
        className="h-9 pl-8 text-[12px]"
      />
      {hits.length > 0 ? (
        <div className="absolute top-full right-0 left-0 z-30 mt-1 max-h-[260px] overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg">
          {hits.map((hit) => (
            <button
              key={`${hit.tab}-${hit.field}`}
              type="button"
              onClick={() => onJump(hit.tab)}
              className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-muted"
            >
              <span className="truncate font-medium text-foreground">{hit.field}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{hit.tabLabel}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
