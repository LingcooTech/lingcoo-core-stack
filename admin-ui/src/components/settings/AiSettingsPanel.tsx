import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Flex,
  Form,
  Input,
  Modal,
  Select,
  Tag,
  Typography,
} from 'antd';
import {
  clearOpenRouterSettings,
  getAiProviders,
  getOpenRouterSettings,
  previewOpenRouterChatCompletion,
  previewOpenRouterModels,
  testOpenRouterSettings,
  upsertOpenRouterSettings,
} from '@/api/settings';
import { AsyncState } from '@/components/admin/AsyncState';
import { FormActions } from '@/components/admin/PageContainer';
import { parseSettingsForm, useSettingsForm } from '@/lib/settings-form';
import {
  buildOpenRouterPayload,
  formatCompactNumber,
  formatModalities,
  formatModelOptionLabel,
  formatPricePerMillion,
  openrouterSchema,
  OPENROUTER_DEFAULT_BASE_URL,
  type OpenRouterValues,
} from '@/lib/settings-schemas';
export function AiSettingsPanel() {
  const qc = useQueryClient(),
    { message } = App.useApp(),
    [modal, context] = Modal.useModal();
  const query = useQuery({
    queryKey: ['system-settings', 'ai', 'openrouter'],
    queryFn: getOpenRouterSettings,
  });
  const providers = useQuery({ queryKey: ['admin-ai-providers'], queryFn: getAiProviders });
  const { form, dirty, reset } = useSettingsForm<OpenRouterValues>(
    query.data
      ? { ...query.data.values, baseUrl: OPENROUTER_DEFAULT_BASE_URL, apiKey: '' }
      : undefined,
  );
  const [chatForm] = Form.useForm<{ prompt: string }>();
  const modelId = Form.useWatch('defaultModel', form) as string | undefined;
  const autoloaded = useRef(false);
  const payload = () =>
    buildOpenRouterPayload(
      {
        ...parseSettingsForm(openrouterSchema, form.getFieldsValue(true), form),
        baseUrl: OPENROUTER_DEFAULT_BASE_URL,
      },
      { includeApiKey: Boolean(form.getFieldValue('apiKey')) },
    );
  const failure = (error: Error) => {
    void message.error(error.message);
  };
  const models = useMutation({
    mutationFn: previewOpenRouterModels,
    onSuccess: (result) => {
      if (!result.items.length) void message.warning('当前配置下没有拉取到可用模型');
    },
    onError: failure,
  });
  const connection = useMutation({
    mutationFn: () => testOpenRouterSettings(payload()),
    onSuccess: (result) => {
      void message.success(`OpenRouter 连接成功，共发现 ${result.modelCount} 个模型`);
      models.mutate(payload());
    },
    onError: failure,
  });
  const save = useMutation({
    mutationFn: () => upsertOpenRouterSettings(payload()),
    onSuccess: async (result) => {
      reset({ ...result.values, apiKey: '', baseUrl: OPENROUTER_DEFAULT_BASE_URL });
      qc.setQueryData(['system-settings', 'ai', 'openrouter'], result);
      await qc.invalidateQueries({ queryKey: ['admin-ai-providers'] });
      void message.success('OpenRouter 配置已保存');
      models.mutate(
        buildOpenRouterPayload(
          { ...result.values, apiKey: '', baseUrl: OPENROUTER_DEFAULT_BASE_URL },
          { includeApiKey: false },
        ),
      );
    },
    onError: failure,
  });
  const clear = useMutation({
    mutationFn: clearOpenRouterSettings,
    onSuccess: async () => {
      const result = await getOpenRouterSettings();
      reset({ ...result.values, apiKey: '', baseUrl: OPENROUTER_DEFAULT_BASE_URL });
      qc.setQueryData(['system-settings', 'ai', 'openrouter'], result);
      models.reset();
      connection.reset();
      chat.reset();
      await qc.invalidateQueries({ queryKey: ['admin-ai-providers'] });
      void message.success('数据库中的 OpenRouter 配置已清空');
    },
    onError: failure,
  });
  const chat = useMutation({
    mutationFn: async () => {
      const values = await chatForm.validateFields();
      if (!modelId) throw new Error('请先拉取模型列表并选择默认模型');
      return previewOpenRouterChatCompletion({
        ...payload(),
        model: modelId,
        messages: [{ role: 'user', content: values.prompt.trim() }],
        maxTokens: 400,
      });
    },
    onError: failure,
  });
  useEffect(() => {
    if (query.data?.configured && !autoloaded.current) {
      autoloaded.current = true;
      models.mutate(
        buildOpenRouterPayload(
          { ...query.data.values, apiKey: '', baseUrl: OPENROUTER_DEFAULT_BASE_URL },
          { includeApiKey: false },
        ),
      );
    }
  }, [query.data, models]);
  const items = models.data?.items ?? [];
  const selected = items.find((model) => model.id === modelId);
  const pending =
    save.isPending || clear.isPending || connection.isPending || models.isPending || chat.isPending;
  return (
    <AsyncState loading={query.isPending} error={query.error} onRetry={() => void query.refetch()}>
      {context}
      <Card
        title="AI 服务 · OpenRouter"
        extra={
          <Tag color={query.data?.configured ? 'success' : 'warning'}>
            {query.data?.configured ? '已配置' : '待配置'}
          </Tag>
        }
      >
        <Typography.Paragraph type="secondary">
          平台统一代理模型请求。敏感密钥留空保留原值，测试使用当前表单配置。
        </Typography.Paragraph>
        {providers.error && (
          <Alert
            type="error"
            showIcon
            title={providers.error.message}
            action={<Button onClick={() => void providers.refetch()}>重试</Button>}
          />
        )}
        <Flex wrap gap={8} style={{ marginBottom: 24 }}>
          {providers.data?.items.map((provider) => (
            <Tag key={provider.code} color={provider.configured ? 'success' : 'default'}>
              {provider.label} · {provider.configured ? '已配置' : '未配置'}
            </Tag>
          ))}
        </Flex>
        <Form
          form={form}
          name="openrouter"
          layout="vertical"
          disabled={pending}
          onFinish={() => save.mutate()}
        >
          <div className="admin-form-grid">
            <Form.Item name="apiKey" label="API Key" extra="加密保存，永不回显。">
              <Input.Password
                autoComplete="new-password"
                placeholder={
                  query.data?.secrets.apiKey.configured ? '已配置；留空保留原值' : 'sk-or-…'
                }
              />
            </Form.Item>
            <Form.Item name="baseUrl" label="API 地址">
              <Input readOnly />
            </Form.Item>
            <Form.Item name="siteUrl" label="站点 URL">
              <Input type="url" />
            </Form.Item>
            <Form.Item name="siteName" label="站点名称">
              <Input />
            </Form.Item>
          </div>
          <Form.Item name="defaultModel" label="默认模型">
            <Select
              showSearch
              optionFilterProp="label"
              options={[
                { value: '', label: '暂不设置默认模型' },
                ...(modelId && !items.some((model) => model.id === modelId)
                  ? [{ value: modelId, label: `当前已保存模型：${modelId}` }]
                  : []),
                ...items.map((model) => ({
                  value: model.id,
                  label: formatModelOptionLabel(model),
                })),
              ]}
            />
          </Form.Item>
          {selected && (
            <Descriptions
              bordered
              size="small"
              column={{ xs: 1, sm: 2 }}
              items={[
                {
                  key: 'model',
                  label: '模型',
                  children: `${selected.name || selected.id} · ${selected.modality || 'text'}`,
                },
                {
                  key: 'context',
                  label: '上下文',
                  children: `${formatCompactNumber(selected.contextLength)} tokens`,
                },
                {
                  key: 'output',
                  label: '最大输出',
                  children: `${formatCompactNumber(selected.maxCompletionTokens)} tokens`,
                },
                {
                  key: 'inputPrice',
                  label: '输入价格',
                  children: formatPricePerMillion(selected.promptPricing),
                },
                {
                  key: 'outputPrice',
                  label: '输出价格',
                  children: formatPricePerMillion(selected.completionPricing),
                },
                {
                  key: 'inputModalities',
                  label: '输入模态',
                  children: formatModalities(selected.inputModalities),
                },
                {
                  key: 'outputModalities',
                  label: '输出模态',
                  children: formatModalities(selected.outputModalities),
                },
              ]}
            />
          )}
          {models.error && (
            <Alert type="error" showIcon title={`拉取模型失败：${models.error.message}`} />
          )}
          {connection.data && (
            <Alert
              type="success"
              showIcon
              title={`连接成功 · ${connection.data.modelCount} 个模型`}
              description={`默认模型：${connection.data.defaultModel || '未设置'}；示例：${connection.data.sampleModels.join('、')}`}
            />
          )}
          <FormActions hint={dirty ? '有未保存的修改' : `${items.length} 个可选模型`}>
            <Button
              type="primary"
              htmlType="submit"
              disabled={!dirty || pending}
              loading={save.isPending}
            >
              保存 OpenRouter 配置
            </Button>
            <Button disabled={pending} onClick={() => connection.mutate()}>
              测试连接
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                try {
                  models.mutate(payload());
                } catch (error) {
                  failure(error as Error);
                }
              }}
            >
              拉取模型列表
            </Button>
            <Button
              danger
              disabled={pending}
              onClick={() => {
                modal.confirm({
                  title: '清空 OpenRouter 数据库配置？',
                  content:
                    '清空后 AI API Hub 会回退到环境变量；如果环境变量也没有配置，中台将无法继续代理 OpenRouter 模型请求。',
                  okText: '确认清空',
                  cancelText: '取消',
                  okButtonProps: { danger: true },
                  onOk: () => clear.mutateAsync(),
                });
              }}
            >
              清空数据库配置
            </Button>
          </FormActions>
        </Form>
      </Card>
      <Card title="模型测试" style={{ marginTop: 24 }}>
        <Form
          form={chatForm}
          name="model-test"
          layout="vertical"
          initialValues={{ prompt: 'Hello, translate this to Chinese.' }}
          onFinish={() => chat.mutate()}
        >
          <Form.Item name="prompt" label="测试消息" rules={[{ required: true, whitespace: true }]}>
            <Input.TextArea rows={4} />
          </Form.Item>
          <FormActions>
            <Button htmlType="submit" disabled={!modelId || pending} loading={chat.isPending}>
              发送测试
            </Button>
          </FormActions>
        </Form>
        {chat.error && <Alert type="error" showIcon title={chat.error.message} />}
        {chat.data && (
          <>
            <Flex wrap gap={8} style={{ marginTop: 16 }}>
              <Tag color="success">{chat.data.model}</Tag>
              <Tag>
                Prompt {chat.data.usage.promptTokens ?? 0} / Completion{' '}
                {chat.data.usage.completionTokens ?? 0}
              </Tag>
            </Flex>
            <Typography.Paragraph
              style={{ whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto', marginTop: 16 }}
            >
              {chat.data.content}
            </Typography.Paragraph>
            {chat.data.finishReason && (
              <Typography.Text type="secondary">结束原因：{chat.data.finishReason}</Typography.Text>
            )}
          </>
        )}
      </Card>
    </AsyncState>
  );
}
