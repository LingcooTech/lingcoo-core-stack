import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Card, Input, Space, Table, Tag } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/lib/theme';
import { AdminUiProvider } from './AdminUiProvider';
import { PageContainer } from './PageContainer';

const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
const meta = {
  title: 'Admin/PageContainer',
  component: PageContainer,
  decorators: [
    (Story) => (
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <AdminUiProvider>
            <Story />
          </AdminUiProvider>
        </ThemeProvider>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof PageContainer>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ResourceList: Story = {
  args: {
    title: '应用部署',
    filters: (
      <Space wrap>
        <Input.Search placeholder="搜索客户或应用" />
        <Tag>平台托管</Tag>
      </Space>
    ),
    actions: <Button>刷新</Button>,
    children: (
      <Card>
        <Table
          rowKey="id"
          pagination={false}
          dataSource={[{ id: 'sample', app: 'Retail', status: '已就绪' }]}
          columns={[
            { title: '应用', dataIndex: 'app' },
            {
              title: '状态',
              dataIndex: 'status',
              render: (value: string) => <Tag color="success">{value}</Tag>,
            },
          ]}
        />
      </Card>
    ),
  },
};
