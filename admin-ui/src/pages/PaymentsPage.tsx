import { handleAsync } from '@/lib/async-events';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  clearProviderSettings,
  getPaymentSettings,
  upsertAlipaySettings,
  upsertWechatSettings,
} from '@/api/payments';
import { ConfirmActionDialog } from '@/components/shared/ConfirmActionDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill } from '@/components/shared/StatusPill';
import { useAuth } from '@/lib/auth';
import { hasPermission, normalizeRole } from '@/lib/rbac';

const wechatSchema = z.object({
  appId: z.string().trim().optional(),
  mchId: z.string().trim().optional(),
  apiV3Key: z
    .string()
    .trim()
    .refine(
      (value) => !value || /^[\x20-\x7E]{32}$/.test(value),
      'API v3 密钥须为 32 位 ASCII 字符',
    )
    .optional(),
  merchantSerial: z.string().trim().optional(),
  privateKeyPem: z.string().trim().optional(),
  publicKeyPem: z.string().trim().optional(),
  publicKeyId: z.string().trim().optional(),
});

const alipaySchema = z.object({
  appId: z.string().optional(),
  privateKeyPem: z.string().optional(),
  publicKeyPem: z.string().optional(),
  f2fPay: z.boolean().optional(),
});

type WechatValues = z.infer<typeof wechatSchema>;
type AlipayValues = z.infer<typeof alipaySchema>;

