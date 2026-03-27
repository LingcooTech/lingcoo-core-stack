export function renderPaymentAdminPage() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>fd-core-stack 支付配置</title>
    <style>
      :root {
        --bg: #efe6d7;
        --panel: #fffaf2;
        --ink: #1d2a2f;
        --muted: #5e6b70;
        --line: #d8cdbb;
        --accent: #0f766e;
        --accent-2: #b45309;
        --danger: #b42318;
        --success: #166534;
        --shadow: 0 18px 40px rgba(35, 28, 16, 0.12);
        --radius: 18px;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "IBM Plex Sans", "PingFang SC", "Microsoft YaHei", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(15, 118, 110, 0.12), transparent 28%),
          radial-gradient(circle at top right, rgba(180, 83, 9, 0.14), transparent 24%),
          linear-gradient(180deg, #f5ecde 0%, var(--bg) 100%);
        min-height: 100vh;
      }

      .shell {
        width: min(1180px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 28px 0 56px;
      }

      .hero,
      .layout,
      .status-grid,
      .auth-grid,
      .field-grid {
        display: grid;
        gap: 18px;
      }

      .hero {
        grid-template-columns: 1.4fr 0.9fr;
        margin-bottom: 18px;
      }

      .layout {
        grid-template-columns: 0.88fr 1.12fr;
        align-items: start;
      }

      .panel {
        background: rgba(255, 250, 242, 0.92);
        border: 1px solid rgba(216, 205, 187, 0.9);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        backdrop-filter: blur(12px);
      }

      .hero-main {
        padding: 26px 28px;
      }

      .hero-side,
      .card {
        padding: 22px;
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        border-radius: 999px;
        background: rgba(15, 118, 110, 0.08);
        color: var(--accent);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      h1 {
        margin: 14px 0 10px;
        font-family: "Avenir Next", "Helvetica Neue", sans-serif;
        font-size: clamp(30px, 4vw, 54px);
        line-height: 0.96;
        letter-spacing: -0.04em;
      }

      h2 {
        margin: 0 0 10px;
        font-size: 18px;
        letter-spacing: -0.02em;
      }

      p,
      .muted,
      .subtle {
        color: var(--muted);
        line-height: 1.65;
      }

      .lead {
        margin: 0;
        max-width: 720px;
        font-size: 15px;
      }

      .status-grid {
        grid-template-columns: repeat(3, 1fr);
        margin-top: 24px;
      }

      .status-card {
        padding: 16px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.62);
        border: 1px solid rgba(216, 205, 187, 0.8);
      }

      .status-card label {
        display: block;
        color: var(--muted);
        font-size: 12px;
        margin-bottom: 6px;
      }

      .status-card strong {
        display: block;
        font-size: 18px;
      }

      .stack {
        display: grid;
        gap: 18px;
      }

      .card-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: start;
        margin-bottom: 18px;
      }

      .card-head p {
        margin: 6px 0 0;
      }

      .badge-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 11px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        border: 1px solid transparent;
      }

      .badge.ok {
        color: var(--success);
        background: rgba(22, 101, 52, 0.09);
        border-color: rgba(22, 101, 52, 0.12);
      }

      .badge.warn {
        color: var(--accent-2);
        background: rgba(180, 83, 9, 0.08);
        border-color: rgba(180, 83, 9, 0.12);
      }

      .badge.muted {
        color: var(--muted);
        background: rgba(94, 107, 112, 0.08);
        border-color: rgba(94, 107, 112, 0.12);
      }

      form {
        display: grid;
        gap: 14px;
      }

      .auth-grid,
      .field-grid {
        grid-template-columns: 1fr 1fr;
      }

      .field {
        display: grid;
        gap: 8px;
      }

      .field.full {
        grid-column: 1 / -1;
      }

      label {
        font-size: 13px;
        font-weight: 700;
      }

      input,
      textarea {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 12px 14px;
        font: inherit;
        color: var(--ink);
        background: rgba(255, 255, 255, 0.88);
        outline: none;
        transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
      }

      input:focus,
      textarea:focus {
        border-color: rgba(15, 118, 110, 0.8);
        box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.12);
      }

      textarea {
        min-height: 148px;
        resize: vertical;
        line-height: 1.45;
      }

      .toggle {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
        border: 1px solid var(--line);
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.88);
      }

      .toggle input {
        width: 18px;
        height: 18px;
        margin: 0;
        box-shadow: none;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      button {
        border: 0;
        border-radius: 999px;
        padding: 11px 16px;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
        transition: transform 0.16s ease, opacity 0.16s ease;
      }

      button:hover {
        transform: translateY(-1px);
      }

      .primary {
        background: var(--accent);
        color: white;
      }

      .secondary {
        background: rgba(29, 42, 47, 0.08);
        color: var(--ink);
      }

      .danger {
        background: rgba(180, 35, 24, 0.08);
        color: var(--danger);
      }

      .ghost-link {
        color: var(--accent);
        text-decoration: none;
        font-weight: 700;
      }

      .flash {
        min-height: 22px;
        font-size: 14px;
        font-weight: 700;
      }

      .flash.success {
        color: var(--success);
      }

      .flash.error {
        color: var(--danger);
      }

      .locked {
        padding: 14px 16px;
        border-radius: 14px;
        background: rgba(15, 118, 110, 0.05);
        border: 1px solid rgba(15, 118, 110, 0.12);
      }

      .warning {
        background: rgba(180, 35, 24, 0.05);
        border-color: rgba(180, 35, 24, 0.12);
        color: var(--danger);
      }

      .hidden {
        display: none !important;
      }

      @media (max-width: 980px) {
        .hero,
        .layout,
        .status-grid,
        .auth-grid,
        .field-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <section class="hero">
        <div class="panel hero-main">
          <span class="eyebrow">fd-core-stack / payment control</span>
          <h1>支付配置后台</h1>
          <p class="lead">
            这里只保留你实际需要填写的字段。回调地址、网关、签名细节都由系统内置处理，不再要求你额外配置。
          </p>
          <div class="status-grid">
            <div class="status-card">
              <label>当前用户</label>
              <strong id="current-user">未登录</strong>
            </div>
            <div class="status-card">
              <label>微信支付</label>
              <strong id="wechat-overview">未检查</strong>
            </div>
            <div class="status-card">
              <label>支付宝</label>
              <strong id="alipay-overview">未检查</strong>
            </div>
          </div>
        </div>

        <aside class="panel hero-side">
          <h2>填写规则</h2>
          <p>1. 这里只显示和 fd-payment 对齐的字段。</p>
          <p>2. 密钥类字段保存后不会回显，输入框变空是正常的，不代表没保存。</p>
          <p>3. 根路径返回 JSON 正常，后台页面在 <a class="ghost-link" href="/admin/payments">/admin/payments</a>。</p>
          <p class="muted">
            接口文档仍然可在 <a class="ghost-link" href="/docs" target="_blank" rel="noreferrer">/docs</a> 查看。
          </p>
        </aside>
      </section>

      <section class="layout">
        <div class="stack">
          <div class="panel card">
            <div class="card-head">
              <div>
                <h2>管理员登录</h2>
                <p class="muted">登录后才能保存支付配置。token 只保存在当前浏览器。</p>
              </div>
            </div>

            <div id="auth-flash" class="flash"></div>

            <div class="auth-grid">
              <form id="login-form">
                <div class="field">
                  <label for="login-email">邮箱</label>
                  <input id="login-email" name="email" type="email" placeholder="admin@example.com" required />
                </div>
                <div class="field">
                  <label for="login-password">密码</label>
                  <input id="login-password" name="password" type="password" placeholder="输入登录密码" required />
                </div>
                <div class="actions">
                  <button class="primary" type="submit">登录</button>
                  <button class="secondary" type="button" id="logout-button">退出</button>
                </div>
              </form>

              <form id="register-form">
                <div class="field">
                  <label for="register-email">注册邮箱</label>
                  <input id="register-email" name="email" type="email" placeholder="first-admin@example.com" required />
                </div>
                <div class="field">
                  <label for="register-name">显示名称</label>
                  <input id="register-name" name="displayName" type="text" placeholder="Admin" />
                </div>
                <div class="field full">
                  <label for="register-password">注册密码</label>
                  <input id="register-password" name="password" type="password" placeholder="至少 8 位" required />
                </div>
                <div class="actions">
                  <button class="primary" type="submit">注册并登录</button>
                </div>
                <div id="bootstrap-note" class="subtle"></div>
              </form>
            </div>
          </div>

          <div class="panel card">
            <div class="card-head">
              <div>
                <h2>权限状态</h2>
                <p class="muted">只有 admin 可以修改支付配置。</p>
              </div>
            </div>
            <div id="access-message" class="locked warning">
              还没有管理员会话。请先登录，或者在系统还没有 admin 的情况下先注册一个账号。
            </div>
          </div>
        </div>

        <div class="stack">
          <div id="settings-panel" class="hidden">
            <div class="panel card">
              <div class="card-head">
                <div>
                  <h2>微信支付</h2>
                  <p class="muted">按你截图中的字段填写即可。系统当前统一走二维码下单。</p>
                </div>
                <div class="badge-row">
                  <span id="wechat-source" class="badge muted">来源未检查</span>
                  <span id="wechat-status" class="badge warn">未配置</span>
                </div>
              </div>

              <div class="locked" style="margin-bottom:18px;">
                AppSecret 和 API 密钥保存后不会回显。刷新后看到空白输入框是正常的。
              </div>

              <div id="wechat-flash" class="flash"></div>

              <form id="wechat-form">
                <div class="field-grid">
                  <div class="field">
                    <label for="wechat-appId">微信 AppID</label>
                    <input id="wechat-appId" name="appId" type="text" placeholder="wx1234567890abcdef" />
                  </div>
                  <div class="field">
                    <label for="wechat-mchId">微信商户号</label>
                    <input id="wechat-mchId" name="mchId" type="text" placeholder="1900000109" />
                  </div>
                  <div class="field">
                    <label for="wechat-appSecret">AppSecret</label>
                    <input id="wechat-appSecret" name="appSecret" type="password" placeholder="留空则保持当前已保存值" />
                    <div id="wechat-appSecret-status" class="subtle"></div>
                  </div>
                  <div class="field">
                    <label for="wechat-apiKey">API 密钥</label>
                    <input id="wechat-apiKey" name="apiKey" type="password" placeholder="留空则保持当前已保存值" />
                    <div id="wechat-apiKey-status" class="subtle"></div>
                  </div>
                  <div class="field full">
                    <label for="wechat-disableH5">禁用 H5 支付</label>
                    <label class="toggle" for="wechat-disableH5">
                      <input id="wechat-disableH5" name="disableH5" type="checkbox" />
                      <span>开启后，系统保留扫码路径，不再为移动端预留 H5 模式。</span>
                    </label>
                  </div>
                </div>

                <div class="actions">
                  <button class="primary" type="submit">保存微信支付配置</button>
                  <button class="danger" type="button" id="wechat-clear">清空微信支付配置</button>
                </div>
              </form>
            </div>

            <div class="panel card">
              <div class="card-head">
                <div>
                  <h2>支付宝</h2>
                  <p class="muted">按你截图中的字段填写即可。是否走当面付由下面开关控制。</p>
                </div>
                <div class="badge-row">
                  <span id="alipay-source" class="badge muted">来源未检查</span>
                  <span id="alipay-status" class="badge warn">未配置</span>
                </div>
              </div>

              <div class="locked" style="margin-bottom:18px;">
                应用私钥和支付宝公钥保存后不会回显。刷新后文本框为空是正常的。
              </div>

              <div id="alipay-flash" class="flash"></div>

              <form id="alipay-form">
                <div class="field-grid">
                  <div class="field full">
                    <label for="alipay-appId">支付宝 APPID</label>
                    <input id="alipay-appId" name="appId" type="text" placeholder="202100..." />
                  </div>
                  <div class="field full">
                    <label for="alipay-privateKeyPem">应用私钥</label>
                    <textarea id="alipay-privateKeyPem" name="privateKeyPem" placeholder="支持粘贴完整 PEM，也支持只粘贴密钥正文"></textarea>
                    <div id="alipay-privateKeyPem-status" class="subtle"></div>
                  </div>
                  <div class="field full">
                    <label for="alipay-publicKeyPem">支付宝公钥</label>
                    <textarea id="alipay-publicKeyPem" name="publicKeyPem" placeholder="支持粘贴完整 PEM，也支持只粘贴密钥正文"></textarea>
                    <div id="alipay-publicKeyPem-status" class="subtle"></div>
                  </div>
                  <div class="field full">
                    <label for="alipay-f2fPay">启用当面付</label>
                    <label class="toggle" for="alipay-f2fPay">
                      <input id="alipay-f2fPay" name="f2fPay" type="checkbox" />
                      <span>开启后，下单结果返回支付宝扫码二维码；关闭时走网页跳转支付。</span>
                    </label>
                  </div>
                </div>

                <div class="actions">
                  <button class="primary" type="submit">保存支付宝配置</button>
                  <button class="danger" type="button" id="alipay-clear">清空支付宝配置</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </section>
    </div>

    <script>
      const state = {
        token: localStorage.getItem('fd_core_admin_token') || ''
      };

      function setFlash(id, message, kind) {
        const el = document.getElementById(id);
        el.textContent = message || '';
        el.className = 'flash' + (kind ? ' ' + kind : '');
      }

      async function api(path, options = {}) {
        const headers = new Headers(options.headers || {});
        if (!headers.has('Content-Type') && options.body) {
          headers.set('Content-Type', 'application/json');
        }
        if (state.token) {
          headers.set('Authorization', 'Bearer ' + state.token);
        }

        const response = await fetch(path, { ...options, headers });
        const text = await response.text();
        let payload = null;

        if (text) {
          try {
            payload = JSON.parse(text);
          } catch {
            payload = { message: text };
          }
        }

        if (!response.ok) {
          throw new Error(payload?.message || payload?.error || 'Request failed');
        }

        return payload;
      }

      function updateBadge(id, text, ok) {
        const el = document.getElementById(id);
        el.textContent = text;
        el.className = 'badge ' + (ok ? 'ok' : 'warn');
      }

      function updateSourceBadge(id, source) {
        const el = document.getElementById(id);
        const label =
          source === 'database' ? '来源: 数据库' :
          source === 'env' ? '来源: 环境变量' :
          '来源: 未配置';
        el.textContent = label;
        el.className = 'badge ' + (source === 'database' ? 'ok' : source === 'env' ? 'warn' : 'muted');
      }

      function secretText(configured) {
        return configured ? '已保存，不回显；留空则保持不变' : '当前未保存';
      }

      function applyOverview(data) {
        const wechat = data.items.find((item) => item.code === 'wechat_pay');
        const alipay = data.items.find((item) => item.code === 'alipay');

        if (wechat) {
          document.getElementById('wechat-appId').value = wechat.values.appId || '';
          document.getElementById('wechat-mchId').value = wechat.values.mchId || '';
          document.getElementById('wechat-appSecret').value = '';
          document.getElementById('wechat-apiKey').value = '';
          document.getElementById('wechat-disableH5').checked = Boolean(wechat.values.disableH5);
          document.getElementById('wechat-appSecret-status').textContent = secretText(wechat.secrets.appSecret.configured);
          document.getElementById('wechat-apiKey-status').textContent = secretText(wechat.secrets.apiKey.configured);
          document.getElementById('wechat-overview').textContent = wechat.configured ? '已配置' : '未完成';
          updateBadge('wechat-status', wechat.configured ? '配置完成' : '配置不完整', wechat.configured);
          updateSourceBadge('wechat-source', wechat.source);
        }

        if (alipay) {
          document.getElementById('alipay-appId').value = alipay.values.appId || '';
          document.getElementById('alipay-privateKeyPem').value = '';
          document.getElementById('alipay-publicKeyPem').value = '';
          document.getElementById('alipay-f2fPay').checked = Boolean(alipay.values.f2fPay);
          document.getElementById('alipay-privateKeyPem-status').textContent = secretText(alipay.secrets.privateKeyPem.configured);
          document.getElementById('alipay-publicKeyPem-status').textContent = secretText(alipay.secrets.publicKeyPem.configured);
          document.getElementById('alipay-overview').textContent = alipay.configured ? '已配置' : '未完成';
          updateBadge('alipay-status', alipay.configured ? '配置完成' : '配置不完整', alipay.configured);
          updateSourceBadge('alipay-source', alipay.source);
        }
      }

      async function loadBootstrapStatus() {
        const data = await api('/v1/admin/bootstrap-status');
        const note = document.getElementById('bootstrap-note');
        note.textContent = data.hasAdmin
          ? '系统里已经存在管理员账号，请直接登录。'
          : '系统里还没有管理员。首个完成注册或登录的账号会自动成为 admin。';
      }

      async function loadSession() {
        if (!state.token) {
          document.getElementById('current-user').textContent = '未登录';
          document.getElementById('access-message').textContent = '还没有管理员会话。请先登录，或者在系统还没有 admin 的情况下先注册一个账号。';
          document.getElementById('settings-panel').classList.add('hidden');
          return;
        }

        try {
          const me = await api('/v1/me');
          const label = me.user.displayName ? me.user.displayName + ' · ' + me.user.email : me.user.email;
          document.getElementById('current-user').textContent = label + ' · ' + me.user.role;

          if (me.user.role !== 'admin') {
            document.getElementById('settings-panel').classList.add('hidden');
            document.getElementById('access-message').textContent = '当前账号已登录，但不是 admin，不能管理支付配置。';
            return;
          }

          document.getElementById('access-message').textContent = '当前账号拥有 admin 权限，可以直接保存和清空支付配置。';
          document.getElementById('settings-panel').classList.remove('hidden');
          const overview = await api('/v1/admin/payment-settings');
          applyOverview(overview);
        } catch (_error) {
          localStorage.removeItem('fd_core_admin_token');
          state.token = '';
          document.getElementById('current-user').textContent = '登录已失效';
          document.getElementById('settings-panel').classList.add('hidden');
          document.getElementById('access-message').textContent = '当前登录态已失效，请重新登录。';
        }
      }

      async function refresh() {
        await loadBootstrapStatus();
        await loadSession();
      }

      document.getElementById('login-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        setFlash('auth-flash', '', '');
        try {
          const data = await api('/v1/auth/login', {
            method: 'POST',
            body: JSON.stringify({
              email: document.getElementById('login-email').value,
              password: document.getElementById('login-password').value
            })
          });
          state.token = data.token;
          localStorage.setItem('fd_core_admin_token', data.token);
          setFlash('auth-flash', '登录成功', 'success');
          await refresh();
        } catch (error) {
          setFlash('auth-flash', error.message, 'error');
        }
      });

      document.getElementById('register-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        setFlash('auth-flash', '', '');
        try {
          const data = await api('/v1/auth/register', {
            method: 'POST',
            body: JSON.stringify({
              email: document.getElementById('register-email').value,
              password: document.getElementById('register-password').value,
              displayName: document.getElementById('register-name').value
            })
          });
          state.token = data.token;
          localStorage.setItem('fd_core_admin_token', data.token);
          setFlash('auth-flash', '注册成功，已自动登录', 'success');
          await refresh();
        } catch (error) {
          setFlash('auth-flash', error.message, 'error');
        }
      });

      document.getElementById('logout-button').addEventListener('click', async () => {
        localStorage.removeItem('fd_core_admin_token');
        state.token = '';
        setFlash('auth-flash', '已退出登录', 'success');
        await refresh();
      });

      document.getElementById('wechat-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        setFlash('wechat-flash', '', '');
        try {
          const payload = {
            appId: document.getElementById('wechat-appId').value,
            appSecret: document.getElementById('wechat-appSecret').value,
            mchId: document.getElementById('wechat-mchId').value,
            apiKey: document.getElementById('wechat-apiKey').value,
            disableH5: document.getElementById('wechat-disableH5').checked
          };
          await api('/v1/admin/payment-settings/wechat', {
            method: 'PUT',
            body: JSON.stringify(payload)
          });
          setFlash('wechat-flash', '微信支付配置已保存', 'success');
          await refresh();
        } catch (error) {
          setFlash('wechat-flash', error.message, 'error');
        }
      });

      document.getElementById('alipay-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        setFlash('alipay-flash', '', '');
        try {
          const payload = {
            appId: document.getElementById('alipay-appId').value,
            privateKeyPem: document.getElementById('alipay-privateKeyPem').value,
            publicKeyPem: document.getElementById('alipay-publicKeyPem').value,
            f2fPay: document.getElementById('alipay-f2fPay').checked
          };
          await api('/v1/admin/payment-settings/alipay', {
            method: 'PUT',
            body: JSON.stringify(payload)
          });
          setFlash('alipay-flash', '支付宝配置已保存', 'success');
          await refresh();
        } catch (error) {
          setFlash('alipay-flash', error.message, 'error');
        }
      });

      document.getElementById('wechat-clear').addEventListener('click', async () => {
        if (!window.confirm('确认清空微信支付数据库配置？环境变量回退仍可能继续生效。')) {
          return;
        }
        try {
          await api('/v1/admin/payment-settings/wechat_pay', { method: 'DELETE' });
          setFlash('wechat-flash', '微信支付数据库配置已清空', 'success');
          await refresh();
        } catch (error) {
          setFlash('wechat-flash', error.message, 'error');
        }
      });

      document.getElementById('alipay-clear').addEventListener('click', async () => {
        if (!window.confirm('确认清空支付宝数据库配置？环境变量回退仍可能继续生效。')) {
          return;
        }
        try {
          await api('/v1/admin/payment-settings/alipay', { method: 'DELETE' });
          setFlash('alipay-flash', '支付宝数据库配置已清空', 'success');
          await refresh();
        } catch (error) {
          setFlash('alipay-flash', error.message, 'error');
        }
      });

      refresh();
    </script>
  </body>
</html>`;
}
