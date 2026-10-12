import { useState } from 'react';
import { Button, Card, Input, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { PageContainer, PageToolbar } from '@/components/admin/PageContainer';
import { AsyncState } from '@/components/admin/AsyncState';
import { AppConnections } from '@/components/admin/apps/AppConnections';
import { listAppConnections } from '@/api/app-lifecycle';
import { listDevelopmentProjects, listDevelopmentInventory } from '@/api/development';

export function DevelopmentPage() {
  const path = useLocation().pathname;
  const section = path.split('/').at(-1) ?? 'projects';
  return (
    <PageContainer
      title={
        {
          projects: '开发项目',
          connections: '开发连接',
          repositories: 'Git 仓库',
          images: '镜像仓库',
        }[section] ?? '开发管理'
      }
    >
      <Tabs
        activeKey={section}
        items={[
          ['projects', '开发项目'],
          ['connections', '开发连接'],
          ['repositories', 'Git 仓库'],
          ['images', '镜像仓库'],
        ].map(([key, label]) => ({
          key: key!,
          label: <Link to={`/admin/development/${key}`}>{label}</Link>,
        }))}
      />
      {section === 'projects' ? (
        <DevelopmentProjects />
      ) : section === 'connections' ? (
        <Card>
          <AppConnections embedded />
        </Card>
      ) : (
        <DevelopmentInventory key={section} github={section === 'repositories'} />
      )}
    </PageContainer>
  );
}
function DevelopmentProjects() {
  const [search, setSearch] = useState('');
  const query = useQuery({ queryKey: ['development-projects'], queryFn: listDevelopmentProjects });
  return (
    <>
      <PageToolbar
        filters={
          <Input.Search
            placeholder="搜索项目名称、Code、仓库"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 320 }}
          />
        }
        actions={
          <Link to="/admin/development/projects/new">
            <Button type="primary">创建开发项目</Button>
          </Link>
        }
      />
      <AsyncState
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        <Table
          rowKey="id"
          scroll={{ x: 850 }}
          dataSource={query.data?.items.filter((p) =>
            `${p.code} ${p.name} ${p.repository ?? ''}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )}
          columns={[
            {
              title: '开发项目',
              render: (_, p) => (
                <Space orientation="vertical" size={0}>
                  <Link to={`/admin/development/projects/${p.code}`}>{p.name}</Link>
                  <Typography.Text type="secondary">{p.code}</Typography.Text>
                </Space>
              ),
            },
            {
              title: '源码仓库',
              dataIndex: 'repository',
              render: (v: string | null) =>
                v ? (
                  <a href={v} target="_blank" rel="noreferrer">
                    {v.replace('https://github.com/', '')}
                  </a>
                ) : (
                  '尚未关联'
                ),
            },
            {
              title: '交付声明',
              render: (_, p) => (
                <Tag color={p.definitionReady ? 'success' : 'default'}>
                  {p.definitionReady ? '已读取' : '待关联'}
                </Tag>
              ),
            },
            {
              title: '商品',
              render: (_, p) =>
                p.appId ? (
                  <Link to={`/admin/apps/${p.code}/edit`}>已创建 · 查看商品</Link>
                ) : (
                  '尚未创建'
                ),
            },
            {
              title: '操作',
              render: (_, p) => <Link to={`/admin/development/projects/${p.code}`}>管理项目</Link>,
            },
          ]}
        />
      </AsyncState>
    </>
  );
}
function DevelopmentInventory({ github }: { github: boolean }) {
  const [connectionId, setConnectionId] = useState<string>(),
    [namespace, setNamespace] = useState<string>(),
    [repository, setRepository] = useState<string>(),
    [repoId, setRepoId] = useState<string>(),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [manual, setManual] = useState(''),
    [cursors, setCursors] = useState<Record<number, string>>({});
  const connections = useQuery({ queryKey: ['app-connections'], queryFn: listAppConnections });
  const selected = connections.data?.items.find((c) => c.id === connectionId);
  const kind = github ? 'github' : repository ? 'tags' : namespace ? 'repositories' : 'namespaces';
  const query = useQuery({
    queryKey: [
      'development-inventory',
      connectionId,
      kind,
      namespace,
      repository,
      repoId,
      page,
      cursors[page],
    ],
    enabled: !!connectionId,
    queryFn: () =>
      listDevelopmentInventory(
        connectionId!,
        new URLSearchParams({
          kind,
          page: String(page),
          ...(namespace ? { namespace } : {}),
          ...(repository ? { repository } : {}),
          ...(repoId ? { repoId } : {}),
          ...(cursors[page] ? { cursor: cursors[page] } : {}),
        }),
      ),
  });
  const reset = () => {
    setNamespace(undefined);
    setRepository(undefined);
    setRepoId(undefined);
    setPage(1);
    setSearch('');
    setManual('');
    setCursors({});
  };
  const rows = query.data?.items.filter((r) =>
    `${r.name} ${r.description ?? ''}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <PageToolbar
        filters={
          <>
            <Select
              aria-label="开发连接"
              placeholder={github ? '选择 GitHub 连接' : '选择 ACR 管理／镜像拉取连接'}
              value={connectionId}
              style={{ width: 300 }}
              onChange={(v) => {
                setConnectionId(v);
                reset();
              }}
              options={connections.data?.items
                .filter((c) => (github ? c.kind === 'github' : c.kind !== 'github'))
                .map((c) => ({ value: c.id, label: c.name }))}
            />
            <Input.Search
              placeholder="筛选当前页"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 240 }}
            />
          </>
        }
        actions={
          <Link to="/admin/development/connections">
            <Button>管理连接</Button>
          </Link>
        }
      />
      {selected?.kind === 'registry' && (
        <Card size="small">
          <Space wrap>
            <Input
              aria-label="镜像仓库路径"
              placeholder="命名空间/镜像仓库"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              style={{ width: 300 }}
            />
            <Button
              disabled={!manual.trim()}
              onClick={() => {
                setRepository(manual.trim());
                setPage(1);
                setCursors({});
              }}
            >
              读取镜像版本
            </Button>
            <Typography.Text type="secondary">
              个人版 ACR 不提供管理 OpenAPI。列表来自开发项目声明；可输入其他仓库路径读取标签。
            </Typography.Text>
          </Space>
        </Card>
      )}
      {!github && (namespace || repository) && (
        <Space>
          <Button onClick={reset}>返回命名空间</Button>
          {repository && (
            <Button
              onClick={() => {
                setRepository(undefined);
                setRepoId(undefined);
                setCursors({});
                setPage(1);
              }}
            >
              返回镜像仓库
            </Button>
          )}
          <Typography.Text>{repository ?? namespace}</Typography.Text>
        </Space>
      )}
      <AsyncState
        loading={
          connections.isPending ||
          (!!connectionId && query.isPending && query.fetchStatus === 'fetching')
        }
        error={connections.error || query.error}
        onRetry={() => void query.refetch()}
        empty={!connectionId}
        emptyText="选择开发连接后读取资源列表"
      >
        <Table
          rowKey="id"
          pagination={false}
          scroll={{ x: 700 }}
          dataSource={rows}
          columns={[
            {
              title: github
                ? 'Git 仓库'
                : kind === 'namespaces'
                  ? '命名空间'
                  : kind === 'repositories'
                    ? '镜像仓库'
                    : '镜像版本',
              dataIndex: 'name',
              render: (v: string, r) =>
                r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer">
                    {v}
                  </a>
                ) : (
                  v
                ),
            },
            ...(github
              ? [
                  {
                    title: '可见性',
                    render: (_: unknown, r: NonNullable<typeof rows>[number]) => (
                      <Tag>{r.private ? '私有' : '公开'}</Tag>
                    ),
                  },
                  { title: '默认分支', dataIndex: 'defaultBranch' },
                  { title: '说明', dataIndex: 'description' },
                ]
              : kind === 'tags'
                ? [
                    {
                      title: 'Digest',
                      dataIndex: 'digest',
                      render: (v: string | undefined) =>
                        v ? (
                          <Typography.Text copyable style={{ wordBreak: 'break-all' }}>
                            {v}
                          </Typography.Text>
                        ) : (
                          '—'
                        ),
                    },
                  ]
                : []),
            {
              title: '操作',
              render: (_, r) =>
                github ? (
                  <Link
                    to={`/admin/development/projects/new?${new URLSearchParams({ repository: r.url!, ref: r.defaultBranch ?? 'main', connectionId: connectionId! })}`}
                  >
                    读取交付声明
                  </Link>
                ) : kind === 'namespaces' ? (
                  <Button
                    type="link"
                    onClick={() => {
                      setNamespace(r.name);
                      setPage(1);
                    }}
                  >
                    查看镜像仓库
                  </Button>
                ) : kind === 'repositories' ? (
                  <Button
                    type="link"
                    onClick={() => {
                      setRepository(r.repository ?? r.name);
                      setRepoId(selected?.kind === 'acr' ? r.id : undefined);
                      setCursors({});
                      setPage(1);
                    }}
                  >
                    查看镜像版本
                  </Button>
                ) : (
                  <Typography.Text
                    copyable={{
                      text: `${selected?.host}/${repository}${r.digest ? '@' + r.digest : ':' + r.name}`,
                    }}
                  >
                    复制引用
                  </Typography.Text>
                ),
            },
          ]}
        />
        <Space style={{ marginTop: 16 }}>
          <Button disabled={page === 1 || query.isFetching} onClick={() => setPage((p) => p - 1)}>
            上一页
          </Button>
          <Typography.Text>第 {page} 页</Typography.Text>
          <Button
            disabled={!query.data?.nextPage || query.isFetching}
            onClick={() => {
              const next = query.data!.nextPage!;
              if (query.data?.nextCursor)
                setCursors((v) => ({ ...v, [next]: query.data!.nextCursor! }));
              setPage(next);
            }}
          >
            下一页
          </Button>
          <Button
            loading={query.isFetching}
            disabled={!connectionId}
            onClick={() => void query.refetch()}
          >
            刷新
          </Button>
        </Space>
      </AsyncState>
    </Space>
  );
}
