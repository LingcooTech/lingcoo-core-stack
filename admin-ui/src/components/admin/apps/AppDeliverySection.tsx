import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Form,
  Input,
  Space,
  Switch,
  Table,
  Typography,
  Tag,
} from 'antd';
import {
  getManifestFieldGroups,
  getManifestFields,
  getManifestAssetGroups,
  computeDeliveryConfigured,
  isDeliveryFieldConfigured,
  serializeDeliveryManifestSourceDraft,
  type DeliveryManifestSourceDraft,
  type DeliverySettingsDraft,
  type DeliveryManifest,
  type DeliverySecretState,
} from '@/lib/app-delivery';
export function AppDeliverySection({
  manifest,
  secrets,
  create,
  savedSource,
  busy,
  onSync,
  onClear,
}: {
  manifest: DeliveryManifest | null;
  secrets: DeliverySecretState;
  create: boolean;
  savedSource: DeliveryManifestSourceDraft;
  busy: boolean;
  onSync: () => void;
  onClear: () => void;
}) {
  const form = Form.useFormInstance();
  const draft = Form.useWatch('delivery', { form, preserve: true }) as
    | DeliverySettingsDraft
    | undefined;
  const source = Form.useWatch('source', { form, preserve: true }) as
    | DeliveryManifestSourceDraft
    | undefined;
  const sourceDirty = Boolean(
    source &&
    serializeDeliveryManifestSourceDraft(source) !==
      serializeDeliveryManifestSourceDraft(savedSource),
  );
  const sourceConfigured = Boolean(source?.manifestUrl.trim() || source?.repoUrl.trim());
  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Card
        title="交付清单来源"
        extra={
          <Space wrap>
            <Tag color={manifest ? 'success' : 'default'}>
              {manifest ? `已同步 v${manifest.version}` : '待同步'}
            </Tag>
            <Button
              disabled={create || busy || sourceDirty || !sourceConfigured}
              loading={busy}
              onClick={onSync}
            >
              同步清单
            </Button>
          </Space>
        }
      >
        <Typography.Paragraph type="secondary">
          填写应用发布流程生成的清单地址，保存应用后同步；镜像、安装入口和参数定义会自动读取。
        </Typography.Paragraph>
        <Form.Item
          name={['source', 'manifestUrl']}
          label="清单 URL（推荐）"
          extra="填写可直接读取 JSON 的 HTTPS 地址，不是 Git 仓库页面或本机文件路径。填写后优先使用此地址。"
          rules={[{ type: 'url', message: '请填写有效的清单地址' }]}
        >
          <Input placeholder="https://downloads.example.com/apps/app-code/version/fd-delivery.manifest.json" />
        </Form.Item>
        <Collapse
          items={[
            {
              key: 'github',
              label: '从 GitHub 仓库读取（另一种来源）',
              children: (
                <div className="admin-form-grid">
                  <Form.Item
                    name={['source', 'repoUrl']}
                    label="公开 GitHub 仓库地址"
                    extra="清单 URL 留空时生效；应使用可公开读取的交付仓库，不需要公开应用源码。"
                  >
                    <Input placeholder="https://github.com/your-org/app-delivery" />
                  </Form.Item>
                  <Form.Item
                    name={['source', 'repoBranch']}
                    label="分支、标签或提交"
                    extra="正式发布建议固定到版本标签或提交。"
                  >
                    <Input placeholder="main" />
                  </Form.Item>
                  <Form.Item
                    name={['source', 'manifestPath']}
                    label="清单在仓库中的路径"
                    extra="相对于仓库根目录，例如 delivery/fd-delivery.manifest.json。"
                  >
                    <Input placeholder="fd-delivery.manifest.json" />
                  </Form.Item>
                </div>
              ),
            },
          ]}
        />
        {(create || sourceDirty) && (
          <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
            先保存应用，再同步清单；同步不会自动上架。
          </Typography.Paragraph>
        )}
      </Card>
      {!manifest ? (
        <Alert
          type="warning"
          title="尚未同步交付清单"
          description="先填写来源并保存应用，再点击“同步清单”。空白草稿可以先保存。"
        />
      ) : (
        <>
          <Collapse
            items={[
              {
                key: 'installer',
                label: '安装入口（由交付清单提供）',
                children: (
                  <>
                    <Descriptions
                      column={1}
                      bordered
                      items={Object.entries(manifest.installer).map(([key, value]) => ({
                        key,
                        label: key,
                        children: value || '—',
                      }))}
                    />
                    {manifest.notes.map((note, i) => (
                      <p key={i}>{note}</p>
                    ))}
                  </>
                ),
              },
            ]}
          />
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            平台填写镜像版本、仓库账号等共用配置；客户服务器
            IP、域名和初始化信息在部署时填写。托管资源由平台分配。
          </Typography.Paragraph>
          {getManifestFieldGroups(manifest, 'preset').map((group) => (
            <Card
              key={group.key}
              title={group.label}
              extra={
                <Tag
                  color={
                    draft &&
                    group.fields.every((field) => isDeliveryFieldConfigured(field, draft, secrets))
                      ? 'success'
                      : 'processing'
                  }
                >
                  已填写{' '}
                  {draft
                    ? group.fields.filter((field) =>
                        isDeliveryFieldConfigured(field, draft, secrets),
                      ).length
                    : 0}
                  /{group.fields.length}
                </Tag>
              }
            >
              <p>{group.description}</p>
              <div className="admin-form-grid">
                {group.fields.map((field) => (
                  <Form.Item
                    key={field.key}
                    name={['delivery', field.type === 'secret' ? 'secrets' : 'values', field.key]}
                    label={field.label}
                    required={
                      field.required ||
                      manifest.assets.some(
                        (asset) => asset.required && asset.authSecret === field.key,
                      )
                    }
                    extra={
                      field.description ||
                      (field.type === 'secret'
                        ? '填写专用受限凭据；已配置时留空保留原值。'
                        : manifest.assets.some((asset) => asset.imageEnv === field.key)
                          ? '从镜像发布结果复制完整地址，格式为 registry/repo@sha256:完整摘要；正式版本不要使用 latest。'
                          : field.key.endsWith('USERNAME')
                            ? '填写镜像仓库提供的专用只读账号，不是 Stack 或应用管理员账号。'
                            : '由应用发布方提供；在各次部署中作为平台预设使用。')
                    }
                    valuePropName={field.type === 'boolean' ? 'checked' : 'value'}
                  >
                    {field.type === 'boolean' ? (
                      <Switch disabled={!field.editable} />
                    ) : field.type === 'secret' ? (
                      <Input.Password
                        autoComplete="new-password"
                        disabled={!field.editable}
                        placeholder={secrets[field.key] ? '已配置；留空保留原值' : '未配置'}
                      />
                    ) : (
                      <Input
                        type={field.type === 'email' ? 'email' : 'text'}
                        disabled={!field.editable}
                        placeholder={field.placeholder}
                      />
                    )}
                  </Form.Item>
                ))}
              </div>
            </Card>
          ))}
          <Collapse
            items={[
              {
                key: 'customer',
                label: '客户部署时填写的参数（此处只读）',
                children: (
                  <>
                    <Typography.Paragraph type="secondary">
                      以下参数由客户创建部署时填写，无需在应用上架时预填。自有服务器由客户提供
                      IP、域名并解析；托管实例由 Stack 分配服务器与默认子域名。
                    </Typography.Paragraph>
                    <Table
                      pagination={false}
                      size="small"
                      rowKey="key"
                      scroll={{ x: 600 }}
                      dataSource={getManifestFields(manifest, 'user_input')}
                      columns={[
                        { title: '参数', dataIndex: 'label' },
                        { title: 'Key', dataIndex: 'key' },
                        { title: '类型', dataIndex: 'type' },
                        {
                          title: '必填',
                          dataIndex: 'required',
                          render: (v: boolean) => (v ? '是' : '否'),
                        },
                        { title: '说明', dataIndex: 'description' },
                      ]}
                    />
                    <Descriptions
                      column={1}
                      items={manifest.domainSlots.map((slot) => ({
                        key: slot.key,
                        label: slot.label,
                        children: `${slot.envKey} ← ${slot.sourceField} · ${slot.required ? '必填' : '可选'} · ${slot.description ?? ''}`,
                      }))}
                    />
                  </>
                ),
              },
              {
                key: 'assets',
                label: '交付资产',
                children: getManifestAssetGroups(manifest).map((group) => (
                  <Card key={group.key} size="small" title={group.label}>
                    {group.assets.map((asset) => (
                      <Descriptions
                        key={asset.key}
                        column={1}
                        bordered
                        items={Object.entries(asset).map(([key, value]) => ({
                          key,
                          label: key,
                          children:
                            typeof value === 'boolean'
                              ? value
                                ? '是'
                                : '否'
                              : String(value ?? '—'),
                        }))}
                      />
                    ))}
                  </Card>
                )),
              },
            ]}
          />
        </>
      )}
      <Space wrap>
        <Tag
          color={
            draft && computeDeliveryConfigured(manifest, draft, secrets) ? 'success' : 'warning'
          }
        >
          {draft && computeDeliveryConfigured(manifest, draft, secrets)
            ? '平台必填项已填写'
            : '平台必填项待补齐'}
        </Tag>
        <Typography.Text type="secondary">
          保存后查看配置检查，确认是否满足上架条件。
        </Typography.Text>
      </Space>
      <Button danger disabled={busy || create} onClick={onClear}>
        清空交付配置
      </Button>
    </Space>
  );
}
