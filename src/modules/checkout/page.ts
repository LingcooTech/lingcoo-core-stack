export function renderCheckoutPage(sessionCode: string) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FD Core Checkout</title>
    <style>
      :root {
        --bg: #f3efe6;
        --panel: rgba(255, 255, 255, 0.86);
        --ink: #13212a;
        --muted: #5d6770;
        --line: #d8d4cb;
        --accent: #0f766e;
        --accent-2: #b45309;
        --success: #166534;
        --danger: #b42318;
        --radius: 18px;
        --shadow: 0 20px 60px rgba(19, 33, 42, 0.12);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "IBM Plex Sans", "PingFang SC", "Microsoft YaHei", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(15, 118, 110, 0.12), transparent 24%),
          radial-gradient(circle at top right, rgba(180, 83, 9, 0.12), transparent 20%),
          linear-gradient(180deg, #f8f4ec 0%, var(--bg) 100%);
        min-height: 100vh;
      }

      .shell {
        width: min(980px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 28px 0 64px;
      }

      .hero,
      .grid {
        display: grid;
        gap: 18px;
      }

      .hero {
        grid-template-columns: 1.15fr 0.85fr;
        margin-bottom: 18px;
      }

      .grid {
        grid-template-columns: 1.05fr 0.95fr;
        align-items: start;
      }

      .panel {
        background: var(--panel);
        border: 1px solid rgba(216, 212, 203, 0.92);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        backdrop-filter: blur(14px);
      }

      .hero-main {
        padding: 26px 28px;
      }

      .card {
        padding: 22px;
      }

      h1 {
        margin: 14px 0 10px;
        font-size: clamp(30px, 4vw, 52px);
        line-height: 0.96;
        letter-spacing: -0.04em;
      }

      h2 {
        margin: 0 0 12px;
        font-size: 18px;
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        padding: 6px 12px;
        border-radius: 999px;
        background: rgba(15, 118, 110, 0.08);
        color: var(--accent);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      p,
      .muted {
        color: var(--muted);
        line-height: 1.68;
      }

      .status {
        display: inline-flex;
        align-items: center;
        padding: 8px 12px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 700;
      }

      .status.pending {
        color: var(--accent-2);
        background: rgba(180, 83, 9, 0.1);
      }

      .status.paid {
        color: var(--success);
        background: rgba(22, 101, 52, 0.1);
      }

      .status.failed,
      .status.cancelled,
      .status.expired {
        color: var(--danger);
        background: rgba(180, 35, 24, 0.1);
      }

      .facts {
        display: grid;
        gap: 14px;
        margin-top: 18px;
      }

      .fact {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 0;
        border-bottom: 1px solid rgba(216, 212, 203, 0.7);
      }

      .fact:last-child {
        border-bottom: none;
        padding-bottom: 0;
      }

      .fact label {
        color: var(--muted);
      }

      .qr-shell {
        display: grid;
        place-items: center;
        min-height: 340px;
        border-radius: 18px;
        border: 1px dashed rgba(15, 118, 110, 0.22);
        background: rgba(255, 255, 255, 0.66);
        padding: 22px;
      }

      .qr-shell img {
        width: min(280px, 70vw);
        height: auto;
        border-radius: 18px;
        background: #fff;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 18px;
      }

      button,
      a.button {
        appearance: none;
        border: none;
        border-radius: 14px;
        padding: 12px 16px;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
        text-decoration: none;
      }

      button.primary,
      a.button.primary {
        background: var(--accent);
        color: #fff;
      }

      button.secondary,
      a.button.secondary {
        background: rgba(19, 33, 42, 0.08);
        color: var(--ink);
      }

      .hint {
        margin-top: 18px;
        padding: 14px 16px;
        border-radius: 14px;
        background: rgba(19, 33, 42, 0.05);
      }

      pre {
        margin: 12px 0 0;
        padding: 12px;
        border-radius: 14px;
        background: #f8fafc;
        font-size: 12px;
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-all;
      }

      .hidden {
        display: none;
      }

      @media (max-width: 900px) {
        .hero,
        .grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <section class="hero">
        <div class="panel hero-main">
          <span class="eyebrow">Hosted Checkout</span>
          <h1 id="title">载入支付会话中</h1>
          <p id="subtitle" class="muted">正在从中台读取当前结算状态。</p>
        </div>
        <div class="panel card">
          <h2>状态</h2>
          <div id="status-badge" class="status pending">载入中</div>
          <div class="facts">
            <div class="fact"><label>Session</label><strong id="session-code">-</strong></div>
            <div class="fact"><label>订单号</label><strong id="order-no">-</strong></div>
            <div class="fact"><label>金额</label><strong id="amount">-</strong></div>
          </div>
        </div>
      </section>

      <section class="grid">
        <div class="panel card">
          <h2>支付动作</h2>
          <div id="payment-content" class="qr-shell">
            <p class="muted">正在准备支付动作。</p>
          </div>
          <div class="actions">
            <button id="refresh-button" class="primary" type="button">已支付，立即验单</button>
            <a id="success-link" class="button primary hidden" href="#" target="_self" rel="noreferrer">返回应用</a>
            <a id="cancel-link" class="button secondary hidden" href="#" target="_self" rel="noreferrer">取消并返回</a>
          </div>
        </div>

        <div class="panel card">
          <h2>订单摘要</h2>
          <div class="facts">
            <div class="fact"><label>应用</label><strong id="app-name">-</strong></div>
            <div class="fact"><label>产品</label><strong id="product-name">-</strong></div>
            <div class="fact"><label>价格方案</label><strong id="price-name">-</strong></div>
            <div class="fact"><label>过期时间</label><strong id="expires-at">-</strong></div>
            <div class="fact"><label>完成时间</label><strong id="completed-at">-</strong></div>
          </div>
          <div id="detail-hint" class="hint">如果异步回调稍慢，可以在支付完成后点击“已支付，立即验单”主动查单。</div>
        </div>
      </section>
    </div>

    <script>
      const sessionCode = ${JSON.stringify(sessionCode)};
      const state = {
        publicData: null,
        hasOpenedRedirect: false,
        pollTimer: null
      };

      function byId(id) {
        return document.getElementById(id);
      }

      function formatTime(value) {
        if (!value) {
          return '-';
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
          return value;
        }

        return date.toLocaleString('zh-CN', { hour12: false });
      }

      function setStatus(status) {
        const badge = byId('status-badge');
        badge.textContent = status;
        badge.className = 'status ' + status;
      }

      function setSummary(data) {
        byId('title').textContent = data.product.name + ' / ' + data.price.name;
        byId('subtitle').textContent = '订单创建后由中台统一处理支付、回调和权益发放。';
        byId('session-code').textContent = data.sessionCode;
        byId('order-no').textContent = data.order.orderNo;
        byId('amount').textContent = data.order.amountYuan + ' ' + data.order.currency;
        byId('app-name').textContent = data.app.name + ' (' + data.app.code + ')';
        byId('product-name').textContent = data.product.name;
        byId('price-name').textContent = data.price.name;
        byId('expires-at').textContent = formatTime(data.expiresAt);
        byId('completed-at').textContent = formatTime(data.completedAt);
        setStatus(data.status);

        const successLink = byId('success-link');
        const cancelLink = byId('cancel-link');
        if (data.successUrl) {
          successLink.href = data.successUrl;
          successLink.classList.remove('hidden');
        }
        if (data.cancelUrl) {
          cancelLink.href = data.cancelUrl;
          cancelLink.classList.remove('hidden');
        }
      }

      function renderPaymentAction(data) {
        const shell = byId('payment-content');

        if (data.status === 'paid') {
          shell.innerHTML = '<div><h2 style="margin:0 0 10px;">支付已完成</h2><p class="muted">中台已经收到支付结果，可以返回应用继续使用。</p></div>';
          return;
        }

        if (data.status === 'expired' || data.status === 'failed' || data.status === 'cancelled') {
          shell.innerHTML = '<div><h2 style="margin:0 0 10px;">当前会话不可继续支付</h2><p class="muted">请返回应用重新发起新的结算会话。</p></div>';
          return;
        }

        if (!data.paymentAction) {
          shell.innerHTML = '<p class="muted">当前没有可展示的支付动作。</p>';
          return;
        }

        if (data.paymentAction.type === 'qr_code') {
          shell.innerHTML =
            '<div style="text-align:center;">' +
            '<img alt="支付二维码" src="' + data.paymentAction.qrCodeDataUrl + '" />' +
            '<p class="muted" style="margin-top:16px;">请使用支付宝或微信扫码完成支付。</p>' +
            '<pre>' + data.paymentAction.qrCodeText + '</pre>' +
            '</div>';
          return;
        }

        shell.innerHTML =
          '<div style="text-align:center;">' +
          '<h2 style="margin:0 0 12px;">跳转到支付页</h2>' +
          '<p class="muted">点击下面按钮在新标签页打开支付页面，当前页会继续轮询支付结果。</p>' +
          '<div class="actions" style="justify-content:center;">' +
          '<button id="open-payment" class="primary" type="button">打开支付页</button>' +
          '</div>' +
          '</div>';

        const button = byId('open-payment');
        button.addEventListener('click', () => {
          window.open(data.paymentAction.url, '_blank', 'noopener,noreferrer');
          state.hasOpenedRedirect = true;
        });

        if (!state.hasOpenedRedirect) {
          window.open(data.paymentAction.url, '_blank', 'noopener,noreferrer');
          state.hasOpenedRedirect = true;
        }
      }

      async function fetchJson(path, init) {
        const response = await fetch(path, init);
        const text = await response.text();
        const payload = text ? JSON.parse(text) : null;

        if (!response.ok) {
          throw new Error(payload?.message || payload?.error || 'Request failed');
        }

        return payload;
      }

      async function loadPublicData() {
        const data = await fetchJson('/v1/checkout/sessions/' + encodeURIComponent(sessionCode) + '/public');
        state.publicData = data;
        setSummary(data);
        renderPaymentAction(data);
      }

      async function refreshStatus() {
        const data = await fetchJson('/v1/checkout/sessions/' + encodeURIComponent(sessionCode) + '/status');
        if (!state.publicData) {
          return;
        }

        state.publicData.status = data.status;
        state.publicData.completedAt = data.completedAt;
        setStatus(data.status);
        byId('completed-at').textContent = formatTime(data.completedAt);

        if (data.status === 'paid') {
          renderPaymentAction(state.publicData);
          if (state.publicData.successUrl) {
            setTimeout(() => {
              window.location.href = state.publicData.successUrl;
            }, 1500);
          }
        }
      }

      async function reconcileSession() {
        const button = byId('refresh-button');
        const previousLabel = button.textContent;
        button.disabled = true;
        button.textContent = '验单中...';

        try {
          const data = await fetchJson(
            '/v1/checkout/sessions/' + encodeURIComponent(sessionCode) + '/reconcile',
            { method: 'POST' }
          );

          if (!state.publicData) {
            return;
          }

          state.publicData.status = data.status;
          state.publicData.completedAt = data.completedAt;
          setStatus(data.status);
          byId('completed-at').textContent = formatTime(data.completedAt);
          renderPaymentAction(state.publicData);
        } finally {
          button.disabled = false;
          button.textContent = previousLabel;
        }
      }

      async function boot() {
        try {
          await loadPublicData();
          await refreshStatus();
        } catch (error) {
          byId('title').textContent = '结算页加载失败';
          byId('subtitle').textContent = error instanceof Error ? error.message : 'Unknown error';
          setStatus('failed');
          byId('payment-content').innerHTML = '<p class="muted">无法读取当前结算会话，请返回应用重新发起。</p>';
          return;
        }

        state.pollTimer = setInterval(() => {
          void refreshStatus();
        }, 3000);
      }

      byId('refresh-button').addEventListener('click', () => {
        void reconcileSession();
      });

      void boot();
    </script>
  </body>
</html>`;
}
