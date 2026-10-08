import { runAsync } from '@/lib/async-events';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

import { listApps } from '@/api/apps';
import { createMyTicket } from '@/api/user';
import type { HydratedSupportTicket } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export function CreateTicketPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({
    appCode: searchParams.get('appCode')?.trim() || '',
    orderNo: '',
    extensionInstallId: '',
    category: 'other' as HydratedSupportTicket['category'],
    priority: 'normal' as HydratedSupportTicket['priority'],
    subject: '',
    body: '',
  });

  const appsQuery = useQuery({
    queryKey: ['catalog-apps'],
    queryFn: listApps,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    const appCode = searchParams.get('appCode')?.trim();
    if (!appCode) {
      return;
    }

    setForm((prev) => (prev.appCode ? prev : { ...prev, appCode }));
  }, [searchParams]);

  const createMutation = useMutation({
    mutationFn: createMyTicket,
    onSuccess: (result) => {
      toast.success(`工单已创建：${result.ticket.ticketNo}`);
      runAsync(() => navigate('/tickets'));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '创建工单失败'),
  });

  const appOptions = appsQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" asChild className="px-0 text-muted-foreground">
          <Link to="/tickets">
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回我的工单
          </Link>
        </Button>

        <section className="rounded-xl border border-border bg-card/95 px-6 py-6 shadow-sm">
          <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
            Create Ticket
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">提交新工单</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            请把关联应用、订单号、客户端安装
            ID、复现步骤和已尝试过的排查动作写完整，这样后续处理更高效。
          </p>
        </section>
      </div>

      <Card className="rounded-xl border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl tracking-tight">工单内容</CardTitle>
          <CardDescription>问题越具体，定位和处理越快。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>关联应用</Label>
              <Select
                value={form.appCode || '__none__'}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    appCode: value === '__none__' ? '' : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择应用" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">不关联应用</SelectItem>
                  {appOptions.map((app) => (
                    <SelectItem key={app.id} value={app.code}>
                      {app.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>订单号</Label>
              <Input
                value={form.orderNo}
                onChange={(event) => setForm((prev) => ({ ...prev, orderNo: event.target.value }))}
                placeholder="可选，例如 FD202604200001"
              />
            </div>

            <div className="space-y-2">
              <Label>客户端安装 ID</Label>
              <Input
                value={form.extensionInstallId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, extensionInstallId: event.target.value }))
                }
                placeholder="可选，例如浏览器扩展安装 ID"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>分类</Label>
                <Select
                  value={form.category}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      category: value as HydratedSupportTicket['category'],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="billing">账单</SelectItem>
                    <SelectItem value="access">授权</SelectItem>
                    <SelectItem value="install">安装</SelectItem>
                    <SelectItem value="deployment">部署</SelectItem>
                    <SelectItem value="bug">缺陷</SelectItem>
                    <SelectItem value="feature">功能</SelectItem>
                    <SelectItem value="account">账户</SelectItem>
                    <SelectItem value="other">其他</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>优先级</Label>
                <Select
                  value={form.priority}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      priority: value as HydratedSupportTicket['priority'],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">低</SelectItem>
                    <SelectItem value="normal">普通</SelectItem>
                    <SelectItem value="high">高</SelectItem>
                    <SelectItem value="urgent">紧急</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>标题</Label>
            <Input
              value={form.subject}
              onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
              placeholder="一句话说明问题，例如：支付成功但 Pro 未开通"
            />
          </div>

          <div className="space-y-2">
            <Label>问题描述</Label>
            <Textarea
              value={form.body}
              onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))}
              rows={8}
              placeholder="请描述复现步骤、报错文案、你已经尝试过的排查动作"
            />
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="outline" asChild>
              <Link to="/tickets">取消</Link>
            </Button>
            <Button
              type="button"
              onClick={() =>
                createMutation.mutate({
                  appCode: form.appCode || undefined,
                  orderNo: form.orderNo.trim() || undefined,
                  extensionInstallId: form.extensionInstallId.trim() || undefined,
                  category: form.category,
                  priority: form.priority,
                  subject: form.subject.trim(),
                  body: form.body.trim(),
                })
              }
              disabled={createMutation.isPending || !form.subject.trim() || !form.body.trim()}
            >
              {createMutation.isPending ? '提交中...' : '提交工单'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
