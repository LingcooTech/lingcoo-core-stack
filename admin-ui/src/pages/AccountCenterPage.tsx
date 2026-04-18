import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSearch, KeyRound, LoaderCircle, UserCircle2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { listApps } from '@/api/apps';
import { changePassword, forgotPassword, getCurrentUser, updateCurrentUser } from '@/api/auth';
import { listMyEntitlements, listMyOrders, syncMyOrder } from '@/api/user';
import { EmptyState } from '@/components/portal/EmptyState';
import { EntitlementProductCard } from '@/components/portal/EntitlementProductCard';
import { OrderCard } from '@/components/portal/OrderCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getAppDeliveryMode } from '@/lib/app-delivery';
import { getAccessLinks } from '@/lib/app-catalog-ui';
import { formatAmount } from '@/lib/utils';

const accountTabValues = ['profile', 'orders', 'apps'] as const;
type AccountTab = typeof accountTabValues[number];

const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .max(120, '用户名不能超过 120 个字符')
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(8, '请输入当前密码'),
    newPassword: z.string().min(8, '新密码至少 8 位'),
    confirmPassword: z.string().min(8, '请再次输入新密码')
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ['confirmPassword'],
    message: '两次输入的新密码不一致'
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ['newPassword'],
    message: '新密码不能与当前密码相同'
  });

type ProfileValues = z.infer<typeof profileSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;

function normalizeAccountTab(value: string | null): AccountTab {
  return accountTabValues.includes(value as AccountTab) ? (value as AccountTab) : 'profile';
}

