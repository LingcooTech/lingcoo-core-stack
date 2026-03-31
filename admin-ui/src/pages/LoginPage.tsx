import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { bootstrapStatus, login, register } from '@/api/auth';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';

const formSchema = z.object({
  email: z.string().email('请输入有效邮箱'),
  password: z.string().min(6, '密码至少 6 位')
});

type FormValues = z.infer<typeof formSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, login: authLogin } = useAuth();
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/admin', { replace: true });
      return;
    }
    bootstrapStatus()
      .then((s) => setIsRegisterMode(!s.hasAdmin))
      .catch(() => setIsRegisterMode(false))
      .finally(() => setLoading(false));
  }, [isAuthenticated, navigate]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' }
  });

  const onSubmit = async (values: FormValues) => {
    try {
      const result = isRegisterMode
        ? await register(values.email, values.password)
        : await login(values.email, values.password);
      authLogin(result.token);
      toast.success(isRegisterMode ? '管理员账号创建成功' : '登录成功');
      navigate('/admin', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#edf2f7]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#edf2f7] p-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-blue-500 flex items-center justify-center text-white text-base font-black shadow-lg shadow-primary/20">
            FD
          </div>
          <div className="text-center">
            <h1 className="text-xl font-black tracking-tight">fd-core-stack</h1>
            <p className="text-sm text-muted-foreground mt-0.5">管理后台</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
          <h2 className="text-base font-black mb-1">{isRegisterMode ? '创建管理员账号' : '登录'}</h2>
          <p className="text-xs text-muted-foreground mb-5">
            {isRegisterMode ? '这是系统首次启动，请创建管理员账号。' : '使用管理员账号登录后台。'}
          </p>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>邮箱</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="admin@example.com" autoComplete="email" {...field} />
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
                        autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? '处理中...' : isRegisterMode ? '创建账号' : '登录'}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
