import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { AssetLibrary } from './AssetLibrary';
export function AssetImagePickerDialog({
  open,
  onOpenChange,
  onSelect,
  title = '选择营销素材',
  description = '上传图片或从营销素材中选择公开图片。',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string) => void;
  title?: string;
  description?: string;
  defaultPrefix?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {open && (
          <AssetLibrary
            imagesOnly
            onSelect={(asset) => {
              if (asset.publicUrl) {
                onSelect(asset.publicUrl);
                onOpenChange(false);
              }
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
