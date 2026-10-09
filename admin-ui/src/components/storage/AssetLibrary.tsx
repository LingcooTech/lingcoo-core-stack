import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Folder,
  FolderPlus,
  FileText,
  Upload,
  RefreshCw,
  Settings,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { AssetSummary, AssetDetail } from '@lingcoo/contracts';
import * as api from '@/api/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { DataTable } from '@/components/shared/DataTable';
import { ConfirmActionDialog } from '@/components/shared/ConfirmActionDialog';
import { useAuth } from '@/lib/auth';
import { hasPermission, normalizeRole } from '@/lib/rbac';
const accept =
  'image/jpeg,image/png,image/gif,image/webp,image/avif,application/pdf,text/plain,text/csv';
const kindLabels = { image: '图片', document: 'PDF 文档', text: '文本' };
const sizeLabel = (size: number) =>
  size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${(size / 1024).toFixed(1)} KB`;
export function AssetPreview({
  asset,
  compact = false,
}: {
  asset: AssetSummary;
  compact?: boolean;
}) {
  return asset.mediaKind === 'image' ? (
    <img
      src={`${asset.contentUrl}?v=${asset.currentVersion}`}
      alt={asset.altText || asset.displayName}
      className={
        compact
          ? 'h-12 w-16 rounded border object-contain'
          : 'max-h-64 w-full rounded border bg-muted/30 object-contain'
      }
    />
  ) : (
    <div className="flex items-center gap-2 text-muted-foreground">
      <FileText className={compact ? 'size-8' : 'size-16'} />
      <span>{kindLabels[asset.mediaKind]}</span>
    </div>
  );
}
export function AssetLibrary({
  onSelect,
  imagesOnly = false,
}: {
  onSelect?: (asset: AssetSummary) => void;
  imagesOnly?: boolean;
}) {
  const { user } = useAuth(),
    role = normalizeRole(user?.role);
  const canManage = hasPermission(role, 'storage.manage'),
    canConfigure = hasPermission(role, 'settings.manage');
  const qc = useQueryClient(),
    fileInput = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [kind, setKind] = useState('');
  const [folder, setFolder] = useState('all'),
    [selected, setSelected] = useState<string | null>(null);
  const [folderEditor, setFolderEditor] = useState<{ id?: string; name: string } | null>(null);
  const [folderDeletion, setFolderDeletion] = useState<string | null>(null);
  const folders = useQuery({ queryKey: ['storage-folders'], queryFn: api.listFolders });
  const assets = useQuery({
    queryKey: ['storage-assets', page, search, kind, folder, imagesOnly],
    queryFn: () =>
      api.listAssets({
        page,
        search: search || undefined,
        mediaKind: imagesOnly ? 'image' : kind || undefined,
        folderId: folder === 'all' ? undefined : folder,
      }),
  });
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['storage-assets'] }),
      qc.invalidateQueries({ queryKey: ['storage-folders'] }),
      qc.invalidateQueries({ queryKey: ['storage-asset'] }),
    ]);
  };
  const upload = useMutation({
    mutationFn: (file: File) =>
      api.uploadAsset(
        file,
        ['all', 'root'].includes(folder) ? null : folder,
        onSelect ? 'public' : 'private',
      ),
    onSuccess: async (asset) => {
      toast.success('素材上传完成');
      await refresh();
      if (onSelect) onSelect(asset);
    },
    onError: (e) => toast.error(e.message),
  });
  const saveFolder = useMutation({
    mutationFn: () => {
      if (!folderEditor) throw new Error('请输入文件夹名称');
      return folderEditor.id
        ? api.renameFolder(folderEditor.id, folderEditor.name.trim())
        : api.createFolder(folderEditor.name.trim());
    },
    onSuccess: async (result) => {
      setFolderEditor(null);
      setFolder(result.id);
      setPage(1);
      await refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const removeFolder = useMutation({
    mutationFn: (id: string) => api.deleteFolder(id),
    onSuccess: async () => {
      setFolderDeletion(null);
      setFolder('all');
      setPage(1);
      await refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const chooseFolder = (id: string) => {
    setFolder(id);
    setPage(1);
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">
            {onSelect ? '选择营销素材' : '云存储 · 营销素材'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            统一管理图片、PDF 和 UTF-8 文本；替换文件保持素材链接稳定。
            {onSelect && '此处上传的图片将公开供业务页面使用。'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <Button variant="outline" onClick={() => setFolderEditor({ name: '' })}>
              <FolderPlus className="mr-2 size-4" />
              新建文件夹
            </Button>
          )}
          {canConfigure && (
            <Button variant="outline" asChild>
              <Link to="/admin/settings?tab=storage">
                <Settings className="mr-2 size-4" />
                存储设置
              </Link>
            </Button>
          )}
          {canManage && (
            <Button disabled={upload.isPending} onClick={() => fileInput.current?.click()}>
              <Upload className="mr-2 size-4" />
              {upload.isPending ? '上传中…' : '上传素材'}
            </Button>
          )}
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            aria-label="上传素材文件"
            accept={imagesOnly ? 'image/jpeg,image/png,image/gif,image/webp,image/avif' : accept}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate(file);
              e.target.value = '';
            }}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Input
          aria-label="搜索素材"
          placeholder="搜索名称或原文件名"
          className="w-full sm:w-64"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        {!imagesOnly && (
          <select
            aria-label="素材类型"
            className="rounded-md border bg-background px-3 text-sm"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部类型</option>
            <option value="image">图片</option>
            <option value="document">PDF 文档</option>
            <option value="text">文本</option>
          </select>
        )}
        <Button
          variant="outline"
          onClick={() => {
            void refresh();
          }}
        >
          <RefreshCw className="mr-2 size-4" />
          刷新
        </Button>
      </div>
      {(assets.error || folders.error) && (
        <p role="alert" className="text-sm text-destructive">
          {assets.error?.message || folders.error?.message}
        </p>
      )}
      <div className="flex flex-col gap-5 md:flex-row">
        <aside aria-label="素材文件夹" className="shrink-0 space-y-2 rounded-lg border p-3 md:w-52">
          <h3 className="mb-3 px-2 text-sm font-semibold">文件夹</h3>
          {[
            { id: 'all', name: '全部素材' },
            { id: 'root', name: '未分类' },
            ...(folders.data?.items ?? []),
          ].map((f) => (
            <div key={f.id} className="flex items-center gap-1">
              <Button
                className="min-w-0 flex-1 justify-start truncate"
                variant={folder === f.id ? 'secondary' : 'ghost'}
                onClick={() => chooseFolder(f.id)}
              >
                <Folder className="mr-2 size-4 shrink-0" />
                <span className="truncate">{f.name}</span>
              </Button>
              {canManage && !['all', 'root'].includes(f.id) && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    aria-label={`重命名 ${f.name}`}
                    onClick={() => setFolderEditor({ id: f.id, name: f.name })}
                  >
                    <Pencil className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    aria-label={`删除文件夹 ${f.name}`}
                    onClick={() => setFolderDeletion(f.id)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </aside>
        <div className="min-w-0 flex-1 overflow-hidden rounded-lg border">
          <DataTable<AssetSummary>
            data={assets.data?.items ?? []}
            isLoading={assets.isPending}
            getRowId={(a) => a.id}
            emptyMessage="暂无素材，上传文件开始使用"
            columns={[
              { key: 'preview', header: '预览', cell: (a) => <AssetPreview asset={a} compact /> },
              {
                key: 'name',
                header: '素材',
                cell: (a) => (
                  <div className="max-w-64">
                    <button
                      type="button"
                      className="truncate text-left font-medium text-primary hover:underline"
                      onClick={() => setSelected(a.id)}
                    >
                      {a.displayName}
                    </button>
                    <p className="truncate text-xs text-muted-foreground">
                      {a.originalName} · {sizeLabel(a.sizeBytes)}
                    </p>
                  </div>
                ),
              },
              {
                key: 'folder',
                header: '文件夹',
                cell: (a) => folders.data?.items.find((f) => f.id === a.folderId)?.name || '未分类',
              },
              { key: 'kind', header: '类型', cell: (a) => kindLabels[a.mediaKind] },
              {
                key: 'visibility',
                header: '可见性',
                cell: (a) => (a.visibility === 'public' ? '公开' : '私有'),
              },
              { key: 'refs', header: '引用', cell: (a) => a.referenceCount },
              {
                key: 'updated',
                header: '更新时间',
                cell: (a) => new Date(a.updatedAt).toLocaleString(),
              },
              ...(onSelect
                ? [
                    {
                      key: 'choose',
                      header: '操作',
                      cell: (a: AssetSummary) => (
                        <Button size="sm" disabled={!a.publicUrl} onClick={() => onSelect(a)}>
                          {a.publicUrl ? '选择' : '需先公开'}
                        </Button>
                      ),
                    },
                  ]
                : []),
            ]}
          />
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <span>共 {assets.data?.total ?? 0} 项</span>
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                上一页
              </Button>
              <span>第 {page} 页</span>
              <Button
                size="sm"
                variant="outline"
                disabled={page * 20 >= (assets.data?.total ?? 0)}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        </div>
      </div>
      <Sheet
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>素材详情</SheetTitle>
            <SheetDescription>查看文件、整理分类和管理内容版本。</SheetDescription>
          </SheetHeader>
          {selected && (
            <AssetDrawer
              key={selected}
              id={selected}
              canManage={canManage}
              onChanged={refresh}
              onDeleted={() => setSelected(null)}
            />
          )}
        </SheetContent>
      </Sheet>
      <Dialog
        open={Boolean(folderEditor)}
        onOpenChange={(open) => {
          if (!open) setFolderEditor(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{folderEditor?.id ? '重命名文件夹' : '新建文件夹'}</DialogTitle>
            <DialogDescription>用文件夹整理营销素材。</DialogDescription>
          </DialogHeader>
          <Input
            aria-label="文件夹名称"
            autoFocus
            maxLength={80}
            value={folderEditor?.name ?? ''}
            onChange={(e) => setFolderEditor((f) => (f ? { ...f, name: e.target.value } : null))}
          />
          <Button
            disabled={!folderEditor?.name.trim() || saveFolder.isPending}
            onClick={() => saveFolder.mutate()}
          >
            保存文件夹
          </Button>
        </DialogContent>
      </Dialog>
      <ConfirmActionDialog
        open={Boolean(folderDeletion)}
        onOpenChange={(open) => {
          if (!open) setFolderDeletion(null);
        }}
        title="删除文件夹"
        description="仅可删除没有素材的文件夹。"
        confirmText="删除"
        onConfirm={() => {
          if (folderDeletion) removeFolder.mutate(folderDeletion);
        }}
        isConfirming={removeFolder.isPending}
      />
    </div>
  );
}
function AssetDrawer({
  id,
  canManage,
  onChanged,
  onDeleted,
}: {
  id: string;
  canManage: boolean;
  onChanged: () => Promise<void>;
  onDeleted: () => void;
}) {
  const query = useQuery({ queryKey: ['storage-asset', id], queryFn: () => api.getAsset(id) });
  if (query.isPending) return <p className="p-6">加载素材详情…</p>;
  if (query.error)
    return (
      <p role="alert" className="p-6">
        {query.error.message}
      </p>
    );
  return query.data ? (
    <AssetEditor
      key={query.data.revision}
      asset={query.data}
      canManage={canManage}
      onChanged={onChanged}
      onDeleted={onDeleted}
    />
  ) : null;
}
function AssetEditor({
  asset,
  canManage,
  onChanged,
  onDeleted,
}: {
  asset: AssetDetail;
  canManage: boolean;
  onChanged: () => Promise<void>;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(asset.displayName),
    [alt, setAlt] = useState(asset.altText ?? ''),
    [visibility, setVisibility] = useState(asset.visibility),
    [folder, setFolder] = useState(asset.folderId ?? 'root');
  const [deleting, setDeleting] = useState(false),
    replacementInput = useRef<HTMLInputElement>(null);
  const folders = useQuery({ queryKey: ['storage-folders'], queryFn: api.listFolders });
  const save = useMutation({
    mutationFn: () =>
      api.updateAsset(asset, {
        displayName: name,
        altText: alt || null,
        visibility,
        folderId: folder === 'root' ? null : folder,
      }),
    onSuccess: async () => {
      toast.success('素材信息已更新');
      await onChanged();
    },
    onError: (e) => toast.error(e.message),
  });
  const replace = useMutation({
    mutationFn: (file: File) => api.uploadAsset(file, asset.folderId, asset.visibility, asset),
    onSuccess: async () => {
      toast.success('素材内容已替换，原链接保持有效');
      await onChanged();
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteAsset(asset),
    onSuccess: async () => {
      await onChanged();
      onDeleted();
    },
    onError: (e) => toast.error(e.message),
  });
  const dirty =
    name !== asset.displayName ||
    alt !== (asset.altText ?? '') ||
    visibility !== asset.visibility ||
    folder !== (asset.folderId ?? 'root');
  return (
    <div className="space-y-5 px-6 pb-8">
      <AssetPreview asset={asset} />
      <dl className="grid grid-cols-[auto_1fr] gap-2 text-sm">
        <dt>素材标识</dt>
        <dd className="break-all">{asset.id}</dd>
        <dt>原文件名</dt>
        <dd className="break-all">{asset.originalName}</dd>
        <dt>大小</dt>
        <dd>{sizeLabel(asset.sizeBytes)}</dd>
        <dt>引用数量</dt>
        <dd>{asset.referenceCount}</dd>
        <dt>内容校验值</dt>
        <dd className="text-xs break-all">{asset.checksumSha256}</dd>
        <dt>当前版本</dt>
        <dd>v{asset.currentVersion}</dd>
      </dl>
      <div className="space-y-2">
        <Label htmlFor="asset-name">显示名称</Label>
        <Input
          id="asset-name"
          value={name}
          disabled={!canManage}
          maxLength={200}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="asset-alt">替代文本</Label>
        <Input
          id="asset-alt"
          value={alt}
          disabled={!canManage}
          maxLength={500}
          onChange={(e) => setAlt(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="asset-folder">所属文件夹</Label>
        <select
          id="asset-folder"
          className="w-full rounded-md border bg-background p-2 text-sm"
          disabled={!canManage}
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
        >
          <option value="root">未分类</option>
          {folders.data?.items.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="asset-visibility">可见性</Label>
        <select
          id="asset-visibility"
          className="w-full rounded-md border bg-background p-2 text-sm"
          disabled={!canManage}
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as 'public' | 'private')}
        >
          <option value="private">私有（仅后台可读）</option>
          <option value="public">公开（允许业务页面访问）</option>
        </select>
      </div>
      {asset.publicUrl && (
        <div className="space-y-2">
          <Label htmlFor="asset-url">公开素材地址</Label>
          <Input id="asset-url" readOnly value={asset.publicUrl} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard
                .writeText(asset.publicUrl!)
                .then(() => toast.success('链接已复制'))
                .catch(() => toast.error('复制失败，请手动复制'));
            }}
          >
            复制链接
          </Button>
        </div>
      )}
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <Button disabled={!dirty || !name.trim() || save.isPending} onClick={() => save.mutate()}>
            保存信息
          </Button>
          <Button
            variant="outline"
            disabled={replace.isPending}
            onClick={() => replacementInput.current?.click()}
          >
            替换文件
          </Button>
          <Button
            variant="destructive"
            disabled={asset.referenceCount > 0}
            onClick={() => setDeleting(true)}
          >
            删除素材
          </Button>
          <input
            ref={replacementInput}
            type="file"
            aria-label="替换素材文件"
            className="hidden"
            accept={accept}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) replace.mutate(file);
              e.target.value = '';
            }}
          />
        </div>
      )}
      {asset.referenceCount > 0 && (
        <p className="text-sm text-muted-foreground">
          素材正在被业务引用；可以替换内容，解除引用后才能删除或改为私有。
        </p>
      )}
      <div>
        <h3 className="mb-2 text-sm font-semibold">版本记录</h3>
        <ul className="space-y-2 text-sm">
          {asset.versions.map((v) => (
            <li key={v.id} className="flex flex-wrap justify-between gap-2 border-b py-2">
              <span>
                v{v.version} · {v.originalName}
              </span>
              <span className="text-muted-foreground">
                {
                  {
                    ready: '当前可用',
                    pending: '待上传',
                    failed: '失败',
                    deletion_pending: '待清理',
                    deleted: '已清理',
                  }[v.status]
                }
              </span>
            </li>
          ))}
        </ul>
      </div>
      <ConfirmActionDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="删除素材"
        description="删除后素材链接将失效，文件由后台清理。"
        confirmText="删除素材"
        isConfirming={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}
