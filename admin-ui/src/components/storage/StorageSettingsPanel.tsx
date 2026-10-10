import { STORAGE_FIELDS } from '@/components/settings/integration-definitions';
import { RotateSecretsButton } from '@/components/settings/RotateSecretsButton';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  storageSettingsSchema,
  type StorageSettingsOverview,
  type StorageSettings,
} from '@lingcoo/contracts';
import { getStorageSettings, saveStorageSettings, testStorageSettings } from '@/api/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IntegrationFields, IntegrationHeader } from '@/components/settings/IntegrationFields';
export function StorageSettingsPanel() {
  const query = useQuery({ queryKey: ['storage-settings'], queryFn: getStorageSettings });
  if (query.isPending) return <p role="status">加载文件存储设置…</p>;
  if (query.error) return <p role="alert">{query.error.message}</p>;
  return query.data ? (
    <SettingsForm key={JSON.stringify(query.data)} overview={query.data} />
  ) : null;
}
function SettingsForm({ overview }: { overview: StorageSettingsOverview }) {
  const qc = useQueryClient();
  const [values, setValues] = useState<StorageSettings>({
    ...overview.values,
    provider: overview.values.provider ?? 's3',
    accessKey: '',
    secretKey: '',
  });
  const dirty =
    JSON.stringify({ ...values, accessKey: undefined, secretKey: undefined }) !==
      JSON.stringify({
        ...overview.values,
        provider: overview.values.provider ?? 's3',
        accessKey: undefined,
        secretKey: undefined,
      }) || Boolean(values.accessKey || values.secretKey);
  const mutation = useMutation({
    mutationFn: async (action: 'save' | 'test') => {
      const parsed = storageSettingsSchema.safeParse(values);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || '请检查配置');
      return action === 'save'
        ? saveStorageSettings(parsed.data)
        : testStorageSettings(parsed.data);
    },
    onSuccess: async (_, action) => {
      toast.success(
        action === 'save' ? '文件存储配置已保存' : '存储连接成功；请再上传一个小文件验证读写权限',
      );
      if (action === 'save') await qc.invalidateQueries({ queryKey: ['storage-settings'] });
    },
    onError: (e) => toast.error(e.message),
  });
  const count = STORAGE_FIELDS.filter((f) =>
    f.control === 'secret'
      ? overview.secrets[f.key as 'accessKey' | 'secretKey'].configured
      : typeof overview.values[f.key as keyof typeof overview.values] === 'boolean' ||
        Boolean(overview.values[f.key as keyof typeof overview.values]),
  ).length;
  return (
    <section className="space-y-5 p-6">
      <IntegrationHeader
        title="文件存储"
        description="营销素材文件存储；七牛云 Kodo 通过 S3-compatible 参数接入。"
        count={count}
      >
        <RotateSecretsButton disabled={dirty || mutation.isPending} />
      </IntegrationHeader>
      {overview.source === 'legacy' && (
        <p role="status" className="text-sm text-amber-700">
          原七牛配置待补充 S3 区域与服务地址，请核实后测试连接。
        </p>
      )}
      <IntegrationFields
        prefix="storage"
        fields={STORAGE_FIELDS}
        values={values}
        source={overview.source}
        secrets={{
          accessKey: overview.secrets.accessKey.configured,
          secretKey: overview.secrets.secretKey.configured,
        }}
        disabled={mutation.isPending}
        onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
      />
      <p className="text-sm leading-6 text-muted-foreground">
        {values.provider === 'local'
          ? '本地磁盘使用 API 与 Worker 共享的持久化目录，S3 参数保留但不参与本地读写；请将该目录纳入备份。'
          : '私有素材必须使用私有空间；平台可见性不会改变存储服务的直链或 CDN 访问权限。上传目录只影响新文件。'}
      </p>
      <details className="text-sm text-muted-foreground">
        <summary className="cursor-pointer">兼容设置 · 公开文件 CDN 地址（可选）</summary>
        <div className="mt-3 space-y-2">
          <Label htmlFor="storage-publicBaseUrl">公开文件 CDN 地址（可选）</Label>
          <Input
            id="storage-publicBaseUrl"
            type="url"
            value={values.publicBaseUrl}
            disabled={mutation.isPending}
            placeholder="留空时由应用受控地址提供文件"
            onChange={(e) => setValues((v) => ({ ...v, publicBaseUrl: e.target.value }))}
          />
          <p>保留既有配置。填写前须确认域名能读取公开素材；本地驱动不使用此地址。</p>
        </div>
      </details>
      <div className="flex flex-wrap gap-3">
        <Button disabled={!dirty || mutation.isPending} onClick={() => mutation.mutate('save')}>
          保存配置
        </Button>
        <Button
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate('test')}
        >
          测试存储连接
        </Button>
        <Button variant="outline" asChild>
          <Link to="/admin/storage">管理营销素材</Link>
        </Button>
      </div>
    </section>
  );
}
