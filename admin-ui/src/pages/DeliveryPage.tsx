import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { listAppsAdmin } from '@/api/apps';
import { clearDeliverySettings, getDeliverySettings, upsertDeliverySettings } from '@/api/delivery';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const deliverySchema = z.object({
  repoUrl: z.string().min(1),
  repoBranch: z.string().min(1),
  frontendImage: z.string().min(1),
  websocketImage: z.string().min(1),
  letsencryptEmail: z.string().email(),
  acrUsername: z.string(),
  acrPassword: z.string().optional(),
  githubToken: z.string().optional(),
  wordpressFetchReleaseAssets: z.boolean(),
  wordpressRunInit: z.boolean(),
  wordpressReleaseOwner: z.string().min(1),
  fdThemeReleaseTag: z.string().min(1),
  fdAdminUiReleaseTag: z.string().min(1),
  fdMemberReleaseTag: z.string().min(1),
  fdPaymentReleaseTag: z.string().min(1),
  fdCommerceReleaseTag: z.string().min(1),
  fdContentTypesReleaseTag: z.string().min(1),
  fdWebsocketPushReleaseTag: z.string().min(1),
  wpgraphqlJwtAuthReleaseTag: z.string().min(1),
  wpgraphqlTaxQueryRef: z.string().min(1)
});

type DeliveryFormValues = z.infer<typeof deliverySchema>;

