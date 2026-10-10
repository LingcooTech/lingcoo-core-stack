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
  Tag,
} from 'antd';
import {
  getManifestFieldGroups,
  getManifestFields,
  getManifestAssetGroups,
  computeDeliveryConfigured,
  type DeliverySettingsDraft,
  type DeliveryManifest,
  type DeliverySecretState,
} from '@/lib/app-delivery';
export function AppDeliverySection({
  manifest,
  secrets,
  create,
  busy,
  onSync,
  onClear,
}: {
  manifest: DeliveryManifest | null;
  secrets: DeliverySecretState;
  create: boolean;
  busy: boolean;
  onSync: () => void;
  onClear: () => void;
}) {
  const draft = Form.useWatch('delivery', Form.useFormInstance()) as
    | DeliverySettingsDraft
    | undefined;
  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Tag
        color={draft && computeDeliveryConfigured(manifest, draft, secrets) ? 'success' : 'warning'}
      >
        {draft && computeDeliveryConfigured(manifest, draft, secrets)
          ? '交付配置完整'
          : '配置未完成'}
      </Tag>
      <Card
        title="交付 Manifest 来源"
        extra={
          <Button disabled={create || busy} loading={busy} onClick={onSync}>
            同步 Manifest
          </Button>
        }
      >
        <Alert
          type="info"
          showIcon
          title="保存配置后进行发布前检查。同步 Manifest 不会自动发布应用。"
        />
        <div className="admin-form-grid">
          {[
            ['repoUrl', 'Git 仓库地址'],
            ['repoBranch', '分支'],
            ['manifestPath', 'Manifest 路径'],
            ['manifestUrl', 'Manifest URL'],
          ].map(([key = '', label = '']) => (
            <Form.Item key={key} name={['source', key]} label={label}>
              <Input />
            </Form.Item>
          ))}
        </div>
      </Card>
      {!manifest ? (
        <Alert type="warning" title="尚未同步有效的交付 Manifest" />
      ) : (
        <>
          <Card title={`安装器 · Manifest ${manifest.version}`}>
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
          </Card>
          {getManifestFieldGroups(manifest, 'preset').map((group) => (
            <Card key={group.key} title={group.label} extra={<Tag>平台预设</Tag>}>
              <p>{group.description}</p>
              <div className="admin-form-grid">
                {group.fields.map((field) => (
                  <Form.Item
                    key={field.key}
                    name={['delivery', field.type === 'secret' ? 'secrets' : 'values', field.key]}
                    label={field.label}
                    extra={field.description}
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
                label: '客户部署参数与域名槽位',
                children: (
                  <>
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
      <Button danger disabled={busy} onClick={onClear}>
        清空交付配置
      </Button>
    </Space>
  );
}
