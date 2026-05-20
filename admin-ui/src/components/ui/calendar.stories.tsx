import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const meta = {
  title: 'UI/Calendar (DatePicker pattern)',
  component: Calendar,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Calendar 直接可用，DatePicker 由 Calendar + Popover 组合而成（shadcn pattern，非独立组件）。下方 stories 展示推荐组合用法。',
      },
    },
  },
} satisfies Meta<typeof Calendar>;

export default meta;
type Story = StoryObj;

export const Inline: Story = {
  render: () => {
    const [date, setDate] = useState<Date | undefined>(new Date());
    return <Calendar mode="single" selected={date} onSelect={setDate} locale={zhCN} />;
  },
};

export const SingleDatePicker: Story = {
  render: () => {
    const [date, setDate] = useState<Date | undefined>();
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'w-[260px] justify-start text-left font-normal',
              !date && 'text-muted-foreground',
            )}
          >
            <CalendarIcon className="size-4" />
            {date ? format(date, 'PPP', { locale: zhCN }) : '选择日期'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={date} onSelect={setDate} locale={zhCN} autoFocus />
        </PopoverContent>
      </Popover>
    );
  },
};

export const DateRangePicker: Story = {
  render: () => {
    const [range, setRange] = useState<DateRange | undefined>();
    const label = range?.from
      ? range.to
        ? `${format(range.from, 'M/d', { locale: zhCN })} - ${format(range.to, 'M/d', { locale: zhCN })}`
        : format(range.from, 'PPP', { locale: zhCN })
      : '选择区间';
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'w-[260px] justify-start text-left font-normal',
              !range?.from && 'text-muted-foreground',
            )}
          >
            <CalendarIcon className="size-4" />
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={range}
            onSelect={setRange}
            locale={zhCN}
            numberOfMonths={2}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    );
  },
};
