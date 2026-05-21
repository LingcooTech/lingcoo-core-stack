import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Archive, Trash2 } from 'lucide-react';

import { BulkActionBar, BulkActionButton } from '@/components/shared/BulkActionBar';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';

interface AppRow {
  id: string;
  name: string;
  code: string;
  status: string;
  installs: number;
}

const APPS: AppRow[] = [
  { id: 'app_1', name: 'AI 翻译工作流', code: 'ai-translate', status: 'active', installs: 128 },
  { id: 'app_2', name: '发票机器人', code: 'invoice-bot', status: 'active', installs: 42 },
  { id: 'app_3', name: 'CRM 同步', code: 'crm-sync', status: 'pending', installs: 7 },
  { id: 'app_4', name: 'OCR 工具包', code: 'ocr-toolkit', status: 'inactive', installs: 0 },
  { id: 'app_5', name: '会议纪要', code: 'meeting-notes', status: 'active', installs: 67 },
  { id: 'app_6', name: '数据管道', code: 'data-pipeline', status: 'pending', installs: 3 },
];

const COLUMNS: Column<AppRow>[] = [
  { key: 'name', header: '应用名称', cell: (r) => <span className="font-medium">{r.name}</span> },
  {
    key: 'code',
    header: 'Code',
    cell: (r) => <code className="text-muted-foreground text-xs">{r.code}</code>,
  },
  {
    key: 'status',
    header: '状态',
    cell: (r) => <StatusPill tone={statusToTone(r.status)} label={r.status} />,
  },
  { key: 'installs', header: '安装数', cell: (r) => r.installs.toLocaleString() },
];

const meta = {
  title: 'Shared/DataTable + BulkActionBar',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Phase D.1+D.3：DataTable 启用 row selection，配合 BulkActionBar 浮出条做批量操作。selection 是 controlled state（Set<string>），通过 getRowId 与行关联。',
      },
    },
    layout: 'padded',
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const WithSelection: Story = {
  render: () => {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [lastAction, setLastAction] = useState<string>('');

    return (
      <div className="space-y-3">
        <BulkActionBar selectedCount={selected.size} onClear={() => setSelected(new Set())}>
          <BulkActionButton
            onClick={() => {
              setLastAction(`归档了 ${selected.size} 个应用`);
              setSelected(new Set());
            }}
          >
            <Archive className="size-3.5" />
            归档
          </BulkActionButton>
          <BulkActionButton
            variant="destructive"
            onClick={() => {
              setLastAction(`删除了 ${selected.size} 个应用`);
              setSelected(new Set());
            }}
          >
            <Trash2 className="size-3.5" />
            删除
          </BulkActionButton>
        </BulkActionBar>

        <div className="border-border rounded-lg border bg-white">
          <DataTable<AppRow>
            columns={COLUMNS}
            data={APPS}
            getRowId={(r) => r.id}
            enableRowSelection
            selectedRowIds={selected}
            onSelectionChange={setSelected}
          />
        </div>

        {lastAction && <p className="text-muted-foreground text-sm">✔ {lastAction}</p>}
      </div>
    );
  },
};

export const Empty: Story = {
  render: () => {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    return (
      <div className="border-border rounded-lg border bg-white">
        <DataTable<AppRow>
          columns={COLUMNS}
          data={[]}
          getRowId={(r) => r.id}
          enableRowSelection
          selectedRowIds={selected}
          onSelectionChange={setSelected}
          emptyMessage="没有符合条件的应用"
        />
      </div>
    );
  },
};
