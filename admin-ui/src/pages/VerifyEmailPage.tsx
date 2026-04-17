import { useMutation } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { verifyEmail, resendVerification } from '@/api/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, setEmailVerified } = useAuth();
  const next = searchParams.get('next') || '/';

  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const verifyMutation = useMutation({
    mutationFn: () => verifyEmail(code),
    onSuccess: () => {
      setEmailVerified();
      toast.success('邮箱验证成功');
      navigate(next, { replace: true });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '验证失败');
    }
  });

  const resendMutation = useMutation({
    mutationFn: resendVerification,
    onSuccess: () => {
      toast.success('验证码已重新发送');
      setCountdown(60);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : '发送失败');
    }
  });

  return (
    <div className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-md items-center">
      <Card className="w-full border-gray-200/80">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl font-semibold">验证邮箱</CardTitle>
          <CardDescription>
            我们已向 {user?.email ?? '您的邮箱'} 发送了 6 位数字验证码
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="请输入 6 位验证码"
              className="text-center text-lg tracking-widest"
            />
          </div>
          <Button
            className="w-full"
            disabled={code.length !== 6 || verifyMutation.isPending}
            onClick={() => verifyMutation.mutate()}
          >
            {verifyMutation.isPending ? '验证中...' : '验证'}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            disabled={countdown > 0 || resendMutation.isPending}
            onClick={() => resendMutation.mutate()}
          >
            {countdown > 0
              ? `重新发送验证码 (${countdown}s)`
              : resendMutation.isPending
                ? '发送中...'
                : '重新发送验证码'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
