import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { FormState } from './model';

interface AppEditLinksCardProps {
  links: FormState['links'];
  onChange: (value: FormState['links']) => void;
  deliveryMode: FormState['deliveryMode'];
}

export function AppEditLinksCard({ links, onChange, deliveryMode }: AppEditLinksCardProps) {
  const isDirectAccessApp = deliveryMode === 'none';

  const appendLink = (type: FormState['links'][number]['type']) => {
    onChange([...links, { label: '', url: '', type }]);
  };

  const updateLink = (index: number, patch: Partial<FormState['links'][number]>) => {
    const next = [...links];
    const item = next[index];
    if (!item) return;
    next[index] = { ...item, ...patch };
    onChange(next);
  };

  const getLabelPlaceholder = (type: FormState['links'][number]['type']) => {
    if (type === 'website') return '例如：Web 版入口';
    if (type === 'download') return '例如：Windows 下载';
    if (type === 'docs') return '例如：使用文档';
    if (type === 'support') return '例如：技术支持';
    return '标签名';
  };

  const getUrlPlaceholder = (type: FormState['links'][number]['type']) => {
    if (type === 'website') return '在线使用地址，例如：https://app.example.com';
    if (type === 'download') return '下载地址，例如：https://download.example.com';
    return 'https://...';
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>{isDirectAccessApp ? '访问与下载' : '相关链接'}</CardTitle>
            <CardDescription>
              {isDirectAccessApp
                ? '为免部署应用配置在线使用、下载或补充文档入口。最多 20 条外部链接。'
                : '最多 20 条外部链接。'}
            </CardDescription>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {isDirectAccessApp ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={links.length >= 20}
                  onClick={() => appendLink('website')}
                >
                  <Plus className="h-4 w-4" />
                  在线使用
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={links.length >= 20}
                  onClick={() => appendLink('download')}
                >
                  <Plus className="h-4 w-4" />
                  下载链接
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={links.length >= 20}
              onClick={() => appendLink(isDirectAccessApp ? 'docs' : 'website')}
            >
              <Plus className="h-4 w-4" />
              {isDirectAccessApp ? '其他链接' : '添加链接'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {links.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {isDirectAccessApp
              ? '暂无访问入口，点击右上角添加在线使用或下载链接。'
              : '暂无链接，点击右上角添加。'}
          </p>
        ) : null}
        {links.map((item, index) => (
          <div key={index} className="flex items-start gap-3 rounded-md border p-3">
            <div className="grid flex-1 gap-2 md:grid-cols-3">
              <Input
                value={item.label}
                onChange={(event) => updateLink(index, { label: event.target.value })}
                placeholder={getLabelPlaceholder(item.type)}
              />
              <Input
                value={item.url}
                onChange={(event) => updateLink(index, { url: event.target.value })}
                placeholder={getUrlPlaceholder(item.type)}
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
                  <SelectItem value="website">在线使用 / 官网</SelectItem>
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
