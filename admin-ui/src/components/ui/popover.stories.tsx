import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalendarIcon, Filter } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

const meta = {
  title: 'UI/Popover',
  component: Popover,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Popover（基于 Radix Popover）。FilterBar chip 编辑、轻量上下文菜单、临时表单的基础原语。比 Sheet 更轻、不 dim 背景；比 Tooltip 重，可点击交互。',
      },
    },
  },
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FilterChipEdit: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Filter className="size-3.5" />
          状态：未选择
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="space-y-3">
          <Label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            按状态筛选
          </Label>
          <div className="space-y-1">
            {['已激活', '处理中', '已失败', '已取消'].map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm">
                <input type="checkbox" /> {s}
              </label>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  ),
};

export const SimpleForm: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <CalendarIcon className="size-4" />
          调整截止日期
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-3">
          <Label htmlFor="due" className="text-sm font-medium">
            截止日期
          </Label>
          <Input id="due" type="date" />
          <Button size="sm" className="w-full">
            保存
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  ),
};
