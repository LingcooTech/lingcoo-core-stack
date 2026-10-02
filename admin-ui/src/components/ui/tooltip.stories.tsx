import type { Meta, StoryObj } from '@storybook/react-vite';
import { Info, Settings } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const meta = {
  title: 'UI/Tooltip',
  component: Tooltip,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Tooltip（基于 Radix Tooltip）。表格中状态徽章、缩略文案、图标按钮的必备件。全局 TooltipProvider 已在 App.tsx 注入，组件内直接用 Tooltip 即可。',
      },
    },
  },
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IconButton: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="设置">
          <Settings />
        </Button>
      </TooltipTrigger>
      <TooltipContent>账户设置</TooltipContent>
    </Tooltip>
  ),
};

export const InfoHint: Story = {
  render: () => (
    <div className="flex items-center gap-2 text-sm">
      <span>支付宝 App-Token</span>
      <Tooltip>
        <TooltipTrigger>
          <Info className="size-4 text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          支付宝开发者中心 → 网页/移动应用 → 应用详情 → 应用 AppId，长度 16 位。
        </TooltipContent>
      </Tooltip>
    </div>
  ),
};
