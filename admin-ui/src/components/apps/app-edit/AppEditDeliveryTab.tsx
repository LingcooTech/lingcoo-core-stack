import { Shield, Trash2 } from 'lucide-react';

import { AppEditSaveBar } from '@/components/apps/app-edit/AppEditSaveBar';
import { StatusPill } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TabsContent } from '@/components/ui/tabs';
import {
  computeDeliveryConfigured,
  getManifestAssetGroups,
  getManifestFieldGroups,
  getManifestFields,
  type DeliveryManifest,
  type DeliveryManifestAsset,
  type DeliveryManifestField,
  type DeliveryManifestSourceDraft,
  type DeliverySecretState,
  type DeliverySettingsDraft,
} from '@/lib/app-delivery';

interface AppEditDeliveryTabProps {
  appCode: string;
  isCreateMode: boolean;
  manifest: DeliveryManifest | null;
  deliverySettings: DeliverySettingsDraft;
  deliverySecrets: DeliverySecretState;
  manifestSource: DeliveryManifestSourceDraft;
  updateValueField: (key: string, value: string | boolean) => void;
  updateSecretField: (key: string, value: string) => void;
  updateManifestField: <K extends keyof DeliveryManifestSourceDraft>(
    key: K,
    value: DeliveryManifestSourceDraft[K],
  ) => void;
  hasSyncedManifest: boolean;
  isSyncingManifest: boolean;
  onSyncManifest: () => void;
  onClear: () => void;
  clearDisabled: boolean;
  isSaving: boolean;
  saveDisabled: boolean;
  onSave: () => void;
}

