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

      .hero {
        display: grid;
        grid-template-columns: 1.4fr 0.9fr;
        gap: 18px;
        margin-bottom: 18px;
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

      .hero-side {
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

      .lead {
        margin: 0;
        max-width: 720px;
        color: var(--muted);
        line-height: 1.7;
        font-size: 15px;
      }

      .status-grid,
      .layout,
      .auth-grid {
        display: grid;
        gap: 18px;
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

      .hero-side h2,
      .section-title {
        margin: 0 0 10px;
        font-size: 18px;
        letter-spacing: -0.02em;
      }

      .hero-side p,
      .hint,
      .muted {
        color: var(--muted);
        font-size: 14px;
        line-height: 1.65;
      }

      .layout {
        grid-template-columns: 0.88fr 1.12fr;
        align-items: start;
      }

      .stack {
        display: grid;
        gap: 18px;
      }

      .card {
        padding: 22px;
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

      .auth-grid {
        grid-template-columns: 1fr 1fr;
      }

      .field-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
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
      textarea,
      select {
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
      textarea:focus,
      select:focus {
        border-color: rgba(15, 118, 110, 0.8);
        box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.12);
      }

      textarea {
        min-height: 148px;
        resize: vertical;
        line-height: 1.45;
      }

      .subtle {
        font-size: 12px;
        color: var(--muted);
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
        background: rgba(180, 35, 24, 0.05);
        border: 1px solid rgba(180, 35, 24, 0.12);
        color: var(--danger);
      }

      .hidden {
        display: none !important;
      }

      @media (max-width: 980px) {
        .hero,
        .layout,
        .auth-grid,
        .field-grid,
        .status-grid {
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
            这是 fd-core-stack 当前的第一版管理入口。它不依赖额外前端工程，直接挂在 API 服务里，用来管理微信支付和支付宝配置，并把敏感参数加密写入数据库。
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
          <h2>现在能看到什么</h2>
          <p>服务根路径只返回 JSON，是正常的。真正可视化的页面目前有两个：</p>
          <p class="muted">
            1. <a class="ghost-link" href="/docs" target="_blank" rel="noreferrer">Swagger 文档</a><br />
            2. 当前这个支付配置页
          </p>
          <p class="muted">
            如果系统里还没有管理员，首个完成注册或登录的账号会被提升为 admin，用来完成初始化配置。
          </p>
        </aside>
      </section>

      <section class="layout">
        <div class="stack">
          <div class="panel card">
            <div class="card-head">
              <div>
                <h2 class="section-title">管理员登录</h2>
                <p class="muted">先登录，再保存支付参数。token 只保存在当前浏览器。</p>
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
                <h2 class="section-title">和 fd-payment 的对应关系</h2>
                <p class="muted">这套中台不是直接照搬 WordPress 插件实现，所以有一部分字段名字一样，一部分已经升级了。</p>
              </div>
            </div>
            <div class="muted" style="display:grid; gap:14px;">
              <div>
                <strong style="display:block; color:var(--ink); margin-bottom:6px;">支付宝</strong>
                <div>fd-payment 里的“支付宝APPID / 应用私钥 / 支付宝公钥”在这里仍然是同一套东西，基本可以直接照着填。</div>
                <div>新增的 gateway / notifyUrl / returnUrl / keyType 里，通常只需要保留默认网关，回调地址可以先留空。</div>
              </div>
              <div>
                <strong style="display:block; color:var(--ink); margin-bottom:6px;">微信支付</strong>
                <div>这里不是旧版“AppSecret + API密钥”那套，而是微信支付 API v3。</div>
                <div>所以 fd-payment 里的“微信AppID / 微信商户号”还能直接对应；但“API密钥”已经换成 API v3 Key，并且必须新增“证书序列号 / 商户私钥 PEM / 平台证书 PEM”。</div>
                <div>AppSecret 在当前这版里不需要，因为我们现在做的是 Native 下单，不是 JSAPI。</div>
              </div>
            </div>
          </div>

          <div id="access-panel" class="panel card">
            <div class="card-head">
              <div>
                <h2 class="section-title">权限状态</h2>
                <p class="muted">这块只做当前后台入口的权限说明。</p>
              </div>
            </div>
            <div id="access-message" class="locked">
              还没有管理员会话。请先登录，或者在系统还没有 admin 的情况下先注册一个账号。
            </div>
          </div>
        </div>

        <div class="stack">
          <div id="settings-panel" class="hidden">
            <div class="panel card">
              <div class="card-head">
                <div>
                  <h2 class="section-title">微信支付</h2>
                  <p class="muted">按微信支付 API v3 Native 接入所需字段填写。</p>
                </div>
                <div class="badge-row">
                  <span id="wechat-source" class="badge muted">来源未检查</span>
                  <span id="wechat-status" class="badge warn">未配置</span>
                </div>
              </div>
              <div id="wechat-flash" class="flash"></div>
              <form id="wechat-form">
                <div class="field-grid">
                  <div class="field">
                    <label for="wechat-mchId">微信商户号</label>
                    <input id="wechat-mchId" name="mchId" type="text" placeholder="1900000109" />
                    <div class="subtle">这就是 fd-payment 里的“微信商户号”。</div>
                  </div>
                  <div class="field">
                    <label for="wechat-appId">微信 AppID</label>
                    <input id="wechat-appId" name="appId" type="text" placeholder="wx1234567890abcdef" />
                    <div class="subtle">这就是 fd-payment 里的“微信AppID”。</div>
                  </div>
                  <div class="field">
                    <label for="wechat-certSerialNo">API 证书序列号</label>
                    <input id="wechat-certSerialNo" name="certSerialNo" type="text" placeholder="7775B3..." />
                    <div class="subtle">这是新字段。到微信商户平台 API 证书里看，不是旧插件那套配置。</div>
                  </div>
                  <div class="field">
                    <label for="wechat-apiBaseUrl">API Base URL</label>
                    <input id="wechat-apiBaseUrl" name="apiBaseUrl" type="url" placeholder="https://api.mch.weixin.qq.com" />
                    <div class="subtle">正式环境保持默认即可。</div>
                  </div>
                  <div class="field full">
                    <label for="wechat-notifyUrl">回调地址</label>
                    <input id="wechat-notifyUrl" name="notifyUrl" type="url" placeholder="留空则按 PUBLIC_BASE_URL 自动生成" />
                    <div class="subtle">通常留空，系统会自动生成。</div>
                  </div>
                  <div class="field full">
                    <label for="wechat-apiV3Key">API v3 Key</label>
                    <input id="wechat-apiV3Key" name="apiV3Key" type="text" placeholder="留空则保持当前已保存值" />
                    <div id="wechat-apiV3Key-status" class="subtle"></div>
                  </div>
                  <div class="field full">
                    <label for="wechat-privateKeyPem">商户私钥 PEM</label>
                    <textarea id="wechat-privateKeyPem" name="privateKeyPem" placeholder="-----BEGIN PRIVATE KEY-----"></textarea>
                    <div id="wechat-privateKeyPem-status" class="subtle"></div>
                  </div>
                  <div class="field full">
                    <label for="wechat-platformCertPem">平台证书 PEM</label>
                    <textarea id="wechat-platformCertPem" name="platformCertPem" placeholder="-----BEGIN CERTIFICATE-----"></textarea>
                    <div id="wechat-platformCertPem-status" class="subtle"></div>
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
                  <h2 class="section-title">支付宝</h2>
                  <p class="muted">按当前 Page Pay 接入方式配置，后续可继续扩展扫码或手机网站支付。</p>
                </div>
                <div class="badge-row">
                  <span id="alipay-source" class="badge muted">来源未检查</span>
                  <span id="alipay-status" class="badge warn">未配置</span>
                </div>
              </div>
              <div id="alipay-flash" class="flash"></div>
              <form id="alipay-form">
                <div class="field-grid">
                  <div class="field">
                    <label for="alipay-appId">支付宝 APPID</label>
                    <input id="alipay-appId" name="appId" type="text" placeholder="202100..." />
                    <div class="subtle">这就是 fd-payment 里的“支付宝APPID”。</div>
                  </div>
                  <div class="field">
                    <label for="alipay-keyType">密钥格式</label>
                    <select id="alipay-keyType" name="keyType">
                      <option value="PKCS1">PKCS1</option>
                      <option value="PKCS8">PKCS8</option>
                    </select>
                  </div>
                  <div class="field full">
                    <label for="alipay-gateway">网关</label>
                    <input id="alipay-gateway" name="gateway" type="url" placeholder="https://openapi.alipay.com/gateway.do" />
                    <div class="subtle">保持默认即可，一般不用改。</div>
                  </div>
                  <div class="field">
                    <label for="alipay-notifyUrl">异步回调地址</label>
                    <input id="alipay-notifyUrl" name="notifyUrl" type="url" placeholder="留空则按 PUBLIC_BASE_URL 自动生成" />
                    <div class="subtle">通常留空，系统会自动生成。</div>
                  </div>
                  <div class="field">
                    <label for="alipay-returnUrl">同步返回地址</label>
                    <input id="alipay-returnUrl" name="returnUrl" type="url" placeholder="可留空" />
                    <div class="subtle">暂时可留空。</div>
                  </div>
                  <div class="field full">
                    <label for="alipay-privateKeyPem">应用私钥 PEM</label>
                    <textarea id="alipay-privateKeyPem" name="privateKeyPem" placeholder="-----BEGIN RSA PRIVATE KEY-----"></textarea>
                    <div id="alipay-privateKeyPem-status" class="subtle"></div>
                  </div>
                  <div class="field full">
                    <label for="alipay-publicKeyPem">支付宝公钥 PEM</label>
                    <textarea id="alipay-publicKeyPem" name="publicKeyPem" placeholder="-----BEGIN PUBLIC KEY-----"></textarea>
                    <div id="alipay-publicKeyPem-status" class="subtle"></div>
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
        return configured ? '已保存，留空则保持不变' : '当前未保存';
      }

      function applyOverview(data) {
        const wechat = data.items.find((item) => item.code === 'wechat_pay');
        const alipay = data.items.find((item) => item.code === 'alipay');

        if (wechat) {
          document.getElementById('wechat-mchId').value = wechat.values.mchId || '';
          document.getElementById('wechat-appId').value = wechat.values.appId || '';
          document.getElementById('wechat-certSerialNo').value = wechat.values.certSerialNo || '';
          document.getElementById('wechat-apiBaseUrl').value = wechat.values.apiBaseUrl || '';
          document.getElementById('wechat-notifyUrl').value = wechat.values.notifyUrl || '';
          document.getElementById('wechat-apiV3Key').value = '';
          document.getElementById('wechat-privateKeyPem').value = '';
          document.getElementById('wechat-platformCertPem').value = '';
          document.getElementById('wechat-apiV3Key-status').textContent = secretText(wechat.secrets.apiV3Key.configured);
          document.getElementById('wechat-privateKeyPem-status').textContent = secretText(wechat.secrets.privateKeyPem.configured);
          document.getElementById('wechat-platformCertPem-status').textContent = secretText(wechat.secrets.platformCertPem.configured);
          document.getElementById('wechat-overview').textContent = wechat.configured ? '已配置' : '未完成';
          updateBadge('wechat-status', wechat.configured ? '配置完成' : '配置不完整', wechat.configured);
          updateSourceBadge('wechat-source', wechat.source);
        }

        if (alipay) {
          document.getElementById('alipay-appId').value = alipay.values.appId || '';
          document.getElementById('alipay-gateway').value = alipay.values.gateway || '';
          document.getElementById('alipay-notifyUrl').value = alipay.values.notifyUrl || '';
          document.getElementById('alipay-returnUrl').value = alipay.values.returnUrl || '';
          document.getElementById('alipay-keyType').value = alipay.values.keyType || 'PKCS1';
          document.getElementById('alipay-privateKeyPem').value = '';
          document.getElementById('alipay-publicKeyPem').value = '';
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
        } catch (error) {
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
            mchId: document.getElementById('wechat-mchId').value,
            appId: document.getElementById('wechat-appId').value,
            certSerialNo: document.getElementById('wechat-certSerialNo').value,
            apiBaseUrl: document.getElementById('wechat-apiBaseUrl').value,
            notifyUrl: document.getElementById('wechat-notifyUrl').value,
            apiV3Key: document.getElementById('wechat-apiV3Key').value,
            privateKeyPem: document.getElementById('wechat-privateKeyPem').value,
            platformCertPem: document.getElementById('wechat-platformCertPem').value
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
            gateway: document.getElementById('alipay-gateway').value,
            notifyUrl: document.getElementById('alipay-notifyUrl').value,
            returnUrl: document.getElementById('alipay-returnUrl').value,
            keyType: document.getElementById('alipay-keyType').value,
            privateKeyPem: document.getElementById('alipay-privateKeyPem').value,
            publicKeyPem: document.getElementById('alipay-publicKeyPem').value
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
