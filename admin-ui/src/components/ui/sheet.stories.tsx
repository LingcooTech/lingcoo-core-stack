import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

const meta = {
  title: 'UI/Sheet',
  component: SheetContent,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Drawer 抽屉（基于 Radix Dialog），Phase E 列表-详情副视图的基础原语。支持 left / right / top / bottom 四向。',
      },
    },
    layout: 'fullscreen',
  },
} satisfies Meta<typeof SheetContent>;

export default meta;
type Story = StoryObj;

export const Right: Story = {
  render: () => (
    <div className="flex h-screen items-center justify-center">
      <Sheet>
        <SheetTrigger asChild>
          <Button>右侧打开（资源详情）</Button>
        </SheetTrigger>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>订单详情</SheetTitle>
            <SheetDescription>这里展示订单的所有字段、状态与时间线。</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-auto px-4">
            <dl className="space-y-3 text-sm">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="flex justify-between border-b pb-2">
                  <dt className="text-muted-foreground">字段 #{i + 1}</dt>
                  <dd className="font-medium">示例值 {i + 1}</dd>
                </div>
              ))}
            </dl>
          </div>
          <SheetFooter>
            <Button>保存</Button>
            <SheetClose asChild>
              <Button variant="outline">取消</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  ),
};

export const Left: Story = {
  render: () => (
    <div className="flex h-screen items-center justify-center">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline">左侧打开</Button>
        </SheetTrigger>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle>导航</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    </div>
  ),
};

export const Bottom: Story = {
  render: () => (
    <div className="flex h-screen items-center justify-center">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline">底部打开（移动端典型）</Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[60vh]">
          <SheetHeader>
            <SheetTitle>筛选</SheetTitle>
            <SheetDescription>移动端常用的底部抽屉。</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    </div>
  ),
};
