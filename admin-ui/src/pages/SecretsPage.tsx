import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Eye, EyeOff, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { createAppSecret, listAppsAdmin, revokeAppSecret } from '@/api/apps';
import { ConfirmActionDialog } from '@/components/shared/ConfirmActionDialog';
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
import { formatTime } from '@/lib/utils';

export function SecretsPage() {
  const qc = useQueryClient();
  const [secretResult, setSecretResult] = useState<{ secret: string; secretId: string; appCode: string } | null>(null);
  const [secretVisible, setSecretVisible] = useState(false);
  const [secretAppCode, setSecretAppCode] = useState('');
  const [secretExpiresAt, setSecretExpiresAt] = useState('');
  const [pendingRevoke, setPendingRevoke] = useState<{ appCode: string; secretId: string; hint: string } | null>(null);

  const { data: appsData } = useQuery({ queryKey: ['apps'], queryFn: listAppsAdmin });
  const apps = appsData?.items ?? [];

  const secretMutation = useMutation({
    mutationFn: ({ appCode, expiresAt }: { appCode: string; expiresAt?: string }) =>
      createAppSecret(appCode, expiresAt || undefined),
    onSuccess: (result) => {
      toast.success('App Secret 已生成，请立即保存');
      setSecretResult({ secret: result.secret, secretId: result.secretId, appCode: result.appCode });
      setSecretAppCode('');
      setSecretExpiresAt('');
      void qc.invalidateQueries({ queryKey: ['apps'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '生成失败')
  });

  const revokeMutation = useMutation({
    mutationFn: ({ appCode, secretId }: { appCode: string; secretId: string }) => revokeAppSecret(appCode, secretId),
    onSuccess: () => {
      toast.success('Secret 已撤销');
      void qc.invalidateQueries({ queryKey: ['apps'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '撤销失败')
  });

  return (
    <div>
      <div className="p-6">
        <h1 className="text-2xl font-black tracking-tight">应用密钥</h1>
        <p className="text-sm text-muted-foreground mt-1">生成和管理应用 API 密钥</p>
      </div>
      <div className="p-6 pt-0">
        <div className="max-w-xl space-y-6">
          <div className="rounded-2xl border border-border bg-white p-5">
            <h3 className="mb-4 text-sm font-black">生成 App Secret</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-bold">选择应用</label>
                <Select value={secretAppCode} onValueChange={setSecretAppCode}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择应用..." />
                  </SelectTrigger>
                  <SelectContent>
                    {apps.map((app) => (
                      <SelectItem key={app.code} value={app.code}>
                        {app.name} ({app.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                {secretMutation.isPending ? '生成中...' : '一键生成 Secret'}
              </Button>
            </div>
          </div>

          {apps.filter((app) => (app.secrets?.length ?? 0) > 0).map((app) => (
            <div key={app.code} className="overflow-hidden rounded-2xl border border-border bg-white">
              <div className="border-b border-border bg-muted/30 px-4 py-3">
                <p className="text-sm font-black">{app.name}</p>
                <p className="text-xs font-mono text-muted-foreground">{app.code}</p>
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
                    onClick={() => setPendingRevoke({ appCode: app.code, secretId: secret.id, hint: secret.hint })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <Dialog open={!!secretResult} onOpenChange={(open) => { if (!open) setSecretResult(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Secret 已生成</DialogTitle>
            <DialogDescription>此 Secret 只显示一次，请立即复制保存。关闭后将无法再次查看。</DialogDescription>
          </DialogHeader>
          {secretResult && (
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs">
                <p className="mb-1 font-black text-amber-800">appCode: {secretResult.appCode}</p>
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

      <ConfirmActionDialog
        open={!!pendingRevoke}
        onOpenChange={(open) => {
          if (!open) setPendingRevoke(null);
        }}
        title="确认撤销 Secret？"
        description={pendingRevoke ? `Secret ${pendingRevoke.hint} 撤销后将立即失效。` : undefined}
        confirmText="撤销 Secret"
        isConfirming={revokeMutation.isPending}
        onConfirm={() => {
          if (!pendingRevoke) return;
          const target = pendingRevoke;
          setPendingRevoke(null);
          revokeMutation.mutate({ appCode: target.appCode, secretId: target.secretId });
        }}
      />
    </div>
  );
}