function hasOwnValue(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function getTextFieldValue(draft: DeliverySettingsDraft, field: DeliveryManifestField) {
  if (hasOwnValue(draft.values, field.key)) {
    const current = draft.values[field.key];
    return typeof current === 'string' ? current : '';
  }

  return typeof field.defaultValue === 'string' ? field.defaultValue : '';
}

function getBooleanFieldValue(draft: DeliverySettingsDraft, field: DeliveryManifestField) {
  if (hasOwnValue(draft.values, field.key)) {
    return Boolean(draft.values[field.key]);
  }

  return typeof field.defaultValue === 'boolean' ? field.defaultValue : false;
}

function renderPresetField(input: {
  field: DeliveryManifestField;
  deliverySettings: DeliverySettingsDraft;
  deliverySecrets: DeliverySecretState;
  updateValueField: (key: string, value: string | boolean) => void;
  updateSecretField: (key: string, value: string) => void;
}) {
  const { field, deliverySettings, deliverySecrets, updateValueField, updateSecretField } = input;

  if (field.type === 'boolean') {
    return (
      <label
        key={field.key}
        className="flex items-center gap-3 rounded-md border border-border p-3"
      >
        <Checkbox
          checked={getBooleanFieldValue(deliverySettings, field)}
          disabled={!field.editable}
          onCheckedChange={(checked) => updateValueField(field.key, Boolean(checked))}
        />
        <span className="space-y-1">
          <span className="block text-sm font-medium">{field.label}</span>
          {field.description ? (
            <span className="block text-xs text-muted-foreground">{field.description}</span>
          ) : null}
        </span>
      </label>
    );
  }

  if (field.type === 'secret') {
    return (
      <div key={field.key} className="space-y-2">
        <Label>{field.label}</Label>
        <Input
          type="password"
          value={deliverySettings.secrets[field.key] ?? ''}
          disabled={!field.editable}
          onChange={(event) => updateSecretField(field.key, event.target.value)}
          placeholder={
            deliverySecrets[field.key] ? '已保存，留空保持不变' : field.placeholder ?? '当前未保存'
          }
        />
        {field.description ? (
          <p className="text-xs text-muted-foreground">{field.description}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div key={field.key} className="space-y-2">
      <Label>{field.label}</Label>
      <Input
        type={field.type === 'email' ? 'email' : 'text'}
        value={getTextFieldValue(deliverySettings, field)}
        disabled={!field.editable}
        onChange={(event) => updateValueField(field.key, event.target.value)}
        placeholder={field.placeholder}
      />
      {field.description ? (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      ) : null}
    </div>
  );
}

const ASSET_TYPE_LABELS: Record<DeliveryManifestAsset['type'], string> = {
  github_release: 'GitHub Release',
  docker_image: 'Docker Image',
  qiniu_object: '七牛云对象',
  http_file: 'HTTP 文件',
  custom: '自定义资产',
};

function renderAssetMeta(asset: DeliveryManifestAsset) {
  const items = [
    asset.repo ? `Repo: ${asset.repo}` : null,
    asset.file ? `File: ${asset.file}` : null,
    asset.imageEnv ? `Image Env: ${asset.imageEnv}` : null,
    asset.tagEnv ? `Tag Env: ${asset.tagEnv}` : null,
    asset.urlEnv ? `URL Env: ${asset.urlEnv}` : null,
    asset.authSecret ? `Auth: ${asset.authSecret}` : null,
    asset.checksumEnv ? `Checksum Env: ${asset.checksumEnv}` : null,
  ].filter(Boolean);

  return items.length > 0 ? items.join(' · ') : '该资产未声明额外定位信息。';
}

export function AppEditDeliveryTab({
  appCode,
  isCreateMode,
  manifest,
  deliverySettings,
  deliverySecrets,
  manifestSource,
  updateValueField,
  updateSecretField,
  updateManifestField,
  hasSyncedManifest,
  isSyncingManifest,
  onSyncManifest,
  onClear,
  clearDisabled,
  isSaving,
  saveDisabled,
  onSave,
}: AppEditDeliveryTabProps) {
  const configured = computeDeliveryConfigured(manifest, deliverySettings, deliverySecrets);
  const presetGroups = getManifestFieldGroups(manifest, 'preset');
  const userInputGroups = getManifestFieldGroups(manifest, 'user_input');
  const assetGroups = getManifestAssetGroups(manifest);
  const presetSecretFields = getManifestFields(manifest, 'preset').filter(
    (field) => field.type === 'secret',
  );

  return (
    <TabsContent value="delivery" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>交付配置</CardTitle>
          <CardDescription>
            应用后台只维护 manifest 中声明为 `preset` 的字段。`user_input` 字段会在终端用户创建部署时填写。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill
              tone={configured ? 'ok' : 'neutral'}
              label={configured ? '交付配置完整' : '配置未完成'}
            />
            {presetSecretFields.map((field) => (
              <StatusPill
                key={field.key}
                tone={deliverySecrets[field.key] ? 'ok' : 'neutral'}
                label={`${field.label}: ${deliverySecrets[field.key] ? '已保存' : '未保存'}`}
              />
            ))}
          </div>

          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-start gap-3">
              <Shield className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-semibold">
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
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base">交付 Manifest</CardTitle>
                  <CardDescription>
                    从仓库同步 `fd-delivery.manifest.json` 到应用 meta，并把新的 preset 默认值合并进交付配置；已保存的密钥会保留。
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onSyncManifest}
                  disabled={
                    isCreateMode ||
                    isSyncingManifest ||
                    (!manifestSource.repoUrl.trim() && !manifestSource.manifestUrl.trim())
                  }
                >
                  {isSyncingManifest ? '同步中...' : '同步 Manifest'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>仓库 URL</Label>
                  <Input
                    value={manifestSource.repoUrl}
                    onChange={(event) => updateManifestField('repoUrl', event.target.value)}
                    placeholder="https://github.com/FutureDecade/fd-retail-system.git"
                  />
                </div>
                <div>
                  <Label>仓库分支</Label>
                  <Input
                    value={manifestSource.repoBranch}
                    onChange={(event) => updateManifestField('repoBranch', event.target.value)}
                    placeholder="main"
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Manifest Path</Label>
                  <Input
                    value={manifestSource.manifestPath}
                    onChange={(event) => updateManifestField('manifestPath', event.target.value)}
                    placeholder="fd-delivery.manifest.json"
                  />
                </div>
                <div>
                  <Label>Manifest URL（可选）</Label>
                  <Input
                    value={manifestSource.manifestUrl}
                    onChange={(event) => updateManifestField('manifestUrl', event.target.value)}
                    placeholder="https://raw.githubusercontent.com/..."
                  />
                </div>
              </div>
              <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                {isCreateMode
                  ? '请先保存应用，再同步 delivery manifest。'
                  : hasSyncedManifest
                    ? '当前已存在同步后的 deliveryManifest。再次同步会刷新插件 release tag 等默认预设，不需要先清空交付配置。'
                    : '当前尚未同步 deliveryManifest。'}
              </div>
            </CardContent>
          </Card>

          {manifest ? (
            <>
              <Card className="border-dashed">
                <CardHeader>
                  <CardTitle className="text-base">安装器信息</CardTitle>
                  <CardDescription>这些值直接来自 manifest 的 installer 段，不在后台单独硬编码。</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>仓库 URL</Label>
                    <Input value={manifest.installer.repoUrl} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>仓库分支</Label>
                    <Input value={manifest.installer.repoBranch} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>安装路径</Label>
                    <Input value={manifest.installer.installPath} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>远程安装脚本</Label>
                    <Input value={manifest.installer.remoteInstallScriptUrl} disabled />
                  </div>
                </CardContent>
              </Card>

              {presetGroups.length > 0 ? (
                presetGroups.map((group) => (
                  <Card key={group.key} className="border-dashed">
                    <CardHeader>
                      <CardTitle className="text-base">{group.label}</CardTitle>
                      <CardDescription>
                        {group.description ?? '这些字段会作为预设值注入 bootstrap。'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2">
                      {group.fields.map((field) =>
                        renderPresetField({
                          field,
                          deliverySettings,
                          deliverySecrets,
                          updateValueField,
                          updateSecretField,
                        }),
                      )}
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="border-dashed">
                  <CardHeader>
                    <CardTitle className="text-base">预设字段</CardTitle>
                    <CardDescription>
                      当前 manifest 没有声明任何 `preset` 字段，后台无需维护额外交付值。
                    </CardDescription>
                  </CardHeader>
                </Card>
              )}

              {assetGroups.length > 0 ? (
                assetGroups.map((group) => (
                  <Card key={`assets-${group.key}`} className="border-dashed">
                    <CardHeader>
                      <CardTitle className="text-base">{group.label}资产</CardTitle>
                      <CardDescription>
                        {group.description ??
                          'manifest 声明的交付资产；中台据此识别公开/私有资产和所需凭据。'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2">
                      {group.assets.map((asset) => (
                        <div key={asset.key} className="rounded-lg border bg-muted/20 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">{asset.label}</p>
                            <StatusPill
                              tone={asset.visibility === 'private' ? 'warn' : 'ok'}
                              label={asset.visibility === 'private' ? '私有资产' : '公开资产'}
                            />
                            <StatusPill
                              tone={asset.required ? 'ok' : 'neutral'}
                              label={asset.required ? '必需' : '可选'}
                            />
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {ASSET_TYPE_LABELS[asset.type]} · {renderAssetMeta(asset)}
                          </p>
                          {asset.description ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              {asset.description}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))
              ) : null}

              <Card className="border-dashed">
                <CardHeader>
                  <CardTitle className="text-base">终端用户部署输入</CardTitle>
                  <CardDescription>
                    下面这些字段不会在后台这里填写，用户在购买后创建部署记录时自行输入。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {manifest.domainSlots.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-3">
                      {manifest.domainSlots.map((slot) => (
                        <div key={slot.key} className="rounded-md border bg-muted/30 p-3">
                          <p className="text-sm font-bold">{slot.label}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{slot.envKey}</p>
                          {slot.description ? (
                            <p className="mt-2 text-xs text-muted-foreground">{slot.description}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {userInputGroups.length > 0 ? (
                    userInputGroups.map((group) => (
                      <div key={group.key} className="space-y-2 rounded-md border bg-muted/20 p-4">
                        <div>
                          <p className="text-sm font-bold">{group.label}</p>
                          {group.description ? (
                            <p className="text-xs text-muted-foreground">{group.description}</p>
                          ) : null}
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          {group.fields.map((field) => (
                            <div key={field.key} className="rounded-lg border bg-background p-3">
                              <p className="text-sm font-medium">{field.label}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{field.key}</p>
                              <p className="mt-2 text-xs text-muted-foreground">
                                {field.type === 'secret'
                                  ? '密钥字段'
                                  : field.type === 'boolean'
                                    ? '布尔开关'
                                    : field.type === 'email'
                                      ? '邮箱字段'
                                      : '文本字段'}
                                {field.required ? ' · 必填' : ' · 可选'}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      当前 manifest 没有额外的 `user_input` 字段。
                    </p>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="text-base">Manifest 未同步</CardTitle>
                <CardDescription>
                  当前应用还没有 `deliveryManifest`。同步之后，后台和用户部署页才会按 manifest 自动渲染。
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={onClear} disabled={clearDisabled}>
              <Trash2 className="h-4 w-4" />
              清空交付配置与密钥
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
