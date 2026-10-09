import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { AssetLibrary } from './AssetLibrary';
import { StorageSettingsPanel } from './StorageSettingsPanel';
import type { AssetDetail } from '@lingcoo/contracts';
const mocks = vi.hoisted(() => ({ api: vi.fn(), role: 'admin' }));
vi.mock('@/api/client', () => ({ apiClient: mocks.api }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { role: mocks.role } }) }));
const assetId = '11111111-1111-4111-8111-111111111111';
function fixture(): AssetDetail {
  return {
    id: assetId,
    folderId: null,
    displayName: '示例素材',
    altText: null,
    visibility: 'public',
    mediaKind: 'text',
    revision: 2,
    currentVersion: 1,
    originalName: 'fixture.txt',
    contentType: 'text/plain',
    sizeBytes: 5,
    checksumSha256: 'a'.repeat(64),
    referenceCount: 0,
    contentUrl: '/fixture.txt',
    publicUrl: `https://stack.example.test/v1/assets/${assetId}/content`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    versions: [
      {
        id: assetId,
        version: 1,
        originalName: 'fixture.txt',
        contentType: 'text/plain',
        sizeBytes: 5,
        checksumSha256: 'a'.repeat(64),
        status: 'ready',
        createdAt: new Date().toISOString(),
      },
    ],
  };
}
async function mount(element: React.ReactNode) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await act(async () =>
    root.render(
      <MemoryRouter>
        <QueryClientProvider client={client}>{element}</QueryClientProvider>
      </MemoryRouter>,
    ),
  );
  return {
    host,
    dispose: async () => {
      await act(async () => root.unmount());
      client.clear();
      host.remove();
    },
  };
}
function button(text: string) {
  const b = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === text);
  if (!b) throw new Error('Missing button ' + text);
  return b;
}
function value(selector: string, text: string) {
  const input = document.querySelector<HTMLInputElement>(selector)!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
async function file(label: string, filename: string) {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  const transfer = new DataTransfer();
  transfer.items.add(new File(['hello'], filename, { type: 'text/plain' }));
  await act(async () => {
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
test('Edu-style folder creation, upload, detail editing and replacement use the same asset library', async () => {
  mocks.role = 'admin';
  mocks.api.mockReset();
  let asset: AssetDetail | null = null;
  let folders: { id: string; name: string; count: number }[] = [];
  mocks.api.mockImplementation(
    async (id: string, _path: string, options?: { body?: string | File }) => {
      if (id === 'GET /v1/admin/storage/folders') return { items: folders };
      if (id === 'POST /v1/admin/storage/folders') {
        folders = [{ id: assetId, name: JSON.parse(String(options!.body)).name, count: 0 }];
        return folders[0];
      }
      if (id === 'GET /v1/admin/storage/assets')
        return { items: asset ? [asset] : [], total: asset ? 1 : 0, page: 1, pageSize: 20 };
      if (id === 'GET /v1/admin/storage/assets/:id') return asset;
      if (id.includes('POST') && (id.includes('/uploads') || id.includes('/replacements')))
        return { assetId, objectId: assetId };
      if (id === 'PUT /v1/admin/storage/uploads/:id/content') {
        const old = asset;
        asset = {
          ...fixture(),
          folderId: assetId,
          displayName: old?.displayName || '示例素材',
          currentVersion: (old?.currentVersion || 0) + 1,
          revision: (old?.revision || 1) + 1,
          originalName: (options!.body as File).name,
        };
        return asset;
      }
      if (id === 'PATCH /v1/admin/storage/assets/:id') {
        asset = { ...asset!, ...JSON.parse(String(options!.body)), revision: asset!.revision + 1 };
        return asset;
      }
      throw new Error('Unexpected endpoint ' + id);
    },
  );
  const view = await mount(<AssetLibrary />);
  try {
    await vi.waitFor(() => expect(view.host.textContent).toContain('暂无素材'));
    await act(async () => button('新建文件夹').click());
    await act(async () => value('input[aria-label="文件夹名称"]', '品牌素材'));
    await act(async () => button('保存文件夹').click());
    await vi.waitFor(() => expect(view.host.textContent).toContain('品牌素材'));
    await file('上传素材文件', 'fixture.txt');
    await vi.waitFor(() => expect(view.host.textContent).toContain('示例素材'));
    await act(async () => button('示例素材').click());
    await vi.waitFor(() => expect(document.body.textContent).toContain('素材详情'));
    await vi.waitFor(() => expect(document.querySelector('#asset-name')).not.toBeNull());
    await act(async () => value('#asset-name', '新名称'));
    await act(async () => button('保存信息').click());
    await vi.waitFor(() => expect(view.host.textContent).toContain('新名称'));
    await file('替换素材文件', 'replacement.txt');
    await vi.waitFor(() => expect(document.body.textContent).toContain('v2'));
    expect(document.querySelector<HTMLInputElement>('#asset-url')!.value).toContain(
      `/v1/assets/${assetId}/content`,
    );
    const grant = mocks.api.mock.calls.find((call) => call[0] === 'POST /v1/admin/storage/uploads');
    expect(JSON.parse(grant![2].body).folderId).toBe(assetId);
  } finally {
    await view.dispose();
  }
});
test('read-only viewers cannot upload or change folders', async () => {
  mocks.role = 'finance';
  mocks.api.mockReset();
  mocks.api.mockImplementation(async (id: string) =>
    id.includes('folders')
      ? { items: [] }
      : { items: [fixture()], total: 1, page: 1, pageSize: 20 },
  );
  const view = await mount(<AssetLibrary />);
  try {
    await vi.waitFor(() => expect(view.host.textContent).toContain('示例素材'));
    expect(view.host.textContent).not.toContain('上传素材');
    expect(view.host.textContent).not.toContain('新建文件夹');
  } finally {
    await view.dispose();
  }
});
test('S3 settings retain saved secrets, show legacy migration guidance and keep failed drafts', async () => {
  mocks.api.mockReset();
  let saves = 0;
  mocks.api.mockImplementation(async (id: string) => {
    if (id.startsWith('PUT')) {
      saves++;
      throw new Error('Fixture unavailable');
    }
    return {
      configured: false,
      source: 'legacy',
      values: {
        region: '',
        endpoint: '',
        bucket: 'legacy-bucket',
        defaultPrefix: 'assets',
        forcePathStyle: false,
        publicBaseUrl: '',
      },
      secrets: { accessKey: { configured: true }, secretKey: { configured: true } },
    };
  });
  const view = await mount(<StorageSettingsPanel />);
  try {
    await vi.waitFor(() => expect(view.host.textContent).toContain('待补充 S3'));
    expect(button('保存配置').disabled).toBe(true);
    expect(document.querySelector<HTMLInputElement>('#storage-secretKey')!.value).toBe('');
    await act(async () => value('#storage-region', 'cn-east-1'));
    await act(async () => button('保存配置').click());
    await vi.waitFor(() => expect(saves).toBe(1));
    expect(document.querySelector<HTMLInputElement>('#storage-region')!.value).toBe('cn-east-1');
  } finally {
    await view.dispose();
  }
});
