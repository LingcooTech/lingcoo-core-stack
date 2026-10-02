import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import type { FormState } from './model';

interface AppEditHighlightsCardProps {
  highlights: FormState['highlights'];
  onChange: (value: FormState['highlights']) => void;
}

export function AppEditHighlightsCard({ highlights, onChange }: AppEditHighlightsCardProps) {
  const updateHighlight = (index: number, patch: Partial<FormState['highlights'][number]>) => {
    const next = [...highlights];
    const item = next[index];
    if (!item) return;
    next[index] = { ...item, ...patch };
    onChange(next);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>核心亮点</CardTitle>
            <CardDescription>最多 8 条，用于展示应用的核心功能特色。</CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={highlights.length >= 8}
            onClick={() => onChange([...highlights, { icon: '', title: '', description: '' }])}
          >
            <Plus className="h-4 w-4" />
            添加亮点
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {highlights.length === 0 ? (
          <p className="text-xs text-muted-foreground">暂无亮点，点击右上角添加。</p>
        ) : null}
        {highlights.map((item, index) => (
          <div key={index} className="space-y-2 rounded-md border p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-bold text-muted-foreground">亮点 {index + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onChange(highlights.filter((_, itemIndex) => itemIndex !== index))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>图标（可选）</Label>
                <Input
                  value={item.icon ?? ''}
                  onChange={(event) => updateHighlight(index, { icon: event.target.value })}
                  placeholder="emoji 或 icon name"
                />
              </div>
              <div>
                <Label>标题</Label>
                <Input
                  value={item.title}
                  onChange={(event) => updateHighlight(index, { title: event.target.value })}
                  placeholder="功能亮点标题"
                />
              </div>
            </div>
            <div>
              <Label>描述</Label>
              <Textarea
                value={item.description}
                onChange={(event) => updateHighlight(index, { description: event.target.value })}
                placeholder="功能亮点描述"
                rows={2}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
