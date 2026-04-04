import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Pencil, Plus, Save } from 'lucide-react';
import { toast } from 'sonner';

import { upsertAuthorizationTemplate } from '@/api/admin';
import type { AuthorizationTemplateSummary } from '@/api/types';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { StatusPill, statusToTone } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCatalogData } from '@/hooks/useCatalogData';

type AuthorizationTemplateFormState = {
  code: string;
  productCode: string;
  name: string;
  kind: string;
  status: 'active' | 'inactive' | 'cancelled' | 'expired';
};

function normalizeCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

function createEmptyAuthorizationTemplateForm(): AuthorizationTemplateFormState {
  return {
    code: '',
    productCode: '',
    name: '',
    kind: 'boolean',
    status: 'active'
  };
}

export function AuthorizationTemplatesPage() {
  const qc = useQueryClient();
  const { products, authorizationTemplates, allPrices, isLoading } = useCatalogData();
  const productMap = new Map(products.map((product) => [product.id, product]));
  const authorizationUsageCount = allPrices.reduce<Map<string, number>>((map, price) => {
    if (!price.authorizationTemplateId) {
      return map;
    }
    map.set(price.authorizationTemplateId, (map.get(price.authorizationTemplateId) ?? 0) + 1);
    return map;
  }, new Map());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAuthorizationTemplate, setEditingAuthorizationTemplate] = useState<AuthorizationTemplateSummary | null>(null);
  const [form, setForm] = useState<AuthorizationTemplateFormState>(createEmptyAuthorizationTemplateForm());

  const saveMutation = useMutation({
    mutationFn: async () => {
      const authorizationTemplateCode = normalizeCode(form.code);
      if (!authorizationTemplateCode) {
        throw new Error('请先填写授权标识');
      }
      if (!form.productCode) {
        throw new Error('请先选择所属产品');
      }
      if (!form.name.trim()) {
        throw new Error('请先填写授权名称');
      }

      return upsertAuthorizationTemplate(authorizationTemplateCode, {
        productCode: form.productCode,
        name: form.name.trim(),
        kind: form.kind.trim() || 'boolean',
        status: form.status
      });
    },
    onSuccess: async () => {
      toast.success(editingAuthorizationTemplate ? '授权档位已保存' : '授权档位已创建');
      await qc.invalidateQueries({ queryKey: ['catalog'] });
      setDialogOpen(false);
      setEditingAuthorizationTemplate(null);
      setForm(createEmptyAuthorizationTemplateForm());
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '保存失败')
  });

  function openCreateDialog() {
    setEditingAuthorizationTemplate(null);
    setForm(createEmptyAuthorizationTemplateForm());
    setDialogOpen(true);
  }

  function openEditDialog(authorizationTemplate: AuthorizationTemplateSummary) {
    const product = authorizationTemplate.productId ? productMap.get(authorizationTemplate.productId) : null;
    setEditingAuthorizationTemplate(authorizationTemplate);
    setForm({
      code: authorizationTemplate.code,
      productCode: product?.code || '',
      name: authorizationTemplate.name,
      kind: authorizationTemplate.kind,
      status: (authorizationTemplate.status as AuthorizationTemplateFormState['status']) || 'active'
    });
    setDialogOpen(true);
  }

  const columns: Column<AuthorizationTemplateSummary>[] = [
    {
      key: 'authorizationTemplate',
      header: '授权档位',
      cell: (row) => (
        <div className="space-y-1">
          <p className="text-sm font-bold text-foreground">{row.name}</p>
          <p className="text-xs font-mono text-muted-foreground">{row.code}</p>
        </div>
      )
    },
    {
      key: 'product',
      header: '所属产品',
      cell: (row) => {
        const product = row.productId ? productMap.get(row.productId) : null;
        return (
          <div className="space-y-1">
            <p className="text-sm font-bold text-foreground">{product?.name || '未绑定产品'}</p>
            <p className="text-xs font-mono text-muted-foreground">{product?.code || '—'}</p>
          </div>
        );
      }
    },
    {
      key: 'kind',
      header: '类型',
      cell: (row) => <StatusPill tone="neutral" label={row.kind} />
    },
    {
      key: 'usage',
      header: '价格映射',
      cell: (row) => (
        <p className="text-xs text-muted-foreground">{authorizationUsageCount.get(row.id) ?? 0} 个价格方案使用</p>
      )
    },
    {
      key: 'status',
      header: '状态',
      cell: (row) => <StatusPill tone={statusToTone(row.status || 'inactive')} label={row.status || 'inactive'} />
    },
    {
      key: 'actions',
      header: '操作',
      cell: (row) => {
        const product = row.productId ? productMap.get(row.productId) : null;
        return (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => openEditDialog(row)}>
              <Pencil className="mr-1 h-3.5 w-3.5" />
              编辑
            </Button>
            {product ? (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/admin/products/${product.code}`}>查看产品</Link>
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">未绑定</span>
            )}
          </div>
        );
      }
    }
  ];

  return (
    <div>
      <SectionHeader sectionKey="authorizationTemplates" />
      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-6 py-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>授权档位总数</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-black text-foreground">{authorizationTemplates.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">当前商品体系中的授权档位数量。</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>已绑定价格映射</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-black text-foreground">{allPrices.filter((price) => Boolean(price.authorizationTemplateId)).length}</p>
              <p className="mt-1 text-xs text-muted-foreground">价格方案与授权档位的现有映射总数。</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>已承接产品</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-black text-foreground">
                {new Set(authorizationTemplates.map((authorizationTemplate) => authorizationTemplate.productId).filter(Boolean)).size}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">已经配置授权档位的产品数量。</p>
            </CardContent>
          </Card>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_16px_48px_rgba(15,23,42,0.04)]">
          <div className="border-b border-slate-200/80 px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-black text-slate-900">授权档位目录</p>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={authorizationTemplates.length > 0 ? 'ok' : 'warn'} label={authorizationTemplates.length > 0 ? '已拆出授权视图' : '暂无授权档位'} />
                <Button onClick={openCreateDialog}>
                  <Plus className="mr-1 h-4 w-4" />
                  新建授权档位
                </Button>
              </div>
            </div>
          </div>
          <DataTable
            columns={columns}
            data={authorizationTemplates}
            isLoading={isLoading}
            emptyMessage="暂无授权档位"
            getRowKey={(row) => row.id}
            rowClassName={() => 'hover:bg-slate-50/70 transition-colors'}
          />
        </div>

        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setEditingAuthorizationTemplate(null);
              setForm(createEmptyAuthorizationTemplateForm());
            }
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingAuthorizationTemplate ? `编辑授权档位 ${editingAuthorizationTemplate.name}` : '新建授权档位'}</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>授权标识</Label>
                <Input
                  value={form.code}
                  onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                  disabled={Boolean(editingAuthorizationTemplate)}
                  placeholder="pro_access"
                />
              </div>
              <div className="space-y-2">
                <Label>授权名称</Label>
                <Input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="专业版"
                />
              </div>
              <div className="space-y-2">
                <Label>所属产品</Label>
                <Select value={form.productCode} onValueChange={(value) => setForm((current) => ({ ...current, productCode: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择产品" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.code} value={product.code}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>类型</Label>
                <Select value={form.kind} onValueChange={(value) => setForm((current) => ({ ...current, kind: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="boolean">boolean</SelectItem>
                    <SelectItem value="quota">quota</SelectItem>
                    <SelectItem value="access">access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>状态</Label>
                <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as AuthorizationTemplateFormState['status'] }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">active</SelectItem>
                    <SelectItem value="inactive">inactive</SelectItem>
                    <SelectItem value="cancelled">cancelled</SelectItem>
                    <SelectItem value="expired">expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                <Save className="mr-1 h-4 w-4" />
                {saveMutation.isPending ? '保存中...' : '保存授权档位'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
