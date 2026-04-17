import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import type { FormState } from './model';

interface AppEditLinksCardProps {
  links: FormState['links'];
  onChange: (value: FormState['links']) => void;
}

export function AppEditLinksCard({ links, onChange }: AppEditLinksCardProps) {
  const updateLink = (index: number, patch: Partial<FormState['links'][number]>) => {
    const next = [...links];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>相关链接</CardTitle>
            <CardDescription>最多 20 条外部链接。</CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={links.length >= 20}
            onClick={() =>
              onChange([...links, { label: '', url: '', type: 'website' }])
            }
          >
            <Plus className="h-4 w-4" />
            添加链接
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {links.length === 0 ? (
          <p className="text-xs text-muted-foreground">暂无链接，点击右上角添加。</p>
        ) : null}
        {links.map((item, index) => (
          <div key={index} className="flex items-start gap-3 rounded-md border p-3">
            <div className="grid flex-1 gap-2 md:grid-cols-3">
              <Input
                value={item.label}
                onChange={(event) => updateLink(index, { label: event.target.value })}
                placeholder="标签名"
              />
              <Input
                value={item.url}
                onChange={(event) => updateLink(index, { url: event.target.value })}
                placeholder="https://..."
              />
              <Select
                value={item.type}
                onValueChange={(value) =>
                  updateLink(index, {
                    type: value as FormState['links'][number]['type'],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="docs">文档</SelectItem>
                  <SelectItem value="support">支持</SelectItem>
                  <SelectItem value="website">官网</SelectItem>
                  <SelectItem value="download">下载</SelectItem>
                  <SelectItem value="other">其他</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-1 h-7 w-7 shrink-0"
              onClick={() => onChange(links.filter((_, itemIndex) => itemIndex !== index))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
