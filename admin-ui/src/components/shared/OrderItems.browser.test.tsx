import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test } from 'vitest';
import { OrderItems } from './OrderItems';
test('purchase lines render literal titles, separate software and hosting, and identify legacy gaps', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const item = {
    kind: 'software' as const,
    productId: '00000000-0000-4000-8000-000000000001',
    code: 'retail',
    title: '<img src=x onerror=alert(1)>',
    appName: 'Retail',
    interval: 'one_time' as const,
    quantity: 1,
    unitAmount: 10000,
    amount: 10000,
    currency: 'CNY',
  };
  try {
    await act(async () =>
      root.render(
        <OrderItems
          items={[
            item,
            {
              ...item,
              kind: 'hosting',
              hostingTerms: {
                offerVersion: 1,
                description: 'Managed hosting',
                graceDays: 7,
                retentionDays: 30,
              },
              title: 'Hosting original',
              interval: 'month',
              unitAmount: 1990,
              amount: 1990,
            },
          ]}
        />,
      ),
    );
    expect(host.textContent).toContain('软件授权');
    expect(host.textContent).toContain('托管服务');
    expect(host.textContent).toContain('19.90');
    expect(host.textContent).toContain('首次交付后起算');
    expect(host.textContent).toContain('数据保留 30 天');
    expect(host.textContent).toContain(item.title);
    expect(host.querySelector('img')).toBeNull();
    await act(async () => root.render(<OrderItems items={[]} />));
    expect(host.textContent).toContain('历史订单未记录购买快照');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
