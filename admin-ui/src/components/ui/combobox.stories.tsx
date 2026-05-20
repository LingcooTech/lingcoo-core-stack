import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Check, ChevronsUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const meta = {
  title: 'UI/Combobox (Command + Popover pattern)',
  component: Command,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Combobox 在 shadcn 不是独立组件，而是 Command (cmdk) + Popover 组合的 pattern。用于大数据量关联选择（用户、应用、套餐），自带搜索与键盘导航。',
      },
    },
  },
} satisfies Meta<typeof Command>;

export default meta;
type Story = StoryObj;

const apps = [
  { value: 'ai-translate', label: 'AI 翻译工作流' },
  { value: 'invoice-bot', label: '发票机器人' },
  { value: 'crm-sync', label: 'CRM 同步' },
  { value: 'ocr-toolkit', label: 'OCR 工具包' },
  { value: 'meeting-notes', label: '会议纪要' },
  { value: 'data-pipeline', label: '数据管道' },
];

export const AppSelector: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState('');

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-[260px] justify-between"
          >
            {value ? apps.find((a) => a.value === value)?.label : '选择应用…'}
            <ChevronsUpDown className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] p-0">
          <Command>
            <CommandInput placeholder="搜索应用…" />
            <CommandList>
              <CommandEmpty>没有匹配的应用。</CommandEmpty>
              <CommandGroup>
                {apps.map((app) => (
                  <CommandItem
                    key={app.value}
                    value={app.value}
                    onSelect={(current) => {
                      setValue(current === value ? '' : current);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn('size-4', value === app.value ? 'opacity-100' : 'opacity-0')}
                    />
                    {app.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  },
};
