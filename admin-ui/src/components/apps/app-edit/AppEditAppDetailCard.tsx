import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import { createDraftId, type EditableAppDetail, type EditableAppSubscriptionPlan } from './model';

interface AppEditAppDetailCardProps {
  value: EditableAppDetail;
  onChange: (value: EditableAppDetail) => void;
}

function updateSubscriptionPlan(
  plans: EditableAppSubscriptionPlan[],
  planId: string,
  patch: Partial<EditableAppSubscriptionPlan>,
) {
  return plans.map((plan) => (plan.id === planId ? { ...plan, ...patch } : plan));
}

export function AppEditAppDetailCard({ value, onChange }: AppEditAppDetailCardProps) {
  const setField = <K extends keyof EditableAppDetail>(key: K, nextValue: EditableAppDetail[K]) => {
    onChange({ ...value, [key]: nextValue });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>应用规格与购买信息</CardTitle>
        <CardDescription>
          参照 `fd-content-types` 的 app 字段，补充详情页需要展示的技术规格、购买方式和使用说明。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label>开发者 / 开发商</Label>
            <Input
              value={value.developer}
              onChange={(event) => setField('developer', event.target.value)}
              placeholder="例如：FutureDecade"
            />
          </div>
          <div className="space-y-2">
            <Label>版本号</Label>
            <Input
              value={value.version}
              onChange={(event) => setField('version', event.target.value)}
              placeholder="例如：1.2.0"
            />
          </div>
          <div className="space-y-2">
            <Label>更新日期</Label>
            <Input
              value={value.updateDate}
              onChange={(event) => setField('updateDate', event.target.value)}
              placeholder="例如：2026-04-18"
            />
          </div>
          <div className="space-y-2">
            <Label>应用大小</Label>
            <Input
              value={value.size}
              onChange={(event) => setField('size', event.target.value)}
              placeholder="例如：45 MB"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>支持平台</Label>
            <Input
              value={value.platformsText}
              onChange={(event) => setField('platformsText', event.target.value)}
              placeholder="例如：iOS, Android, Web"
            />
            <p className="text-muted-foreground text-xs">
              用逗号分隔多个平台，详情页会显示为标签。
            </p>
          </div>
          <div className="space-y-2">
            <Label>支持语言</Label>
            <Input
              value={value.languages}
              onChange={(event) => setField('languages', event.target.value)}
              placeholder="例如：简体中文, English"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label>购买方式</Label>
            <Select
              value={value.purchaseType}
              onValueChange={(nextValue) =>
                setField('purchaseType', nextValue as EditableAppDetail['purchaseType'])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free">免费使用</SelectItem>
                <SelectItem value="onsite_onetime">站内购买 - 买断</SelectItem>
                <SelectItem value="onsite_subscription">站内购买 - 订阅</SelectItem>
                <SelectItem value="offsite">站外购买</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>价格文案</Label>
            <Input
              value={value.price}
              onChange={(event) => setField('price', event.target.value)}
              placeholder="例如：¥29 / 月"
            />
          </div>
          <div className="space-y-2">
            <Label>试用天数</Label>
            <Input
              value={value.trialDays}
              onChange={(event) => setField('trialDays', event.target.value)}
              placeholder="例如：14"
            />
          </div>
          <div className="space-y-2">
            <Label>站外购买地址</Label>
            <Input
              value={value.purchaseUrl}
              onChange={(event) => setField('purchaseUrl', event.target.value)}
              placeholder="https://..."
            />
          </div>
        </div>

        {value.purchaseType === 'onsite_subscription' ? (
          <div className="border-border bg-muted/80 space-y-4 rounded-xl border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-foreground text-sm font-semibold">订阅套餐</p>
                <p className="text-muted-foreground text-xs">用于详情页右侧边栏展示套餐信息。</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setField('subscriptionPlans', [
                    ...value.subscriptionPlans,
                    {
                      id: createDraftId('subscription_plan'),
                      period: '',
                      price: '',
                      description: '',
                    },
                  ])
                }
              >
                <Plus className="h-4 w-4" />
                添加套餐
              </Button>
            </div>

            {value.subscriptionPlans.length === 0 ? (
              <p className="text-muted-foreground text-xs">暂无订阅套餐，点击右上角添加。</p>
            ) : null}

            {value.subscriptionPlans.map((plan) => (
              <div
                key={plan.id}
                className="border-border bg-card grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr,1fr,2fr,auto]"
              >
                <Input
                  value={plan.period}
                  onChange={(event) =>
                    setField(
                      'subscriptionPlans',
                      updateSubscriptionPlan(value.subscriptionPlans, plan.id, {
                        period: event.target.value,
                      }),
                    )
                  }
                  placeholder="周期，例如：月付"
                />
                <Input
                  value={plan.price}
                  onChange={(event) =>
                    setField(
                      'subscriptionPlans',
                      updateSubscriptionPlan(value.subscriptionPlans, plan.id, {
                        price: event.target.value,
                      }),
                    )
                  }
                  placeholder="价格，例如：¥29"
                />
                <Input
                  value={plan.description}
                  onChange={(event) =>
                    setField(
                      'subscriptionPlans',
                      updateSubscriptionPlan(value.subscriptionPlans, plan.id, {
                        description: event.target.value,
                      }),
                    )
                  }
                  placeholder="补充说明，例如：相当于 ¥24/月"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setField(
                      'subscriptionPlans',
                      value.subscriptionPlans.filter((item) => item.id !== plan.id),
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-2">
            <Label>系统要求</Label>
            <Textarea
              value={value.systemRequirements}
              onChange={(event) => setField('systemRequirements', event.target.value)}
              placeholder="每行一项，例如：Windows 10 及以上"
              rows={5}
            />
          </div>
          <div className="space-y-2">
            <Label>使用说明</Label>
            <Textarea
              value={value.usageInstructions}
              onChange={(event) => setField('usageInstructions', event.target.value)}
              placeholder="说明用户如何获取和使用应用"
              rows={5}
            />
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-2">
            <Label>技术说明</Label>
            <Textarea
              value={value.technicalNotes}
              onChange={(event) => setField('technicalNotes', event.target.value)}
              placeholder="补充技术规格、兼容性或部署要求"
              rows={6}
            />
          </div>
          <div className="space-y-2">
            <Label>注意事项</Label>
            <Textarea
              value={value.notes}
              onChange={(event) => setField('notes', event.target.value)}
              placeholder="例如：需要邀请制、需要企业账号或需要代理网络"
              rows={6}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
