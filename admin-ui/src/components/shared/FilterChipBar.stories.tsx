import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { FilterChipBar } from '@/components/shared/FilterChipBar';

const meta = {
  title: 'Shared/FilterChipBar',
  component: FilterChipBar,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Phase D.4：资源页统一筛选条。chip 点击展开 Popover 选项，支持多选 + 可选搜索；状态可与 useTableState 接通做 URL 同步。',
      },
    },
    layout: 'padded',
  },
} satisfies Meta<typeof FilterChipBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OrdersFilters: Story = {
  render: () => {
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<string[]>(['paid']);
    const [provider, setProvider] = useState<string[]>([]);
    const [app, setApp] = useState<string[]>([]);

    return (
      <FilterChipBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="按订单号 / 邮箱搜索..."
        chips={[
          {
            id: 'status',
            label: '状态',
            values: status,
            onChange: setStatus,
            options: [
              { value: 'pending', label: '待支付' },
              { value: 'paid', label: '已支付' },
              { value: 'failed', label: '失败' },
              { value: 'refunded', label: '已退款' },
              { value: 'cancelled', label: '已取消' },
            ],
          },
          {
            id: 'provider',
            label: '支付方式',
            values: provider,
            onChange: setProvider,
            options: [
              { value: 'wechat', label: '微信支付' },
              { value: 'alipay', label: '支付宝' },
            ],
          },
          {
            id: 'app',
            label: '应用',
            values: app,
            onChange: setApp,
            searchable: true,
            options: [
              { value: 'ai-translate', label: 'AI 翻译工作流' },
              { value: 'invoice-bot', label: '发票机器人' },
              { value: 'crm-sync', label: 'CRM 同步' },
              { value: 'ocr-toolkit', label: 'OCR 工具包' },
              { value: 'meeting-notes', label: '会议纪要' },
              { value: 'data-pipeline', label: '数据管道' },
              { value: 'sentiment', label: '情感分析' },
              { value: 'summarizer', label: '内容摘要' },
            ],
          },
        ]}
        onClearAll={() => {
          setStatus([]);
          setProvider([]);
          setApp([]);
        }}
      />
    );
  },
};
