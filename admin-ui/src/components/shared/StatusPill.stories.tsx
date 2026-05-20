import type { Meta, StoryObj } from '@storybook/react-vite';

import { StatusPill, statusToTone } from '@/components/shared/StatusPill';

const meta = {
  title: 'Shared/StatusPill',
  component: StatusPill,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '资源状态徽章，统一架构文档中 ok/warn/danger/neutral/info 五档 tone。颜色来自 Phase B.1 的 status semantic token (bg-status-{tone}-bg / text-status-{tone}-fg / border-status-{tone}-border)，主题切换通过重映射这些 token 完成。',
      },
    },
  },
  args: {
    tone: 'ok',
    label: '已激活',
  },
  argTypes: {
    tone: {
      control: 'inline-radio',
      options: ['ok', 'warn', 'danger', 'neutral', 'info'],
    },
  },
} satisfies Meta<typeof StatusPill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllTones: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <StatusPill tone="ok" label="已激活" />
      <StatusPill tone="warn" label="处理中" />
      <StatusPill tone="danger" label="已失败" />
      <StatusPill tone="neutral" label="未配置" />
      <StatusPill tone="info" label="环境" />
    </div>
  ),
};

export const FromStatusString: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-2">
      {['active', 'paid', 'pending', 'failed', 'env', 'unknown'].map((status) => (
        <div key={status} className="flex items-center gap-3">
          <code className="text-muted-foreground w-24 text-xs">{status}</code>
          <StatusPill tone={statusToTone(status)} label={status} />
        </div>
      ))}
    </div>
  ),
};
