import { Package, Plus, Sparkles, Trash2 } from 'lucide-react';

import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TabsContent } from '@/components/ui/tabs';

import { AppEditSaveBar } from './AppEditSaveBar';
import {
  formatPlanInterval,
  type EditableFeature,
  type EditableFeatureUpdate,
  type EditablePlan,
  type EditablePlanUpdate,
} from './model';

interface AppEditPlansTabProps {
  features: EditableFeature[];
  plans: EditablePlan[];
  updateFeature: EditableFeatureUpdate;
  addFeature: () => void;
  removeFeature: (featureId: string) => void;
  updatePlan: EditablePlanUpdate;
  addPlan: () => void;
  removePlan: (planId: string) => void;
  isSaving: boolean;
  saveDisabled: boolean;
  onSave: () => void;
}

export function AppEditPlansTab({
  features,
  plans,
  updateFeature,
  addFeature,
  removeFeature,
  updatePlan,
  addPlan,
  removePlan,
  isSaving,
  saveDisabled,
  onSave,
}: AppEditPlansTabProps) {
  return (
    <TabsContent value="plans" className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>功能列表</CardTitle>
              <CardDescription>先定义功能项，再把它们组合进套餐。</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addFeature}>
              <Plus className="h-4 w-4" />
              添加功能
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {features.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              当前还没有功能。先创建 feature，后面套餐才能关联这些功能。
            </div>
          ) : (
            features.map((feature, index) => (
              <div key={feature.id} className="space-y-4 rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-semibold">
                        {feature.name.trim() || `功能 ${index + 1}`}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      功能 Code 会用于 plan 关联和授权汇总。
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => removeFeature(feature.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>Feature Code *</Label>
                    <Input
                      value={feature.code}
                      onChange={(event) =>
                        updateFeature(feature.id, (current) => ({
                          ...current,
                          code: event.target.value,
                        }))
                      }
                      placeholder="例如: team_members"
                    />
                  </div>
                  <div>
                    <Label>功能名称 *</Label>
                    <Input
                      value={feature.name}
                      onChange={(event) =>
                        updateFeature(feature.id, (current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="例如: 团队成员管理"
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>功能类型</Label>
                    <Input
                      value={feature.kind}
                      onChange={(event) =>
                        updateFeature(feature.id, (current) => ({
                          ...current,
                          kind: event.target.value,
                        }))
                      }
                      placeholder="boolean"
                    />
                  </div>
                  <div>
                    <Label>状态</Label>
                    <Select
                      value={feature.status}
                      onValueChange={(value) =>
                        updateFeature(feature.id, (current) => ({
                          ...current,
                          status: value as EditableFeature['status'],
                        }))
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
                </div>

                <StatusPill tone={statusToTone(feature.status)} label={feature.status} />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>套餐列表</CardTitle>
              <CardDescription>套餐定义购买层和功能集合；售卖文案在 Offers Tab 单独配置。</CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addPlan}
              disabled={features.length === 0}
            >
              <Plus className="h-4 w-4" />
              添加套餐
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {features.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              请先创建功能，再创建套餐。每个套餐至少要关联一个功能。
            </div>
          ) : null}

          {plans.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              当前还没有套餐。创建套餐后，Offers Tab 才能绑定并售卖。
            </div>
          ) : (
            plans.map((plan, index) => (
              <div key={plan.id} className="space-y-4 rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-semibold">{plan.name.trim() || `套餐 ${index + 1}`}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatPlanInterval(plan.interval)} · {plan.code || '未设置 Plan Code'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => removePlan(plan.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>Plan Code *</Label>
                    <Input
                      value={plan.code}
                      onChange={(event) =>
                        updatePlan(plan.id, (current) => ({
                          ...current,
                          code: event.target.value,
                        }))
                      }
                      placeholder="例如: pro_monthly"
                    />
                  </div>
                  <div>
                    <Label>套餐名称 *</Label>
                    <Input
                      value={plan.name}
                      onChange={(event) =>
                        updatePlan(plan.id, (current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="例如: Pro 月付"
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>计费通道</Label>
                    <Input
                      value={plan.billingProvider}
                      onChange={(event) =>
                        updatePlan(plan.id, (current) => ({
                          ...current,
                          billingProvider: event.target.value,
                        }))
                      }
                      placeholder="self_hosted"
                    />
                  </div>
                  <div>
                    <Label>外部 Price ID</Label>
                    <Input
                      value={plan.billingPriceId}
                      onChange={(event) =>
                        updatePlan(plan.id, (current) => ({
                          ...current,
                          billingPriceId: event.target.value,
                        }))
                      }
                      placeholder="可选，例如 stripe price id"
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <div>
                    <Label>价格（元）</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={plan.priceYuan}
                      onChange={(event) =>
                        updatePlan(plan.id, (current) => ({
                          ...current,
                          priceYuan: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label>币种</Label>
                    <Input
                      value={plan.currency}
                      onChange={(event) =>
                        updatePlan(plan.id, (current) => ({
                          ...current,
                          currency: event.target.value.toUpperCase(),
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label>周期</Label>
                    <Select
                      value={plan.interval}
                      onValueChange={(value) =>
                        updatePlan(plan.id, (current) => ({
                          ...current,
                          interval: value as EditablePlan['interval'],
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="month">月付</SelectItem>
                        <SelectItem value="year">年付</SelectItem>
                        <SelectItem value="one_time">一次性</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>状态</Label>
                    <Select
                      value={plan.status}
                      onValueChange={(value) =>
                        updatePlan(plan.id, (current) => ({
                          ...current,
                          status: value as EditablePlan['status'],
                        }))
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
                </div>

                <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
                  <div>
                    <p className="text-sm font-semibold">部署权益</p>
                    <p className="text-xs text-muted-foreground">
                      这些配置会在购买时固化到授权实例；用户创建部署时必须选择一个有效授权。
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>每个授权的 Active Deployments 上限</Label>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={plan.deploymentPolicy.maxActiveDeployments}
                        onChange={(event) => {
                          const parsed = Number.parseInt(event.target.value, 10);
                          updatePlan(plan.id, (current) => ({
                            ...current,
                            deploymentPolicy: {
                              ...current.deploymentPolicy,
                              maxActiveDeployments: Number.isFinite(parsed) && parsed >= 1 ? parsed : 1,
                            },
                          }));
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        只限制当前授权实例，不再按应用维度累计。
                      </p>
                    </div>
                    <label className="flex items-start gap-3 rounded-md border bg-white p-3">
                      <Checkbox
                        checked={plan.deploymentPolicy.allowMultiplePurchases}
                        onCheckedChange={(checked) =>
                          updatePlan(plan.id, (current) => ({
                            ...current,
                            deploymentPolicy: {
                              ...current.deploymentPolicy,
                              allowMultiplePurchases: checked === true,
                            },
                          }))
                        }
                      />
                      <span className="space-y-1">
                        <span className="block text-sm font-medium">允许同一用户重复购买该套餐</span>
                        <span className="block text-xs text-muted-foreground">
                          启用后，每次购买会产生独立授权，可分别绑定域名和消耗部署名额。
                        </span>
                      </span>
                    </label>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>域名绑定策略</Label>
                      <Select
                        value={plan.deploymentPolicy.domainBindingMode}
                        onValueChange={(value) =>
                          updatePlan(plan.id, (current) => ({
                            ...current,
                            deploymentPolicy: {
                              ...current.deploymentPolicy,
                              domainBindingMode: value as EditablePlan['deploymentPolicy']['domainBindingMode'],
                              domainBindingSource:
                                value === 'lock_on_first_success' &&
                                current.deploymentPolicy.domainBindingSource === 'none'
                                  ? 'primaryDomain'
                                  : value === 'none'
                                    ? 'none'
                                    : current.deploymentPolicy.domainBindingSource,
                            },
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">不绑定</SelectItem>
                          <SelectItem value="lock_on_first_success">首次成功部署后锁定</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>绑定域名槽位</Label>
                      <Select
                        value={plan.deploymentPolicy.domainBindingSource}
                        disabled={plan.deploymentPolicy.domainBindingMode === 'none'}
                        onValueChange={(value) =>
                          updatePlan(plan.id, (current) => ({
                            ...current,
                            deploymentPolicy: {
                              ...current.deploymentPolicy,
                              domainBindingSource:
                                value as EditablePlan['deploymentPolicy']['domainBindingSource'],
                            },
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">未启用</SelectItem>
                          <SelectItem value="primaryDomain">主域名</SelectItem>
                          <SelectItem value="adminDomain">后台域名</SelectItem>
                          <SelectItem value="wsDomain">WS 域名</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>绑定粒度</Label>
                      <Select
                        value={plan.deploymentPolicy.domainBindingScope}
                        disabled={plan.deploymentPolicy.domainBindingMode === 'none'}
                        onValueChange={(value) =>
                          updatePlan(plan.id, (current) => ({
                            ...current,
                            deploymentPolicy: {
                              ...current.deploymentPolicy,
                              domainBindingScope:
                                value as EditablePlan['deploymentPolicy']['domainBindingScope'],
                            },
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="registrable_domain">根域名 / 可注册域</SelectItem>
                          <SelectItem value="exact_host">完整子域名</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        `根域名` 会把 app.example.com 和 www.example.com 视为同一授权域名。
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                  <div>
                    <p className="text-sm font-semibold">关联功能</p>
                    <p className="text-xs text-muted-foreground">
                      至少勾选一个功能。授权结果会根据这里的映射聚合。
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {features.map((feature) => {
                      const checked = plan.featureCodes.includes(feature.code);
                      return (
                        <label
                          key={feature.id}
                          className="flex items-start gap-3 rounded-md border bg-white p-3"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(nextChecked) =>
                              updatePlan(plan.id, (current) => ({
                                ...current,
                                featureCodes:
                                  nextChecked === true
                                    ? Array.from(new Set([...current.featureCodes, feature.code]))
                                    : current.featureCodes.filter((code) => code !== feature.code),
                              }))
                            }
                          />
                          <div className="space-y-1">
                            <p className="text-sm font-semibold">{feature.name || feature.code}</p>
                            <p className="text-xs font-mono text-muted-foreground">{feature.code}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <StatusPill tone={statusToTone(plan.status)} label={plan.status} />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <AppEditSaveBar
        title="保存功能与套餐"
        description="保存后会更新 feature、plan 及它们之间的关联关系。"
        isSaving={isSaving}
        disabled={saveDisabled}
        onSave={onSave}
      />
    </TabsContent>
  );
}
