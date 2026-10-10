import type { ReactNode } from 'react';
import { Flex, Form, Input, InputNumber, Select, Switch, Tag, Typography } from 'antd';
export type IntegrationField = {
  key: string;
  label: string;
  description: string;
  control?: 'secret' | 'number' | 'boolean' | 'select' | 'email' | 'url';
  options?: { label: string; value: string }[];
};
export function IntegrationHeader({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description: string;
  count: number;
  children?: ReactNode;
}) {
  return (
    <Flex justify="space-between" align="start" wrap gap={12} style={{ marginBottom: 24 }}>
      <div>
        <Typography.Title level={4}>{title}</Typography.Title>
        <Typography.Text type="secondary">{description}</Typography.Text>
      </div>
      <Flex align="center" wrap gap={12}>
        <Tag color="success">已配置 {count}/8</Tag>
        {children}
      </Flex>
    </Flex>
  );
}
export function IntegrationFields({
  fields,
  prefix,
  secrets = {},
  source,
  disabled = false,
}: {
  fields: readonly IntegrationField[];
  prefix: string;
  secrets?: Record<string, boolean>;
  source: string;
  disabled?: boolean;
}) {
  const sourceLabel =
    (
      { database: '管理后台', env: '环境变量', legacy: '原七牛配置', none: '系统默认' } as Record<
        string,
        string
      >
    )[source] || source;
  return (
    <div className="admin-form-grid">
      {fields.map((field) => (
        <Form.Item
          key={field.key}
          name={field.key}
          data-setting-key={field.key}
          label={
            <span>
              {field.label}{' '}
              <span aria-hidden="true">
                <Tag color="blue">{sourceLabel}</Tag>
                {field.control === 'secret' && <Tag color="red">敏感</Tag>}
              </span>
            </span>
          }
          htmlFor={`${prefix}-${field.key}`}
          extra={field.description}
          valuePropName={field.control === 'boolean' ? 'checked' : 'value'}
        >
          {field.control === 'boolean' ? (
            <Switch id={`${prefix}-${field.key}`} aria-label={field.label} disabled={disabled} />
          ) : field.control === 'select' ? (
            <Select
              id={`${prefix}-${field.key}`}
              aria-label={field.label}
              options={field.options}
              disabled={disabled}
            />
          ) : field.control === 'number' ? (
            <InputNumber
              id={`${prefix}-${field.key}`}
              aria-label={field.label}
              min={1}
              max={65535}
              precision={0}
              style={{ width: '100%' }}
              disabled={disabled}
            />
          ) : field.control === 'secret' ? (
            <Input.Password
              aria-label={field.label}
              id={`${prefix}-${field.key}`}
              autoComplete="new-password"
              placeholder={secrets[field.key] ? '已配置；输入完整新值以替换' : '输入完整敏感设置值'}
              disabled={disabled}
            />
          ) : (
            <Input
              aria-label={field.label}
              id={`${prefix}-${field.key}`}
              type={field.control ?? 'text'}
              autoComplete="off"
              disabled={disabled}
            />
          )}
        </Form.Item>
      ))}
    </div>
  );
}
