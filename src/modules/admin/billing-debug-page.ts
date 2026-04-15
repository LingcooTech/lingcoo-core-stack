export function renderBillingDebugPage() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Billing Debug Console</title>
    <style>
      :root {
        --bg: #f6f7fb;
        --panel: rgba(255, 255, 255, 0.9);
        --ink: #13212a;
        --muted: #64748b;
        --line: #e2e8f0;
        --accent: #0f766e;
        --accent-2: #7c3aed;
        --warning: #b45309;
        --danger: #b42318;
        --success: #166534;
        --shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
        --radius: 18px;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(15, 118, 110, 0.10), transparent 28%),
          radial-gradient(circle at top right, rgba(124, 58, 237, 0.10), transparent 24%),
          linear-gradient(180deg, #fafbff 0%, var(--bg) 100%);
        min-height: 100vh;
      }

      .shell { width: min(1400px, calc(100vw - 32px)); margin: 0 auto; padding: 24px 0 56px; }
      .hero, .grid { display: grid; gap: 16px; }
      .hero { grid-template-columns: 1.1fr 0.9fr; margin-bottom: 16px; }
      .grid { grid-template-columns: 1fr 1fr; align-items: start; }
      .panel {
        background: var(--panel);
        border: 1px solid rgba(226, 232, 240, 0.9);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        backdrop-filter: blur(12px);
      }
      .card { padding: 20px; }
      .hero-main { padding: 24px; }
      h1 { margin: 10px 0 8px; font-size: clamp(30px, 4vw, 52px); line-height: 0.98; letter-spacing: -0.04em; }
      h2 { margin: 0 0 12px; font-size: 18px; }
      p { margin: 0; line-height: 1.68; color: var(--muted); }
      .eyebrow {
        display: inline-flex; align-items: center; padding: 6px 12px; border-radius: 999px;
        background: rgba(15, 118, 110, 0.08); color: var(--accent); font-size: 12px; font-weight: 800;
        letter-spacing: 0.06em; text-transform: uppercase;
      }
      .toolbar { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
      button {
        appearance: none; border: none; border-radius: 12px; padding: 11px 14px; font: inherit; font-weight: 700; cursor: pointer;
      }
      button.primary { background: var(--accent); color: #fff; }
      button.secondary { background: rgba(15, 23, 42, 0.08); color: var(--ink); }
      button.ghost { background: transparent; color: var(--accent); border: 1px solid rgba(15, 118, 110, 0.18); }
      button:disabled { opacity: 0.55; cursor: not-allowed; }
      .meta-grid {
        display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 16px;
      }
      .meta {
        padding: 14px; border: 1px solid var(--line); border-radius: 14px; background: rgba(248, 250, 252, 0.7);
      }
      .meta label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; }
      .meta strong { font-size: 14px; word-break: break-all; }
      .status-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
      .chip {
        display: inline-flex; align-items: center; padding: 6px 10px; border-radius: 999px;
        font-size: 12px; font-weight: 800;
      }
      .chip.ok { color: var(--success); background: rgba(22, 101, 52, 0.10); }
      .chip.warn { color: var(--warning); background: rgba(180, 83, 9, 0.10); }
      .chip.bad { color: var(--danger); background: rgba(180, 35, 24, 0.10); }
      .list { display: grid; gap: 12px; }
      .item {
        border: 1px solid var(--line); border-radius: 16px; padding: 14px; background: rgba(255,255,255,0.82);
      }
      .item-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
      .item-title { font-weight: 800; }
      .item-sub { font-size: 12px; color: var(--muted); margin-top: 4px; }
      .kv { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
      .kv div { padding: 10px 12px; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0; }
      .kv label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; }
      pre {
        margin: 12px 0 0; padding: 12px; border-radius: 14px; background: #0f172a; color: #e2e8f0;
        overflow-x: auto; white-space: pre-wrap; word-break: break-word; font-size: 12px; line-height: 1.6;
      }
      .hidden { display: none; }
      .section-body { display: grid; gap: 12px; }
      .split { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .note { margin-top: 10px; font-size: 13px; color: var(--muted); }
      @media (max-width: 1100px) {
        .hero, .grid, .split { grid-template-columns: 1fr; }
        .meta-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 640px) {
        .meta-grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <section class="hero">
        <div class="panel hero-main">
          <span class="eyebrow">Billing Debug Console</span>
          <h1>支付链路观察页</h1>
          <p>这个页面会直接读取中台的订单、Webhook、事件和授权数据，帮助你对照支付回调、查单和验单结果。</p>
          <div class="toolbar">
            <button id="refresh-btn" class="primary" type="button">刷新数据</button>
            <button id="load-latest-btn" class="secondary" type="button">加载最新 20 条</button>
            <button id="copy-link-btn" class="ghost" type="button">复制当前链接</button>
          </div>
          <div class="note" id="last-updated">尚未加载</div>
        </div>
        <div class="panel card">
          <h2>当前汇总</h2>
          <div class="status-row" id="summary-chips">
            <span class="chip warn">等待加载</span>
          </div>
          <div class="meta-grid">
            <div class="meta"><label>Webhook</label><strong id="meta-webhooks">-</strong></div>
            <div class="meta"><label>Orders</label><strong id="meta-orders">-</strong></div>
            <div class="meta"><label>Events</label><strong id="meta-events">-</strong></div>
            <div class="meta"><label>Entitlements</label><strong id="meta-entitlements">-</strong></div>
          </div>
        </div>
      </section>

      <section class="grid">
        <div class="panel card">
          <h2>时间线</h2>
          <div id="timeline" class="list"></div>
        </div>
        <div class="panel card">
          <h2>原始响应</h2>
          <div class="section-body">
            <div class="split">
              <button id="toggle-orders" class="secondary" type="button">显示订单 JSON</button>
              <button id="toggle-webhooks" class="secondary" type="button">显示 Webhook JSON</button>
            </div>
            <pre id="orders-json" class="hidden">[]</pre>
            <pre id="webhooks-json" class="hidden">[]</pre>
            <pre id="events-json" class="hidden">[]</pre>
            <pre id="entitlements-json" class="hidden">[]</pre>
          </div>
        </div>
      </section>
    </div>

    <script>
      const apiBase = '';
      const state = {
        orders: null,
        webhooks: null,
        events: null,
        entitlements: null,
        latestOrderNo: ''
      };

      const byId = (id) => document.getElementById(id);
      const fmt = (value) => {
        if (!value) return '-';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { hour12: false });
      };
      const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[ch]));

      function setLastUpdated(text) {
        byId('last-updated').textContent = text;
      }

      function renderSummary() {
        const chips = [];
        const paidOrders = Array.isArray(state.orders?.items) ? state.orders.items.filter((item) => item.status === 'paid').length : 0;
        const pendingOrders = Array.isArray(state.orders?.items) ? state.orders.items.filter((item) => item.status === 'pending').length : 0;
        const paidWebhooks = Array.isArray(state.webhooks?.items) ? state.webhooks.items.filter((item) => item.status === 'processed').length : 0;

        chips.push(`<span class="chip ok">Paid Orders: ${paidOrders}</span>`);
        chips.push(`<span class="chip warn">Pending Orders: ${pendingOrders}</span>`);
        chips.push(`<span class="chip ok">Processed Webhooks: ${paidWebhooks}</span>`);
        chips.push(`<span class="chip ok">Entitlements: ${Array.isArray(state.entitlements?.items) ? state.entitlements.items.length : 0}</span>`);
        byId('summary-chips').innerHTML = chips.join('');

        byId('meta-webhooks').textContent = state.webhooks ? String(state.webhooks.total ?? state.webhooks.items?.length ?? 0) : '-';
        byId('meta-orders').textContent = state.orders ? String(state.orders.total ?? state.orders.items?.length ?? 0) : '-';
        byId('meta-events').textContent = state.events ? String(state.events.total ?? state.events.items?.length ?? 0) : '-';
        byId('meta-entitlements').textContent = state.entitlements ? String(state.entitlements.total ?? state.entitlements.items?.length ?? 0) : '-';
      }

      function renderTimeline() {
        const items = [];
        const orders = Array.isArray(state.orders?.items) ? state.orders.items.slice(0, 10) : [];
        const webhooks = Array.isArray(state.webhooks?.items) ? state.webhooks.items.slice(0, 10) : [];
        const events = Array.isArray(state.events?.items) ? state.events.items.slice(0, 10) : [];
        const entitlements = Array.isArray(state.entitlements?.items) ? state.entitlements.items.slice(0, 10) : [];

        orders.forEach((order) => {
          items.push(`
            <div class="item">
              <div class="item-head">
                <div>
                  <div class="item-title">Order ${escapeHtml(order.orderNo)}</div>
                  <div class="item-sub">${escapeHtml(order.provider)} · ${escapeHtml(order.status)} · ${fmt(order.createdAt)}</div>
                </div>
                <span class="chip ${order.status === 'paid' ? 'ok' : order.status === 'pending' ? 'warn' : 'bad'}">${escapeHtml(order.status)}</span>
              </div>
              <div class="kv">
                <div><label>Provider Order ID</label><strong>${escapeHtml(order.providerOrderId ?? '-')}</strong></div>
                <div><label>Paid At</label><strong>${fmt(order.paidAt)}</strong></div>
                <div><label>Completed At</label><strong>${fmt(order.updatedAt)}</strong></div>
                <div><label>App / Plan</label><strong>${escapeHtml(order.appId)} / ${escapeHtml(order.planId)}</strong></div>
              </div>
            </div>`);
        });

        webhooks.forEach((webhook) => {
          items.push(`
            <div class="item">
              <div class="item-head">
                <div>
                  <div class="item-title">Webhook ${escapeHtml(webhook.providerEventId)}</div>
                  <div class="item-sub">${escapeHtml(webhook.provider)} · ${escapeHtml(webhook.type)} · ${fmt(webhook.createdAt)}</div>
                </div>
                <span class="chip ${webhook.processedAt ? 'ok' : 'warn'}">${webhook.processedAt ? 'processed' : 'pending'}</span>
              </div>
              <div class="kv">
                <div><label>Status</label><strong>${escapeHtml(webhook.status ?? '-')}</strong></div>
                <div><label>Processed At</label><strong>${fmt(webhook.processedAt)}</strong></div>
              </div>
              <pre>${escapeHtml(JSON.stringify(webhook.payload, null, 2))}</pre>
            </div>`);
        });

        events.forEach((event) => {
          items.push(`
            <div class="item">
              <div class="item-head">
                <div>
                  <div class="item-title">Event ${escapeHtml(event.eventName)}</div>
                  <div class="item-sub">${fmt(event.createdAt)} · ${escapeHtml(event.user?.email ?? event.userId ?? '-')}
                  </div>
                </div>
                <span class="chip ok">event</span>
              </div>
              <pre>${escapeHtml(JSON.stringify(event.properties ?? {}, null, 2))}</pre>
            </div>`);
        });

        entitlements.forEach((entitlement) => {
          items.push(`
            <div class="item">
              <div class="item-head">
                <div>
                  <div class="item-title">Entitlement ${escapeHtml(entitlement.id)}</div>
                  <div class="item-sub">${fmt(entitlement.createdAt)} · ${escapeHtml(entitlement.status)}</div>
                </div>
                <span class="chip ok">entitlement</span>
              </div>
              <div class="kv">
                <div><label>Plan</label><strong>${escapeHtml(entitlement.planId)}</strong></div>
                <div><label>Source</label><strong>${escapeHtml(entitlement.sourceType)} / ${escapeHtml(entitlement.sourceId ?? '-')}</strong></div>
              </div>
            </div>`);
        });

        byId('timeline').innerHTML = items.length > 0
          ? items.join('')
          : '<div class="item"><div class="item-title">暂无数据</div><div class="item-sub">请先刷新或加载最新记录。</div></div>';
      }

      function renderJsonPanels() {
        byId('orders-json').textContent = JSON.stringify(state.orders, null, 2);
        byId('webhooks-json').textContent = JSON.stringify(state.webhooks, null, 2);
        byId('events-json').textContent = JSON.stringify(state.events, null, 2);
        byId('entitlements-json').textContent = JSON.stringify(state.entitlements, null, 2);
      }

      async function fetchJson(path) {
        const response = await fetch(path, { credentials: 'include', cache: 'no-store' });
        const text = await response.text();
        const data = text ? JSON.parse(text) : null;
        if (!response.ok) {
          throw new Error((data && (data.message || data.error)) || response.statusText || 'Request failed');
        }
        return data;
      }

      async function loadData() {
        const latestOrders = await fetchJson('/v1/admin/orders?limit=20&offset=0');
        state.orders = latestOrders;
        state.latestOrderNo = latestOrders.items && latestOrders.items[0] ? latestOrders.items[0].orderNo : '';

        const [webhooks, events, entitlements] = await Promise.all([
          fetchJson('/v1/admin/billing-webhooks?limit=30&offset=0'),
          fetchJson('/v1/admin/events?limit=30&offset=0'),
          fetchJson('/v1/admin/entitlements?limit=30&offset=0')
        ]);

        state.webhooks = webhooks;
        state.events = events;
        state.entitlements = entitlements;

        renderSummary();
        renderTimeline();
        renderJsonPanels();
        setLastUpdated('最后刷新：' + new Date().toLocaleString('zh-CN', { hour12: false }));
      }

      byId('refresh-btn').addEventListener('click', async () => {
        byId('refresh-btn').disabled = true;
        try {
          await loadData();
        } catch (error) {
          setLastUpdated('加载失败：' + (error instanceof Error ? error.message : String(error)));
        } finally {
          byId('refresh-btn').disabled = false;
        }
      });

      byId('load-latest-btn').addEventListener('click', async () => {
        byId('load-latest-btn').disabled = true;
        try {
          await loadData();
        } finally {
          byId('load-latest-btn').disabled = false;
        }
      });

      byId('copy-link-btn').addEventListener('click', async () => {
        await navigator.clipboard.writeText(window.location.href);
      });

      byId('toggle-orders').addEventListener('click', () => byId('orders-json').classList.toggle('hidden'));
      byId('toggle-webhooks').addEventListener('click', () => byId('webhooks-json').classList.toggle('hidden'));

      void loadData().catch((error) => {
        setLastUpdated('加载失败：' + (error instanceof Error ? error.message : String(error)));
      });
    </script>
  </body>
</html>`;
}
