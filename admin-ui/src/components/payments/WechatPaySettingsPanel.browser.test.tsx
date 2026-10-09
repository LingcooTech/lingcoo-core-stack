import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import type { PaymentProviderConfig } from '@lingcoo/contracts/models';
import { PaymentsPage } from '@/pages/PaymentsPage';
const mocks = vi.hoisted(() => ({ api: vi.fn(), role: 'admin' }));
vi.mock('@/api/client', () => ({ apiClient: mocks.api }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { role: mocks.role } }) }));
const pem = `-----BEGIN PRIVATE KEY-----\n${'A'.repeat(128)}\n-----END PRIVATE KEY-----`;
const apiV3Key = '12345678901234567890123456789012';
const initial = (): PaymentProviderConfig => ({
  code: 'wechat_pay',
  source: 'database',
  configured: true,
  values: {
    enabled: true,
    appId: 'wx0123456789abcdef',
    mchId: '1234567890',
    merchantSerial: 'fixture-serial',
    publicKeyId: 'PUB_KEY_ID_fixture',
    notifyUrl: 'https://stack.example.test/v1/billing/providers/wechat/notify',
  },
  secrets: {
    apiV3Key: { configured: true },
    privateKeyPem: { configured: true },
    publicKeyPem: { configured: true },
  },
});
async function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <PaymentsPage />
      </QueryClientProvider>,
    ),
  );
  return {
    host,
    client,
    dispose: async () => {
      await act(async () => root.unmount());
      client.clear();
      host.remove();
    },
  };
}
function button(host: ParentNode, label: string) {
  const result = Array.from(host.querySelectorAll('button')).find(
    (item) => item.textContent === label,
  );
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
}
function input(host: ParentNode, name: string, value: string) {
  const element = host.querySelector<HTMLInputElement>(`input[name=${name}]`)!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}
async function upload(host: ParentNode, file: File) {
  const element = host.querySelector<HTMLInputElement>('input[name=privateKeyPem]')!;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  await act(async () => {
    element.files = transfer.files;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

test('Edu-style PEM upload and group save retain failed drafts, only send edits and clear secrets on success', async () => {
  mocks.role = 'admin';
  mocks.api.mockReset();
  let settings = initial(),
    writes = 0;
  mocks.api.mockImplementation(async (id: string, _path: string, options?: { body: string }) => {
    if (id.startsWith('PUT')) {
      if (++writes === 1) throw new Error('Temporary save failure');
      const saved = JSON.parse(options!.body);
      settings = {
        ...settings,
        values: { ...settings.values, enabled: saved.enabled, notifyUrl: saved.notifyUrl },
      };
      return settings;
    }
    return { items: [settings] };
  });
  const { host, client, dispose } = await mount();
  try {
    await vi.waitFor(() => expect(host.textContent).toContain('已配置 9/9'));
    expect(button(host, '保存微信支付设置').disabled).toBe(true);
    expect(host.querySelector('textarea')).toBeNull();
    await upload(host, new File([pem], 'apiclient_key.pem', { type: 'text/plain' }));
    await vi.waitFor(() => expect(host.textContent).toContain('已读取 apiclient_key.pem'));
    expect(host.textContent).not.toContain('-----BEGIN');
    await act(async () => {
      input(host, 'apiV3Key', apiV3Key);
      input(host, 'notifyUrl', 'https://stack.example.test/custom-notify');
      host.querySelector<HTMLButtonElement>('#wechat-enabled')!.click();
    });
    await act(async () => button(host, '支付宝').click());
    await act(async () => button(host, '微信支付').click());
    expect(host.textContent).toContain('已读取 apiclient_key.pem');
    expect(host.querySelector<HTMLInputElement>('input[name=apiV3Key]')!.value).toBe(apiV3Key);
    await act(async () => button(host, '保存微信支付设置').click());
    await vi.waitFor(() =>
      expect(host.textContent).toContain('Temporary save failure；待保存内容已保留'),
    );
    expect(host.querySelector<HTMLInputElement>('input[name=apiV3Key]')!.value).toBe(apiV3Key);
    expect(host.textContent).toContain('已读取 apiclient_key.pem');
    await act(async () => button(host, '保存微信支付设置').click());
    await vi.waitFor(() => expect(button(host, '保存微信支付设置').disabled).toBe(true));
    const calls = mocks.api.mock.calls.filter((call) => String(call[0]).startsWith('PUT'));
    expect(calls).toHaveLength(2);
    expect(JSON.parse(calls[0]![2].body)).toEqual({
      enabled: false,
      apiV3Key,
      privateKeyPem: pem,
      notifyUrl: 'https://stack.example.test/custom-notify',
    });
    expect(calls[0]![2].body).toBe(calls[1]![2].body);
    expect(host.querySelector<HTMLInputElement>('input[name=apiV3Key]')!.value).toBe('');
    expect(host.textContent).not.toContain('已读取 apiclient_key.pem');
    expect(host.textContent).toContain('已配置；上传新文件可替换');
    expect(host.querySelector('#wechat-enabled')!.getAttribute('aria-checked')).toBe('false');
    expect(host.querySelector<HTMLInputElement>('input[name=notifyUrl]')!.value).toBe(
      'https://stack.example.test/custom-notify',
    );
    // A later background refresh cannot resurrect a saved secret draft.
    settings = { ...settings, values: { ...settings.values, mchId: '1234567899' } };
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['payment-settings'] });
    });
    expect(host.querySelector<HTMLInputElement>('input[name=apiV3Key]')!.value).toBe('');
  } finally {
    await dispose();
  }
});

