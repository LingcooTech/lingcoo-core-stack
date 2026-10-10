import { QuestionCircleOutlined } from '@ant-design/icons';
import { Button, Popover } from 'antd';
import type { ReactNode } from 'react';
export function PageHelp({ children }: { children: ReactNode }) {
  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      title="使用说明"
      content={<div style={{ width: 280, maxWidth: 'calc(100vw - 64px)' }}>{children}</div>}
    >
      <Button type="text" icon={<QuestionCircleOutlined />}>
        使用说明
      </Button>
    </Popover>
  );
}
