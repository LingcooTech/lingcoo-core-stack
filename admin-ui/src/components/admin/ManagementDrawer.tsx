import { Button, Drawer, Space, Typography, type DrawerProps } from 'antd';
import type { ReactNode } from 'react';
export function ManagementDrawer({
  open,
  title,
  description,
  children,
  size = 'medium',
  onClose,
  onSubmit,
  saving,
  submitText = '保存',
  footer,
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  size?: 'small' | 'medium' | 'large';
  onClose: () => void;
  onSubmit?: () => void;
  saving?: boolean;
  submitText?: string;
  footer?: DrawerProps['footer'];
}) {
  return (
    <Drawer
      open={open}
      title={title}
      size={{ small: 560, medium: 840, large: 1080 }[size]}
      onClose={onClose}
      destroyOnHidden
      styles={{
        wrapper: { maxWidth: '100vw' },
        body: { minHeight: 0, overflowY: 'auto', scrollbarGutter: 'stable' },
        footer: { textAlign: 'right' },
      }}
      footer={
        footer === undefined ? (
          <Space>
            <Button onClick={onClose}>{onSubmit ? '取消' : '关闭'}</Button>
            {onSubmit && (
              <Button type="primary" loading={saving} onClick={onSubmit}>
                {submitText}
              </Button>
            )}
          </Space>
        ) : (
          footer
        )
      }
    >
      {description && <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>}
      {children}
    </Drawer>
  );
}
