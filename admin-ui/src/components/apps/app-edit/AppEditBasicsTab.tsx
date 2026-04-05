import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TabsContent } from '@/components/ui/tabs';

import { AppEditSaveBar } from './AppEditSaveBar';
import type { AppEditFieldSetter, FormState } from './model';

interface AppEditBasicsTabProps {
  form: FormState;
  setField: AppEditFieldSetter;
  isCreateMode: boolean;
  isSaving: boolean;
  saveDisabled: boolean;
  onSave: () => void;
}

export function AppEditBasicsTab({
  form,
  setField,
  isCreateMode,
  isSaving,
  saveDisabled,
  onSave,
}: AppEditBasicsTabProps) {
  return (
    <TabsContent value="basics" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>基本信息</CardTitle>
          <CardDescription>控制应用名称、App Code、分类、运行类型和核心视觉资产。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>App Code *</Label>
            <Input
              value={form.appCode}
              onChange={(event) => setField('appCode', event.target.value)}
              placeholder="例如: my_app"
              disabled={!isCreateMode}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {isCreateMode
                ? '只支持英文、数字和下划线。这个字段会进入 URL、接口 path 和系统内部标识。'
                : '应用创建后不再修改 App Code，避免影响 URL、回调和安装接入。'}
            </p>
          </div>

          <div>
            <Label>名称 *</Label>
            <Input
              value={form.name}
              onChange={(event) => setField('name', event.target.value)}
              placeholder="应用名称"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>一句话简介</Label>
              <span className="text-xs text-muted-foreground">{form.tagline.length}/200</span>
            </div>
            <Input
              value={form.tagline}
              onChange={(event) => {
                if (event.target.value.length <= 200) {
                  setField('tagline', event.target.value);
                }
              }}
              placeholder="简短的应用描述"
              maxLength={200}
            />
          </div>

          <div>
            <Label>分类</Label>
            <Input
              value={form.category}
              onChange={(event) => setField('category', event.target.value)}
              placeholder="如: productivity, dev_tools"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>类型</Label>
              <Input
                value={form.type}
                onChange={(event) => setField('type', event.target.value)}
                placeholder="如: chrome_extension, web_app, service, saas"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                应用类型只作为分类标签使用，不参与授权、部署或交付方式判断。
              </p>
            </div>
            <div>
              <Label>交付方式</Label>
              <Select
                value={form.deliveryMode}
                onValueChange={(value) => setField('deliveryMode', value as FormState['deliveryMode'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">免部署</SelectItem>
                  <SelectItem value="one_click">一键部署</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                这里决定是否显示交付配置 Tab，以及是否进入部署流程；与应用类型无关。
              </p>
            </div>
            <div>
              <Label>状态</Label>
              <Select value={form.status} onValueChange={(value) => setField('status', value as FormState['status'])}>
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
                onChange={(event) => setField('iconUrl', event.target.value)}
                placeholder="https://..."
              />
              {form.iconUrl ? (
                <img
                  src={form.iconUrl}
                  alt="icon"
                  className="h-10 w-10 shrink-0 rounded-lg border object-cover"
                  onError={(event) => {
                    (event.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : null}
            </div>
          </div>

          <div>
            <Label>封面图 URL</Label>
            <Input
              value={form.coverUrl}
              onChange={(event) => setField('coverUrl', event.target.value)}
              placeholder="https://..."
            />
            {form.coverUrl ? (
              <img
                src={form.coverUrl}
                alt="cover"
                className="mt-2 h-32 w-full rounded-xl border object-cover"
                onError={(event) => {
                  (event.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : null}
          </div>
        </CardContent>
      </Card>

      <AppEditSaveBar
        title={isCreateMode ? '创建应用' : '保存基本信息'}
        description={
          isCreateMode
            ? '先创建应用基础记录，后续功能、套餐、Offer 会一起保存。'
            : '保存后会同步名称、分类、状态以及封面素材。'
        }
        isSaving={isSaving}
        disabled={saveDisabled}
        onSave={onSave}
      />
    </TabsContent>
  );
}
