import { ImagePlus } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { AssetImagePickerDialog } from './AssetImagePickerDialog';

interface AssetImageFieldProps {
  value: string;
  onChange: (value: string) => void;
  defaultPrefix?: string;
  placeholder?: string;
  previewAlt: string;
  previewClassName?: string;
  dialogTitle?: string;
  dialogDescription?: string;
}

export function AssetImageField({
  value,
  onChange,
  defaultPrefix,
  placeholder = 'https://...',
  previewAlt,
  previewClassName = 'h-20 w-full rounded-md border object-cover',
  dialogTitle,
  dialogDescription,
}: AssetImageFieldProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          className="flex-1"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
        <Button type="button" variant="outline" onClick={() => setPickerOpen(true)}>
          <ImagePlus className="h-4 w-4" />
          云存储
        </Button>
      </div>

      {value ? (
        <img
          key={value}
          src={value}
          alt={previewAlt}
          className={previewClassName}
          onError={(event) => {
            (event.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : null}

      <AssetImagePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={onChange}
        defaultPrefix={defaultPrefix}
        title={dialogTitle}
        description={dialogDescription}
      />
    </>
  );
}
