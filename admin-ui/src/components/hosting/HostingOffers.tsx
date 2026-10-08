import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  hostingOfferCreateSchema,
  hostingOfferWriteSchema,
  type HostingOffer,
} from '@lingcoo/contracts';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const labels = { draft: '草稿', active: '已上架', archived: '已下架' };
export function HostingOffers() {
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<HostingOffer | 'new' | null>(null);
  const query = useQuery({
    queryKey: ['hosting-offers', offset],
    queryFn: () =>
      apiClient(
        'GET /v1/admin/billing/hosting-offers',
        `/v1/admin/billing/hosting-offers?offset=${offset}&limit=20`,
      ),
  });
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">托管套餐</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            独立配置应用托管的价格与服务政策。套餐上架不会收款、创建实例或调整已有服务期限；客户购买入口将在收费流程验收后开放。
          </p>
        </div>
        <Button disabled={!query.data || !!editing} onClick={() => setEditing('new')}>
          新增托管套餐
        </Button>
      </div>
      {query.isPending && <p className="text-sm">正在读取套餐…</p>}
      {query.isError && (
        <div role="alert" className="text-sm text-destructive">
          {query.error.message}
          <Button variant="ghost" onClick={() => void query.refetch()}>
            重试
          </Button>
        </div>
      )}
      {editing && query.data && (
        <OfferForm
          key={editing === 'new' ? 'new' : `${editing.id}:${editing.version}`}
          offer={editing === 'new' ? null : editing}
          apps={query.data.apps}
          onClose={() => setEditing(null)}
        />
      )}
      {query.data && !query.data.items.length && (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">
          尚无托管套餐。可以先保存价格为零的草稿，确定价格后再上架。
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {query.data?.items.map((offer) => (
          <article key={offer.id} className="min-w-0 space-y-3 rounded-xl border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold break-words">{offer.title}</h3>
                <p className="mt-1 text-xs break-all text-muted-foreground">
                  {query.data.apps.find((a) => a.id === offer.appId)?.name ?? offer.appId} ·{' '}
                  {offer.code}
                </p>
              </div>
              <span className="shrink-0 rounded border px-2 py-1 text-xs">
                {labels[offer.status]}
              </span>
            </div>
            <p className="text-xl font-semibold tabular-nums">
              ¥{(offer.priceAmount / 100).toFixed(2)}
              <span className="text-sm font-normal text-muted-foreground">
                {' '}
                / {offer.interval === 'month' ? '月' : '年'}
              </span>
            </p>
            <p className="text-sm break-words whitespace-pre-wrap text-muted-foreground">
              {offer.description}
            </p>
            <p className="text-xs text-muted-foreground">
              宽限 {offer.graceDays} 天 · 停服后数据保留 {offer.retentionDays} 天 · 版本{' '}
              {offer.version}
            </p>
            <Button variant="outline" disabled={!!editing} onClick={() => setEditing(offer)}>
              编辑套餐
            </Button>
          </article>
        ))}
      </div>
      {query.data && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>共 {query.data.total} 个套餐</span>
          <Button
            variant="outline"
            disabled={offset === 0 || !!editing}
            onClick={() => setOffset(Math.max(0, offset - 20))}
          >
            上一页
          </Button>
          <Button
            variant="outline"
            disabled={offset + 20 >= query.data.total || !!editing}
            onClick={() => setOffset(offset + 20)}
          >
            下一页
          </Button>
        </div>
      )}
    </section>
  );
}

