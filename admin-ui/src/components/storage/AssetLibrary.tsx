import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Alert,
  Button,
  Card,
  Descriptions,
  Flex,
  Form,
  Input,
  Modal,
  Select,
  Table,
  Tag,
  Typography,
  type TableColumnsType,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  FileOutlined,
  FolderOutlined,
  FolderAddOutlined,
  ReloadOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import type { AssetSummary, AssetDetail } from '@lingcoo/contracts';
import * as api from '@/api/storage';
import { ManagementDrawer } from '@/components/admin/ManagementDrawer';
import { AsyncState } from '@/components/admin/AsyncState';
import { PageToolbar, FormActions } from '@/components/admin/PageContainer';
import { useSettingsForm } from '@/lib/settings-form';
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
      style={
        compact
          ? { height: 48, width: 64, objectFit: 'contain' }
          : { maxHeight: 256, width: '100%', objectFit: 'contain' }
      }
    />
  ) : (
    <Flex align="center" gap={8}>
      <FileOutlined aria-hidden="true" style={{ fontSize: compact ? 24 : 48 }} />
      <Typography.Text type="secondary">{kindLabels[asset.mediaKind]}</Typography.Text>
    </Flex>
  );
}
export function AssetLibrary({
  onSelect,
  imagesOnly = false,
  onConfigure,
}: {
  onSelect?: (asset: AssetSummary) => void;
  imagesOnly?: boolean;
  onConfigure?: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth(),
    role = normalizeRole(user?.role),
    { message } = App.useApp();
  const canManage = hasPermission(role, 'storage.manage'),
    canConfigure = hasPermission(role, 'settings.manage');
  const qc = useQueryClient(),
    fileInput = useRef<HTMLInputElement>(null),
    [modal, context] = Modal.useModal();
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [kind, setKind] = useState<string | undefined>();
  const [folder, setFolder] = useState('all'),
    [selected, setSelected] = useState<string | null>(null);
  const [folderEditor, setFolderEditor] = useState<{ id?: string } | null>(null);
  const [folderForm] = Form.useForm<{ name: string }>();
  const folders = useQuery({ queryKey: ['storage-folders'], queryFn: api.listFolders });
  const assets = useQuery({
    queryKey: ['storage-assets', page, search, kind, folder, imagesOnly],
    queryFn: () =>
      api.listAssets({
        page,
        search: search || undefined,
        mediaKind: imagesOnly ? 'image' : kind,
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
  const failure = (error: Error) => {
    void message.error(error.message);
  };
  const upload = useMutation({
    mutationFn: (file: File) => {
      if (!canManage) throw new Error('没有素材管理权限');
      return api.uploadAsset(
        file,
        ['all', 'root'].includes(folder) ? null : folder,
        onSelect ? 'public' : 'private',
      );
    },
    onSuccess: async (asset) => {
      void message.success('素材上传完成');
      await refresh();
      if (onSelect && asset.publicUrl) onSelect(asset);
    },
    onError: failure,
  });
  const saveFolder = useMutation({
    mutationFn: ({ name }: { name: string }) => {
      if (!canManage || !folderEditor) throw new Error('没有文件夹管理权限');
      return folderEditor.id
        ? api.renameFolder(folderEditor.id, name.trim())
        : api.createFolder(name.trim());
    },
    onSuccess: async (result) => {
      setFolderEditor(null);
      folderForm.resetFields();
      setFolder(result.id);
      setPage(1);
      await refresh();
    },
    onError: failure,
  });
  const removeFolder = useMutation({
    mutationFn: api.deleteFolder,
    onSuccess: async () => {
      setFolder('all');
      setPage(1);
      await refresh();
    },
    onError: failure,
  });
  const editFolder = (id?: string, name = '') => {
    folderForm.resetFields();
    folderForm.setFieldsValue({ name });
    setFolderEditor(id ? { id } : {});
  };
  const columns: TableColumnsType<AssetSummary> = [
    {
      title: '预览',
      key: 'preview',
      width: 90,
      render: (_, asset) => <AssetPreview asset={asset} compact />,
    },
    {
      title: '素材',
      key: 'name',
      width: 240,
      render: (_, asset) => (
        <div>
          <Button
            type="link"
            style={{ padding: 0, maxWidth: 220 }}
            onClick={() => setSelected(asset.id)}
          >
            <Typography.Text ellipsis>{asset.displayName}</Typography.Text>
          </Button>
          <br />
          <Typography.Text type="secondary">
            {asset.originalName} · {sizeLabel(asset.sizeBytes)}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: '文件夹',
      key: 'folder',
      width: 140,
      render: (_, asset) =>
        folders.data?.items.find((item) => item.id === asset.folderId)?.name || '未分类',
    },
    {
      title: '类型',
      dataIndex: 'mediaKind',
      width: 100,
      render: (value: keyof typeof kindLabels) => kindLabels[value],
    },
    {
      title: '可见性',
      dataIndex: 'visibility',
      width: 90,
      render: (value) => <Tag>{value === 'public' ? '公开' : '私有'}</Tag>,
    },
    { title: '引用', dataIndex: 'referenceCount', width: 80 },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 180,
      render: (value: string) => new Date(value).toLocaleString(),
    },
    ...(onSelect
      ? [
          {
            title: '操作',
            key: 'choose',
            width: 100,
            render: (_: unknown, asset: AssetSummary) => (
              <Button size="small" disabled={!asset.publicUrl} onClick={() => onSelect(asset)}>
                {asset.publicUrl ? '选择' : '需先公开'}
              </Button>
            ),
          },
        ]
      : []),
  ];
  return (
    <div className="admin-asset-library">
      {context}
      {onSelect && (
        <Typography.Paragraph type="secondary">
          此处上传的图片将公开供业务页面使用。
        </Typography.Paragraph>
      )}
      <PageToolbar
        filters={
          <>
            <Input.Search
              aria-label="搜索素材"
              placeholder="搜索名称或原文件名"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              style={{ width: 260 }}
            />
            {!imagesOnly && (
              <Select
                aria-label="素材类型"
                allowClear
                placeholder="全部类型"
                value={kind}
                style={{ width: 150 }}
                onChange={(value) => {
                  setKind(value);
                  setPage(1);
                }}
                options={Object.entries(kindLabels).map(([value, label]) => ({ value, label }))}
              />
            )}
          </>
        }
        actions={
          <>
            <Button icon={<ReloadOutlined aria-hidden="true" />} onClick={() => void refresh()}>
              刷新
            </Button>
            {canManage && (
              <Button icon={<FolderAddOutlined aria-hidden="true" />} onClick={() => editFolder()}>
                新建文件夹
              </Button>
            )}
            {canConfigure && (
              <Button
                onClick={() => {
                  onConfigure?.();
                  const params = new URLSearchParams({
                    tab: 'storage',
                    returnTo: location.pathname + location.search + location.hash,
                  });
                  void navigate(`/admin/settings?${params.toString()}`);
                }}
              >
                存储设置
              </Button>
            )}
            {canManage && (
              <Button
                type="primary"
                icon={<UploadOutlined aria-hidden="true" />}
                disabled={upload.isPending}
                loading={upload.isPending}
                onClick={() => fileInput.current?.click()}
              >
                上传素材
              </Button>
            )}
          </>
        }
      />
      <input
        ref={fileInput}
        type="file"
        hidden
        aria-label="上传素材文件"
        accept={imagesOnly ? 'image/jpeg,image/png,image/gif,image/webp,image/avif' : accept}
        disabled={!canManage || upload.isPending}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload.mutate(file);
          event.target.value = '';
        }}
      />
      <div className="admin-asset-layout">
        <Card size="small" title="文件夹" className="admin-asset-folders">
          <AsyncState
            loading={folders.isPending}
            error={folders.error}
            onRetry={() => void folders.refetch()}
          >
            <nav aria-label="素材文件夹">
              {[
                { id: 'all', name: '全部素材' },
                { id: 'root', name: '未分类' },
                ...(folders.data?.items ?? []),
              ].map((item) => (
                <Flex key={item.id} gap={2} style={{ marginBottom: 6 }}>
                  <Button
                    icon={<FolderOutlined aria-hidden="true" />}
                    type={folder === item.id ? 'primary' : 'text'}
                    style={{ minWidth: 0, flex: 1, justifyContent: 'start' }}
                    onClick={() => {
                      setFolder(item.id);
                      setPage(1);
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.name}
                    </span>
                  </Button>
                  {canManage && !['all', 'root'].includes(item.id) && (
                    <>
                      <Button
                        type="text"
                        icon={<EditOutlined aria-hidden="true" />}
                        aria-label={`重命名 ${item.name}`}
                        onClick={() => editFolder(item.id, item.name)}
                      />
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined aria-hidden="true" />}
                        aria-label={`删除文件夹 ${item.name}`}
                        onClick={() => {
                          modal.confirm({
                            title: '删除文件夹',
                            content: '仅可删除没有素材的文件夹。',
                            okText: '删除',
                            cancelText: '取消',
                            okButtonProps: { danger: true },
                            onOk: () => removeFolder.mutateAsync(item.id),
                          });
                        }}
                      />
                    </>
                  )}
                </Flex>
              ))}
            </nav>
          </AsyncState>
        </Card>
        <div style={{ minWidth: 0 }}>
          <AsyncState error={assets.error} onRetry={() => void assets.refetch()}>
            <Table
              rowKey="id"
              columns={columns}
              dataSource={assets.data?.items ?? []}
              loading={assets.isPending}
              scroll={{ x: 1020 }}
              locale={{ emptyText: '暂无素材，上传文件开始使用' }}
              pagination={{
                current: page,
                pageSize: 20,
                total: assets.data?.total ?? 0,
                showSizeChanger: false,
                showTotal: (total) => `共 ${total} 项`,
                onChange: setPage,
              }}
            />
          </AsyncState>
        </div>
      </div>
      {selected && (
        <AssetDrawer
          id={selected}
          canManage={canManage}
          onChanged={refresh}
          onClose={() => setSelected(null)}
        />
      )}
      <Modal
        open={Boolean(folderEditor)}
        title={folderEditor?.id ? '重命名文件夹' : '新建文件夹'}
        onCancel={() => {
          if (!saveFolder.isPending) setFolderEditor(null);
        }}
        destroyOnHidden
        confirmLoading={saveFolder.isPending}
        okText="保存文件夹"
        cancelText="取消"
        onOk={() => folderForm.submit()}
      >
        <Form
          form={folderForm}
          name="asset-folder"
          layout="vertical"
          disabled={saveFolder.isPending}
          onFinish={(values) => saveFolder.mutate(values)}
        >
          <Form.Item
            name="name"
            label="文件夹名称"
            rules={[{ required: true, whitespace: true, max: 80 }]}
          >
            <Input aria-label="文件夹名称" autoFocus maxLength={80} />
          </Form.Item>
          {saveFolder.error && <Alert type="error" title={saveFolder.error.message} />}
        </Form>
      </Modal>
    </div>
  );
}
function AssetDrawer({
  id,
  canManage,
  onChanged,
  onClose,
}: {
  id: string;
  canManage: boolean;
  onChanged(): Promise<void>;
  onClose(): void;
}) {
  const query = useQuery({ queryKey: ['storage-asset', id], queryFn: () => api.getAsset(id) });
  if (query.data)
    return (
      <AssetEditor
        asset={query.data}
        canManage={canManage}
        onChanged={onChanged}
        onClose={onClose}
      />
    );
  return (
    <ManagementDrawer open title="素材详情" onClose={onClose}>
      <AsyncState
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {null}
      </AsyncState>
    </ManagementDrawer>
  );
}
const editorValues = (asset: AssetDetail) => ({
  displayName: asset.displayName,
  altText: asset.altText ?? '',
  visibility: asset.visibility,
  folderId: asset.folderId ?? 'root',
});
function AssetEditor({
  asset,
  canManage,
  onChanged,
  onClose,
}: {
  asset: AssetDetail;
  canManage: boolean;
  onChanged(): Promise<void>;
  onClose(): void;
}) {
  const { message } = App.useApp(),
    [modal, context] = Modal.useModal();
  const [base, setBase] = useState(asset);
  const { form, dirty, reset } = useSettingsForm(editorValues(base));
  useEffect(() => {
    if (!dirty && asset.revision > base.revision) setBase(asset);
  }, [asset, dirty, base.revision]);
  const replacement = useRef<HTMLInputElement>(null);
  const folders = useQuery({ queryKey: ['storage-folders'], queryFn: api.listFolders });
  const failure = (error: Error) => {
    void message.error(error.message);
  };
  const save = useMutation({
    mutationFn: (values: ReturnType<typeof editorValues>) =>
      api.updateAsset(base, {
        ...values,
        altText: values.altText || null,
        folderId: values.folderId === 'root' ? null : values.folderId,
      }),
    onSuccess: async (result) => {
      setBase(result);
      reset(editorValues(result));
      void message.success('素材信息已更新');
      await onChanged();
    },
    onError: failure,
  });
  const replace = useMutation({
    mutationFn: (file: File) => api.uploadAsset(file, base.folderId, base.visibility, base),
    onSuccess: async (result) => {
      setBase(result);
      reset(editorValues(result));
      void message.success('素材内容已替换，原链接保持有效');
      await onChanged();
    },
    onError: failure,
  });
  const remove = useMutation({
    mutationFn: () => api.deleteAsset(base),
    onSuccess: async () => {
      await onChanged();
      onClose();
    },
    onError: failure,
  });
  const pending = save.isPending || replace.isPending || remove.isPending;
  const close = () => {
    if (pending) return;
    if (dirty)
      modal.confirm({
        title: '放弃未保存的素材修改？',
        okText: '放弃修改',
        cancelText: '继续编辑',
        onOk: onClose,
      });
    else onClose();
  };
  return (
    <ManagementDrawer
      open
      title="素材详情"
      onClose={close}
      footer={
        <FormActions hint={dirty ? '有未保存的修改' : '替换文件保持素材链接稳定'}>
          <Button onClick={close} disabled={pending}>
            关闭
          </Button>
          {canManage && (
            <>
              <Button
                type="primary"
                loading={save.isPending}
                disabled={!dirty || pending}
                onClick={() => form.submit()}
              >
                保存信息
              </Button>
              <Button disabled={pending || dirty} onClick={() => replacement.current?.click()}>
                替换文件
              </Button>
              <Button
                danger
                disabled={pending || asset.referenceCount > 0}
                onClick={() => {
                  modal.confirm({
                    title: '删除素材',
                    content: '删除后素材链接将失效，文件由后台清理。',
                    okText: '删除素材',
                    cancelText: '取消',
                    okButtonProps: { danger: true },
                    onOk: () => remove.mutateAsync(),
                  });
                }}
              >
                删除素材
              </Button>
            </>
          )}
        </FormActions>
      }
    >
      {context}
      <AssetPreview asset={asset} />
      <Button href={asset.contentUrl} download={asset.originalName} style={{ marginBlock: 16 }}>
        下载文件
      </Button>
      <Descriptions
        column={1}
        size="small"
        items={[
          { key: 'id', label: '素材标识', children: asset.id },
          { key: 'name', label: '原文件名', children: asset.originalName },
          { key: 'size', label: '大小', children: sizeLabel(asset.sizeBytes) },
          { key: 'refs', label: '引用数量', children: asset.referenceCount },
          {
            key: 'checksum',
            label: '内容校验值',
            children: (
              <Typography.Text style={{ overflowWrap: 'anywhere' }}>
                {asset.checksumSha256}
              </Typography.Text>
            ),
          },
          { key: 'version', label: '当前版本', children: `v${asset.currentVersion}` },
        ]}
      />
      <Form
        name="asset"
        form={form}
        layout="vertical"
        disabled={!canManage || pending}
        onFinish={(values) => save.mutate(values)}
      >
        <Form.Item
          name="displayName"
          label="显示名称"
          htmlFor="asset-name"
          rules={[{ required: true, whitespace: true, max: 200 }]}
        >
          <Input id="asset-name" maxLength={200} />
        </Form.Item>
        <Form.Item name="altText" label="替代文本">
          <Input id="asset-alt" maxLength={500} />
        </Form.Item>
        <Form.Item name="folderId" label="所属文件夹">
          <Select
            id="asset-folder"
            options={[
              { value: 'root', label: '未分类' },
              ...(folders.data?.items ?? []).map((item) => ({ value: item.id, label: item.name })),
            ]}
          />
        </Form.Item>
        <Form.Item name="visibility" label="可见性">
          <Select
            id="asset-visibility"
            options={[
              { value: 'private', label: '私有（仅后台可读）', disabled: asset.referenceCount > 0 },
              { value: 'public', label: '公开（允许业务页面访问）' },
            ]}
          />
        </Form.Item>
      </Form>
      {folders.error && (
        <Alert
          type="error"
          title={folders.error.message}
          action={<Button onClick={() => void folders.refetch()}>重试</Button>}
        />
      )}
      {asset.publicUrl && (
        <Form layout="vertical">
          <Form.Item label="公开素材地址" htmlFor="asset-url">
            <Input id="asset-url" readOnly value={asset.publicUrl} />
          </Form.Item>
          <Button
            onClick={() => {
              void navigator.clipboard
                .writeText(asset.publicUrl!)
                .then(() => message.success('链接已复制'))
                .catch(() => message.error('复制失败，请手动复制'));
            }}
          >
            复制链接
          </Button>
        </Form>
      )}
      {asset.referenceCount > 0 && (
        <Alert
          type="info"
          showIcon
          title="素材正在被业务引用；可以替换内容，解除引用后才能删除或改为私有。"
        />
      )}
      {(save.error || replace.error) && (
        <Alert
          style={{ marginTop: 16 }}
          type="error"
          showIcon
          title={save.error?.message || replace.error?.message}
        />
      )}
      <input
        ref={replacement}
        type="file"
        hidden
        aria-label="替换素材文件"
        accept={accept}
        disabled={!canManage || pending || dirty}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) replace.mutate(file);
          event.target.value = '';
        }}
      />
      <Card size="small" title="版本记录" style={{ marginTop: 24 }}>
        <Table
          rowKey="id"
          pagination={false}
          dataSource={asset.versions}
          columns={[
            { title: '版本', dataIndex: 'version', render: (value) => `v${value}` },
            { title: '原文件名', dataIndex: 'originalName' },
            {
              title: '状态',
              dataIndex: 'status',
              render: (value: AssetDetail['versions'][number]['status']) =>
                ({
                  ready: '当前可用',
                  pending: '待上传',
                  failed: '失败',
                  deletion_pending: '待清理',
                  deleted: '已清理',
                })[value],
            },
          ]}
        />
      </Card>
    </ManagementDrawer>
  );
}
