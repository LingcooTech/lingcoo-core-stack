import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { login, register } from '@/api/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';

const formSchema = z.object({
  email: z.string().email('请输入有效邮箱'),
  password: z.string().min(8, '密码至少 8 位')
});

type FormValues = z.infer<typeof formSchema>;

export function UserAuthPage({ mode }: { mode: 'login' | 'register' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, login: authLogin } = useAuth();
  const next = searchParams.get('next') || '/orders';

  useEffect(() => {
    if (isAuthenticated) {
      navigate(next, { replace: true });
    }
  }, [isAuthenticated, navigate, next]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' }
  });

  const onSubmit = async (values: FormValues) => {
    try {
      const result = mode === 'register' ? await register(values.email, values.password) : await login(values.email, values.password);
      authLogin(result.token);
      if (result.user.emailVerified === false) {
        toast.success(mode === 'register' ? '注册成功，请验证邮箱' : '登录成功，请先验证邮箱');
        navigate(`/verify-email?next=${encodeURIComponent(next)}`, { replace: true });
        return;
      }
      toast.success(mode === 'register' ? '注册成功，已进入用户中心' : '登录成功');
      navigate(next, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败');
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-md items-center">
      <Card className="w-full border-gray-200/80">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl font-semibold">{mode === 'register' ? '创建用户账号' : '登录用户中心'}</CardTitle>
          <CardDescription>
            {mode === 'register'
              ? '注册后即可管理订单、授权，并进入后续的系统部署流程。'
              : '登录后可继续支付、查看订单、管理已购产品与授权。'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>邮箱</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" placeholder="you@example.com" {...field} />
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
                        autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                        placeholder="至少 8 位"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? '处理中...' : mode === 'register' ? '注册并继续' : '登录并继续'}
              </Button>
            </form>
          </Form>

          <div className="mt-5 text-sm text-muted-foreground">
            {mode === 'login' ? (
              <div className="mb-3">
                <Link
                  to={`/forgot-password${form.getValues('email') ? `?email=${encodeURIComponent(form.getValues('email'))}` : ''}`}
                  className="font-bold text-primary hover:underline"
                >
                  忘记密码？
                </Link>
              </div>
            ) : null}
            {mode === 'register' ? '已经有账号？' : '还没有账号？'}{' '}
            <Link
              to={{
                pathname: mode === 'register' ? '/login' : '/register',
                search: location.search
              }}
              className="font-bold text-primary hover:underline"
            >
              {mode === 'register' ? '直接登录' : '立即注册'}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
