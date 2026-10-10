import { PictureOutlined } from '@ant-design/icons';
import { Button, Flex, Form, Image, Input } from 'antd';
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
  defaultPrefix,
  placeholder = 'https://...',
  previewAlt,
  previewClassName = 'h-20 w-full rounded-md border object-cover',
  dialogTitle,
  dialogDescription,
}: AssetImageFieldProps) {
  const [open, setOpen] = useState(false);
  const { status } = Form.Item.useStatus();
  return (
    <>
      <Flex wrap gap={8}>
        <Input
          id={id}
          style={{ flex: '1 1 220px' }}
          status={status === 'error' ? 'error' : undefined}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          placeholder={placeholder}
        />
        <Button icon={<PictureOutlined aria-hidden="true" />} onClick={() => setOpen(true)}>
          云存储
        </Button>
      </Flex>
      {value && (
        <Image
          key={value}
          src={value}
          alt={previewAlt}
          className={previewClassName}
          style={{ maxHeight: 120, objectFit: 'contain', marginTop: 12 }}
        />
      )}
      <AssetImagePickerDialog
        open={open}
        onOpenChange={setOpen}
        onSelect={(url) => onChange?.(url)}
        defaultPrefix={defaultPrefix}
        title={dialogTitle}
        description={dialogDescription}
      />
    </>
  );
}
