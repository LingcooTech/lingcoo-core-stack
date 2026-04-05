import { Shield, Trash2 } from 'lucide-react';

import { AppEditSaveBar } from '@/components/apps/app-edit/AppEditSaveBar';
import { StatusPill } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TabsContent } from '@/components/ui/tabs';
import { computeDeliveryConfigured, type DeliverySettingsDraft } from '@/lib/app-delivery';

interface AppEditDeliveryTabProps {
  appCode: string;
  isCreateMode: boolean;
  deliverySettings: DeliverySettingsDraft;
  acrPasswordConfigured: boolean;
  githubTokenConfigured: boolean;
  updateField: <K extends keyof DeliverySettingsDraft>(
    key: K,
    value: DeliverySettingsDraft[K],
  ) => void;
  onClear: () => void;
  clearDisabled: boolean;
  isSaving: boolean;
  saveDisabled: boolean;
  onSave: () => void;
}

export function AppEditDeliveryTab({
  appCode,
  isCreateMode,
  deliverySettings,
  acrPasswordConfigured,
  githubTokenConfigured,
  updateField,
  onClear,
  clearDisabled,
  isSaving,
  saveDisabled,
  onSave,
}: AppEditDeliveryTabProps) {
  const configured = computeDeliveryConfigured(deliverySettings, {
    acrPasswordConfigured,
    githubTokenConfigured,
  });

  return (
    <TabsContent value="delivery" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>交付配置</CardTitle>
          <CardDescription>
            直接维护当前应用的一键部署参数。敏感凭据仍通过加密设置存储，不会写进应用表。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={configured ? 'ok' : 'neutral'} label={configured ? '交付配置完整' : '配置未完成'} />
            <StatusPill
              tone={acrPasswordConfigured ? 'ok' : 'neutral'}
              label={`ACR 密码: ${acrPasswordConfigured ? '已保存' : '未保存'}`}
            />
            <StatusPill
              tone={githubTokenConfigured ? 'ok' : 'neutral'}
              label={`GitHub Token: ${githubTokenConfigured ? '已保存' : '未保存'}`}
            />
          </div>

          <div className="rounded-2xl border bg-muted/30 p-4">
            <div className="flex items-start gap-3">
              <Shield className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-black">
                  {isCreateMode ? '首次保存会先创建应用，再写入交付配置。' : `当前应用: ${appCode}`}
                </p>
                <p className="text-sm text-muted-foreground">
                  选择“免部署”后这里会被隐藏，部署入口也不会再显示该应用。已保存的密钥不会被自动删除。
                </p>
              </div>
            </div>
          </div>

          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">仓库与镜像</CardTitle>
              <CardDescription>这些值会进入远程安装 bootstrap 结果，供一键部署脚本直接使用。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>交付仓库 URL</Label>
                <Input
                  value={deliverySettings.repoUrl}
                  onChange={(event) => updateField('repoUrl', event.target.value)}
                  placeholder="https://github.com/..."
                />
              </div>
              <div>
                <Label>交付仓库分支</Label>
                <Input
                  value={deliverySettings.repoBranch}
                  onChange={(event) => updateField('repoBranch', event.target.value)}
                  placeholder="main"
                />
              </div>
              <div>
                <Label>Frontend Image</Label>
                <Input
                  value={deliverySettings.frontendImage}
                  onChange={(event) => updateField('frontendImage', event.target.value)}
                  placeholder="registry.example.com/frontend:tag"
                />
              </div>
              <div>
                <Label>WebSocket Image</Label>
                <Input
                  value={deliverySettings.websocketImage}
                  onChange={(event) => updateField('websocketImage', event.target.value)}
                  placeholder="registry.example.com/websocket:tag"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">凭据与证书</CardTitle>
              <CardDescription>这些值不会暴露给用户，只会注入部署 bootstrap 和安装器。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>ACR 用户名</Label>
                <Input
                  value={deliverySettings.acrUsername}
                  onChange={(event) => updateField('acrUsername', event.target.value)}
                  placeholder="futuredecade"
                />
              </div>
              <div>
                <Label>证书通知邮箱</Label>
                <Input
                  value={deliverySettings.letsencryptEmail}
                  onChange={(event) => updateField('letsencryptEmail', event.target.value)}
                  placeholder="ops@example.com"
                />
              </div>
              <div>
                <Label>ACR 密码</Label>
                <Input
                  type="password"
                  value={deliverySettings.acrPassword}
                  onChange={(event) => updateField('acrPassword', event.target.value)}
                  placeholder={acrPasswordConfigured ? '已保存，留空保持不变' : '当前未保存'}
                />
              </div>
              <div>
                <Label>GitHub Token</Label>
                <Input
                  type="password"
                  value={deliverySettings.githubToken}
                  onChange={(event) => updateField('githubToken', event.target.value)}
                  placeholder={githubTokenConfigured ? '已保存，留空保持不变' : '当前未保存'}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">版本与初始化</CardTitle>
              <CardDescription>定义远程安装时的默认 release 版本和首次安装行为。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Release Owner</Label>
                  <Input
                    value={deliverySettings.wordpressReleaseOwner}
                    onChange={(event) => updateField('wordpressReleaseOwner', event.target.value)}
                    placeholder="FutureDecade"
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex items-center gap-3 rounded-xl border border-border p-3">
                    <Checkbox
                      checked={deliverySettings.wordpressFetchReleaseAssets}
                      onCheckedChange={(checked) =>
                        updateField('wordpressFetchReleaseAssets', Boolean(checked))
                      }
                    />
                    <span className="text-sm font-medium">自动拉取 WordPress 资产</span>
                  </label>
                  <label className="flex items-center gap-3 rounded-xl border border-border p-3">
                    <Checkbox
                      checked={deliverySettings.wordpressRunInit}
                      onCheckedChange={(checked) =>
                        updateField('wordpressRunInit', Boolean(checked))
                      }
                    />
                    <span className="text-sm font-medium">自动完成首次安装</span>
                  </label>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>fd-theme</Label>
                  <Input
                    value={deliverySettings.fdThemeReleaseTag}
                    onChange={(event) => updateField('fdThemeReleaseTag', event.target.value)}
                  />
                </div>
                <div>
                  <Label>fd-admin-ui</Label>
                  <Input
                    value={deliverySettings.fdAdminUiReleaseTag}
                    onChange={(event) => updateField('fdAdminUiReleaseTag', event.target.value)}
                  />
                </div>
                <div>
                  <Label>fd-member</Label>
                  <Input
                    value={deliverySettings.fdMemberReleaseTag}
                    onChange={(event) => updateField('fdMemberReleaseTag', event.target.value)}
                  />
                </div>
                <div>
                  <Label>fd-payment</Label>
                  <Input
                    value={deliverySettings.fdPaymentReleaseTag}
                    onChange={(event) => updateField('fdPaymentReleaseTag', event.target.value)}
                  />
                </div>
                <div>
                  <Label>fd-commerce</Label>
                  <Input
                    value={deliverySettings.fdCommerceReleaseTag}
                    onChange={(event) => updateField('fdCommerceReleaseTag', event.target.value)}
                  />
                </div>
                <div>
                  <Label>fd-content-types</Label>
                  <Input
                    value={deliverySettings.fdContentTypesReleaseTag}
                    onChange={(event) => updateField('fdContentTypesReleaseTag', event.target.value)}
                  />
                </div>
                <div>
                  <Label>fd-websocket-push</Label>
                  <Input
                    value={deliverySettings.fdWebsocketPushReleaseTag}
                    onChange={(event) => updateField('fdWebsocketPushReleaseTag', event.target.value)}
                  />
                </div>
                <div>
                  <Label>wp-graphql-jwt-auth</Label>
                  <Input
                    value={deliverySettings.wpgraphqlJwtAuthReleaseTag}
                    onChange={(event) => updateField('wpgraphqlJwtAuthReleaseTag', event.target.value)}
                  />
                </div>
                <div>
                  <Label>wp-graphql-tax-query</Label>
                  <Input
                    value={deliverySettings.wpgraphqlTaxQueryRef}
                    onChange={(event) => updateField('wpgraphqlTaxQueryRef', event.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onClear}
              disabled={clearDisabled}
            >
              <Trash2 className="h-4 w-4" />
              清空交付配置
            </Button>
          </div>
        </CardContent>
      </Card>

      <AppEditSaveBar
        title="保存交付配置"
        description="保存后会更新该应用的一键部署参数和密钥状态。"
        isSaving={isSaving}
        disabled={saveDisabled}
        onSave={onSave}
      />
    </TabsContent>
  );
}
