import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Collapse, Form, Input, Modal } from 'antd';
import { z } from 'zod';
import type { SmtpSettingsOverview } from '@/api/types';
import {
  clearSmtpSettings,
  getSmtpSettings,
  sendSmtpTestEmail,
  testSmtpConnection,
  upsertSmtpSettings,
} from '@/api/settings';
import { SMTP_FIELDS } from './integration-definitions';
import { RotateSecretsButton } from './RotateSecretsButton';
import { IntegrationFields, IntegrationHeader } from './IntegrationFields';
import { AsyncState } from '@/components/admin/AsyncState';
import { FormActions } from '@/components/admin/PageContainer';
import { parseSettingsForm, useSettingsForm } from '@/lib/settings-form';
const schema = z.object({
  transport: z.enum(['capture', 'smtp']),
  host: z.string().trim().max(255),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().trim().max(255),
  password: z.string().max(255),
  from: z.union([z.email(), z.literal('')]),
  fromName: z.string().trim().max(120),
});
const emailSchema = z.object({
  to: z.email('请输入有效的测试收件邮箱'),
  subject: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(10000),
});
type Values = z.infer<typeof schema>;
type Email = z.infer<typeof emailSchema>;
export function SmtpSettingsPanel() {
  const query = useQuery({ queryKey: ['system-settings', 'smtp'], queryFn: getSmtpSettings });
  return (
    <AsyncState loading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
      {query.data && <SettingsForm overview={query.data} />}
    </AsyncState>
  );
}
function SettingsForm({ overview }: { overview: SmtpSettingsOverview }) {
  const qc = useQueryClient(),
    { message } = App.useApp(),
    [modal, context] = Modal.useModal();
  const values: Values = {
    ...overview.values,
    transport: overview.values.transport ?? 'smtp',
    fromName: overview.values.fromName ?? 'Stack',
    password: '',
  };
  const { form, dirty, reset } = useSettingsForm(values);
  const [emailForm] = Form.useForm<Email>();
  const transport = Form.useWatch('transport', form);
  const mutation = useMutation({
    mutationFn: async (action: 'save' | 'test' | 'send' | 'clear') => {
      if (action === 'clear') return clearSmtpSettings();
      const input = parseSettingsForm(schema, await form.validateFields(), form);
      if (action === 'save') return upsertSmtpSettings(input);
      if (action === 'test') return testSmtpConnection(input);
      return sendSmtpTestEmail({
        ...input,
        ...parseSettingsForm(emailSchema, await emailForm.validateFields(), emailForm),
      });
    },
    onSuccess: async (result, action) => {
      void message.success(
        action === 'test'
          ? 'SMTP 连接和认证成功；未发送邮件'
          : action === 'send'
            ? result && 'simulated' in result && result.simulated
              ? '测试邮件已捕获，未向外发送'
              : '测试邮件已发送'
            : action === 'clear'
              ? '后台邮件配置已清除'
              : '邮件服务配置已保存',
      );
      if (action === 'save' || action === 'clear') {
        const saved = await getSmtpSettings();
        reset({
          ...saved.values,
          transport: saved.values.transport ?? 'smtp',
          fromName: saved.values.fromName ?? 'Stack',
          password: '',
        });
        qc.setQueryData(['system-settings', 'smtp'], saved);
      }
    },
    onError: (error) => {
      void message.error(error.message);
    },
  });
  const count = SMTP_FIELDS.filter((field) =>
    field.control === 'secret'
      ? overview.secrets.password.configured
      : typeof overview.values[field.key as keyof typeof overview.values] === 'boolean' ||
        Boolean(overview.values[field.key as keyof typeof overview.values]),
  ).length;
  return (
    <Card>
      {context}
      <IntegrationHeader
        title="邮件服务"
        description="SMTP 发信身份、传输安全和投递模式。"
        count={count}
      >
        <RotateSecretsButton disabled={dirty || mutation.isPending} />
      </IntegrationHeader>
      <Form
        name="smtp"
        form={form}
        layout="vertical"
        disabled={mutation.isPending}
        onFinish={() => mutation.mutate('save')}
      >
        <IntegrationFields
          prefix="smtp"
          fields={SMTP_FIELDS}
          source={overview.source}
          secrets={{ password: overview.secrets.password.configured }}
        />
        {transport === 'capture' && (
          <Alert
            type="warning"
            showIcon
            title="测试捕获模式不会向外发送邮件"
            description="生产注册验证、密码找回和告警需要选择邮件服务器投递。"
          />
        )}
        <FormActions hint={dirty ? '有未保存的修改' : '敏感项留空保留原值'}>
          <Button
            type="primary"
            htmlType="submit"
            disabled={!dirty}
            loading={mutation.isPending && mutation.variables === 'save'}
          >
            保存配置
          </Button>
          <Button onClick={() => mutation.mutate('test')}>测试 SMTP 连接</Button>
          <Button
            danger
            disabled={overview.source !== 'database'}
            onClick={() => {
              modal.confirm({
                title: '清除邮件服务后台配置？',
                content: '配置将回退到环境变量；若没有可用的 SMTP，邮件验证和找回密码将无法发信。',
                okText: '清除配置',
                cancelText: '取消',
                okButtonProps: { danger: true },
                onOk: () => mutation.mutateAsync('clear'),
              });
            }}
          >
            清除配置
          </Button>
        </FormActions>
      </Form>
      <Collapse
        style={{ marginTop: 24 }}
        items={[
          {
            key: 'email',
            label: '发送测试邮件',
            children: (
              <Form
                name="smtp-test"
                form={emailForm}
                layout="vertical"
                disabled={mutation.isPending}
                initialValues={{
                  to: '',
                  subject: 'Stack 测试邮件',
                  text: '这是一封用于验证邮件服务的测试邮件。',
                }}
                onFinish={() => mutation.mutate('send')}
              >
                <Form.Item
                  name="to"
                  label="测试收件邮箱"
                  rules={[{ required: true, type: 'email' }]}
                >
                  <Input type="email" />
                </Form.Item>
                <Form.Item
                  name="subject"
                  label="测试邮件主题"
                  rules={[{ required: true, whitespace: true, max: 200 }]}
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  name="text"
                  label="测试邮件正文"
                  rules={[{ required: true, whitespace: true, max: 10000 }]}
                >
                  <Input.TextArea rows={4} />
                </Form.Item>
                <FormActions hint="连接测试不发信；此操作使用当前表单配置。Capture 模式只模拟成功。">
                  <Button
                    htmlType="submit"
                    loading={mutation.isPending && mutation.variables === 'send'}
                  >
                    发送测试邮件
                  </Button>
                </FormActions>
              </Form>
            ),
          },
        ]}
      />
    </Card>
  );
}