export function DeliveryPage() {
  const qc = useQueryClient();
  const appsQuery = useQuery({ queryKey: ['apps'], queryFn: listAppsAdmin });
  const deployableApps = useMemo(
    () => (appsQuery.data?.items ?? []).filter((app) => app.type === 'service' || app.type === 'web_app'),
    [appsQuery.data?.items]
  );
  const [selectedAppCode, setSelectedAppCode] = useState('');

  useEffect(() => {
    if (!selectedAppCode && deployableApps[0]?.code) {
      setSelectedAppCode(deployableApps[0].code);
    }
  }, [deployableApps, selectedAppCode]);

  const settingsQuery = useQuery({
    queryKey: ['delivery-settings', selectedAppCode],
    queryFn: () => getDeliverySettings(selectedAppCode),
    enabled: Boolean(selectedAppCode)
  });

  const form = useForm<DeliveryFormValues>({
    resolver: zodResolver(deliverySchema),
    defaultValues: {
      repoUrl: '',
      repoBranch: 'main',
      frontendImage: '',
      websocketImage: '',
      letsencryptEmail: '',
      acrUsername: '',
      acrPassword: '',
      githubToken: '',
      wordpressFetchReleaseAssets: true,
      wordpressRunInit: true,
      wordpressReleaseOwner: 'FutureDecade',
      fdThemeReleaseTag: 'v1.0.7',
      fdAdminUiReleaseTag: 'v1.3.1',
      fdMemberReleaseTag: 'v1.0.1',
      fdPaymentReleaseTag: 'v1.0.0',
      fdCommerceReleaseTag: 'v1.0.0',
      fdContentTypesReleaseTag: 'v0.1.0',
      fdWebsocketPushReleaseTag: 'v1.0.0',
      wpgraphqlJwtAuthReleaseTag: 'v0.7.2',
      wpgraphqlTaxQueryRef: 'v0.2.0'
    }
  });

  useEffect(() => {
    const settings = settingsQuery.data;
    if (!settings) {
      return;
    }

    form.reset({
      ...settings.values,
      acrPassword: '',
      githubToken: ''
    });
  }, [form, settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (values: DeliveryFormValues) => upsertDeliverySettings(selectedAppCode, values),
    onSuccess: () => {
      toast.success('交付设置已保存');
      void qc.invalidateQueries({ queryKey: ['delivery-settings', selectedAppCode] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '保存失败')
  });

  const clearMutation = useMutation({
    mutationFn: () => clearDeliverySettings(selectedAppCode),
    onSuccess: () => {
      toast.success('交付设置已清空');
      void qc.invalidateQueries({ queryKey: ['delivery-settings', selectedAppCode] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '清空失败')
  });

  const settings = settingsQuery.data;

  return (
    <div>
      <SectionHeader sectionKey="delivery" />
      <div className="space-y-6 p-6">
        <div className="max-w-xl space-y-3">
          <label className="block text-sm font-bold">选择交付应用</label>
          <Select value={selectedAppCode} onValueChange={setSelectedAppCode}>
            <SelectTrigger>
              <SelectValue placeholder="选择系统类应用..." />
            </SelectTrigger>
            <SelectContent>
              {deployableApps.map((app) => (
                <SelectItem key={app.code} value={app.code}>
                  {app.name} ({app.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedAppCode && settings ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-muted/40 p-4">
              <StatusPill tone={settings.configured ? 'ok' : 'neutral'} label={settings.configured ? '交付配置完整' : '配置不完整'} />
              <StatusPill tone={settings.secrets.acrPassword.configured ? 'ok' : 'neutral'} label={`ACR 拉取凭据: ${settings.secrets.acrPassword.configured ? '已配置' : '未配置'}`} />
              <StatusPill tone={settings.secrets.githubToken.configured ? 'ok' : 'neutral'} label={`GitHub Token: ${settings.secrets.githubToken.configured ? '已保存' : '未保存'}`} />
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))} className="space-y-6">
                <section className="space-y-4 rounded-2xl border border-border bg-white p-5">
                  <div>
                    <h3 className="text-sm font-black">仓库与镜像</h3>
                    <p className="mt-1 text-xs text-muted-foreground">这些值会通过 deploy token bootstrap 自动注入安装器，购买用户不需要知道镜像 tag。</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField control={form.control} name="repoUrl" render={({ field }) => (
                      <FormItem>
                        <FormLabel>交付仓库 URL</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="repoBranch" render={({ field }) => (
                      <FormItem>
                        <FormLabel>交付仓库分支</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="frontendImage" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Frontend Image</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="websocketImage" render={({ field }) => (
                      <FormItem>
                        <FormLabel>WebSocket Image</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </section>

                <section className="space-y-4 rounded-2xl border border-border bg-white p-5">
                  <div>
                    <h3 className="text-sm font-black">受控交付凭据</h3>
                    <p className="mt-1 text-xs text-muted-foreground">这些凭据不会直接展示给购买用户。若 Stack 已配置阿里云 ACR 临时凭据签发，这里的 ACR 用户名和密码可留空，静态凭据只作为回退方案。</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField control={form.control} name="acrUsername" render={({ field }) => (
                      <FormItem>
                        <FormLabel>ACR 用户名</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormDescription>启用全局 ACR 临时凭据后可留空。</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="letsencryptEmail" render={({ field }) => (
                      <FormItem>
                        <FormLabel>证书通知邮箱</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="acrPassword" render={({ field }) => (
                      <FormItem>
                        <FormLabel>ACR 密码</FormLabel>
                        <FormControl><Input type="password" placeholder={settings.secrets.acrPassword.configured ? '已保存或已启用临时凭据，留空保持不变' : '当前未保存'} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="githubToken" render={({ field }) => (
                      <FormItem>
                        <FormLabel>GitHub Token</FormLabel>
                        <FormControl><Input type="password" placeholder={settings.secrets.githubToken.configured ? '已保存，留空保持不变' : '当前未保存'} {...field} /></FormControl>
                        <FormDescription>用于拉取私有或限流敏感的 release 资产。</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </section>

                <section className="space-y-4 rounded-2xl border border-border bg-white p-5">
                  <div>
                    <h3 className="text-sm font-black">安装默认项</h3>
                    <p className="mt-1 text-xs text-muted-foreground">这里定义 remote install 的默认交付版本和首次安装行为。</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField control={form.control} name="wordpressReleaseOwner" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Release Owner</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField control={form.control} name="wordpressFetchReleaseAssets" render={({ field }) => (
                        <FormItem className="flex items-center gap-3 rounded-xl border border-border p-3">
                          <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                          <FormLabel className="cursor-pointer">自动拉取 WordPress 资产</FormLabel>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="wordpressRunInit" render={({ field }) => (
                        <FormItem className="flex items-center gap-3 rounded-xl border border-border p-3">
                          <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                          <FormLabel className="cursor-pointer">自动完成首次安装</FormLabel>
                        </FormItem>
                      )} />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField control={form.control} name="fdThemeReleaseTag" render={({ field }) => (
                      <FormItem><FormLabel>fd-theme</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="fdAdminUiReleaseTag" render={({ field }) => (
                      <FormItem><FormLabel>fd-admin-ui</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="fdMemberReleaseTag" render={({ field }) => (
                      <FormItem><FormLabel>fd-member</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="fdPaymentReleaseTag" render={({ field }) => (
                      <FormItem><FormLabel>fd-payment</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="fdCommerceReleaseTag" render={({ field }) => (
                      <FormItem><FormLabel>fd-commerce</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="fdContentTypesReleaseTag" render={({ field }) => (
                      <FormItem><FormLabel>fd-content-types</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="fdWebsocketPushReleaseTag" render={({ field }) => (
                      <FormItem><FormLabel>fd-websocket-push</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="wpgraphqlJwtAuthReleaseTag" render={({ field }) => (
                      <FormItem><FormLabel>wp-graphql-jwt-auth</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="wpgraphqlTaxQueryRef" render={({ field }) => (
                      <FormItem><FormLabel>wp-graphql-tax-query</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                </section>

                <div className="flex gap-2">
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? '保存中...' : '保存交付设置'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={clearMutation.isPending}
                    onClick={() => {
                      if (confirm(`确认清空 ${selectedAppCode} 的交付设置？`)) {
                        clearMutation.mutate();
                      }
                    }}
                  >
                    清空设置
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-white p-5 text-sm text-muted-foreground">
            先创建一个 `service` 或 `web_app` 类型的应用，交付设置才会在这里出现。
          </div>
        )}
      </div>
    </div>
  );
}
