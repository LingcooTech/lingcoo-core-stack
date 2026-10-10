import { Form, type FormInstance } from 'antd';
import { useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { AdminDraftContext } from '@/components/admin/draft-context';
import type { ZodType } from 'zod';

function snapshotFor(value: unknown): string | undefined {
  return JSON.stringify(value, (_, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([left], [right]) => left.localeCompare(right)),
        )
      : item,
  );
}

export function parseSettingsForm<T extends object>(
  schema: ZodType<T>,
  values: unknown,
  form: Pick<FormInstance, 'setFields'>,
): T {
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    form.setFields(
      parsed.error.issues
        .filter((issue) => issue.path.length)
        .map((issue) => ({
          name: issue.path.filter((part): part is string | number => typeof part !== 'symbol'),
          errors: [issue.message],
        })),
    );
    throw new Error(parsed.error.issues[0]?.message ?? '请检查表单');
  }
  return parsed.data;
}

// A background query refresh must not replace an unsaved draft. Form remains the only field store.
export function useSettingsForm<T extends object>(values: T | undefined) {
  const [form] = Form.useForm<T>();
  const baseline = useRef<T | undefined>(undefined);
  const [, rerender] = useState(0);
  Form.useWatch([], { form, preserve: true });
  const snapshot = snapshotFor(values);
  const reset = useCallback(
    (next: T) => {
      baseline.current = next;
      form.resetFields();
      form.setFieldsValue(next);
      rerender((revision) => revision + 1);
    },
    [form],
  );
  useEffect(() => {
    if (!snapshot) return;
    const current = form.getFieldsValue(true);
    if (!baseline.current || snapshotFor(current) === snapshotFor(baseline.current))
      reset(JSON.parse(snapshot) as T);
  }, [form, snapshot, reset]);
  const dirty = Boolean(
    baseline.current && snapshotFor(form.getFieldsValue(true)) !== snapshotFor(baseline.current),
  );
  const register = useContext(AdminDraftContext),
    id = useId();
  useEffect(() => {
    register?.(id, dirty);
    return () => register?.(id, false);
  }, [register, id, dirty]);
  return { form, dirty, reset };
}
