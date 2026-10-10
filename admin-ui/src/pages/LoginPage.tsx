import { App, Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bootstrapStatus, login, logoutSession } from '@/api/auth';
import { loginSchema } from '@lingcoo/contracts';
import { canAccessAdminConsole } from '@/lib/rbac';
import { useAuth } from '@/lib/auth';
import { AdminUiProvider } from '@/components/admin/AdminUiProvider';
import { AsyncState } from '@/components/admin/AsyncState';

export function LoginPage() {
  return (
    <AdminUiProvider>
      <AdminLogin />
    </AdminUiProvider>
  );
}
function AdminLogin() {
  const navigate = useNavigate();
  const { isAuthenticated, login: authLogin } = useAuth();
  const { message } = App.useApp();
  const [needsAdminSetup, setNeedsAdminSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm<{ email: string; password: string }>();
  useEffect(() => {
    if (isAuthenticated) {
      void navigate('/admin', { replace: true });
      return;
    }
    let active = true;
    void bootstrapStatus()
      .then((status) => {
        if (active) setNeedsAdminSetup(!status.hasAdmin);
      })
      .catch(() => {
        if (active) setNeedsAdminSetup(false);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isAuthenticated, navigate]);
  const submit = async (values: { email: string; password: string }) => {
    setError(null);
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      const fields: Array<{ name: 'email' | 'password'; errors: string[] }> = [];
      for (const issue of parsed.error.issues) {
        const name = issue.path[0];
        if (name === 'email' || name === 'password') {
          fields.push({ name, errors: [issue.message] });
        }
      }
      form.setFields(fields);
      return;
    }
    setSaving(true);
    try {
      const result = await login(parsed.data.email, parsed.data.password);
      if (!canAccessAdminConsole(result.user.role)) {
        await logoutSession();
        throw new Error('该账号没有管理后台访问权限');
      }
      authLogin(result.user);
      void message.success('登录成功');
      await navigate('/admin', { replace: true });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '登录失败，请重试');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="admin-login">
      <Card className="admin-login__card" title="管理后台">
        {loading ? (
          <AsyncState loading>{null}</AsyncState>
        ) : (
          <>
            <Typography.Title level={4}>欢迎回来</Typography.Title>
            <Typography.Paragraph type="secondary">
              {needsAdminSetup
                ? '管理账号尚未配置，请联系平台维护人员完成初始化。'
                : '使用管理账号登录后台。'}
            </Typography.Paragraph>
            {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
            <Form
              form={form}
              layout="vertical"
              onFinish={(values) => {
                void submit(values);
              }}
              disabled={saving}
              initialValues={{ email: '', password: '' }}
            >
              <Form.Item
                name="email"
                label="邮箱"
                rules={[
                  { required: true, message: '请输入邮箱' },
                  { type: 'email', message: '请输入有效邮箱' },
                ]}
              >
                <Input autoComplete="email" placeholder="admin@example.com" />
              </Form.Item>
              <Form.Item
                name="password"
                label="密码"
                rules={[
                  { required: true, message: '请输入密码' },
                  { min: 8, message: '密码至少 8 位' },
                ]}
              >
                <Input.Password autoComplete="current-password" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={saving}>
                登录
              </Button>
            </Form>
          </>
        )}
      </Card>
    </div>
  );
}