export function PaymentsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canManagePayments = hasPermission(normalizeRole(user?.role), 'payments.manage');
  const [providerToClear, setProviderToClear] = useState<'wechat_pay' | 'alipay' | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['payment-settings'],
    queryFn: getPaymentSettings,
  });

  const wechat = data?.items.find((i) => i.code === 'wechat_pay');
  const alipay = data?.items.find((i) => i.code === 'alipay');

  const wechatMutation = useMutation({
    mutationFn: upsertWechatSettings,
    onSuccess: () => {
      wechatForm.reset({
        ...wechatForm.getValues(),
        apiV3Key: '',
        privateKeyPem: '',
        publicKeyPem: '',
      });
      toast.success('微信支付配置已保存');
      void qc.invalidateQueries({ queryKey: ['payment-settings'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '保存失败'),
  });

  const alipayMutation = useMutation({
    mutationFn: upsertAlipaySettings,
    onSuccess: () => {
      toast.success('支付宝配置已保存');
      void qc.invalidateQueries({ queryKey: ['payment-settings'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '保存失败'),
  });

  const clearMutation = useMutation({
    mutationFn: clearProviderSettings,
    onSuccess: (_, provider) => {
      toast.success(`${provider === 'wechat_pay' ? '微信支付' : '支付宝'}数据库配置已清空`);
      void qc.invalidateQueries({ queryKey: ['payment-settings'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '清空失败'),
  });

  const wechatForm = useForm<WechatValues>({
    resolver: zodResolver(wechatSchema),
    resetOptions: { keepDirtyValues: true },
    values: {
      appId: (wechat?.values.appId as string) ?? '',
      mchId: (wechat?.values.mchId as string) ?? '',
      apiV3Key: '',
      privateKeyPem: '',
      publicKeyPem: '',
      merchantSerial: String(wechat?.values.merchantSerial ?? ''),
      publicKeyId: String(wechat?.values.publicKeyId ?? ''),
    },
  });
  const alipayForm = useForm<AlipayValues>({
    resolver: zodResolver(alipaySchema),
    defaultValues: {
      appId: (alipay?.values.appId as string) ?? '',
      privateKeyPem: '',
      publicKeyPem: '',
      f2fPay: Boolean(alipay?.values.f2fPay),
    },
  });

  const sourceLabel = (s: string) =>
    s === 'database' ? '数据库' : s === 'env' ? '环境变量' : '未配置';

  return (
    <div>
      <SectionHeader sectionKey="payments" />
      <div className="p-6">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : (
          <Tabs defaultValue="wechat">
            <TabsList className="mb-6">
              <TabsTrigger value="wechat">微信支付</TabsTrigger>
              <TabsTrigger value="alipay">支付宝</TabsTrigger>
            </TabsList>

            <TabsContent value="wechat">
              <div className="max-w-xl space-y-5">
                {/* Status Row */}
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-4">
                  <StatusPill
                    tone={wechat?.configured ? 'ok' : 'neutral'}
                    label={wechat?.configured ? '配置完成' : '配置不完整'}
                  />
                  <StatusPill
                    tone={
                      wechat?.source === 'database'
                        ? 'ok'
                        : wechat?.source === 'env'
                          ? 'warn'
                          : 'neutral'
                    }
                    label={`来源: ${sourceLabel(wechat?.source ?? 'unconfigured')}`}
                  />
                </div>

                <Form {...wechatForm}>
                  <form
                    onSubmit={handleAsync(wechatForm.handleSubmit((v) => wechatMutation.mutate(v)))}
                    className="space-y-4"
                  >
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FormField
                        control={wechatForm.control}
                        name="appId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>AppID</FormLabel>
                            <FormControl>
                              <Input placeholder="wx..." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={wechatForm.control}
                        name="mchId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>商户号 (MchID)</FormLabel>
                            <FormControl>
                              <Input placeholder="1xxxxxxx" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {(
                        [
                          ['merchantSerial', '商户 API 证书序列号', false],
                          ['publicKeyId', '微信支付公钥 ID / 平台证书序列号', false],
                          ['apiV3Key', 'API v3 密钥（32 字节）', true],
                          ['privateKeyPem', '商户 API 私钥 PEM', true],
                          ['publicKeyPem', '微信支付公钥 / 平台证书 PEM', true],
                        ] as const
                      ).map(([name, label, secret]) => (
                        <FormField
                          key={name}
                          control={wechatForm.control}
                          name={name}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{label}</FormLabel>
                              <FormControl>
                                {name.endsWith('Pem') ? (
                                  <Textarea
                                    autoComplete="off"
                                    placeholder={
                                      wechat?.secrets[name]?.configured
                                        ? '已保存，留空保持不变'
                                        : '粘贴 PEM 内容'
                                    }
                                    {...field}
                                  />
                                ) : (
                                  <Input
                                    type={secret ? 'password' : 'text'}
                                    autoComplete="off"
                                    placeholder={
                                      secret && wechat?.secrets[name]?.configured
                                        ? '已保存，留空保持不变'
                                        : ''
                                    }
                                    {...field}
                                  />
                                )}
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      使用微信支付 V3 Native 扫码支付。回调地址由平台自动生成。旧版 API 密钥不能代替
                      API v3 密钥。
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        disabled={wechatMutation.isPending || !canManagePayments}
                      >
                        {wechatMutation.isPending ? '保存中...' : '保存微信配置'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={clearMutation.isPending || !canManagePayments}
                        onClick={() => setProviderToClear('wechat_pay')}
                      >
                        清空配置
                      </Button>
                    </div>
                  </form>
                </Form>
              </div>
            </TabsContent>

            <TabsContent value="alipay">
              <div className="max-w-xl space-y-5">
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-4">
                  <StatusPill
                    tone={alipay?.configured ? 'ok' : 'neutral'}
                    label={alipay?.configured ? '配置完成' : '配置不完整'}
                  />
                  <StatusPill
                    tone={
                      alipay?.source === 'database'
                        ? 'ok'
                        : alipay?.source === 'env'
                          ? 'warn'
                          : 'neutral'
                    }
                    label={`来源: ${sourceLabel(alipay?.source ?? 'unconfigured')}`}
                  />
                </div>

                <Form {...alipayForm}>
                  <form
                    onSubmit={handleAsync(alipayForm.handleSubmit((v) => alipayMutation.mutate(v)))}
                    className="space-y-4"
                  >
                    <FormField
                      control={alipayForm.control}
                      name="appId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>应用 AppID</FormLabel>
                          <FormControl>
                            <Input placeholder="2021..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={alipayForm.control}
                      name="privateKeyPem"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>应用私钥 (PEM)</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder={
                                alipay?.secrets.privateKeyPem?.configured
                                  ? '已保存，留空保持不变'
                                  : '粘贴 PEM 格式私钥'
                              }
                              className="min-h-[100px] font-mono text-xs"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={alipayForm.control}
                      name="publicKeyPem"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>支付宝公钥 (PEM)</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder={
                                alipay?.secrets.publicKeyPem?.configured
                                  ? '已保存，留空保持不变'
                                  : '粘贴 PEM 格式公钥'
                              }
                              className="min-h-[100px] font-mono text-xs"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={alipayForm.control}
                      name="f2fPay"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-3 rounded-md border border-border bg-card p-4">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <div>
                            <FormLabel className="cursor-pointer">启用当面付 (F2F Pay)</FormLabel>
                            <FormDescription>启用支付宝当面付扫码支付。</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        disabled={alipayMutation.isPending || !canManagePayments}
                      >
                        {alipayMutation.isPending ? '保存中...' : '保存支付宝配置'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={clearMutation.isPending || !canManagePayments}
                        onClick={() => setProviderToClear('alipay')}
                      >
                        清空配置
                      </Button>
                    </div>
                  </form>
                </Form>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>

      <ConfirmActionDialog
        open={providerToClear !== null}
        onOpenChange={(open) => {
          if (!open) setProviderToClear(null);
        }}
        title="确认清空支付配置？"
        description={
          providerToClear === 'wechat_pay'
            ? '将清空微信支付数据库配置；若存在环境变量回退，运行时仍可能继续生效。'
            : providerToClear === 'alipay'
              ? '将清空支付宝数据库配置；若存在环境变量回退，运行时仍可能继续生效。'
              : undefined
        }
        confirmText="清空配置"
        isConfirming={clearMutation.isPending}
        onConfirm={() => {
          if (!providerToClear) return;
          const provider = providerToClear;
          setProviderToClear(null);
          clearMutation.mutate(provider);
        }}
      />
    </div>
  );
}
