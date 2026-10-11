import { usePageMetadata } from '@/lib/use-page-metadata';
import { Link } from 'react-router-dom';

import { AccountTicketsTab } from '@/components/account/AccountTicketsTab';
import { Button } from '@/components/ui/button';

export function MyTicketsPage() {
  usePageMetadata('我的工单');
  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card/95 px-6 py-6 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">Support</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">我的工单</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            这里集中查看你提交过的所有工单，跟进处理进度、补充上下文，或在问题解决后主动关闭工单。
          </p>
        </div>
        <Button asChild className="rounded-full px-5">
          <Link to="/tickets/new">发起新工单</Link>
        </Button>
      </section>

      <AccountTicketsTab />
    </div>
  );
}
