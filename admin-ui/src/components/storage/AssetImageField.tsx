import { PictureOutlined, DeleteOutlined } from '@ant-design/icons';
import { Button, ConfigProvider, Flex, Image, Space, Typography } from 'antd';
import { useState } from 'react';
import { AssetImagePickerDialog } from './AssetImagePickerDialog';
interface AssetImageFieldProps {
  value?: string;
  onChange?: (value: string) => void;
  id?: string;
  defaultPrefix?: string;
  placeholder?: string;
  previewAlt: string;
  previewClassName?: string;
  dialogTitle?: string;
  dialogDescription?: string;
}
export function AssetImageField({
  value = '',
  onChange,
  id,
  previewAlt,
  dialogTitle,
  dialogDescription,
}: AssetImageFieldProps) {
  const [open, setOpen] = useState(false);
  const { componentDisabled } = ConfigProvider.useConfig();
  return (
    <>
      <Flex align="center" wrap gap={16}>
        {value ? (
          <Image
            key={value}
            src={value}
            alt={previewAlt}
            width={112}
            height={88}
            style={{ objectFit: 'contain', borderRadius: 8 }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              width: 112,
              height: 88,
              display: 'grid',
              placeItems: 'center',
              border: '1px dashed var(--ant-color-border, #d9d9d9)',
              borderRadius: 8,
            }}
          >
            <PictureOutlined style={{ fontSize: 28, opacity: 0.45 }} />
          </div>
        )}
        <Space orientation="vertical" size={8}>
          <Space wrap>
            <Button
              id={id}
              aria-label={`${value ? '更换' : '选择'}${previewAlt}`}
              icon={<PictureOutlined />}
              onClick={() => setOpen(true)}
            >
              {value ? '更换图片' : '选择图片'}
            </Button>
            {value && (
              <Button
                danger
                icon={<DeleteOutlined />}
                aria-label={`移除${previewAlt}`}
                onClick={() => onChange?.('')}
              >
                移除
              </Button>
            )}
          </Space>
          <Typography.Text type="secondary">从云存储选择，或上传新图片</Typography.Text>
        </Space>
      </Flex>
      <AssetImagePickerDialog
        open={open && !componentDisabled}
        onOpenChange={setOpen}
        onSelect={(url) => {
          if (!componentDisabled) onChange?.(url);
        }}
        title={dialogTitle}
        description={dialogDescription}
      />
    </>
  );
}
