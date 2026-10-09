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
    accessKey: '',
    secretKey: '',
  });
  const [dirty, setDirty] = useState(false);
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
        action === 'save' ? 'S3 存储配置已保存' : '存储连接成功；请再上传一个小文件验证读写权限',
      );
      if (action === 'save') await qc.invalidateQueries({ queryKey: ['storage-settings'] });
    },
    onError: (e) => toast.error(e.message),
  });
  const field = (key: keyof StorageSettings, label: string, placeholder = '', secret = false) => (
    <div className="space-y-2">
      <Label htmlFor={`storage-${key}`}>{label}</Label>
      <Input
        id={`storage-${key}`}
        type={secret ? 'password' : 'text'}
        autoComplete="off"
        value={String(values[key] ?? '')}
        placeholder={placeholder}
        onChange={(e) => {
          setValues((v) => ({ ...v, [key]: e.target.value }));
          setDirty(true);
        }}
      />
    </div>
  );
  return (
    <section className="space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold">文件存储 · S3 兼容</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          七牛云 Kodo 通过 S3 接口接入，也可配置其他 S3 兼容服务。
          {overview.configured ? '当前已配置。' : '当前尚未配置完成。'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          配置来源：
          {
            {
              database: '后台设置',
              env: '环境变量',
              legacy: '原七牛配置（待补充 S3 区域与服务地址）',
              none: '未配置',
            }[overview.source]
          }
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {field('region', '存储区域', '例如 cn-east-1')}
        {field('endpoint', 'S3 服务地址', '例如 https://s3.cn-east-1.qiniucs.com')}
        {field('bucket', 'S3 空间名称', '以七牛空间概览中的 S3 空间名为准')}
        {field('defaultPrefix', '默认上传目录', 'stack/assets')}
        {field(
          'accessKey',
          '访问密钥 AK',
          overview.secrets.accessKey.configured ? '已配置，留空保留原值' : '请输入 AK',
          true,
        )}
        {field(
          'secretKey',
          '访问密钥 SK',
          overview.secrets.secretKey.configured ? '已配置，留空保留原值' : '请输入 SK',
          true,
        )}
        {field('publicBaseUrl', '公开文件 CDN 地址（可选）', '留空时由应用受控地址提供文件')}
      </div>
      <Label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={values.forcePathStyle}
          onChange={(e) => {
            setValues((v) => ({ ...v, forcePathStyle: e.target.checked }));
            setDirty(true);
          }}
        />
        强制路径寻址（七牛通常关闭，MinIO 按服务要求设置）
      </Label>
      <p className="text-sm text-muted-foreground">
        私有素材必须使用私有空间；沿用公开空间时，平台可见性不会改变存储服务的直链访问权限。 填写
        CDN 地址前，请确认该域名能读取公开素材。上传目录只影响新文件。
      </p>
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
