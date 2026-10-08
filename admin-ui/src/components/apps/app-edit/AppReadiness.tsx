import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function AppReadiness({ appCode }: { appCode?: string }) {
  const query = useQuery({
    queryKey: ['app-readiness', appCode],
    enabled: Boolean(appCode),
    queryFn: () =>
      apiClient(
        'GET /v1/admin/apps/:appCode/readiness',
        `/v1/admin/apps/${encodeURIComponent(appCode!)}/readiness`,
      ),
  });
  return (
    <section className="mb-6 rounded-xl border bg-card p-5" aria-label="发布前检查">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">发布前检查</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            先保存草稿并配置交付，再启用应用。检查结果仅针对已保存的配置。
          </p>
        </div>
        {appCode && (
          <Button
            type="button"
            variant="outline"
            disabled={query.isFetching}
            onClick={() => {
              void query.refetch();
            }}
          >
            重新检查
          </Button>
        )}
      </div>
      {!appCode ? (
        <p className="mt-3 text-sm">创建草稿后可查看检查结果。</p>
      ) : query.isPending ? (
        <p className="mt-3 text-sm">正在检查…</p>
      ) : query.isError ? (
        <p className="mt-3 text-sm text-destructive">检查失败，请重试。</p>
      ) : (
        <>
          <div className="mt-4">
            <Badge variant={query.data.configurationReady ? 'secondary' : 'destructive'}>
              {query.data.configurationReady ? '配置检查通过' : '发布配置待补齐'}
            </Badge>
            <p className="mt-2 text-sm text-muted-foreground">
              配置通过后仍需完成镜像拉取、实际交付和真实支付等在线验收。
            </p>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium">查看检查明细</summary>
            <ul className="mt-3 divide-y">
              {query.data.checks.map((check) => (
                <li key={check.code} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{check.title}</span>
                    <Badge variant={check.status === 'blocked' ? 'destructive' : 'outline'}>
                      {check.status === 'passed'
                        ? '通过'
                        : check.status === 'blocked'
                          ? '需补齐'
                          : '待在线验收'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{check.detail}</p>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
