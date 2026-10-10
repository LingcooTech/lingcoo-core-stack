import {
  Alert,
  Button,
  Checkbox,
  Collapse,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Timeline,
} from 'antd';
import { useEffect, useState } from 'react';
import { useHostingExit } from '@/hooks/useHostingExit';
import { formatTime } from '@/lib/utils';
import { AsyncState } from './AsyncState';
import { AdminHostingHandoverPanel } from './HostingHandoverPanel';
export function AdminHostingExitPanel({ deploymentId }: { deploymentId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapse
      onChange={(keys) => setOpen(keys.includes('exit'))}
      items={[
        {
          key: 'exit',
          label: '服务退出与数据交接',
          children: <Exit deploymentId={deploymentId} open={open} />,
        },
      ]}
    />
  );
}
type ExitDraft = {
  reason?: string;
  retentionDays?: number;
  reference?: string;
  confirmed?: boolean;
};
function Exit({ deploymentId, open }: { deploymentId: string; open: boolean }) {
  const { canManage, query, mutation, exit, kind, validation, submit } = useHostingExit(
    deploymentId,
    true,
    open,
  );
  const [form] = Form.useForm<ExitDraft>();
  const [confirmation, setConfirmation] = useState<{ kind: string; values: ExitDraft } | null>(
    null,
  );
  useEffect(() => {
    if (mutation.isSuccess) {
      setConfirmation(null);
      form.resetFields();
    }
  }, [mutation.isSuccess, form]);
  return (
    <div className="space-y-4">
      <Alert
        type="info"
        title="申请后暂停续费及重启。运维确认后停止服务、保存数据和异机备份；不会自动删除数据或退款。"
      />
      <AsyncState
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {exit ? (
          <Descriptions
            column={1}
            bordered
            size="small"
            items={[
              {
                key: 'state',
                label: '状态',
                children: {
                  requested: '等待运维处理',
                  withdrawn: '已撤回退出',
                  stopping: '停服与备份中',
                  retained: '数据保留中',
                  completed: '交接已确认',
                }[exit.state],
              },
              { key: 'reason', label: '原因', children: exit.reason },
              {
                key: 'retainUntil',
                label: '数据至少保留至',
                children: exit.retainUntil ? formatTime(exit.retainUntil) : '尚未起算',
              },
              {
                key: 'evidence',
                label: '停服与异机备份校验',
                children: (
                  <span className="break-all">{exit.evidence?.manifestSha256 ?? '等待验证'}</span>
                ),
              },
              {
                key: 'reference',
                label: '交接说明',
                children: exit.handoverReference || '尚未登记',
              },
            ]}
          />
        ) : (
          <p>尚未申请退出</p>
        )}
        {kind && canManage && (
          <Form
            key={kind}
            form={form}
            layout="vertical"
            disabled={mutation.isPending}
            onFinish={(values: ExitDraft) => {
              mutation.reset();
              setConfirmation({ kind, values });
            }}
          >
            {kind === 'request' && (
              <Form.Item
                name="reason"
                label="退出原因"
                rules={[{ required: true }, { min: 5, max: 500 }]}
              >
                <Input.TextArea rows={3} />
              </Form.Item>
            )}
            {kind === 'start' && (
              <>
                <Form.Item
                  name="retentionDays"
                  label="数据保留天数"
                  extra="不得短于购买约定"
                  rules={[{ required: true }, { type: 'integer', min: 1, max: 3650 }]}
                >
                  <InputNumber min={1} max={3650} />
                </Form.Item>
                <Form.Item
                  name="confirmed"
                  valuePropName="checked"
                  rules={[
                    {
                      validator: (_, value: boolean) =>
                        value
                          ? Promise.resolve()
                          : Promise.reject(new Error('请确认停止服务并保留备份数据')),
                    },
                  ]}
                >
                  <Checkbox>确认停止此实例全部服务；完成备份后保留数据。</Checkbox>
                </Form.Item>
              </>
            )}
            {kind === 'handover' && (
              <Form.Item
                name="reference"
                label="数据交接说明"
                extra="交接工单或交付凭证，不填写密钥或下载口令"
                rules={[{ required: true }, { min: 5, max: 500 }]}
              >
                <Input.TextArea rows={3} />
              </Form.Item>
            )}
            <Button danger={kind === 'start'} htmlType="submit" loading={mutation.isPending}>
              {kind === 'request'
                ? '申请退出'
                : kind === 'start'
                  ? '确认停服并备份'
                  : '登记数据交接'}
            </Button>
          </Form>
        )}
        {exit && ['retained', 'completed'].includes(exit.state) && (
          <AdminHostingHandoverPanel
            deploymentId={deploymentId}
            version={exit.version}
            completed={exit.state === 'completed'}
            canManage={canManage}
          />
        )}
        {!!query.data?.events.length && (
          <Collapse
            items={[
              {
                key: 'history',
                label: '退出与交接记录',
                children: (
                  <Timeline
                    items={query.data.events.map((event) => ({
                      content: (
                        <>
                          <span>
                            {formatTime(event.createdAt)} ·{' '}
                            {exitEventLabels[event.kind] ?? event.kind}
                          </span>
                          {event.reason && <p>{event.reason}</p>}
                        </>
                      ),
                    }))}
                  />
                ),
              },
            ]}
          />
        )}
      </AsyncState>
      {(validation || mutation.error) && (
        <Alert type="error" title={validation || mutation.error?.message} />
      )}
      <Modal
        open={!!confirmation}
        title={
          confirmation?.kind === 'start' ? '确认停止实例并执行备份？' : '确认提交服务退出操作？'
        }
        okText="确认提交"
        cancelText="返回修改"
        okButtonProps={{ danger: confirmation?.kind === 'start' }}
        confirmLoading={mutation.isPending}
        onCancel={() => {
          if (!mutation.isPending) setConfirmation(null);
        }}
        onOk={() => {
          if (confirmation && !mutation.isPending) submit(confirmation.kind, confirmation.values);
        }}
      >
        <p>
          {confirmation?.kind === 'start'
            ? `将停止此实例全部服务，完成备份后保留数据至少 ${confirmation.values.retentionDays} 天。`
            : (confirmation?.values.reason ?? confirmation?.values.reference)}
        </p>
        {(validation || mutation.error) && (
          <Alert type="error" title={validation || mutation.error?.message} />
        )}
      </Modal>
    </div>
  );
}

const exitEventLabels: Record<string, string> = {
  request: '申请退出',
  withdraw: '客户撤回退出',
  start: '提交停服任务',
  node_confirmed: '节点确认停服与备份',
  handover: '登记数据交接',
  acknowledge: '客户确认交接',
  export_requested: '请求制作交付包',
  handover_ready: '加密交付包已验证',
  handover_key_received: '客户领取独立解密密钥',
  handover_download_granted: '签发短时下载授权',
  handover_download_started: '客户开始下载',
  handover_revoked: '交付包已撤销',
  reclaim_requested: '运维提交资源回收',
  reclaimed: '节点确认资源回收',
};
