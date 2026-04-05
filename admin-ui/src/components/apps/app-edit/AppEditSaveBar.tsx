import { Save } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface AppEditSaveBarProps {
  title: string;
  description: string;
  isSaving: boolean;
  disabled: boolean;
  onSave: () => void;
}

export function AppEditSaveBar({
  title,
  description,
  isSaving,
  disabled,
  onSave,
}: AppEditSaveBarProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-black">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Button onClick={onSave} disabled={disabled}>
        <Save className="h-4 w-4" />
        {isSaving ? '保存中...' : title}
      </Button>
    </div>
  );
}
