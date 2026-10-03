import { runAsync, handleAsync } from '@/lib/async-events';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { forgotPassword, resetPassword } from '@/api/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

const requestSchema = z.object({
  email: z.string().email('请输入有效邮箱'),
});

const resetSchema = z.object({
  code: z
    .string()
    .length(6, '请输入 6 位验证码')
    .regex(/^\d{6}$/, '验证码必须为 6 位数字'),
  newPassword: z.string().min(8, '密码至少 8 位'),
});

type RequestValues = z.infer<typeof requestSchema>;
type ResetValues = z.infer<typeof resetSchema>;

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [submittedEmail, setSubmittedEmail] = useState(searchParams.get('email') ?? '');
  const [codeRequested, setCodeRequested] = useState(false);

  const requestForm = useForm<RequestValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: { email: submittedEmail },
  });

  const resetForm = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { code: '', newPassword: '' },
  });

  const activeEmail = requestForm.watch('email') || submittedEmail;

  const requestMutation = useMutation({
    mutationFn: ({ email }: RequestValues) => forgotPassword(email),
    onSuccess: (_, values) => {
      setSubmittedEmail(values.email);
      setCodeRequested(true);
      toast.success('如果该邮箱已注册，验证码已发送');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '发送失败'),
  });

  const resetMutation = useMutation({
    mutationFn: (values: ResetValues) =>
      resetPassword(submittedEmail, values.code, values.newPassword),
    onSuccess: () => {
      toast.success('密码已重置，请重新登录');
      runAsync(() => navigate(`/login?next=${encodeURIComponent('/orders')}`, { replace: true }));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : '重置失败'),
  });

  return (
    <div className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-md items-center">
      <Card className="w-full border-border bg-card/95 shadow-xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl font-semibold">找回密码</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Form {...requestForm}>
            <form
              onSubmit={handleAsync(
                requestForm.handleSubmit((values) => requestMutation.mutate(values)),
              )}
              className="space-y-4"
            >
              <FormField
                control={requestForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>邮箱</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={requestMutation.isPending}>
                {requestMutation.isPending
                  ? '发送中...'
                  : codeRequested
                    ? '重新发送验证码'
                    : '发送重置验证码'}
              </Button>
            </form>
          </Form>

          <div className="rounded-lg border border-border bg-muted p-4">
            <p className="text-sm font-bold text-foreground">重置密码</p>
            <p className="mt-1 text-xs text-muted-foreground">
              当前邮箱：{submittedEmail || activeEmail || '请先填写邮箱并发送验证码'}
            </p>

            <Form {...resetForm}>
              <form
                onSubmit={handleAsync(
                  resetForm.handleSubmit((values) => resetMutation.mutate(values)),
                )}
                className="mt-4 space-y-4"
              >
                <FormField
                  control={resetForm.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>验证码</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={6}
                          placeholder="请输入 6 位验证码"
                          {...field}
                          onChange={(event) =>
                            field.onChange(event.target.value.replace(/\D/g, '').slice(0, 6))
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={resetForm.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>新密码</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          autoComplete="new-password"
                          placeholder="至少 8 位"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={!submittedEmail || resetMutation.isPending}
                >
                  {resetMutation.isPending ? '重置中...' : '重置密码'}
                </Button>
              </form>
            </Form>
          </div>

          <div className="text-sm text-muted-foreground">
            想起密码了？{' '}
            <Link to="/login" className="font-bold text-primary hover:underline">
              返回登录
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