function OfferForm({
  offer,
  apps,
  onClose,
}: {
  offer: HostingOffer | null;
  apps: { id: string; name: string; code: string }[];
  onClose: () => void;
}) {
  const [id] = useState(() => crypto.randomUUID());
  const [error, setError] = useState('');
  const submitted = useRef(false);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (values: FormData) => {
      const value = (key: string) => String(values.get(key) ?? '').trim();
      const yuan = value('price');
      if (!/^\d{1,7}(\.\d{1,2})?$/.test(yuan)) throw new Error('价格请输入非负金额，最多两位小数');
      const [whole, decimals = ''] = yuan.split('.');
      const body = {
        title: value('title'),
        description: value('description'),
        interval: value('interval'),
        priceAmount: Number(whole) * 100 + Number(decimals.padEnd(2, '0')),
        currency: 'CNY',
        graceDays: Number(value('graceDays')),
        retentionDays: Number(value('retentionDays')),
        status: value('status'),
        reason: value('reason'),
      };
      const parsed = offer
        ? hostingOfferWriteSchema.safeParse({ ...body, expectedVersion: offer.version })
        : hostingOfferCreateSchema.safeParse({
            ...body,
            id,
            appId: value('appId'),
            code: value('code'),
          });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? '请检查套餐信息');
      if (offer)
        return apiClient(
          'PUT /v1/admin/billing/hosting-offers/:offerId',
          `/v1/admin/billing/hosting-offers/${offer.id}`,
          { body: JSON.stringify(parsed.data) },
        );
      return apiClient(
        'POST /v1/admin/billing/hosting-offers',
        '/v1/admin/billing/hosting-offers',
        { body: JSON.stringify(parsed.data) },
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['hosting-offers'] });
      onClose();
    },
    onError: (e) => setError(e.message),
    onSettled: () => {
      submitted.current = false;
    },
  });
  const selectClass = 'h-9 w-full rounded-md border bg-background px-2 text-sm';
  return (
    <form
      className="space-y-4 rounded-xl border bg-muted/20 p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (submitted.current) return;
        submitted.current = true;
        setError('');
        mutation.mutate(new FormData(e.currentTarget));
      }}
    >
      <h3 className="font-semibold">{offer ? '编辑托管套餐' : '新增托管套餐'}</h3>
      <fieldset disabled={mutation.isPending} className="grid gap-4 sm:grid-cols-2">
        {!offer && (
          <>
            <label className="space-y-1 text-sm">
              所属应用
              <select name="appId" required defaultValue="" className={selectClass}>
                <option value="" disabled>
                  请选择应用
                </option>
                {apps.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}（{a.code}）
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              套餐编码
              <Input
                name="code"
                required
                maxLength={64}
                pattern="[a-z0-9][a-z0-9_-]*"
                placeholder="例如 retail-monthly"
              />
            </label>
          </>
        )}
        <label className="space-y-1 text-sm">
          套餐名称
          <Input name="title" required maxLength={120} defaultValue={offer?.title} />
        </label>
        <label className="space-y-1 text-sm">
          计费周期
          <select name="interval" className={selectClass} defaultValue={offer?.interval ?? 'month'}>
            <option value="month">自然月</option>
            <option value="year">自然年</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          价格（元）
          <Input
            name="price"
            required
            inputMode="decimal"
            defaultValue={offer ? (offer.priceAmount / 100).toFixed(2) : ''}
            placeholder="待定价格可填 0，保存草稿"
          />
        </label>
        <label className="space-y-1 text-sm">
          状态
          <select name="status" className={selectClass} defaultValue={offer?.status ?? 'draft'}>
            <option value="draft">草稿</option>
            <option value="active">上架</option>
            <option value="archived">下架</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          到期宽限天数
          <Input
            name="graceDays"
            type="number"
            min={0}
            max={90}
            required
            defaultValue={offer?.graceDays}
          />
        </label>
        <label className="space-y-1 text-sm">
          停服后数据保留天数
          <Input
            name="retentionDays"
            type="number"
            min={1}
            max={3650}
            required
            defaultValue={offer?.retentionDays}
          />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          服务内容
          <textarea
            name="description"
            required
            minLength={5}
            maxLength={2000}
            rows={3}
            defaultValue={offer?.description}
            className="w-full rounded-md border bg-background p-2"
            placeholder="说明托管、备份、维护与服务限制，供客户购买前阅读"
          />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          变更原因（内部审计）
          <Input name="reason" required minLength={5} maxLength={500} />
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? '正在保存…' : '保存套餐'}
        </Button>
        <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>
          取消
        </Button>
      </div>
    </form>
  );
}
