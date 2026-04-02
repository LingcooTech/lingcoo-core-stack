import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import MDEditor from '@uiw/react-md-editor';

import { listAppsAdmin, listCatalogSnapshot, upsertApp } from '@/api/apps';
import type { AppFaq, AppHighlight, AppLink, AppScreenshot } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';

// ─── Helpers ────────────────────────────────────────────────────────────────

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

function formatPriceYuan(cents?: number) {
  return ((cents ?? 0) / 100).toFixed(2);
}

function formatPlanInterval(interval: string | null | undefined) {
  if (interval === 'month') return '月付';
  if (interval === 'year') return '年付';
  if (interval === 'one_time') return '一次性';
  return interval || '未设置';
}

function createOfferId() {
  return `offer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface EditableOffer {
  id: string;
  code: string;
  planCode: string;
  title: string;
  description: string;
  badge: string;
  priceYuan: string;
  currency: string;
  status: string;
  isDefault: boolean;
}

interface FormState {
  name: string;
  tagline: string;
  category: string;
  type: string;
  status: string;
  iconUrl: string;
  coverUrl: string;
  content: string;
  highlights: AppHighlight[];
  screenshots: AppScreenshot[];
  faq: AppFaq[];
  links: AppLink[];
  productCodes: string[];
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AppEditPage() {
  const { appCode } = useParams<{ appCode: string }>();
  const qc = useQueryClient();

  // ── Data fetching ─────────────────────────────────────────────────────────

  const { data: appsData, isLoading: isAppsLoading } = useQuery({
    queryKey: ['apps'],
    queryFn: listAppsAdmin,
  });

  const { data: catalogData } = useQuery({
    queryKey: ['catalog'],
    queryFn: listCatalogSnapshot,
  });

  const app = useMemo(
    () => (appsData?.items ?? []).find((a) => a.code === appCode) ?? null,
    [appsData, appCode],
  );

  const products = catalogData?.products ?? [];
  const allPlans = useMemo(() => {
    const productMap = new Map(products.map((p) => [p.id, p]));
    return (catalogData?.plans ?? []).map((plan) => {
      const product = plan.productId ? productMap.get(plan.productId) : null;
      return {
        ...plan,
        productCode: plan.productCode || product?.code,
        productName: plan.productName || product?.name,
      };
    });
  }, [catalogData?.plans, products]);

  // ── Form state ────────────────────────────────────────────────────────────

  const [form, setForm] = useState<FormState>({
    name: '',
    tagline: '',
    category: '',
    type: 'web_app',
    status: 'active',
    iconUrl: '',
    coverUrl: '',
    content: '',
    highlights: [],
    screenshots: [],
    faq: [],
    links: [],
    productCodes: [],
  });

  const [editableOffers, setEditableOffers] = useState<EditableOffer[]>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (app && !initialized) {
      setForm({
        name: app.name,
        tagline: app.tagline ?? '',
        category: app.category ?? '',
        type: app.type,
        status: app.status,
        iconUrl: app.iconUrl ?? '',
        coverUrl: app.coverUrl ?? '',
        content: app.content ?? '',
        highlights: app.highlights?.length ? app.highlights.map((h) => ({ ...h })) : [],
        screenshots: app.screenshots?.length ? app.screenshots.map((s) => ({ ...s })) : [],
        faq: app.faq?.length ? app.faq.map((f) => ({ ...f })) : [],
        links: app.links?.length ? app.links.map((l) => ({ ...l })) : [],
        productCodes: app.products?.map((p) => p.code) ?? [],
      });
      setEditableOffers(
        (app.checkoutOffers ?? []).map((offer) => ({
          id: createOfferId(),
          code: offer.code,
          planCode: offer.planCode,
          title: offer.title,
          description: offer.description ?? '',
          badge: offer.badge ?? '',
          priceYuan: formatPriceYuan(offer.priceAmount),
          currency: offer.currency,
          status: offer.status,
          isDefault: offer.isDefault,
        })),
      );
      setInitialized(true);
    }
  }, [app, initialized]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const availablePlans = useMemo(
    () =>
      allPlans
        .filter((plan) => plan.productCode && form.productCodes.includes(plan.productCode))
        .sort(
          (a, b) =>
            (a.productCode || '').localeCompare(b.productCode || '') ||
            a.code.localeCompare(b.code),
        ),
    [allPlans, form.productCodes],
  );

  const availablePlanMap = useMemo(
    () => new Map(availablePlans.map((p) => [p.code, p])),
    [availablePlans],
  );

  // ── Offer helpers ─────────────────────────────────────────────────────────

  const updateOffer = (offerId: string, updater: (o: EditableOffer) => EditableOffer) => {
    setEditableOffers((prev) => prev.map((o) => (o.id === offerId ? updater(o) : o)));
  };

  const addOffer = () => {
    const seed = availablePlans[0];
    setEditableOffers((prev) => {
      const next = [
        ...prev,
        {
          id: createOfferId(),
          code: slugify(seed?.code || `offer_${Date.now().toString(36)}`),
          planCode: seed?.code || '',
          title: seed?.name || '',
          description: '',
          badge: '',
          priceYuan: formatPriceYuan(seed?.priceAmount),
          currency: seed?.currency || 'CNY',
          status: (seed?.status as string) || 'active',
          isDefault: false,
        },
      ];
      if (next.length === 1) next[0] = { ...next[0], isDefault: true };
      return next;
    });
  };

  const removeOffer = (offerId: string) => {
    setEditableOffers((prev) => {
      const next = prev.filter((o) => o.id !== offerId);
      if (next.length > 0 && !next.some((o) => o.isDefault)) {
        next[0] = { ...next[0], isDefault: true };
      }
      return next;
    });
  };

  const markDefaultOffer = (offerId: string) => {
    setEditableOffers((prev) =>
      prev.map((o) => ({ ...o, isDefault: o.id === offerId })),
    );
  };

  // ── Mutation ──────────────────────────────────────────────────────────────

  const upsertMutation = useMutation({
    mutationFn: () => {
      if (!appCode) throw new Error('缺少 appCode');

      const checkoutOffers = editableOffers
        .map((offer, index) => ({
          code: slugify(offer.code),
          planCode: offer.planCode,
          title: offer.title.trim(),
          description: offer.description.trim(),
          badge: offer.badge.trim(),
          priceAmount: Math.round(parseFloat(offer.priceYuan || '0') * 100),
          currency: offer.currency.trim().toUpperCase() || 'CNY',
          status: offer.status,
          isDefault: offer.isDefault,
          sortOrder: index,
        }))
        .filter((o) => o.code && o.planCode && o.title);

      const checkoutDefaultOfferCode =
        checkoutOffers.find((o) => o.isDefault)?.code ||
        checkoutOffers[0]?.code ||
        undefined;

      const meta = { ...(app?.meta ?? {}) };
      delete meta.checkoutPlanCode;
      delete meta.checkoutOffers;
      delete meta.checkoutDefaultOfferCode;

      return upsertApp(appCode, {
        name: form.name,
        tagline: form.tagline || undefined,
        content: form.content || undefined,
        category: form.category || undefined,
        type: form.type,
        status: form.status,
        iconUrl: form.iconUrl || undefined,
        coverUrl: form.coverUrl || undefined,
        screenshots: form.screenshots.filter((s) => s.url.trim()),
        highlights: form.highlights.filter((h) => h.title.trim()),
        faq: form.faq.filter((f) => f.question.trim() && f.answer.trim()),
        links: form.links.filter((l) => l.label.trim() && l.url.trim()),
        productCodes: form.productCodes,
        checkoutOffers,
        checkoutDefaultOfferCode,
        meta,
      });
    },
    onSuccess: () => {
      toast.success('应用配置已保存');
      void qc.invalidateQueries({ queryKey: ['apps'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '保存失败'),
  });

  // ── Generic field updater ─────────────────────────────────────────────────

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // ── Loading / not found ───────────────────────────────────────────────────

  if (isAppsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    );
  }

  if (!app) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-sm text-muted-foreground">未找到应用 {appCode}</p>
        <Link to="/admin/apps">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回应用列表
          </Button>
        </Link>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 backdrop-blur px-6 py-3">
        <div className="flex items-center gap-3">
          <Link to="/admin/apps">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-1 h-4 w-4" />
              返回
            </Button>
          </Link>
          <Separator orientation="vertical" className="h-5" />
          <div>
            <p className="text-sm font-bold">{app.name}</p>
            <p className="text-xs font-mono text-muted-foreground">{app.code}</p>
          </div>
        </div>
        <Button
          onClick={() => upsertMutation.mutate()}
          disabled={upsertMutation.isPending || !form.name.trim()}
        >
          {upsertMutation.isPending ? '保存中...' : '保存'}
        </Button>
      </div>

      <div className="mx-auto max-w-4xl space-y-6 p-6">
        {/* ── Section 1: 基本信息 ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>基本信息</CardTitle>
            <CardDescription>应用的基本属性配置</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>名称 *</Label>
              <Input
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder="应用名称"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label>一句话简介</Label>
                <span className="text-xs text-muted-foreground">
                  {form.tagline.length}/200
                </span>
              </div>
              <Input
                value={form.tagline}
                onChange={(e) => {
                  if (e.target.value.length <= 200) setField('tagline', e.target.value);
                }}
                placeholder="简短的应用描述"
                maxLength={200}
              />
            </div>

            <div>
              <Label>分类</Label>
              <Input
                value={form.category}
                onChange={(e) => setField('category', e.target.value)}
                placeholder="如: productivity, dev_tools"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>类型</Label>
                <Select value={form.type} onValueChange={(v) => setField('type', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chrome_extension">Chrome Extension</SelectItem>
                    <SelectItem value="web_app">Web App</SelectItem>
                    <SelectItem value="service">Service</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>状态</Label>
                <Select value={form.status} onValueChange={(v) => setField('status', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>图标 URL</Label>
              <div className="flex items-center gap-3">
                <Input
                  className="flex-1"
                  value={form.iconUrl}
                  onChange={(e) => setField('iconUrl', e.target.value)}
                  placeholder="https://..."
                />
                {form.iconUrl && (
                  <img
                    src={form.iconUrl}
                    alt="icon"
                    className="h-10 w-10 shrink-0 rounded-lg border object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
              </div>
            </div>

            <div>
              <Label>封面图 URL</Label>
              <Input
                value={form.coverUrl}
                onChange={(e) => setField('coverUrl', e.target.value)}
                placeholder="https://..."
              />
              {form.coverUrl && (
                <img
                  src={form.coverUrl}
                  alt="cover"
                  className="mt-2 h-32 w-full rounded-xl border object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Section 2: 详情内容 ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>详情内容</CardTitle>
            <CardDescription>使用 Markdown 编辑应用详情页的正文内容</CardDescription>
          </CardHeader>
          <CardContent>
            <div data-color-mode="light">
              <MDEditor
                value={form.content}
                onChange={(val) => setField('content', val ?? '')}
                height={400}
                style={{ minHeight: 300 }}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Section 3: 核心亮点 ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>核心亮点</CardTitle>
                <CardDescription>最多 8 条，用于展示应用的核心功能特色</CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={form.highlights.length >= 8}
                onClick={() =>
                  setField('highlights', [
                    ...form.highlights,
                    { icon: '', title: '', description: '' },
                  ])
                }
              >
                <Plus className="mr-1 h-4 w-4" />
                添加亮点
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {form.highlights.length === 0 && (
              <p className="text-xs text-muted-foreground">暂无亮点，点击右上角添加</p>
            )}
            {form.highlights.map((item, idx) => (
              <div key={idx} className="space-y-2 rounded-xl border p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-bold text-muted-foreground">亮点 {idx + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() =>
                      setField(
                        'highlights',
                        form.highlights.filter((_, i) => i !== idx),
                      )
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>图标（可选）</Label>
                    <Input
                      value={item.icon ?? ''}
                      onChange={(e) => {
                        const next = [...form.highlights];
                        next[idx] = { ...next[idx], icon: e.target.value };
                        setField('highlights', next);
                      }}
                      placeholder="emoji 或 icon name"
                    />
                  </div>
                  <div>
                    <Label>标题</Label>
                    <Input
                      value={item.title}
                      onChange={(e) => {
                        const next = [...form.highlights];
                        next[idx] = { ...next[idx], title: e.target.value };
                        setField('highlights', next);
                      }}
                      placeholder="功能亮点标题"
                    />
                  </div>
                </div>
                <div>
                  <Label>描述</Label>
                  <Textarea
                    value={item.description}
                    onChange={(e) => {
                      const next = [...form.highlights];
                      next[idx] = { ...next[idx], description: e.target.value };
                      setField('highlights', next);
                    }}
                    placeholder="功能亮点描述"
                    rows={2}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ── Section 4: 截图管理 ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>截图管理</CardTitle>
                <CardDescription>最多 20 张，用于应用详情页展示</CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={form.screenshots.length >= 20}
                onClick={() =>
                  setField('screenshots', [...form.screenshots, { url: '', caption: '' }])
                }
              >
                <Plus className="mr-1 h-4 w-4" />
                添加截图
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {form.screenshots.length === 0 && (
              <p className="text-xs text-muted-foreground">暂无截图，点击右上角添加</p>
            )}
            {form.screenshots.map((item, idx) => (
              <div key={idx} className="flex items-start gap-3 rounded-xl border p-3">
                {item.url && (
                  <img
                    src={item.url}
                    alt={item.caption || `截图 ${idx + 1}`}
                    className="h-16 w-24 shrink-0 rounded-lg border object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <div className="flex-1 space-y-2">
                  <Input
                    value={item.url}
                    onChange={(e) => {
                      const next = [...form.screenshots];
                      next[idx] = { ...next[idx], url: e.target.value };
                      setField('screenshots', next);
                    }}
                    placeholder="图片 URL"
                  />
                  <Input
                    value={item.caption ?? ''}
                    onChange={(e) => {
                      const next = [...form.screenshots];
                      next[idx] = { ...next[idx], caption: e.target.value };
                      setField('screenshots', next);
                    }}
                    placeholder="图片描述（可选）"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-1 h-7 w-7 shrink-0"
                  onClick={() =>
                    setField(
                      'screenshots',
                      form.screenshots.filter((_, i) => i !== idx),
                    )
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ── Section 5: 常见问题 ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>常见问题</CardTitle>
                <CardDescription>最多 30 条 FAQ</CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={form.faq.length >= 30}
                onClick={() =>
                  setField('faq', [...form.faq, { question: '', answer: '' }])
                }
              >
                <Plus className="mr-1 h-4 w-4" />
                添加问题
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {form.faq.length === 0 && (
              <p className="text-xs text-muted-foreground">暂无常见问题，点击右上角添加</p>
            )}
            {form.faq.map((item, idx) => (
              <div key={idx} className="space-y-2 rounded-xl border p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-bold text-muted-foreground">Q{idx + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() =>
                      setField(
                        'faq',
                        form.faq.filter((_, i) => i !== idx),
                      )
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div>
                  <Label>问题</Label>
                  <Input
                    value={item.question}
                    onChange={(e) => {
                      const next = [...form.faq];
                      next[idx] = { ...next[idx], question: e.target.value };
                      setField('faq', next);
                    }}
                    placeholder="常见问题"
                  />
                </div>
                <div>
                  <Label>回答</Label>
                  <Textarea
                    value={item.answer}
                    onChange={(e) => {
                      const next = [...form.faq];
                      next[idx] = { ...next[idx], answer: e.target.value };
                      setField('faq', next);
                    }}
                    placeholder="问题的回答"
                    rows={3}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ── Section 6: 相关链接 ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>相关链接</CardTitle>
                <CardDescription>最多 20 条外部链接</CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={form.links.length >= 20}
                onClick={() =>
                  setField('links', [
                    ...form.links,
                    { label: '', url: '', type: 'website' as const },
                  ])
                }
              >
                <Plus className="mr-1 h-4 w-4" />
                添加链接
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {form.links.length === 0 && (
              <p className="text-xs text-muted-foreground">暂无链接，点击右上角添加</p>
            )}
            {form.links.map((item, idx) => (
              <div key={idx} className="flex items-start gap-3 rounded-xl border p-3">
                <div className="grid flex-1 grid-cols-3 gap-2">
                  <Input
                    value={item.label}
                    onChange={(e) => {
                      const next = [...form.links];
                      next[idx] = { ...next[idx], label: e.target.value };
                      setField('links', next);
                    }}
                    placeholder="标签名"
                  />
                  <Input
                    value={item.url}
                    onChange={(e) => {
                      const next = [...form.links];
                      next[idx] = { ...next[idx], url: e.target.value };
                      setField('links', next);
                    }}
                    placeholder="https://..."
                  />
                  <Select
                    value={item.type}
                    onValueChange={(v) => {
                      const next = [...form.links];
                      next[idx] = { ...next[idx], type: v as AppLink['type'] };
                      setField('links', next);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="docs">文档</SelectItem>
                      <SelectItem value="support">支持</SelectItem>
                      <SelectItem value="website">官网</SelectItem>
                      <SelectItem value="download">下载</SelectItem>
                      <SelectItem value="other">其他</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-1 h-7 w-7 shrink-0"
                  onClick={() =>
                    setField(
                      'links',
                      form.links.filter((_, i) => i !== idx),
                    )
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ── Section 7: 产品绑定与定价 ───────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>产品绑定与定价</CardTitle>
            <CardDescription>
              选择关联产品，并配置该应用的自定义定价梯度（Checkout Offers）
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Product checkboxes */}
            <div>
              <Label className="mb-2 block">绑定产品</Label>
              {products.length === 0 ? (
                <p className="text-xs text-muted-foreground">暂无可用产品</p>
              ) : (
                <div className="space-y-2">
                  {products.map((product) => (
                    <label key={product.code} className="flex cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={form.productCodes.includes(product.code)}
                        onCheckedChange={(checked) => {
                          const next = checked
                            ? [...form.productCodes, product.code]
                            : form.productCodes.filter((c) => c !== product.code);
                          setField('productCodes', next);
                        }}
                      />
                      <span className="text-sm font-mono">{product.code}</span>
                      <span className="text-xs text-muted-foreground">{product.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Checkout Offers */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-bold">应用定价梯度</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    每个 Offer 绑定一个基础 Plan，但价格、标题、标签可按应用单独设置
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addOffer}
                  disabled={availablePlans.length === 0}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  添加 Offer
                </Button>
              </div>

              {availablePlans.length === 0 && (
                <p className="text-xs text-muted-foreground">先选择产品，才能配置定价选项</p>
              )}

              {editableOffers.length === 0 && availablePlans.length > 0 && (
                <div className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
                  尚未配置自定义 Offer，保存后前端将回退到基础 Plan
                </div>
              )}

              <div className="space-y-4">
                {editableOffers.map((offer, idx) => {
                  const boundPlan =
                    availablePlanMap.get(offer.planCode) ??
                    allPlans.find((p) => p.code === offer.planCode) ??
                    null;

                  return (
                    <div key={offer.id} className="space-y-3 rounded-xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-bold">
                          {offer.title || `Offer ${idx + 1}`}
                          {offer.isDefault && (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                              默认
                            </span>
                          )}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => removeOffer(offer.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Offer Code</Label>
                          <Input
                            value={offer.code}
                            onChange={(e) =>
                              updateOffer(offer.id, (o) => ({
                                ...o,
                                code: slugify(e.target.value),
                              }))
                            }
                            placeholder="offer_code"
                          />
                        </div>
                        <div>
                          <Label>绑定 Plan</Label>
                          <Select
                            value={offer.planCode}
                            onValueChange={(v) =>
                              updateOffer(offer.id, (o) => {
                                const np = availablePlanMap.get(v);
                                return {
                                  ...o,
                                  planCode: v,
                                  currency: np?.currency || o.currency,
                                  status: np?.status || o.status,
                                  title: o.title || np?.name || '',
                                  priceYuan: o.priceYuan || formatPriceYuan(np?.priceAmount),
                                };
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="选择 Plan" />
                            </SelectTrigger>
                            <SelectContent>
                              {availablePlans.map((plan) => (
                                <SelectItem key={plan.code} value={plan.code}>
                                  {plan.name} ({plan.code}) - {formatPlanInterval(plan.interval)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>展示标题</Label>
                          <Input
                            value={offer.title}
                            onChange={(e) =>
                              updateOffer(offer.id, (o) => ({ ...o, title: e.target.value }))
                            }
                            placeholder="Pro 月付"
                          />
                        </div>
                        <div>
                          <Label>描述（可选）</Label>
                          <Input
                            value={offer.description}
                            onChange={(e) =>
                              updateOffer(offer.id, (o) => ({
                                ...o,
                                description: e.target.value,
                              }))
                            }
                            placeholder={
                              boundPlan
                                ? `${formatPlanInterval(boundPlan.interval)} - ${boundPlan.productCode}`
                                : '简短说明'
                            }
                          />
                        </div>
                      </div>

                      <div>
                        <Label>标签（可选）</Label>
                        <Input
                          value={offer.badge}
                          onChange={(e) =>
                            updateOffer(offer.id, (o) => ({ ...o, badge: e.target.value }))
                          }
                          placeholder="限时优惠"
                        />
                      </div>

                      <div className="grid grid-cols-4 gap-3">
                        <div>
                          <Label>价格（元）</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={offer.priceYuan}
                            onChange={(e) =>
                              updateOffer(offer.id, (o) => ({
                                ...o,
                                priceYuan: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label>币种</Label>
                          <Input
                            value={offer.currency}
                            onChange={(e) =>
                              updateOffer(offer.id, (o) => ({
                                ...o,
                                currency: e.target.value.toUpperCase(),
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label>状态</Label>
                          <Select
                            value={offer.status}
                            onValueChange={(v) =>
                              updateOffer(offer.id, (o) => ({ ...o, status: v }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="inactive">Inactive</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                              <SelectItem value="expired">Expired</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-end">
                          <Button
                            type="button"
                            variant={offer.isDefault ? 'default' : 'outline'}
                            className="w-full"
                            onClick={() => markDefaultOffer(offer.id)}
                          >
                            {offer.isDefault ? '默认 Offer' : '设为默认'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bottom save button */}
        <div className="pb-8">
          <Button
            className="w-full"
            onClick={() => upsertMutation.mutate()}
            disabled={upsertMutation.isPending || !form.name.trim()}
          >
            {upsertMutation.isPending ? '保存中...' : '保存应用配置'}
          </Button>
        </div>
      </div>
    </div>
  );
}