test('invalid PEM selection and invalid values cannot overwrite settings; same file can be reselected', async () => {
  mocks.role = 'admin';
  mocks.api.mockReset();
  mocks.api.mockResolvedValue({ items: [initial()] });
  const { host, dispose } = await mount();
  try {
    await vi.waitFor(() => expect(host.textContent).toContain('已配置 9/9'));
    for (const [file, error] of [
      [new File([pem], 'key.txt'), '请选择 .pem 格式文件'],
      [new File(['x'.repeat(20_001)], 'large.pem'), 'PEM 文件不能超过 20KB'],
      [new File(['not a PEM'], 'bad.pem'), '请选择有效的 PEM 格式文件'],
    ] as const) {
      await upload(host, file);
      await vi.waitFor(() => expect(host.textContent).toContain(error));
      expect(button(host, '保存微信支付设置').disabled).toBe(true);
    }
    const file = new File([pem], 'apiclient_key.pem');
    await upload(host, file);
    await vi.waitFor(() => expect(host.textContent).toContain('已读取 apiclient_key.pem'));
    await act(async () => button(host, '取消替换').click());
    expect(button(host, '保存微信支付设置').disabled).toBe(true);
    await upload(host, file);
    await vi.waitFor(() => expect(host.textContent).toContain('已读取 apiclient_key.pem'));
    await act(async () => {
      input(host, 'appId', 'invalid-app-id');
      input(host, 'notifyUrl', 'http://stack.example.test/notify');
    });
    await act(async () => host.querySelector('form')!.requestSubmit());
    await vi.waitFor(() => expect(host.textContent).toContain('AppID 须为 wx 开头'));
    expect(host.textContent).toContain('支付回调地址必须使用 HTTPS');
    expect(mocks.api.mock.calls.filter((call) => String(call[0]).startsWith('PUT'))).toHaveLength(
      0,
    );
  } finally {
    await dispose();
  }
});

test('readonly payment settings disable every control and failed loads expose retry instead of an empty editor', async () => {
  mocks.role = 'support';
  mocks.api.mockReset();
  mocks.api.mockResolvedValue({ items: [initial()] });
  let mounted = await mount();
  try {
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('当前账号仅可查看支付设置'));
    expect(
      Array.from(mounted.host.querySelectorAll('form input')).every(
        (element) => (element as HTMLInputElement).disabled,
      ),
    ).toBe(true);
    expect(button(mounted.host, '保存微信支付设置').disabled).toBe(true);
    expect(button(mounted.host, '清除本组后台配置').disabled).toBe(true);
  } finally {
    await mounted.dispose();
  }
  mocks.role = 'admin';
  mocks.api.mockRejectedValue(new Error('Load failed'));
  mounted = await mount();
  try {
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('支付设置加载失败'));
    expect(mounted.host.querySelector('form')).toBeNull();
    mocks.api.mockResolvedValue({ items: [initial()] });
    await act(async () => button(mounted.host, '重新加载').click());
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('支付回调地址'));
  } finally {
    await mounted.dispose();
  }
});

test('clearing a group needs confirmation and removes unsaved sensitive drafts after success', async () => {
  mocks.role = 'admin';
  mocks.api.mockReset();
  let settings = initial();
  mocks.api.mockImplementation(async (id: string) => {
    if (id.startsWith('DELETE')) {
      settings = {
        ...initial(),
        source: 'none',
        configured: false,
        values: {
          enabled: false,
          notifyUrl: 'https://stack.example.test/v1/billing/providers/wechat/notify',
        },
        secrets: {},
      };
      return;
    }
    return { items: [settings] };
  });
  const { host, dispose } = await mount();
  try {
    await vi.waitFor(() => expect(host.textContent).toContain('已配置 9/9'));
    await act(async () => input(host, 'apiV3Key', apiV3Key));
    await act(async () => button(host, '清除本组后台配置').click());
    expect(document.body.textContent).toContain('若需停止新支付，请关闭');
    expect(mocks.api.mock.calls.some((call) => String(call[0]).startsWith('DELETE'))).toBe(false);
    await act(async () => button(document.body, '清空配置').click());
    await vi.waitFor(() => expect(host.textContent).toContain('配置未完成'));
    expect(host.querySelector<HTMLInputElement>('input[name=apiV3Key]')!.value).toBe('');
    expect(button(host, '保存微信支付设置').disabled).toBe(true);
  } finally {
    await dispose();
  }
});
