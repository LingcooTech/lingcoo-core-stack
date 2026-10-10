import { Modal, Typography } from 'antd';
import { AssetLibrary } from './AssetLibrary';
export function AssetImagePickerDialog({
  open,
  onOpenChange,
  onSelect,
  title = '选择营销素材',
  description = '上传图片或从营销素材中选择公开图片。',
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  onSelect(url: string): void;
  title?: string;
  description?: string;
  defaultPrefix?: string;
}) {
  return (
    <Modal
      open={open}
      onCancel={() => onOpenChange(false)}
      title={title}
      width={1080}
      footer={null}
      destroyOnHidden
      styles={{ body: { maxHeight: '75vh', overflowY: 'auto' } }}
    >
      <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>
      {open && (
        <AssetLibrary
          imagesOnly
          onConfigure={() => onOpenChange(false)}
          onSelect={(asset) => {
            if (asset.publicUrl) {
              onSelect(asset.publicUrl);
              onOpenChange(false);
            }
          }}
        />
      )}
    </Modal>
  );
}
