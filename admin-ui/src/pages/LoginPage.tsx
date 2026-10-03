import { runAsync, handleAsync } from '@/lib/async-events';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { bootstrapStatus, login, logoutSession } from '@/api/auth';
import { loginSchema } from '@lingcoo/contracts';
import { canAccessAdminConsole } from '@/lib/rbac';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';

const formSchema = loginSchema.extend({
  email: z.string().email('请输入有效邮箱'),
  password: loginSchema.shape.password.min(8, '密码至少 8 位'),
});

type FormValues = z.infer<typeof formSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, login: authLogin } = useAuth();
  const [needsAdminSetup, setNeedsAdminSetup] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAuthenticated) {
      runAsync(() => navigate('/admin', { replace: true }));
      return;
    }
    bootstrapStatus()
      .then((s) => setNeedsAdminSetup(!s.hasAdmin))
      .catch(() => setNeedsAdminSetup(false))
      .finally(() => setLoading(false));
  }, [isAuthenticated, navigate]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      const result = await login(values.email, values.password);
      if (!canAccessAdminConsole(result.user.role)) {
        await logoutSession();
        throw new Error('该账号没有管理后台访问权限');
      }
      authLogin(result.user);
      toast.success('登录成功');
      runAsync(() => navigate('/admin', { replace: true }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.10),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.08),_transparent_44%)] dark:bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.18),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.14),_transparent_44%)]"
      />
      <div className="relative w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-foreground text-base font-bold text-background shadow-lg">
            FD
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight">fd-core-stack</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">管理后台</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-border bg-card/95 p-7 shadow-xl backdrop-blur-xl">
          <h2 className="mb-1 text-lg font-semibold tracking-tight text-foreground">欢迎回来</h2>
          <p className="mb-5 text-xs text-muted-foreground">
            {needsAdminSetup
              ? '管理账号尚未配置，请联系平台维护人员完成初始化。'
              : '使用管理账号登录后台。'}
          </p>

          <Form {...form}>
            <form onSubmit={handleAsync(form.handleSubmit(onSubmit))} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>邮箱</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="admin@example.com"
                        autoComplete="email"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>密码</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        autoComplete="current-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? '处理中...' : '登录'}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
