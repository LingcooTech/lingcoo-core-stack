import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import type { FeatureSummary, PlanSummary, ProductSummary } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type RecordStatus = 'active' | 'inactive' | 'cancelled' | 'expired';
type ProductType = 'chrome_extension' | 'web_app' | 'service';
type PlanInterval = 'month' | 'year' | 'one_time';

interface EditableFeature {
  id: string;
  code: string;
  name: string;
  kind: string;
  status: RecordStatus;
}

interface EditablePlan {
  id: string;
  code: string;
  name: string;
  interval: PlanInterval;
  priceYuan: string;
  currency: string;
  status: RecordStatus;
  featureCodes: string[];
}

export interface CatalogBundleSummary {
  product: ProductSummary;
  features: FeatureSummary[];
  plans: PlanSummary[];
  planFeatureCodesByPlanCode: Record<string, string[]>;
}

function createLocalId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

function centsToYuan(value?: number) {
  return ((value ?? 0) / 100).toFixed(2);
}

function buildFeatureDrafts(bundle: CatalogBundleSummary | null): EditableFeature[] {
  if (!bundle) {
    return [
      {
        id: createLocalId('feature'),
        code: 'system_deploy',
        name: 'System Deploy',
        kind: 'boolean',
        status: 'active'
      }
    ];
  }

  return bundle.features.map((feature) => ({
    id: createLocalId('feature'),
    code: feature.code,
    name: feature.name,
    kind: feature.kind,
    status: (feature.status as RecordStatus) || 'active'
  }));
}

function buildPlanDrafts(bundle: CatalogBundleSummary | null): EditablePlan[] {
  if (!bundle) {
    return [
      {
        id: createLocalId('plan'),
        code: '',
        name: '',
        interval: 'one_time',
        priceYuan: '0.00',
        currency: 'CNY',
        status: 'inactive',
        featureCodes: ['system_deploy']
      }
    ];
  }

  const featureCodes = bundle.features.map((feature) => feature.code);

  return bundle.plans.map((plan) => ({
    id: createLocalId('plan'),
    code: plan.code,
    name: plan.name,
    interval: (plan.interval as PlanInterval) || 'one_time',
    priceYuan: centsToYuan(plan.priceAmount),
    currency: plan.currency || 'CNY',
    status: (plan.status as RecordStatus) || 'active',
    featureCodes: bundle.planFeatureCodesByPlanCode[plan.code] ?? featureCodes
  }));
}

