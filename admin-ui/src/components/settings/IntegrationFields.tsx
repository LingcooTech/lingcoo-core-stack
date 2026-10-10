import { useState, type ReactNode } from 'react';
import { Eye, EyeOff, Settings } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

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
    <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Settings className="size-4" />
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="rounded bg-green-500/10 px-2 py-1 text-xs text-green-700 dark:text-green-300">
          已配置 {count}/8
        </span>
        {children}
      </div>
    </header>
  );
}
export function IntegrationFields({
  fields,
  prefix,
  values,
  secrets = {},
  source,
  disabled = false,
  onChange,
}: {
  fields: readonly IntegrationField[];
  prefix: string;
  values: Record<string, unknown>;
  secrets?: Record<string, boolean>;
  source: string;
  disabled?: boolean;
  onChange(key: string, value: string | boolean | number): void;
}) {
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const sourceLabel =
    (
      { database: '管理后台', env: '环境变量', legacy: '原七牛配置', none: '系统默认' } as Record<
        string,
        string
      >
    )[source] || source;
  return (
    <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
      {fields.map((field) => {
        const id = `${prefix}-${field.key}`;
        return (
          <section
            key={field.key}
            data-setting-key={field.key}
            className="flex min-w-0 flex-col justify-between gap-5 border-b py-6"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor={id}>{field.label}</Label>
                <span className="rounded bg-blue-500/10 px-2 py-0.5 text-xs text-blue-700 dark:text-blue-300">
                  {sourceLabel}
                </span>
                {field.control === 'secret' && (
                  <span className="rounded bg-red-500/10 px-2 py-0.5 text-xs text-red-600">
                    敏感
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{field.description}</p>
            </div>
            {field.control === 'boolean' ? (
              <button
                id={id}
                type="button"
                role="switch"
                aria-label={field.label}
                aria-checked={Boolean(values[field.key])}
                disabled={disabled}
                className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${values[field.key] ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                onClick={() => onChange(field.key, !values[field.key])}
              >
                <span
                  className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${values[field.key] ? 'left-0.5 translate-x-5' : 'left-0.5'}`}
                />
              </button>
            ) : field.control === 'select' ? (
              <select
                id={id}
                value={String(values[field.key] ?? '')}
                disabled={disabled}
                className="h-9 w-full rounded-full border bg-background px-3 text-sm disabled:opacity-50"
                onChange={(event) => onChange(field.key, event.target.value)}
              >
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <div className="relative">
                <Input
                  id={id}
                  type={
                    field.control === 'secret'
                      ? visible[field.key]
                        ? 'text'
                        : 'password'
                      : (field.control ?? 'text')
                  }
                  value={String(values[field.key] ?? '')}
                  autoComplete={field.control === 'secret' ? 'new-password' : 'off'}
                  placeholder={
                    field.control === 'secret'
                      ? secrets[field.key]
                        ? '已配置；输入完整新值以替换'
                        : '输入完整敏感设置值'
                      : undefined
                  }
                  disabled={disabled}
                  className={`rounded-full ${field.control === 'secret' ? 'pr-10' : ''}`}
                  min={field.control === 'number' ? 1 : undefined}
                  max={field.control === 'number' ? 65535 : undefined}
                  onChange={(event) =>
                    onChange(
                      field.key,
                      field.control === 'number'
                        ? event.target.value === ''
                          ? ''
                          : Number(event.target.value)
                        : event.target.value,
                    )
                  }
                />
                {field.control === 'secret' && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`${visible[field.key] ? '隐藏' : '显示'}${field.label}`}
                    className="absolute top-0 right-0 size-9 rounded-full"
                    onClick={() => setVisible((v) => ({ ...v, [field.key]: !v[field.key] }))}
                  >
                    {visible[field.key] ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </Button>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
