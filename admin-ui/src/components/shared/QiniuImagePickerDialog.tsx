import { useMutation, useQuery } from '@tanstack/react-query';
import { ImagePlus, Loader2, RefreshCw, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { createQiniuUploadToken, listQiniuImages } from '@/api/media';
import { getQiniuSettings } from '@/api/settings';
import type { QiniuImageItem } from '@/api/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface QiniuImagePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string) => void;
  defaultPrefix?: string;
  title?: string;
  description?: string;
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${size} B`;
}

function formatUploadedAt(uploadedAt: string | null) {
  if (!uploadedAt) {
    return '时间未知';
  }

  const parsed = new Date(uploadedAt);
  if (Number.isNaN(parsed.getTime())) {
    return '时间未知';
  }

  return parsed.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function QiniuImagePickerDialog({
  open,
  onOpenChange,
  onSelect,
  defaultPrefix = '',
  title = '从七牛云选择图片',
  description = '可以直接上传图片，或从七牛云已存在的图片中选择。'
}: QiniuImagePickerDialogProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [prefix, setPrefix] = useState(defaultPrefix);
  const [items, setItems] = useState<QiniuImageItem[]>([]);
  const [marker, setMarker] = useState<string | null>(null);
  const [hasBootstrapped, setHasBootstrapped] = useState(false);

  const { data: qiniuSettings } = useQuery({
    queryKey: ['system-settings', 'qiniu'],
    queryFn: getQiniuSettings,
    enabled: open
  });

  const loadImagesMutation = useMutation({
    mutationFn: async (input: { prefix: string; marker?: string | null }) =>
      listQiniuImages({
        prefix: input.prefix || undefined,
        marker: input.marker || undefined,
        limit: 60
      }),
    onSuccess: (result, variables) => {
      setItems((current) => (variables.marker ? [...current, ...result.items] : result.items));
      setMarker(result.marker);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '加载图片失败');
    }
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const token = await createQiniuUploadToken({
        filename: file.name,
        prefix: prefix || undefined
      });
      const formData = new FormData();
      formData.set('token', token.uploadToken);
      formData.set('key', token.key);
      formData.set('file', file);

      const response = await fetch(token.uploadHost, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const detail = (await response.text()).trim();
        throw new Error(detail || `上传失败 (${response.status})`);
      }

      return token.publicUrl;
    },
    onSuccess: (url) => {
      toast.success('图片上传成功');
      loadImagesMutation.mutate({ prefix });
      onSelect(url);
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '上传失败');
    }
  });

  useEffect(() => {
    if (!open) {
      setHasBootstrapped(false);
      return;
    }

    setPrefix(defaultPrefix);
  }, [defaultPrefix, open]);

  useEffect(() => {
    if (!open || hasBootstrapped || !qiniuSettings?.configured) {
      return;
    }

    setHasBootstrapped(true);
    loadImagesMutation.mutate({ prefix: defaultPrefix });
  }, [defaultPrefix, hasBootstrapped, loadImagesMutation, open, qiniuSettings?.configured]);

  const isBusy = loadImagesMutation.isPending || uploadMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          {!qiniuSettings?.configured ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
              七牛云尚未配置完整。请先到“系统设置”里填写 Access Key、Secret Key、Bucket 和公共访问域名。
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 md:flex-row">
                <Input
                  value={prefix}
                  onChange={(event) => setPrefix(event.target.value)}
                  placeholder="目录前缀，例如 apps/my_app/screenshots"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={isBusy}
                  onClick={() => loadImagesMutation.mutate({ prefix })}
                >
                  {loadImagesMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  刷新列表
                </Button>
                <Button
                  type="button"
                  disabled={isBusy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  上传图片
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (!file) {
                      return;
                    }
                    uploadMutation.mutate(file);
                  }}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                当前目录: {prefix || '根目录'}。上传时会自动附带日期目录，避免文件名冲突。
              </p>

              <ScrollArea className="h-[420px] rounded-lg border border-border">
                <div className="p-4">
                  {loadImagesMutation.isPending && items.length === 0 ? (
                    <div className="flex h-[340px] items-center justify-center text-sm text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      正在加载图片...
                    </div>
                  ) : items.length === 0 ? (
                    <div className="flex h-[340px] flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                      <ImagePlus className="h-8 w-8 text-muted-foreground/70" />
                      <div>
                        <p>当前目录下还没有图片。</p>
                        <p>可以先上传一张，或者换一个目录前缀再刷新。</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {items.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          className="overflow-hidden rounded-lg border border-border bg-white text-left transition hover:border-primary/40 hover:shadow-sm"
                          onClick={() => {
                            onSelect(item.url);
                            onOpenChange(false);
                          }}
                        >
                          <div className="aspect-[4/3] bg-muted">
                            <img src={item.url} alt={item.key} className="h-full w-full object-cover" />
                          </div>
                          <div className="space-y-1 p-3">
                            <p className="line-clamp-2 break-all text-sm font-semibold text-foreground">{item.key}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatFileSize(item.size)} · {formatUploadedAt(item.uploadedAt)}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          {marker && qiniuSettings?.configured ? (
            <Button
              type="button"
              variant="outline"
              disabled={loadImagesMutation.isPending}
              onClick={() => loadImagesMutation.mutate({ prefix, marker })}
            >
              {loadImagesMutation.isPending ? '加载中...' : '加载更多'}
            </Button>
          ) : <div />}
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
