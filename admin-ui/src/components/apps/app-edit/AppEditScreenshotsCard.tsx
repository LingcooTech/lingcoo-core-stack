import { Plus, Trash2 } from 'lucide-react';

import { QiniuImageField } from '@/components/shared/QiniuImageField';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

import type { FormState } from './model';

interface AppEditScreenshotsCardProps {
  appCode: string;
  screenshots: FormState['screenshots'];
  onChange: (value: FormState['screenshots']) => void;
}

export function AppEditScreenshotsCard({
  appCode,
  screenshots,
  onChange,
}: AppEditScreenshotsCardProps) {
  const updateScreenshot = (
    index: number,
    patch: Partial<FormState['screenshots'][number]>,
  ) => {
    const next = [...screenshots];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>截图管理</CardTitle>
            <CardDescription>最多 20 张，用于应用详情页展示。</CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={screenshots.length >= 20}
            onClick={() => onChange([...screenshots, { url: '', caption: '' }])}
          >
            <Plus className="h-4 w-4" />
            添加截图
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {screenshots.length === 0 ? (
          <p className="text-xs text-muted-foreground">暂无截图，点击右上角添加。</p>
        ) : null}
        {screenshots.map((item, index) => (
          <div key={index} className="flex items-start gap-3 rounded-md border p-3">
            <div className="flex-1 space-y-2">
              <QiniuImageField
                value={item.url}
                onChange={(value) => updateScreenshot(index, { url: value })}
                placeholder="图片 URL"
                defaultPrefix={`${appCode}/screenshots`}
                previewAlt={item.caption || `截图 ${index + 1}`}
                previewClassName="h-40 w-full rounded-md border object-cover"
                dialogTitle="选择应用截图"
                dialogDescription="截图会展示在用户侧应用详情页，建议统一尺寸比例。"
              />
              <Input
                value={item.caption ?? ''}
                onChange={(event) => updateScreenshot(index, { caption: event.target.value })}
                placeholder="图片描述（可选）"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-1 h-7 w-7 shrink-0"
              onClick={() =>
                onChange(screenshots.filter((_, itemIndex) => itemIndex !== index))
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
