import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Eye, EyeOff, Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { createAppSecret, listAppsAdmin, revokeAppSecret } from '@/api/apps';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCatalogData } from '@/hooks/useCatalogData';
import { getPrimaryAppForProduct, productNeedsDedicatedProfile } from '@/lib/product-model';
import { formatTime } from '@/lib/utils';

export function SecretsPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [secretResult, setSecretResult] = useState<{ secret: string; secretId: string; appCode: string } | null>(null);
  const [secretVisible, setSecretVisible] = useState(false);
  const [selectedProductCode, setSelectedProductCode] = useState('');
  const [secretExpiresAt, setSecretExpiresAt] = useState('');

  const { data: appsData } = useQuery({ queryKey: ['apps'], queryFn: listAppsAdmin });
  const { products } = useCatalogData();
  const apps = appsData?.items ?? [];
  const productOptions = products
    .map((product) => ({
      product,
      primaryApp: getPrimaryAppForProduct(product.code, apps)
    }))
    .filter((entry) => entry.primaryApp);
  const selectedProduct = productOptions.find((entry) => entry.product.code === selectedProductCode) ?? null;
  const needsDedicatedProfile = productNeedsDedicatedProfile(selectedProductCode, selectedProduct?.primaryApp ?? null);
  const secretAppCode = needsDedicatedProfile ? '' : selectedProduct?.primaryApp?.code ?? '';

  useEffect(() => {
    const preset = searchParams.get('productCode')?.trim();
    if (preset && productOptions.some((entry) => entry.product.code === preset)) {
      setSelectedProductCode((current) => current || preset);
      return;
    }

    if (!selectedProductCode && productOptions[0]?.product.code) {
      setSelectedProductCode(productOptions[0].product.code);
    }
  }, [productOptions, searchParams, selectedProductCode]);

  const secretMutation = useMutation({
    mutationFn: ({ appCode, expiresAt }: { appCode: string; expiresAt?: string }) =>
      createAppSecret(appCode, expiresAt || undefined),
    onSuccess: (result) => {
      toast.success('产品接入密钥已生成，请立即保存');
      setSecretResult({ secret: result.secret, secretId: result.secretId, appCode: result.appCode });
      setSecretExpiresAt('');
      void qc.invalidateQueries({ queryKey: ['apps'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '生成失败')
  });

  const revokeMutation = useMutation({
    mutationFn: ({ appCode, secretId }: { appCode: string; secretId: string }) => revokeAppSecret(appCode, secretId),
    onSuccess: () => {
      toast.success('产品接入密钥已撤销');
      void qc.invalidateQueries({ queryKey: ['apps'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '撤销失败')
  });

  return (
    <div>
      <div className="p-6">
        <h1 className="text-2xl font-black tracking-tight">产品接入密钥</h1>
        <p className="mt-1 text-sm text-muted-foreground">为需要主动接入中台 API 的产品生成和管理密钥</p>
      </div>
      <div className="p-6 pt-0">
        <div className="max-w-xl space-y-6">
          <div className="rounded-2xl border border-border bg-white p-5">
            <h3 className="mb-4 text-sm font-black">生成产品密钥</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-bold">选择产品</label>
                <Select value={selectedProductCode} onValueChange={setSelectedProductCode}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择产品..." />
                  </SelectTrigger>
                  <SelectContent>
                    {productOptions.map((entry) => (
                      <SelectItem key={entry.product.code} value={entry.product.code}>
                        {entry.product.name} ({entry.product.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-2 text-xs text-muted-foreground">
                  {needsDedicatedProfile
                    ? `当前产品仍在复用共享内部档案 ${selectedProduct?.primaryApp?.code}。请先回到产品工作台保存一次，生成专属档案后再创建密钥。`
                    : '底层仍通过内部产品档案保存密钥，但后台入口已统一为产品维度。'}
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-bold">过期时间（留空永不过期）</label>
                <Input type="datetime-local" value={secretExpiresAt} onChange={(event) => setSecretExpiresAt(event.target.value)} />
              </div>
              <Button
                disabled={!secretAppCode || secretMutation.isPending}
                onClick={() =>
                  secretMutation.mutate({
                    appCode: secretAppCode,
                    expiresAt: secretExpiresAt ? new Date(secretExpiresAt).toISOString() : undefined
                  })
                }
              >
                {secretMutation.isPending ? '生成中...' : '一键生成产品密钥'}
              </Button>
            </div>
          </div>

          {productOptions
            .filter((entry) => (entry.primaryApp?.secrets?.length ?? 0) > 0)
            .map((entry) => {
              const app = entry.primaryApp!;

              return (
                <div key={entry.product.code} className="overflow-hidden rounded-2xl border border-border bg-white">
                  <div className="border-b border-border bg-muted/30 px-4 py-3">
                    <p className="text-sm font-black">{entry.product.name}</p>
                    <p className="text-xs font-mono text-muted-foreground">{entry.product.code} · profile {app.code}</p>
                  </div>
                  {app.secrets?.map((secret) => (
                    <div key={secret.id} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0">
                      <div className="min-w-0">
                        <p className="text-xs font-mono text-foreground">{secret.hint}</p>
                        <p className="text-xs text-muted-foreground">{formatTime(secret.expiresAt)}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => {
                          if (confirm(`确认撤销密钥 ${secret.hint}？`)) {
                            revokeMutation.mutate({ appCode: app.code, secretId: secret.id });
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              );
            })}
        </div>
      </div>

      <Dialog open={!!secretResult} onOpenChange={(open) => { if (!open) setSecretResult(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>产品密钥已生成</DialogTitle>
            <DialogDescription>此密钥只显示一次，请立即复制保存。关闭后将无法再次查看。</DialogDescription>
          </DialogHeader>
          {secretResult && (
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs">
                <p className="mb-1 font-black text-amber-800">profileCode: {secretResult.appCode}</p>
                <p className="mb-1 font-black text-amber-800">secretId: {secretResult.secretId}</p>
              </div>
              <div className="relative">
                <div className="break-all rounded-xl bg-slate-950 p-3 pr-16 font-mono text-xs text-green-400">
                  {secretVisible ? secretResult.secret : '\u2022'.repeat(Math.min(secretResult.secret.length, 40))}
                </div>
                <div className="absolute right-2 top-1/2 flex -translate-y-1/2 gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-white" onClick={() => setSecretVisible((value) => !value)}>
                    {secretVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-slate-400 hover:text-white"
                    onClick={() => {
                      void navigator.clipboard.writeText(secretResult.secret);
                      toast.success('已复制到剪贴板');
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