export function CatalogBundleDialog({
  open,
  onOpenChange,
  bundle,
  pending,
  onSubmit
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bundle: CatalogBundleSummary | null;
  pending?: boolean;
  onSubmit: (payload: {
    productCode: string;
    name: string;
    type: ProductType;
    status: RecordStatus;
    features: Array<{
      code: string;
      name: string;
      kind: string;
      status: RecordStatus;
    }>;
    plans: Array<{
      code: string;
      name: string;
      billingProvider: string;
      priceAmount: number;
      currency: string;
      interval: PlanInterval;
      status: RecordStatus;
      featureCodes: string[];
    }>;
  }) => void;
}) {
  const [productCode, setProductCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<ProductType>('service');
  const [status, setStatus] = useState<RecordStatus>('active');
  const [features, setFeatures] = useState<EditableFeature[]>([]);
  const [plans, setPlans] = useState<EditablePlan[]>([]);

  useEffect(() => {
    if (!open) return;

    setProductCode(bundle?.product.code ?? 'fd_headless_wp_system');
    setName(bundle?.product.name ?? 'FD Headless WP System');
    setType((bundle?.product.type as ProductType) || 'service');
    setStatus((bundle?.product.status as RecordStatus) || 'active');
    setFeatures(buildFeatureDrafts(bundle));
    setPlans(buildPlanDrafts(bundle));
  }, [bundle, open]);

  const addFeature = () => {
    setFeatures((current) => [
      ...current,
      {
        id: createLocalId('feature'),
        code: '',
        name: '',
        kind: 'boolean',
        status: 'active'
      }
    ]);
  };

  const addPlan = () => {
    setPlans((current) => [
      ...current,
      {
        id: createLocalId('plan'),
        code: '',
        name: '',
        interval: 'one_time',
        priceYuan: '0.00',
        currency: 'CNY',
        status: 'inactive',
        featureCodes: features.slice(0, 1).map((feature) => feature.code).filter(Boolean)
      }
    ]);
  };

  const cleanedFeatures = features
    .map((feature) => ({
      code: normalizeCode(feature.code || feature.name),
      name: feature.name.trim(),
      kind: feature.kind.trim() || 'boolean',
      status: feature.status
    }))
    .filter((feature) => feature.code && feature.name);

  const cleanedPlans = plans
    .map((plan) => ({
      code: normalizeCode(plan.code || plan.name),
      name: plan.name.trim(),
      billingProvider: 'self_hosted',
      priceAmount: Math.round(Number(plan.priceYuan || '0') * 100),
      currency: plan.currency.trim().toUpperCase() || 'CNY',
      interval: plan.interval,
      status: plan.status,
      featureCodes: [...new Set(plan.featureCodes.map((featureCode) => normalizeCode(featureCode)).filter(Boolean))]
    }))
    .filter((plan) => plan.code && plan.name && plan.featureCodes.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{bundle ? `编辑目录 ${bundle.product.name}` : '新建产品目录'}</DialogTitle>
          <DialogDescription>这里定义产品、能力项和授权方案。销售展示和交付声明统一在产品工作台内管理。</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-bold">产品名称</label>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="FD Headless WP System" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold">产品 Code</label>
              <Input
                value={productCode}
                disabled={Boolean(bundle)}
                onChange={(event) => setProductCode(normalizeCode(event.target.value))}
                placeholder="fd_headless_wp_system"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-bold">产品类型</label>
              <Select value={type} onValueChange={(value) => setType(value as ProductType)}>
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
            <div className="space-y-2">
              <label className="text-sm font-bold">状态</label>
              <Select value={status} onValueChange={(value) => setStatus(value as RecordStatus)}>
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

          <section className="space-y-4 rounded-2xl border border-border bg-muted/20 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black">功能项</p>
                <p className="mt-1 text-xs text-muted-foreground">每个 product 至少需要一个 feature，授权和部署资格都会落在这一层。</p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={addFeature}>
                <Plus className="mr-1 h-4 w-4" />
                添加 Feature
              </Button>
            </div>

            <div className="space-y-3">
              {features.map((feature) => (
                <div key={feature.id} className="grid gap-3 rounded-xl border border-border bg-white p-4 md:grid-cols-[1fr,1fr,180px,auto]">
                  <Input
                    value={feature.name}
                    onChange={(event) =>
                      setFeatures((current) =>
                        current.map((item) => (item.id === feature.id ? { ...item, name: event.target.value } : item))
                      )
                    }
                    placeholder="System Deploy"
                  />
                  <Input
                    value={feature.code}
                    onChange={(event) =>
                      setFeatures((current) =>
                        current.map((item) => (item.id === feature.id ? { ...item, code: normalizeCode(event.target.value) } : item))
                      )
                    }
                    placeholder="system_deploy"
                  />
                  <Select
                    value={feature.status}
                    onValueChange={(value) =>
                      setFeatures((current) =>
                        current.map((item) => (item.id === feature.id ? { ...item, status: value as RecordStatus } : item))
                      )
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
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => setFeatures((current) => current.filter((item) => item.id !== feature.id))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-border bg-muted/20 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black">Plans</p>
                <p className="mt-1 text-xs text-muted-foreground">Plans 决定计费周期和授权范围。每个 plan 至少绑定一个 feature。</p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={addPlan}>
                <Plus className="mr-1 h-4 w-4" />
                添加 Plan
              </Button>
            </div>

            <div className="space-y-4">
              {plans.map((plan, index) => (
                <div key={plan.id} className="space-y-4 rounded-xl border border-border bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black">{plan.name || `Plan ${index + 1}`}</p>
                      <p className="text-xs font-mono text-muted-foreground">{plan.code || '未设置 code'}</p>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => setPlans((current) => current.filter((item) => item.id !== plan.id))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <Input
                      value={plan.name}
                      onChange={(event) =>
                        setPlans((current) =>
                          current.map((item) => (item.id === plan.id ? { ...item, name: event.target.value } : item))
                        )
                      }
                      placeholder="Headless WP License"
                    />
                    <Input
                      value={plan.code}
                      onChange={(event) =>
                        setPlans((current) =>
                          current.map((item) => (item.id === plan.id ? { ...item, code: normalizeCode(event.target.value) } : item))
                        )
                      }
                      placeholder="fd_headless_wp_license"
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    <Select
                      value={plan.interval}
                      onValueChange={(value) =>
                        setPlans((current) =>
                          current.map((item) => (item.id === plan.id ? { ...item, interval: value as PlanInterval } : item))
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="month">Month</SelectItem>
                        <SelectItem value="year">Year</SelectItem>
                        <SelectItem value="one_time">One Time</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={plan.priceYuan}
                      onChange={(event) =>
                        setPlans((current) =>
                          current.map((item) => (item.id === plan.id ? { ...item, priceYuan: event.target.value } : item))
                        )
                      }
                      placeholder="299.00"
                    />
                    <Input
                      value={plan.currency}
                      onChange={(event) =>
                        setPlans((current) =>
                          current.map((item) => (item.id === plan.id ? { ...item, currency: event.target.value.toUpperCase() } : item))
                        )
                      }
                      placeholder="CNY"
                    />
                    <Select
                      value={plan.status}
                      onValueChange={(value) =>
                        setPlans((current) =>
                          current.map((item) => (item.id === plan.id ? { ...item, status: value as RecordStatus } : item))
                        )
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

                  <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Feature Scope</p>
                    <div className="grid gap-2 md:grid-cols-2">
                      {features.map((feature) => {
                        const featureCode = normalizeCode(feature.code || feature.name);
                        return (
                          <label key={`${plan.id}:${feature.id}`} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                            <Checkbox
                              checked={plan.featureCodes.includes(featureCode)}
                              onCheckedChange={(checked) =>
                                setPlans((current) =>
                                  current.map((item) => {
                                    if (item.id !== plan.id) return item;
                                    return {
                                      ...item,
                                      featureCodes: checked
                                        ? [...item.featureCodes, featureCode]
                                        : item.featureCodes.filter((code) => code !== featureCode)
                                    };
                                  })
                                )
                              }
                            />
                            <span className="font-medium">{feature.name || featureCode}</span>
                            <span className="font-mono text-xs text-muted-foreground">{featureCode}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <Button
            className="w-full"
            disabled={pending || !normalizeCode(productCode) || !name.trim() || cleanedFeatures.length === 0 || cleanedPlans.length === 0}
            onClick={() =>
              onSubmit({
                productCode: normalizeCode(productCode),
                name: name.trim(),
                type,
                status,
                features: cleanedFeatures,
                plans: cleanedPlans
              })
            }
          >
            {pending ? '保存中...' : bundle ? '保存目录' : '创建目录'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
