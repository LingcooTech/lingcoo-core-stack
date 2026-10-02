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
          '资源状态徽章，统一架构文档中 ok/warn/danger/neutral/info 五档 tone。Linear/Vercel 风格低饱和：浅色 50 背景 + 700 文本；深色 500/10 + 300 文本，dark 自适应。可通过 noDot 隐藏前置圆点。',
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
          <code className="w-24 text-xs text-muted-foreground">{status}</code>
          <StatusPill tone={statusToTone(status)} label={status} />
        </div>
      ))}
    </div>
  ),
};