function AccountProfileTab() {
  const qc = useQueryClient();
  const currentUserQuery = useQuery({
    queryKey: ['current-user'],
    queryFn: getCurrentUser
  });
  const currentUser = currentUserQuery.data?.user ?? null;

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: ''
    }
  });

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    }
  });

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    profileForm.reset({
      displayName: currentUser.displayName ?? ''
    });
  }, [currentUser, profileForm]);

  const updateProfileMutation = useMutation({
    mutationFn: (values: ProfileValues) => updateCurrentUser(values.displayName),
    onSuccess: (result) => {
      toast.success('个人资料已更新');
      qc.setQueryData(['current-user'], {
        authenticated: true,
        user: result.user
      });
      profileForm.reset({
        displayName: result.user.displayName ?? ''
      });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '更新个人资料失败')
  });

  const changePasswordMutation = useMutation({
    mutationFn: (values: PasswordValues) =>
      changePassword(values.currentPassword, values.newPassword, values.confirmPassword),
    onSuccess: () => {
      toast.success('密码已修改');
      passwordForm.reset();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '修改密码失败')
  });

  const sendResetEmailMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser?.email) {
        throw new Error('当前用户邮箱不可用');
      }

      return forgotPassword(currentUser.email);
    },
    onSuccess: () => {
      toast.success('找回密码邮件已发送，请检查邮箱');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '发送找回密码邮件失败')
  });

  if (currentUserQuery.isLoading) {
    return (
      <Card className="rounded-xl border-gray-200 bg-white">
        <CardContent className="flex items-center justify-center gap-3 p-10 text-gray-500">
          <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
          正在加载个人资料...
        </CardContent>
      </Card>
    );
  }

  if (!currentUser) {
    return (
      <EmptyState
        icon={UserCircle2}
        title="无法加载个人资料"
        description="当前用户资料暂时不可用，请刷新页面后重试。"
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">登录邮箱</p>
          <p className="mt-2 break-all text-sm font-semibold text-gray-900">{currentUser.email}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">账户角色</p>
          <p className="mt-2 text-sm font-semibold text-gray-900">{currentUser.role === 'admin' ? '管理员' : '普通用户'}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">邮箱验证</p>
          <div className="mt-2">
            <Badge variant={currentUser.emailVerified ? 'default' : 'secondary'}>
              {currentUser.emailVerified ? '已验证' : '待验证'}
            </Badge>
          </div>
        </div>
      </div>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card className="rounded-xl border-gray-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl tracking-tight">个人资料</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...profileForm}>
              <form
                onSubmit={profileForm.handleSubmit((values) => updateProfileMutation.mutate(values))}
                className="space-y-5"
              >
                <FormField
                  control={profileForm.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>用户名</FormLabel>
                      <FormControl>
                        <Input placeholder="请输入用户名" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" disabled={updateProfileMutation.isPending}>
                  {updateProfileMutation.isPending ? '保存中...' : '保存个人资料'}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-gray-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl tracking-tight">密码与安全</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Form {...passwordForm}>
              <form
                onSubmit={passwordForm.handleSubmit((values) => changePasswordMutation.mutate(values))}
                className="space-y-5"
              >
                <FormField
                  control={passwordForm.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>当前密码</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="current-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>新密码</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>确认新密码</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" disabled={changePasswordMutation.isPending}>
                  {changePasswordMutation.isPending ? '修改中...' : '修改密码'}
                </Button>
              </form>
            </Form>

            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/70 p-4">
              <p className="text-sm font-semibold text-gray-900">忘记当前密码？</p>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                disabled={sendResetEmailMutation.isPending}
                onClick={() => sendResetEmailMutation.mutate()}
              >
                {sendResetEmailMutation.isPending ? '发送中...' : '发送找回密码邮件'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function AccountOrdersTab() {
  const qc = useQueryClient();
  const ordersQuery = useQuery({ queryKey: ['my-orders'], queryFn: listMyOrders });
  const syncMutation = useMutation({
    mutationFn: syncMyOrder,
    onSuccess: () => {
      toast.success('订单状态已同步');
      void qc.invalidateQueries({ queryKey: ['my-orders'] });
      void qc.invalidateQueries({ queryKey: ['my-entitlements'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '同步失败');
    }
  });

  const orders = ordersQuery.data?.items ?? [];
  const paidOrders = orders.filter((order) => order.status === 'paid');
  const pendingOrders = orders.filter((order) => order.status !== 'paid');

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: '全部订单', value: String(orders.length) },
          { label: '已支付', value: String(paidOrders.length) },
          { label: '待同步', value: String(pendingOrders.length) }
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">{item.label}</p>
            <p className="mt-1.5 text-[1.75rem] font-semibold tracking-tight text-gray-900">{item.value}</p>
          </div>
        ))}
      </div>

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-tight text-gray-900">我的订单</h2>
          <p className="text-sm text-gray-500">
            已支付 {paidOrders.length} 笔，累计 {formatAmount(paidOrders.reduce((sum, order) => sum + order.amount, 0), paidOrders[0]?.currency ?? 'CNY')}
          </p>
        </div>

        <div className="grid gap-4">
          {ordersQuery.isLoading ? (
            <Card className="rounded-xl border-gray-200 bg-white">
              <CardContent className="flex items-center justify-center gap-3 p-10 text-gray-500">
                <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
                正在加载订单记录...
              </CardContent>
            </Card>
          ) : orders.length === 0 ? (
            <EmptyState
              icon={FileSearch}
              title="还没有订单记录"
              description="还没有订单记录，去应用中心看看吧。"
            />
          ) : (
            orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onSync={(orderNo) => syncMutation.mutate(orderNo)}
                syncing={syncMutation.isPending}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function AccountAppsTab() {
  const entitlementsQuery = useQuery({ queryKey: ['my-entitlements'], queryFn: listMyEntitlements });
  const appsQuery = useQuery({ queryKey: ['public-apps'], queryFn: listApps });

  const summary = entitlementsQuery.data?.summary ?? [];
  const items = entitlementsQuery.data?.items ?? [];
  const apps = appsQuery.data?.items ?? [];
  const appByCode = new Map(apps.map((app) => [app.code, app]));

  const appsByProduct = new Map<string, string[]>();
  for (const app of apps) {
    if (!appsByProduct.has(app.code)) {
      appsByProduct.set(app.code, []);
    }
    appsByProduct.get(app.code)?.push(app.name);
  }

  const featureNameMap = new Map<string, string>();
  for (const item of items) {
    if (item.plan?.code && item.plan?.name) {
      featureNameMap.set(item.plan.code, item.plan.name);
    }
  }

  const activeItems = items.filter((item) => item.status === 'active');
  const deployableCount = summary.filter((entry) => {
    const app = appByCode.get(entry.appCode);
    return Boolean(app && getAppDeliveryMode(app) === 'one_click');
  }).length;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: '已购应用', value: String(summary.length) },
          { label: '激活授权', value: String(activeItems.length) },
          { label: '可部署应用', value: String(deployableCount) }
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">{item.label}</p>
            <p className="mt-1.5 text-[1.75rem] font-semibold tracking-tight text-gray-900">{item.value}</p>
          </div>
        ))}
      </div>

      {entitlementsQuery.isLoading ? (
        <Card className="rounded-xl border-gray-200 bg-white">
          <CardContent className="flex items-center justify-center gap-3 p-10 text-gray-500">
            <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
            正在加载已购应用...
          </CardContent>
        </Card>
      ) : summary.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="还没有已购应用"
          description="还没有已购应用，去应用中心选购吧。"
        />
      ) : (
        <section className="space-y-5">
          <h2 className="text-2xl font-semibold tracking-tight text-gray-900">我的应用</h2>
          <div className="grid gap-5 lg:grid-cols-2">
            {summary.map((entry) => {
              const relatedItems = items.filter((item) => item.app?.code === entry.appCode);
              const relatedApps = appsByProduct.get(entry.appCode) ?? [];
              const app = appByCode.get(entry.appCode) ?? null;
              const featureNames = entry.featureCodes.map((code) => featureNameMap.get(code) ?? code);
              const deploymentHref =
                app && getAppDeliveryMode(app) === 'one_click'
                  ? `/deploy?app=${encodeURIComponent(entry.appCode)}`
                  : undefined;
              const accessLinks =
                app && getAppDeliveryMode(app) !== 'one_click' ? getAccessLinks(app.links) : [];

              return (
                <EntitlementProductCard
                  key={entry.appCode}
                  productName={relatedItems[0]?.app?.name ?? entry.appCode}
                  featureNames={featureNames}
                  relatedApps={relatedApps}
                  items={relatedItems}
                  deploymentHref={deploymentHref}
                  accessLinks={accessLinks}
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

export function AccountCenterPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = normalizeAccountTab(searchParams.get('tab'));

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">个人中心</h1>
      </div>

      <Tabs
        value={currentTab}
        onValueChange={(nextValue) => setSearchParams({ tab: normalizeAccountTab(nextValue) })}
        className="space-y-5"
      >
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm">
          <TabsList className="h-auto w-full justify-start gap-1 rounded-lg bg-muted/70 p-1">
            <TabsTrigger value="profile" className="min-w-[108px] rounded-md">
              个人资料
            </TabsTrigger>
            <TabsTrigger value="orders" className="min-w-[108px] rounded-md">
              我的订单
            </TabsTrigger>
            <TabsTrigger value="apps" className="min-w-[108px] rounded-md">
              我的应用
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="profile" className="mt-0">
          <AccountProfileTab />
        </TabsContent>
        <TabsContent value="orders" className="mt-0">
          <AccountOrdersTab />
        </TabsContent>
        <TabsContent value="apps" className="mt-0">
          <AccountAppsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
