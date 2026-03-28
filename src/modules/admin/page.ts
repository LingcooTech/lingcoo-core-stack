export type AdminSectionKey = 'dashboard' | 'payments' | 'apps' | 'licenses' | 'operations' | 'observability';

const adminSectionMeta: Record<
  AdminSectionKey,
  {
    eyebrow: string;
    title: string;
    lead: string;
  }
> = {
  dashboard: {
    eyebrow: 'fd-core-stack / admin console',
    title: '管理后台',
    lead: '中台后台入口。支付、应用接入、授权、运营和可观测能力都从这里分域进入，不再继续堆在一个 payment 页面里。'
  },
  payments: {
    eyebrow: 'fd-core-stack / payments',
    title: '支付配置',
    lead: '只处理支付相关能力。微信支付、支付宝配置和支付侧状态在这里维护，不再承接其他后台模块。'
  },
  apps: {
    eyebrow: 'fd-core-stack / apps',
    title: '应用接入',
    lead: '维护中台接入应用、产品绑定和 App Secret。Chrome 扩展、Next.js、React 应用统一从这里拿接入能力。'
  },
  licenses: {
    eyebrow: 'fd-core-stack / licenses',
    title: '授权管理',
    lead: '查看和处理 entitlement。人工发放、撤销、核对授权链路都放在这里，避免和支付配置混在一起。'
  },
  operations: {
    eyebrow: 'fd-core-stack / operations',
    title: '运营台',
    lead: '订单和安装实例归运营域处理。这里负责补单、查单、安装追踪，不和配置页混排。'
  },
  observability: {
    eyebrow: 'fd-core-stack / observability',
    title: '事件与观测',
    lead: '查看事件流与支付回调，定位登录、安装、支付、授权等关键链路问题。'
  }
};

export function renderAdminPage(activeSection: AdminSectionKey = 'dashboard') {
  const section = adminSectionMeta[activeSection] ?? adminSectionMeta.dashboard;
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>fd-core-stack 管理后台</title>
    <style>
      :root {
        --bg: #f3f4ef;
        --bg-2: #fbfbf8;
        --panel: rgba(255, 255, 255, 0.86);
        --panel-strong: rgba(255, 255, 255, 0.96);
        --panel-soft: rgba(246, 247, 243, 0.92);
        --ink: #122033;
        --muted: #5f6f83;
        --line: rgba(15, 23, 42, 0.08);
        --line-strong: rgba(15, 23, 42, 0.12);
        --accent: #0f766e;
        --accent-2: #ea580c;
        --accent-3: #1d4ed8;
        --danger: #dc2626;
        --success: #16a34a;
        --warning: #c2410c;
        --shadow: 0 28px 80px rgba(15, 23, 42, 0.12);
        --shadow-soft: 0 18px 42px rgba(15, 23, 42, 0.08);
        --radius: 30px;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "SF Pro Display", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at 0% 0%, rgba(15, 118, 110, 0.18), transparent 24%),
          radial-gradient(circle at 100% 0%, rgba(234, 88, 12, 0.14), transparent 22%),
          radial-gradient(circle at 50% 100%, rgba(29, 78, 216, 0.12), transparent 28%),
          linear-gradient(180deg, #fbfcf8 0%, var(--bg) 48%, var(--bg-2) 100%);
        min-height: 100vh;
        position: relative;
      }

      body::before,
      body::after {
        content: "";
        position: fixed;
        inset: auto;
        width: 32vw;
        height: 32vw;
        border-radius: 999px;
        pointer-events: none;
        filter: blur(80px);
        opacity: 0.4;
      }

      body::before {
        top: -12vw;
        left: -8vw;
        background: rgba(15, 118, 110, 0.14);
      }

      body::after {
        right: -10vw;
        bottom: -14vw;
        background: rgba(234, 88, 12, 0.12);
      }

      .shell {
        width: min(1560px, calc(100vw - 40px));
        margin: 0 auto;
        padding: 24px 0 84px;
        display: grid;
        grid-template-columns: 320px minmax(0, 1fr);
        gap: 24px;
        align-items: start;
        position: relative;
        z-index: 1;
      }

      .workspace {
        display: grid;
        gap: 24px;
      }

      .sidebar {
        position: sticky;
        top: 24px;
        padding: 28px;
        max-height: calc(100vh - 40px);
        overflow: auto;
        background:
          radial-gradient(circle at top left, rgba(45, 212, 191, 0.18), transparent 34%),
          radial-gradient(circle at bottom right, rgba(249, 115, 22, 0.12), transparent 28%),
          linear-gradient(180deg, rgba(12, 19, 31, 0.98), rgba(18, 30, 45, 0.96));
        color: #e2e8f0;
        border: 1px solid rgba(148, 163, 184, 0.16);
        border-radius: 34px;
      }

      .sidebar::before {
        content: "";
        position: absolute;
        top: 18px;
        right: 18px;
        width: 88px;
        height: 88px;
        border-radius: 24px;
        background: linear-gradient(135deg, rgba(45, 212, 191, 0.18), rgba(59, 130, 246, 0.04));
        border: 1px solid rgba(148, 163, 184, 0.12);
      }

      .sidebar .muted,
      .sidebar .subtle,
      .sidebar p {
        color: rgba(226, 232, 240, 0.7);
      }

      .brand-lockup {
        display: grid;
        gap: 16px;
        margin-bottom: 24px;
        position: relative;
      }

      .brand-mark {
        width: 54px;
        height: 54px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 18px;
        background: linear-gradient(135deg, rgba(45, 212, 191, 0.92), rgba(29, 78, 216, 0.88));
        color: white;
        font-size: 20px;
        font-weight: 800;
        letter-spacing: -0.04em;
        box-shadow: 0 18px 34px rgba(15, 118, 110, 0.24);
      }

      .sidebar-title {
        margin: 0;
        font-size: 40px;
        line-height: 0.92;
        letter-spacing: -0.04em;
        color: #f8fafc;
      }

      .sidebar-copy {
        margin: 0;
        max-width: 220px;
      }

      .sidebar-label {
        display: block;
        margin-bottom: 10px;
        color: rgba(226, 232, 240, 0.66);
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .sidebar-user {
        font-size: 16px;
        font-weight: 700;
        color: #f8fafc;
      }

      .sidebar-note {
        margin-top: 22px;
        padding-top: 22px;
        border-top: 1px solid rgba(148, 163, 184, 0.18);
      }

      .sidebar-block {
        margin-top: 22px;
        padding: 18px;
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(148, 163, 184, 0.14);
      }

      .workspace-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        padding: 20px 24px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(248, 250, 248, 0.82));
      }

      .workspace-bar p {
        margin: 6px 0 0;
      }

      .workspace-tag {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 7px 12px;
        border-radius: 999px;
        background: rgba(15, 118, 110, 0.08);
        color: var(--accent);
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .workspace-title {
        margin-top: 10px;
        font-size: 24px;
        font-weight: 800;
        letter-spacing: -0.04em;
      }

      .chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        justify-content: flex-end;
      }

      .command-chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.04);
        border: 1px solid rgba(15, 23, 42, 0.08);
        color: var(--ink);
        font-size: 13px;
        font-weight: 700;
      }

      .hero,
      .layout,
      .status-grid,
      .auth-grid,
      .field-grid,
      .admin-nav {
        display: grid;
        gap: 18px;
      }

      .hero {
        grid-template-columns: minmax(0, 1.35fr) 360px;
        margin: 0;
        align-items: stretch;
      }

      .layout {
        grid-template-columns: 360px minmax(0, 1fr);
        align-items: start;
      }

      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        backdrop-filter: blur(18px);
        position: relative;
        overflow: hidden;
      }

      .hero-main {
        padding: 34px 36px;
        background:
          radial-gradient(circle at top right, rgba(45, 212, 191, 0.12), transparent 26%),
          radial-gradient(circle at bottom left, rgba(234, 88, 12, 0.1), transparent 28%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(247, 248, 244, 0.84));
      }

      .hero-side,
      .card {
        padding: 26px;
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        border-radius: 999px;
        background: rgba(15, 118, 110, 0.1);
        color: var(--accent);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      h1 {
        margin: 16px 0 12px;
        font-family: "SF Pro Display", "PingFang SC", "Helvetica Neue", sans-serif;
        font-size: clamp(38px, 4.4vw, 64px);
        line-height: 0.94;
        letter-spacing: -0.04em;
      }

      h2 {
        margin: 0 0 10px;
        font-size: 20px;
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
        max-width: 760px;
        font-size: 16px;
      }

      .hero-actions,
      .hero-ribbon {
        display: grid;
        gap: 14px;
      }

      .hero-actions {
        margin-top: 24px;
        grid-template-columns: repeat(2, minmax(0, max-content));
      }

      .hero-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 48px;
        padding: 0 18px;
        border-radius: 16px;
        background: rgba(15, 23, 42, 0.04);
        border: 1px solid rgba(15, 23, 42, 0.08);
        color: var(--ink);
        text-decoration: none;
        font-weight: 800;
      }

      .hero-link.primary-link {
        background: linear-gradient(135deg, var(--accent), var(--accent-3));
        color: white;
        border-color: transparent;
      }

      .hero-ribbon {
        margin-top: 22px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .ribbon-item {
        padding: 16px;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.7);
        border: 1px solid rgba(15, 23, 42, 0.08);
        box-shadow: var(--shadow-soft);
      }

      .ribbon-item label,
      .spotlight-label {
        display: block;
        margin-bottom: 8px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .ribbon-item strong {
        display: block;
        font-size: 18px;
        letter-spacing: -0.03em;
      }

      .ribbon-item span {
        display: block;
        margin-top: 8px;
        color: var(--muted);
        line-height: 1.55;
      }

      .status-grid {
        grid-template-columns: 1fr 1fr;
        margin-top: 22px;
      }

      .status-card {
        padding: 15px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(148, 163, 184, 0.16);
        box-shadow: none;
      }

      .status-card label {
        display: block;
        color: rgba(226, 232, 240, 0.64);
        font-size: 12px;
        margin-bottom: 6px;
      }

      .status-card strong {
        display: block;
        font-size: 16px;
        color: #f8fafc;
      }

      .stack {
        display: grid;
        gap: 20px;
      }

      .metric-grid {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 16px;
      }

      .metric-card {
        padding: 20px;
        border-radius: 22px;
        border: 1px solid rgba(15, 23, 42, 0.08);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(246, 247, 243, 0.92));
        box-shadow: var(--shadow-soft);
        position: relative;
        overflow: hidden;
      }

      .metric-card::before {
        content: "";
        position: absolute;
        inset: 0 auto auto 0;
        width: 100%;
        height: 4px;
        background: linear-gradient(90deg, var(--accent), var(--accent-2));
      }

      .metric-card label {
        display: block;
        margin-bottom: 10px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
      }

      .metric-card strong {
        display: block;
        font-size: 28px;
        letter-spacing: -0.04em;
      }

      .metric-card span {
        display: block;
        margin-top: 8px;
        color: var(--muted);
        font-size: 13px;
      }

      .quick-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
      }

      .quick-card {
        padding: 20px;
        border-radius: 22px;
        background:
          radial-gradient(circle at top right, rgba(45, 212, 191, 0.16), transparent 28%),
          linear-gradient(180deg, rgba(14, 23, 36, 0.98), rgba(21, 33, 49, 0.96));
        color: #e2e8f0;
        box-shadow: var(--shadow-soft);
      }

      .quick-card h3 {
        margin: 0 0 8px;
        font-size: 16px;
      }

      .quick-card p {
        margin: 0;
        color: rgba(226, 232, 240, 0.82);
      }

      .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        align-items: end;
      }

      .toolbar .field {
        min-width: 170px;
        flex: 1 1 180px;
      }

      .toolbar .field.compact {
        flex: 0 1 150px;
      }

      .toolbar-note {
        margin-top: 6px;
        color: var(--muted);
        font-size: 13px;
      }

      .entity-card {
        padding: 22px;
        border-radius: 24px;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(247, 248, 244, 0.92));
        border: 1px solid var(--line);
        box-shadow: var(--shadow-soft);
        position: relative;
        overflow: hidden;
      }

      .entity-card::before {
        content: "";
        position: absolute;
        inset: 0 auto 0 0;
        width: 4px;
        background: linear-gradient(180deg, var(--accent), var(--accent-2));
      }

      .entity-head {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: start;
      }

      .entity-title {
        font-size: 16px;
        font-weight: 800;
        letter-spacing: -0.02em;
      }

      .meta-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }

      .meta-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 10px;
        border-radius: 999px;
        background: rgba(37, 99, 235, 0.08);
        color: var(--ink);
        border: 1px solid rgba(37, 99, 235, 0.12);
        font-size: 12px;
      }

      .meta-chip.ghost {
        background: rgba(148, 163, 184, 0.08);
        border-color: rgba(148, 163, 184, 0.16);
      }

      .section-divider {
        margin-top: 14px;
        padding-top: 14px;
        border-top: 1px solid var(--line);
      }

      .summary-strip {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
      }

      .summary-tile {
        padding: 16px;
        border-radius: 16px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.8);
      }

      .summary-tile strong {
        display: block;
        font-size: 22px;
        margin-top: 6px;
      }

      .admin-nav {
        grid-template-columns: 1fr;
        margin: 20px 0 0;
        position: static;
      }

      .nav-link {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: flex-start;
        min-height: 68px;
        padding: 14px 16px;
        border-radius: 20px;
        border: 1px solid rgba(148, 163, 184, 0.16);
        background: rgba(255, 255, 255, 0.06);
        color: #cbd5e1;
        text-decoration: none;
        font-weight: 700;
        box-shadow: none;
        backdrop-filter: blur(10px);
      }

      .nav-link.active {
        background: linear-gradient(135deg, rgba(45, 212, 191, 0.18), rgba(59, 130, 246, 0.14));
        border-color: rgba(45, 212, 191, 0.24);
        color: #eff6ff;
      }

      .nav-title {
        font-size: 15px;
        font-weight: 800;
      }

      .nav-note {
        margin-top: 4px;
        color: rgba(226, 232, 240, 0.64);
        font-size: 12px;
        font-weight: 500;
        line-height: 1.45;
      }

      .hero-side {
        display: grid;
        gap: 16px;
        align-content: start;
        background: transparent;
        padding: 0;
      }

      .hero-spotlight {
        padding: 20px;
        border-radius: 24px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(247, 248, 244, 0.86));
        border: 1px solid rgba(15, 23, 42, 0.08);
        box-shadow: var(--shadow-soft);
      }

      .hero-spotlight strong {
        display: block;
        font-size: 18px;
        letter-spacing: -0.03em;
      }

      .hero-spotlight span {
        display: block;
        margin-top: 8px;
        color: var(--muted);
        line-height: 1.6;
      }

      .card-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: start;
        margin-bottom: 20px;
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
        background: rgba(22, 163, 74, 0.1);
        border-color: rgba(22, 163, 74, 0.16);
      }

      .badge.warn {
        color: var(--warning);
        background: rgba(217, 119, 6, 0.1);
        border-color: rgba(217, 119, 6, 0.16);
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
      select,
      textarea {
        width: 100%;
        border: 1px solid rgba(15, 23, 42, 0.1);
        border-radius: 16px;
        padding: 13px 15px;
        font: inherit;
        color: var(--ink);
        background: rgba(255, 255, 255, 0.98);
        outline: none;
        transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
      }

      input:focus,
      select:focus,
      textarea:focus {
        border-color: rgba(37, 99, 235, 0.56);
        box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
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
        padding: 14px 16px;
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 248, 244, 0.92));
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
        border-radius: 16px;
        padding: 12px 18px;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
        transition: transform 0.16s ease, opacity 0.16s ease, box-shadow 0.16s ease;
        box-shadow: var(--shadow-soft);
      }

      button:hover {
        transform: translateY(-1px);
      }

      .primary {
        background: linear-gradient(135deg, var(--accent), var(--accent-3));
        color: white;
      }

      .secondary {
        background: rgba(15, 23, 42, 0.05);
        color: var(--ink);
      }

      .danger {
        background: rgba(220, 38, 38, 0.08);
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
        padding: 16px 18px;
        border-radius: 18px;
        background: rgba(15, 118, 110, 0.05);
        border: 1px solid rgba(15, 118, 110, 0.12);
      }

      .warning {
        background: rgba(220, 38, 38, 0.05);
        border-color: rgba(220, 38, 38, 0.12);
        color: var(--danger);
      }

      .checkbox-list {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }

      .inline-code {
        font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
        font-size: 12px;
      }

      details {
        margin-top: 10px;
      }

      pre.json-block {
        margin: 10px 0 0;
        padding: 12px;
        border-radius: 14px;
        background: rgba(15, 23, 42, 0.05);
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
        font-size: 12px;
        line-height: 1.5;
      }

      .hidden {
        display: none !important;
      }

      .content-stack {
        display: grid;
        gap: 20px;
      }

      @media (max-width: 980px) {
        .shell,
        .workspace-bar,
        .hero,
        .layout,
        .status-grid,
        .metric-grid,
        .quick-grid,
        .hero-ribbon,
        .summary-strip,
        .auth-grid,
        .field-grid,
        .checkbox-list {
          grid-template-columns: 1fr;
        }

        .sidebar {
          position: static;
          max-height: none;
        }

        .chip-row,
        .hero-actions {
          justify-content: flex-start;
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <aside class="sidebar panel">
        <div class="brand-lockup">
          <div class="brand-mark">FD</div>
          <div>
            <span class="eyebrow">fd-core-stack / control center</span>
            <h1 class="sidebar-title">Core Stack</h1>
            <p class="sidebar-copy">自托管核心中台，统一承接支付、授权、应用接入和运营链路。</p>
          </div>
        </div>

        <nav class="admin-nav">
          <a class="nav-link" data-nav-section="dashboard" href="/admin"><span class="nav-title">总览</span><span class="nav-note">系统状态与关键入口</span></a>
          <a class="nav-link" data-nav-section="payments" href="/admin/payments"><span class="nav-title">支付</span><span class="nav-note">微信支付、支付宝配置</span></a>
          <a class="nav-link" data-nav-section="apps" href="/admin/apps"><span class="nav-title">应用</span><span class="nav-note">接入应用与 App Secret</span></a>
          <a class="nav-link" data-nav-section="licenses" href="/admin/licenses"><span class="nav-title">授权</span><span class="nav-note">人工授权与 entitlement</span></a>
          <a class="nav-link" data-nav-section="operations" href="/admin/operations"><span class="nav-title">运营</span><span class="nav-note">订单、安装与补单排障</span></a>
          <a class="nav-link" data-nav-section="observability" href="/admin/observability"><span class="nav-title">观测</span><span class="nav-note">事件流与支付回调</span></a>
        </nav>

        <div class="sidebar-block">
          <label class="sidebar-label">当前用户</label>
          <div id="current-user" class="sidebar-user">未登录</div>
        </div>

        <div class="status-grid">
          <div class="status-card">
            <label>微信支付</label>
            <strong id="wechat-overview">未检查</strong>
          </div>
          <div class="status-card">
            <label>支付宝</label>
            <strong id="alipay-overview">未检查</strong>
          </div>
          <div class="status-card">
            <label>应用接入</label>
            <strong id="app-overview">未检查</strong>
          </div>
          <div class="status-card">
            <label>后台入口</label>
            <strong>/admin</strong>
          </div>
        </div>

        <div class="sidebar-note">
          <label class="sidebar-label">使用说明</label>
          <p>管理入口按业务域拆分，不再全部挤在支付页。</p>
          <p>密钥保存后不回显，输入框变空属于正常表现。</p>
          <p>旧地址 <a class="ghost-link" href="/admin/payments">/admin/payments</a> 继续兼容。</p>
          <p><a class="ghost-link" href="/docs" target="_blank" rel="noreferrer">查看 API 文档</a></p>
        </div>
      </aside>

      <main class="workspace">
        <section class="workspace-bar panel">
          <div>
            <span class="workspace-tag">Self-hosted</span>
            <div class="workspace-title">独立核心中台后台</div>
            <p class="muted">单机 Docker 部署、独立支付接入、统一授权与应用接入，不让业务应用重复接后端能力。</p>
          </div>
          <div class="chip-row">
            <span class="command-chip">Docker Deploy</span>
            <span class="command-chip">GitHub Actions</span>
            <span class="command-chip">ACR Image Pull</span>
            <span class="command-chip">Admin + API</span>
          </div>
        </section>

        <section class="hero">
          <div class="hero-main panel">
            <span class="eyebrow">${section.eyebrow}</span>
            <h1>${section.title}</h1>
            <p class="lead">
              ${section.lead}
            </p>

            <div class="hero-actions">
              <a class="hero-link primary-link" href="/docs" target="_blank" rel="noreferrer">查看 API 文档</a>
              <a class="hero-link" href="/admin/payments">打开支付配置</a>
            </div>

            <div class="hero-ribbon">
              <div class="ribbon-item">
                <label>部署形态</label>
                <strong>单机 Docker</strong>
                <span>适配当前 2C4G 资源，控制成本，同时保留标准化发布路径。</span>
              </div>
              <div class="ribbon-item">
                <label>集成目标</label>
                <strong>统一后端能力</strong>
                <span>Chrome 扩展、Next.js、React 应用都只调中台 API，不重复接支付和授权 SDK。</span>
              </div>
              <div class="ribbon-item">
                <label>当前方向</label>
                <strong>生产级 MVP</strong>
                <span>从一开始把工程流程、安全、可观测、运营后台一起建好，不走 demo 路线。</span>
              </div>
            </div>
          </div>

          <aside class="hero-side">
            <div class="hero-spotlight">
              <span class="spotlight-label">Payments</span>
              <strong>支付配置</strong>
              <span>微信支付、支付宝配置通过后台表单直接维护，不再要求长期写死在服务器环境变量。</span>
            </div>
            <div class="hero-spotlight">
              <span class="spotlight-label">Apps</span>
              <strong>应用接入</strong>
              <span>Chrome 扩展、Next.js、React 应用统一走 app secret / app token，不再重复接 SDK。</span>
            </div>
            <div class="hero-spotlight">
              <span class="spotlight-label">Operations</span>
              <strong>运营排障</strong>
              <span>订单详情、支付尝试、授权结果、事件回溯都在后台里直接串起来。</span>
            </div>
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

          <div id="settings-panel" class="content-stack hidden">
            <div class="panel card" data-admin-section="dashboard">
              <div class="card-head">
                <div>
                  <h2>后台分区</h2>
                  <p class="muted">现在按业务域拆开入口，后续模块继续按域扩展，不再把后台能力全部塞进支付页面。</p>
                </div>
              </div>
              <div id="dashboard-metrics" class="metric-grid" style="margin-bottom:18px;"></div>
              <div id="dashboard-highlights" class="quick-grid" style="margin-bottom:18px;"></div>
              <div class="stack">
                <div class="locked">支付配置: <a class="ghost-link" href="/admin/payments">/admin/payments</a></div>
                <div class="locked">应用接入: <a class="ghost-link" href="/admin/apps">/admin/apps</a></div>
                <div class="locked">授权管理: <a class="ghost-link" href="/admin/licenses">/admin/licenses</a></div>
                <div class="locked">订单与安装: <a class="ghost-link" href="/admin/operations">/admin/operations</a></div>
                <div class="locked">事件与支付回调: <a class="ghost-link" href="/admin/observability">/admin/observability</a></div>
              </div>
            </div>

            <div class="panel card" data-admin-section="payments">
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

            <div class="panel card" data-admin-section="payments">
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

            <div class="panel card" data-admin-section="apps">
              <div class="card-head">
                <div>
                  <h2>应用管理</h2>
                  <p class="muted">先登记应用和绑定产品，再签发 secret。这里直接维护中台接入清单。</p>
                </div>
              </div>

              <div id="apps-admin-flash" class="flash"></div>

              <form id="app-editor-form">
                <div class="field-grid">
                  <div class="field">
                    <label for="app-editor-selected">已接入应用</label>
                    <select id="app-editor-selected" name="selectedAppCode"></select>
                    <div class="subtle">选择已有应用可编辑，选择“新建应用”可创建新接入项。</div>
                  </div>
                  <div class="field">
                    <label for="app-editor-code">应用标识</label>
                    <input id="app-editor-code" name="code" type="text" placeholder="ai_web_translator_ext" required />
                  </div>
                  <div class="field">
                    <label for="app-editor-name">应用名称</label>
                    <input id="app-editor-name" name="name" type="text" placeholder="AI Web Translator" required />
                  </div>
                  <div class="field">
                    <label for="app-editor-type">应用类型</label>
                    <select id="app-editor-type" name="type">
                      <option value="chrome_extension">Chrome 扩展</option>
                      <option value="web_app">Web 应用</option>
                      <option value="service">服务</option>
                    </select>
                  </div>
                  <div class="field">
                    <label for="app-editor-status">状态</label>
                    <select id="app-editor-status" name="status">
                      <option value="active">active</option>
                      <option value="inactive">inactive</option>
                      <option value="cancelled">cancelled</option>
                      <option value="expired">expired</option>
                    </select>
                  </div>
                  <div class="field full">
                    <label for="app-editor-description">描述</label>
                    <input id="app-editor-description" name="description" type="text" placeholder="简要说明这个应用的用途" />
                  </div>
                  <div class="field full">
                    <label>绑定产品</label>
                    <div id="app-product-options" class="checkbox-list"></div>
                  </div>
                </div>

                <div class="actions">
                  <button class="secondary" type="button" id="app-editor-new">新建应用</button>
                  <button class="primary" type="submit">保存应用</button>
                </div>
              </form>
            </div>

            <div class="panel card" data-admin-section="apps">
              <div class="card-head">
                <div>
                  <h2>应用接入 Secret</h2>
                  <p class="muted">给 Chrome 扩展、Next.js、React 应用签发 app secret。应用先用 secret 换 app token，再调用私有 app 路由。</p>
                </div>
                <div class="badge-row">
                  <span id="app-count-badge" class="badge muted">应用未加载</span>
                </div>
              </div>

              <div id="app-admin-flash" class="flash"></div>

              <form id="app-secret-form">
                <div class="field-grid">
                  <div class="field">
                    <label for="app-secret-appCode">应用</label>
                    <select id="app-secret-appCode" name="appCode"></select>
                  </div>
                  <div class="field full">
                    <label for="app-secret-expiresAt">过期时间</label>
                    <input id="app-secret-expiresAt" name="expiresAt" type="datetime-local" />
                    <div class="subtle">留空表示不过期。</div>
                  </div>
                </div>

                <div class="actions">
                  <button class="primary" type="submit">一键生成 App Secret</button>
                </div>
              </form>

              <div id="app-secret-result" class="locked hidden" style="margin-top:18px;"></div>
              <div id="app-list" class="stack" style="margin-top:18px;"></div>
            </div>

            <div class="panel card" data-admin-section="licenses">
              <div class="card-head">
                <div>
                  <h2>人工授权</h2>
                  <p class="muted">运营或客服需要手动开通时，直接按用户邮箱和套餐发放授权。</p>
                </div>
              </div>
              <div id="grant-admin-flash" class="flash"></div>
              <form id="grant-form">
                <div class="field-grid">
                  <div class="field">
                    <label for="grant-userEmail">用户邮箱</label>
                    <input id="grant-userEmail" name="userEmail" type="email" placeholder="user@example.com" required />
                  </div>
                  <div class="field">
                    <label for="grant-planCode">套餐</label>
                    <select id="grant-planCode" name="planCode"></select>
                  </div>
                  <div class="field full">
                    <label for="grant-reason">备注</label>
                    <input id="grant-reason" name="reason" type="text" placeholder="例如：补偿、人工开通、迁移老系统用户" />
                  </div>
                </div>

                <div class="actions">
                  <button class="primary" type="submit">发放授权</button>
                </div>
              </form>
            </div>

            <div class="panel card" data-admin-section="operations">
              <div class="card-head">
                <div>
                  <h2>订单运营</h2>
                  <p class="muted">查看最近订单，并手动触发查单 / 补单。</p>
                </div>
              </div>
              <div id="orders-admin-flash" class="flash"></div>
              <div class="toolbar" style="margin-bottom:18px;">
                <div class="field">
                  <label for="order-query">搜索订单 / 用户 / 应用</label>
                  <input id="order-query" type="text" placeholder="订单号、邮箱、appCode、planCode" />
                </div>
                <div class="field compact">
                  <label for="order-status-filter">状态</label>
                  <select id="order-status-filter">
                    <option value="">全部状态</option>
                    <option value="pending">pending</option>
                    <option value="paid">paid</option>
                    <option value="failed">failed</option>
                    <option value="cancelled">cancelled</option>
                    <option value="refunded">refunded</option>
                  </select>
                </div>
                <div class="field compact">
                  <label for="order-provider-filter">通道</label>
                  <select id="order-provider-filter">
                    <option value="">全部通道</option>
                    <option value="wechat_pay">wechat_pay</option>
                    <option value="alipay">alipay</option>
                  </select>
                </div>
                <div class="field compact">
                  <label for="order-app-filter">应用</label>
                  <select id="order-app-filter">
                    <option value="">全部应用</option>
                  </select>
                </div>
              </div>
              <div id="orders-summary" class="toolbar-note"></div>
              <div id="order-detail" class="stack" style="margin-bottom:18px;"></div>
              <div id="orders-list" class="stack"></div>
            </div>

            <div class="panel card" data-admin-section="operations">
              <div class="card-head">
                <div>
                  <h2>安装实例</h2>
                  <p class="muted">查看 app 安装实例、绑定用户、最近活跃时间。</p>
                </div>
              </div>
              <div id="installs-list" class="stack"></div>
            </div>

            <div class="panel card" data-admin-section="licenses">
              <div class="card-head">
                <div>
                  <h2>授权明细</h2>
                  <p class="muted">查看 entitlement 明细、来源订单和当前状态。支持按来源整组撤销。</p>
                </div>
              </div>
              <div id="entitlements-admin-flash" class="flash"></div>
              <div id="entitlements-list" class="stack"></div>
            </div>

            <div class="panel card" data-admin-section="observability">
              <div class="card-head">
                <div>
                  <h2>业务事件</h2>
                  <p class="muted">中台自身记录的事件流，便于排查登录、安装、支付、授权链路。</p>
                </div>
              </div>
              <div id="events-list" class="stack"></div>
            </div>

            <div class="panel card" data-admin-section="observability">
              <div class="card-head">
                <div>
                  <h2>支付回调</h2>
                  <p class="muted">查看微信支付和支付宝通知入库、处理状态与原始负载。</p>
                </div>
              </div>
              <div id="webhooks-list" class="stack"></div>
            </div>
          </div>
        </section>
      </main>
    </div>

    <script>
      const state = {
        token: localStorage.getItem('fd_core_admin_token') || '',
        apps: [],
        products: [],
        plans: [],
        orders: [],
        installs: [],
        entitlements: [],
        events: [],
        webhooks: [],
        activeSection: '${activeSection}',
        selectedOrderNo: ''
      };

      function setFlash(id, message, kind) {
        const el = document.getElementById(id);
        el.textContent = message || '';
        el.className = 'flash' + (kind ? ' ' + kind : '');
      }

      function escapeHtml(value) {
        return String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function formatText(value, fallback = '-') {
        return escapeHtml(value || fallback);
      }

      function formatJson(value) {
        try {
          return escapeHtml(JSON.stringify(value ?? {}, null, 2));
        } catch {
          return escapeHtml(String(value ?? '{}'));
        }
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

      function applyActiveSection(section) {
        document.querySelectorAll('[data-admin-section]').forEach((el) => {
          el.classList.toggle('hidden', el.getAttribute('data-admin-section') !== section);
        });

        document.querySelectorAll('[data-nav-section]').forEach((el) => {
          el.classList.toggle('active', el.getAttribute('data-nav-section') === section);
        });
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

      function formatTime(value) {
        if (!value) {
          return '永不过期';
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
          return value;
        }

        return date.toLocaleString('zh-CN', { hour12: false });
      }

      function setAppOverviewLabel(apps) {
        document.getElementById('app-overview').textContent = apps.length > 0 ? ('已接入 ' + apps.length + ' 个应用') : '暂无应用';
        const badge = document.getElementById('app-count-badge');
        badge.textContent = apps.length > 0 ? ('应用数: ' + apps.length) : '暂无应用';
        badge.className = 'badge ' + (apps.length > 0 ? 'ok' : 'muted');
      }

      function renderDashboardMetrics() {
        const root = document.getElementById('dashboard-metrics');
        const activeSecrets = state.apps.reduce((total, app) => total + (Array.isArray(app.secrets) ? app.secrets.filter((item) => item.status === 'active').length : 0), 0);
        const paidOrders = state.orders.filter((item) => item.status === 'paid').length;
        const pendingOrders = state.orders.filter((item) => item.status === 'pending').length;
        const activeInstalls = state.installs.filter((item) => item.status === 'active').length;
        const activeEntitlements = state.entitlements.filter((item) => item.status === 'active').length;

        root.innerHTML = [
          { label: '接入应用', value: state.apps.length, note: '已登记 app 数量' },
          { label: '活跃 Secret', value: activeSecrets, note: '当前可换 token 的 Secret' },
          { label: '已支付订单', value: paidOrders, note: '最近加载订单里的 paid' },
          { label: '待处理订单', value: pendingOrders, note: '需要继续查单的 pending' },
          { label: '有效授权', value: activeEntitlements, note: 'active entitlement 数量' }
        ].map((item) => (
          '<div class="metric-card">' +
            '<label>' + escapeHtml(item.label) + '</label>' +
            '<strong>' + escapeHtml(item.value) + '</strong>' +
            '<span>' + escapeHtml(item.note) + '</span>' +
          '</div>'
        )).join('');
      }

      function renderDashboardHighlights() {
        const root = document.getElementById('dashboard-highlights');
        const latestOrder = state.orders[0];
        const latestInstall = state.installs[0];
        const latestEvent = state.events[0];
        const configuredProviders = [
          document.getElementById('wechat-overview').textContent,
          document.getElementById('alipay-overview').textContent
        ].filter((item) => item === '已配置').length;

        root.innerHTML = [
          {
            title: '支付状态',
            text: '当前已配置 ' + configuredProviders + ' / 2 个支付通道，可直接从后台继续维护。'
          },
          {
            title: '最近订单',
            text: latestOrder
              ? latestOrder.orderNo + ' · ' + latestOrder.status + ' · ' + (latestOrder.amount / 100).toFixed(2) + ' ' + latestOrder.currency
              : '最近没有订单记录'
          },
          {
            title: '最近安装',
            text: latestInstall
              ? latestInstall.extensionInstallId + ' · ' + (latestInstall.app?.code || '-') + ' · ' + latestInstall.status
              : '最近没有安装记录'
          },
          {
            title: '最近事件',
            text: latestEvent
              ? latestEvent.eventName + ' · ' + formatTime(latestEvent.eventTime)
              : '最近没有业务事件'
          }
        ].map((item) => (
          '<div class="quick-card">' +
            '<h3>' + escapeHtml(item.title) + '</h3>' +
            '<p>' + escapeHtml(item.text) + '</p>' +
          '</div>'
        )).join('');
      }

      function renderOrderAppFilterOptions(items) {
        const select = document.getElementById('order-app-filter');
        const current = select.value;
        const appCodes = [...new Set(items.map((item) => item.app?.code).filter(Boolean))].sort();
        select.innerHTML =
          '<option value="">全部应用</option>' +
          appCodes.map((code) => '<option value="' + escapeHtml(code) + '">' + escapeHtml(code) + '</option>').join('');
        if (appCodes.includes(current)) {
          select.value = current;
        }
      }

      function getFilteredOrders(items) {
        const query = document.getElementById('order-query').value.trim().toLowerCase();
        const status = document.getElementById('order-status-filter').value;
        const provider = document.getElementById('order-provider-filter').value;
        const appCode = document.getElementById('order-app-filter').value;

        return items.filter((item) => {
          if (status && item.status !== status) {
            return false;
          }
          if (provider && item.provider !== provider) {
            return false;
          }
          if (appCode && item.app?.code !== appCode) {
            return false;
          }

          if (!query) {
            return true;
          }

          const haystack = [
            item.orderNo,
            item.user?.email,
            item.userId,
            item.app?.code,
            item.product?.code,
            item.plan?.code,
            item.checkoutSession?.sessionCode
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          return haystack.includes(query);
        });
      }

      function renderAppSecretOptions(apps) {
        const select = document.getElementById('app-secret-appCode');
        const current = select.value;

        if (!apps.length) {
          select.innerHTML = '<option value="">请先创建应用</option>';
          select.value = '';
          return;
        }

        select.innerHTML = apps
          .map((item) => '<option value="' + escapeHtml(item.code) + '">' + escapeHtml(item.name) + ' (' + escapeHtml(item.code) + ')</option>')
          .join('');

        if (apps.some((item) => item.code === current)) {
          select.value = current;
        }
      }

      function renderAppEditorOptions(apps) {
        const select = document.getElementById('app-editor-selected');
        const current = select.value || '__new__';
        select.innerHTML =
          '<option value="__new__">新建应用</option>' +
          apps
            .map((item) => '<option value="' + escapeHtml(item.code) + '">' + escapeHtml(item.name) + ' (' + escapeHtml(item.code) + ')</option>')
            .join('');

        if (apps.some((item) => item.code === current)) {
          select.value = current;
        } else {
          select.value = '__new__';
        }
      }

      function renderPlanOptions(plans) {
        const select = document.getElementById('grant-planCode');
        const activePlans = plans.filter((item) => item.status === 'active');
        select.innerHTML = activePlans.length
          ? activePlans
              .map((item) => (
                '<option value="' + escapeHtml(item.code) + '">' +
                  escapeHtml(item.name) + ' (' + escapeHtml(item.code) + ' / ' + escapeHtml(item.interval) + ' / ' + (item.priceAmount / 100).toFixed(2) + ' ' + escapeHtml(item.currency) + ')' +
                '</option>'
              ))
              .join('')
          : '<option value="">暂无可用套餐</option>';
      }

      function renderProductOptions(products, selectedCodes) {
        const root = document.getElementById('app-product-options');
        if (!products.length) {
          root.innerHTML = '<div class="locked">当前没有产品数据，无法绑定应用。</div>';
          return;
        }

        const selected = new Set(selectedCodes || []);
        root.innerHTML = products
          .map((item) => (
            '<label class="toggle" for="product-' + escapeHtml(item.code) + '">' +
              '<input id="product-' + escapeHtml(item.code) + '" name="productCodes" type="checkbox" value="' + escapeHtml(item.code) + '"' + (selected.has(item.code) ? ' checked' : '') + ' />' +
              '<span>' + escapeHtml(item.name) + ' (' + escapeHtml(item.code) + ')</span>' +
            '</label>'
          ))
          .join('');
      }

      function fillAppEditor(app) {
        if (!app) {
          document.getElementById('app-editor-code').value = '';
          document.getElementById('app-editor-name').value = '';
          document.getElementById('app-editor-description').value = '';
          document.getElementById('app-editor-type').value = 'chrome_extension';
          document.getElementById('app-editor-status').value = 'active';
          renderProductOptions(state.products, []);
          return;
        }

        document.getElementById('app-editor-code').value = app.code || '';
        document.getElementById('app-editor-name').value = app.name || '';
        document.getElementById('app-editor-description').value = app.description || '';
        document.getElementById('app-editor-type').value = app.type || 'chrome_extension';
        document.getElementById('app-editor-status').value = app.status || 'active';
        renderProductOptions(state.products, Array.isArray(app.products) ? app.products.map((item) => item.code) : []);
      }

      function syncSelectedAppEditor() {
        const selectedCode = document.getElementById('app-editor-selected').value;
        if (!selectedCode || selectedCode === '__new__') {
          fillAppEditor(null);
          return;
        }

        fillAppEditor(state.apps.find((item) => item.code === selectedCode) || null);
      }

      function getCheckedProductCodes() {
        return Array.from(document.querySelectorAll('input[name="productCodes"]:checked')).map((item) => item.value);
      }

      function renderManagedApps(apps) {
        state.apps = apps;
        setAppOverviewLabel(apps);
        renderDashboardMetrics();
        renderDashboardHighlights();
        renderAppSecretOptions(apps);
        renderAppEditorOptions(apps);
        syncSelectedAppEditor();

        const root = document.getElementById('app-list');
        if (!apps.length) {
          root.innerHTML = '<div class="locked">当前还没有已登记的 app。</div>';
          return;
        }

        root.innerHTML = apps
          .map((app) => {
            const secrets = Array.isArray(app.secrets) ? app.secrets : [];
            const products = Array.isArray(app.products) ? app.products : [];
            return (
              '<div class="entity-card">' +
                '<div class="entity-head">' +
                  '<div>' +
                    '<div class="entity-title">' + formatText(app.name) + ' (' + formatText(app.code) + ')</div>' +
                    '<div class="meta-row">' +
                      '<span class="meta-chip">类型 · ' + formatText(app.type) + '</span>' +
                      '<span class="meta-chip ghost">状态 · ' + formatText(app.status) + '</span>' +
                      '<span class="meta-chip ghost">产品 · ' + (products.length ? products.map((item) => formatText(item.code)).join(', ') : '未绑定') + '</span>' +
                    '</div>' +
                  '</div>' +
                  '<div class="badge-row">' +
                    '<span class="badge ' + (secrets.length ? 'ok' : 'warn') + '">Secrets: ' + secrets.length + '</span>' +
                  '</div>' +
                '</div>' +
                '<div class="section-divider">' +
                  (secrets.length
                    ? secrets.map((secret) => (
                        '<div class="subtle" style="padding:10px 0;">' +
                          'Name: ' + formatText(secret.name) +
                          ' · Hint: ' + formatText(secret.hint) +
                          ' · 状态: ' + formatText(secret.status) +
                          ' · 最近使用: ' + (secret.lastUsedAt ? formatTime(secret.lastUsedAt) : '未使用') +
                          ' · 过期: ' + formatTime(secret.expiresAt) +
                          (secret.status === 'active'
                            ? ' <button class="danger" type="button" data-app-secret-revoke="' + escapeHtml(app.code) + '" data-secret-id="' + escapeHtml(secret.id) + '">停用 Secret</button>'
                            : '') +
                        '</div>'
                      )).join('')
                    : '<div class="subtle">还没有签发 secret。</div>') +
                '</div>' +
              '</div>'
            );
          })
          .join('');
      }

      function renderOrders(items) {
        const root = document.getElementById('orders-list');
        const filtered = getFilteredOrders(items);
        const summary = document.getElementById('orders-summary');
        summary.textContent = '当前显示 ' + filtered.length + ' / ' + items.length + ' 条订单';

        if (!filtered.length) {
          root.innerHTML = '<div class="locked">当前还没有订单。</div>';
          return;
        }

        root.innerHTML = filtered.map((item) => (
          '<div class="entity-card">' +
            '<div class="entity-head">' +
              '<div>' +
                '<div class="entity-title">' + formatText(item.orderNo) + '</div>' +
                '<div class="meta-row">' +
                  '<span class="meta-chip">状态 · ' + formatText(item.status) + '</span>' +
                  '<span class="meta-chip">通道 · ' + formatText(item.provider) + '</span>' +
                  '<span class="meta-chip ghost">金额 · ' + (item.amount / 100).toFixed(2) + ' ' + formatText(item.currency) + '</span>' +
                  '<span class="meta-chip ghost">应用 · ' + formatText(item.app?.code) + '</span>' +
                  '<span class="meta-chip ghost">套餐 · ' + formatText(item.plan?.code) + '</span>' +
                '</div>' +
                '<div class="subtle" style="margin-top:10px;">用户: ' + formatText(item.user?.email || item.userId) + ' · 产品: ' + formatText(item.product?.code) + '</div>' +
                '<div class="subtle">Session: ' + formatText(item.checkoutSession?.sessionCode) + ' · 支付时间: ' + formatTime(item.paidAt) + '</div>' +
              '</div>' +
              '<div class="actions">' +
                '<button class="secondary" type="button" data-order-detail="' + escapeHtml(item.orderNo) + '">查看详情</button>' +
                '<button class="secondary" type="button" data-order-reconcile="' + escapeHtml(item.orderNo) + '">同步订单</button>' +
              '</div>' +
            '</div>' +
          '</div>'
        )).join('');
      }

      function renderOrderDetail(data) {
        const root = document.getElementById('order-detail');
        if (!data || !data.item) {
          root.innerHTML = '<div class="locked">点击订单“查看详情”，这里会显示 session、支付尝试、授权和事件。</div>';
          return;
        }

        const item = data.item;
        const session = item.checkoutSession;
        const attempts = Array.isArray(data.paymentAttempts) ? data.paymentAttempts : [];
        const entitlements = Array.isArray(data.entitlements) ? data.entitlements : [];
        const events = Array.isArray(data.events) ? data.events : [];

        root.innerHTML =
          '<div class="entity-card">' +
            '<div class="entity-head">' +
              '<div>' +
                '<div class="entity-title">订单详情 · ' + formatText(item.orderNo) + '</div>' +
                '<div class="meta-row">' +
                  '<span class="meta-chip">状态 · ' + formatText(item.status) + '</span>' +
                  '<span class="meta-chip">通道 · ' + formatText(item.provider) + '</span>' +
                  '<span class="meta-chip ghost">金额 · ' + (item.amount / 100).toFixed(2) + ' ' + formatText(item.currency) + '</span>' +
                  '<span class="meta-chip ghost">应用 · ' + formatText(item.app?.code) + '</span>' +
                  '<span class="meta-chip ghost">套餐 · ' + formatText(item.plan?.code) + '</span>' +
                '</div>' +
                '<div class="subtle" style="margin-top:10px;">用户: ' + formatText(item.user?.email || item.userId) + ' · providerOrderId: ' + formatText(item.providerOrderId) + '</div>' +
                '<div class="subtle">支付时间: ' + formatTime(item.paidAt) + '</div>' +
              '</div>' +
              '<div class="actions">' +
                '<button class="secondary" type="button" data-order-reconcile="' + escapeHtml(item.orderNo) + '">同步订单</button>' +
              '</div>' +
            '</div>' +
            '<details open>' +
              '<summary class="inline-code">checkout session</summary>' +
              (session
                ? '<div class="subtle" style="margin-top:10px;">sessionCode: ' + formatText(session.sessionCode) + ' · status: ' + formatText(session.status) + ' · actionType: ' + formatText(session.actionType) + '</div>' +
                  '<div class="subtle">expiresAt: ' + formatTime(session.expiresAt) + ' · completedAt: ' + formatTime(session.completedAt) + '</div>' +
                  '<pre class="json-block">' + formatJson(session.actionPayload) + '</pre>'
                : '<div class="subtle" style="margin-top:10px;">没有 checkout session</div>') +
            '</details>' +
            '<details open>' +
              '<summary class="inline-code">payment attempts (' + attempts.length + ')</summary>' +
              (attempts.length
                ? attempts.map((attempt) => (
                    '<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(216,205,187,0.8);">' +
                      '<div class="subtle">attemptNo: ' + formatText(attempt.attemptNo) + ' · status: ' + formatText(attempt.status) + ' · actionType: ' + formatText(attempt.actionType) + '</div>' +
                      '<div class="subtle">providerReference: ' + formatText(attempt.providerReference) + ' · createdAt: ' + formatTime(attempt.createdAt) + '</div>' +
                      '<details>' +
                        '<summary class="inline-code">request payload</summary>' +
                        '<pre class="json-block">' + formatJson(attempt.requestPayload) + '</pre>' +
                      '</details>' +
                      '<details>' +
                        '<summary class="inline-code">response payload</summary>' +
                        '<pre class="json-block">' + formatJson(attempt.responsePayload) + '</pre>' +
                      '</details>' +
                    '</div>'
                  )).join('')
                : '<div class="subtle" style="margin-top:10px;">没有 payment attempt</div>') +
            '</details>' +
            '<details open>' +
              '<summary class="inline-code">entitlements (' + entitlements.length + ')</summary>' +
              (entitlements.length
                ? entitlements.map((entry) => (
                    '<div class="subtle" style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(216,205,187,0.8);">' +
                      'feature: ' + formatText(entry.feature?.code) +
                      ' · status: ' + formatText(entry.status) +
                      ' · startsAt: ' + formatTime(entry.startsAt) +
                      ' · expiresAt: ' + formatTime(entry.expiresAt) +
                    '</div>'
                  )).join('')
                : '<div class="subtle" style="margin-top:10px;">这笔订单还没有发放 entitlement</div>') +
            '</details>' +
            '<details open>' +
              '<summary class="inline-code">related events (' + events.length + ')</summary>' +
              (events.length
                ? events.map((entry) => (
                    '<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(216,205,187,0.8);">' +
                      '<div class="subtle">' + formatText(entry.eventName) + ' · ' + formatTime(entry.eventTime) + '</div>' +
                      '<pre class="json-block">' + formatJson(entry.properties) + '</pre>' +
                    '</div>'
                  )).join('')
                : '<div class="subtle" style="margin-top:10px;">当前没有关联业务事件</div>') +
            '</details>' +
            '<details>' +
              '<summary class="inline-code">order meta</summary>' +
              '<pre class="json-block">' + formatJson(item.meta) + '</pre>' +
            '</details>' +
          '</div>';
      }

      function renderInstalls(items) {
        const root = document.getElementById('installs-list');
        if (!items.length) {
          root.innerHTML = '<div class="locked">当前还没有安装实例。</div>';
          return;
        }

        root.innerHTML = items.map((item) => (
          '<div class="entity-card">' +
            '<div class="entity-title">' + formatText(item.extensionInstallId) + '</div>' +
            '<div class="meta-row">' +
              '<span class="meta-chip">应用 · ' + formatText(item.app?.code) + '</span>' +
              '<span class="meta-chip ghost">产品 · ' + formatText(item.product?.code) + '</span>' +
              '<span class="meta-chip ghost">状态 · ' + formatText(item.status) + '</span>' +
            '</div>' +
            '<div class="subtle" style="margin-top:10px;">用户: ' + formatText(item.user?.email || '未绑定') + ' · 版本: ' + formatText(item.appVersion) + '</div>' +
            '<div class="subtle">Profile: ' + formatText(item.chromeProfileHint) + ' · 最近活跃: ' + formatTime(item.lastSeenAt) + '</div>' +
          '</div>'
        )).join('');
      }

      function renderEntitlements(items) {
        const root = document.getElementById('entitlements-list');
        if (!items.length) {
          root.innerHTML = '<div class="locked">当前还没有授权明细。</div>';
          return;
        }

        root.innerHTML = items.map((item) => (
          '<div class="entity-card">' +
            '<div class="entity-head">' +
              '<div>' +
                '<div class="entity-title">' + formatText(item.user?.email || item.userId) + '</div>' +
                '<div class="meta-row">' +
                  '<span class="meta-chip">产品 · ' + formatText(item.product?.code) + '</span>' +
                  '<span class="meta-chip ghost">功能 · ' + formatText(item.feature?.code) + '</span>' +
                  '<span class="meta-chip ghost">状态 · ' + formatText(item.status) + '</span>' +
                '</div>' +
                '<div class="subtle" style="margin-top:10px;">来源: ' + formatText(item.sourceType) + ' · 订单: ' + formatText(item.sourceOrder?.orderNo) + '</div>' +
                '<div class="subtle">开始: ' + formatTime(item.startsAt) + ' · 到期: ' + formatTime(item.expiresAt) + '</div>' +
              '</div>' +
              (item.status === 'active'
                ? '<div class="actions"><button class="danger" type="button" data-entitlement-revoke="' + escapeHtml(item.id) + '">撤销授权</button></div>'
                : '') +
            '</div>' +
          '</div>'
        )).join('');
      }

      function renderEvents(items) {
        const root = document.getElementById('events-list');
        if (!items.length) {
          root.innerHTML = '<div class="locked">当前还没有业务事件。</div>';
          return;
        }

        root.innerHTML = items.map((item) => (
          '<div class="entity-card">' +
            '<div class="entity-title">' + formatText(item.eventName) + '</div>' +
            '<div class="meta-row">' +
              '<span class="meta-chip">时间 · ' + formatTime(item.eventTime) + '</span>' +
              '<span class="meta-chip ghost">用户 · ' + formatText(item.user?.email || item.userId) + '</span>' +
              '<span class="meta-chip ghost">应用 · ' + formatText(item.app?.code) + '</span>' +
            '</div>' +
            '<div class="subtle" style="margin-top:10px;">产品: ' + formatText(item.product?.code) + ' · 安装: ' + formatText(item.install?.extensionInstallId) + '</div>' +
            '<details>' +
              '<summary class="inline-code">properties</summary>' +
              '<pre class="json-block">' + formatJson(item.properties) + '</pre>' +
            '</details>' +
          '</div>'
        )).join('');
      }

      function renderWebhooks(items) {
        const root = document.getElementById('webhooks-list');
        if (!items.length) {
          root.innerHTML = '<div class="locked">当前还没有支付回调记录。</div>';
          return;
        }

        root.innerHTML = items.map((item) => (
          '<div class="entity-card">' +
            '<div class="entity-title">' + formatText(item.provider) + ' · ' + formatText(item.type) + '</div>' +
            '<div class="meta-row">' +
              '<span class="meta-chip">状态 · ' + formatText(item.status) + '</span>' +
              '<span class="meta-chip ghost">已处理 · ' + formatTime(item.processedAt) + '</span>' +
              '<span class="meta-chip ghost">入库 · ' + formatTime(item.createdAt) + '</span>' +
            '</div>' +
            '<div class="subtle" style="margin-top:10px;">事件号: ' + formatText(item.providerEventId) + '</div>' +
            '<details>' +
              '<summary class="inline-code">payload</summary>' +
              '<pre class="json-block">' + formatJson(item.payload) + '</pre>' +
            '</details>' +
          '</div>'
        )).join('');
      }

      async function loadAdminOperations() {
        const [orders, installs, entitlements] = await Promise.all([
          api('/v1/admin/orders?limit=30'),
          api('/v1/admin/installs?limit=30'),
          api('/v1/admin/entitlements?limit=30')
        ]);

        state.orders = orders.items || [];
        state.installs = installs.items || [];
        state.entitlements = entitlements.items || [];
        renderOrderAppFilterOptions(state.orders);
        renderOrders(state.orders);
        renderInstalls(state.installs);
        renderEntitlements(state.entitlements);
        renderDashboardMetrics();
        renderDashboardHighlights();

        if (state.selectedOrderNo) {
          try {
            const detail = await api('/v1/admin/orders/' + encodeURIComponent(state.selectedOrderNo));
            renderOrderDetail(detail);
          } catch {
            state.selectedOrderNo = '';
            renderOrderDetail(null);
          }
        } else {
          renderOrderDetail(null);
        }
      }

      async function loadOrderDetail(orderNo) {
        const data = await api('/v1/admin/orders/' + encodeURIComponent(orderNo));
        state.selectedOrderNo = orderNo;
        renderOrderDetail(data);
        return data;
      }

      async function loadObservability() {
        const [events, webhooks] = await Promise.all([
          api('/v1/admin/events?limit=20'),
          api('/v1/admin/billing-webhooks?limit=20')
        ]);

        state.events = events.items || [];
        state.webhooks = webhooks.items || [];
        renderEvents(state.events);
        renderWebhooks(state.webhooks);
        renderDashboardMetrics();
        renderDashboardHighlights();
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
          state.apps = [];
          state.orders = [];
          state.installs = [];
          state.entitlements = [];
          state.events = [];
          state.webhooks = [];
          renderManagedApps([]);
          renderOrders([]);
          renderOrderDetail(null);
          renderInstalls([]);
          renderEntitlements([]);
          renderEvents([]);
          renderWebhooks([]);
          renderPlanOptions([]);
          renderProductOptions([], []);
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
          const [overview, apps, products, plans] = await Promise.all([
            api('/v1/admin/payment-settings'),
            api('/v1/admin/apps'),
            api('/v1/products'),
            api('/v1/plans')
          ]);
          applyOverview(overview);
          state.products = products.items || [];
          state.plans = plans.items || [];
          renderPlanOptions(state.plans);
          renderProductOptions(state.products, []);
          renderManagedApps(apps.items || []);
          await Promise.all([loadAdminOperations(), loadObservability()]);
        } catch (_error) {
          localStorage.removeItem('fd_core_admin_token');
          state.token = '';
          document.getElementById('current-user').textContent = '登录已失效';
          document.getElementById('settings-panel').classList.add('hidden');
          document.getElementById('access-message').textContent = '当前登录态已失效，请重新登录。';
          state.apps = [];
          state.orders = [];
          state.installs = [];
          state.entitlements = [];
          state.events = [];
          state.webhooks = [];
          renderManagedApps([]);
          renderOrders([]);
          renderOrderDetail(null);
          renderInstalls([]);
          renderEntitlements([]);
          renderEvents([]);
          renderWebhooks([]);
          renderPlanOptions([]);
          renderProductOptions([], []);
        }
      }

      async function refresh() {
        applyActiveSection(state.activeSection);
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

      document.getElementById('app-secret-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        setFlash('app-admin-flash', '', '');
        const result = document.getElementById('app-secret-result');
        result.classList.add('hidden');
        result.textContent = '';

        try {
          const appCode = document.getElementById('app-secret-appCode').value;
          if (!appCode) {
            throw new Error('请先创建应用，再签发 secret');
          }

          const expiresAtRaw = document.getElementById('app-secret-expiresAt').value;
          const payload = {
            expiresAt: expiresAtRaw ? new Date(expiresAtRaw).toISOString() : undefined
          };
          const data = await api('/v1/admin/apps/' + encodeURIComponent(appCode) + '/secrets', {
            method: 'POST',
            body: JSON.stringify(payload)
          });
          setFlash('app-admin-flash', 'App secret 已签发。请立刻保存，只会显示这一次。', 'success');
          result.classList.remove('hidden');
          result.textContent =
            'appCode: ' + data.appCode + '\\n' +
            'appName: ' + data.appName + '\\n' +
            'secretId: ' + data.secretId + '\\n' +
            'secret: ' + data.secret + '\\n' +
            'hint: ' + data.hint + '\\n' +
            'expiresAt: ' + (data.expiresAt || 'never');
          document.getElementById('app-secret-expiresAt').value = '';
          await refresh();
        } catch (error) {
          setFlash('app-admin-flash', error.message, 'error');
        }
      });

      document.getElementById('app-editor-selected').addEventListener('change', () => {
        syncSelectedAppEditor();
      });

      document.getElementById('app-editor-new').addEventListener('click', () => {
        document.getElementById('app-editor-selected').value = '__new__';
        syncSelectedAppEditor();
        setFlash('apps-admin-flash', '已切换到新建应用模式', 'success');
      });

      document.getElementById('app-editor-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        setFlash('apps-admin-flash', '', '');

        try {
          const code = document.getElementById('app-editor-code').value.trim();
          const productCodes = getCheckedProductCodes();

          if (!code) {
            throw new Error('应用标识不能为空');
          }

          if (!productCodes.length) {
            throw new Error('至少绑定一个产品');
          }

          await api('/v1/admin/apps/' + encodeURIComponent(code), {
            method: 'PUT',
            body: JSON.stringify({
              name: document.getElementById('app-editor-name').value.trim(),
              description: document.getElementById('app-editor-description').value.trim() || undefined,
              type: document.getElementById('app-editor-type').value,
              status: document.getElementById('app-editor-status').value,
              productCodes
            })
          });

          setFlash('apps-admin-flash', '应用配置已保存', 'success');
          await refresh();
          document.getElementById('app-editor-selected').value = code;
          syncSelectedAppEditor();
        } catch (error) {
          setFlash('apps-admin-flash', error.message, 'error');
        }
      });

      document.getElementById('grant-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        setFlash('grant-admin-flash', '', '');

        try {
          const data = await api('/v1/admin/entitlements/grant', {
            method: 'POST',
            body: JSON.stringify({
              userEmail: document.getElementById('grant-userEmail').value.trim(),
              planCode: document.getElementById('grant-planCode').value,
              reason: document.getElementById('grant-reason').value.trim() || undefined
            })
          });

          setFlash(
            'grant-admin-flash',
            data.granted
              ? '授权已发放给 ' + data.user.email + '，套餐 ' + data.plan.code + '，共 ' + data.entitlementCount + ' 条权限'
              : '未重复发放：' + data.user.email + ' 已拥有该 one_time 权益',
            data.granted ? 'success' : 'error'
          );
          document.getElementById('grant-userEmail').value = '';
          document.getElementById('grant-reason').value = '';
          await Promise.all([loadAdminOperations(), loadObservability()]);
        } catch (error) {
          setFlash('grant-admin-flash', error.message, 'error');
        }
      });

      ['order-query', 'order-status-filter', 'order-provider-filter', 'order-app-filter'].forEach((id) => {
        document.getElementById(id).addEventListener(id === 'order-query' ? 'input' : 'change', () => {
          renderOrders(state.orders);
        });
      });

      document.getElementById('orders-list').addEventListener('click', async (event) => {
        const detailTarget = event.target instanceof Element ? event.target.closest('[data-order-detail]') : null;
        if (detailTarget) {
          const orderNo = detailTarget.getAttribute('data-order-detail');
          if (!orderNo) {
            return;
          }

          const previousText = detailTarget.textContent;
          detailTarget.setAttribute('disabled', 'disabled');
          detailTarget.textContent = '加载中...';
          setFlash('orders-admin-flash', '', '');

          try {
            await loadOrderDetail(orderNo);
            setFlash('orders-admin-flash', '已加载订单详情: ' + orderNo, 'success');
          } catch (error) {
            setFlash('orders-admin-flash', error.message, 'error');
          } finally {
            detailTarget.removeAttribute('disabled');
            detailTarget.textContent = previousText || '查看详情';
          }

          return;
        }

        const target = event.target instanceof Element ? event.target.closest('[data-order-reconcile]') : null;
        if (!target) {
          return;
        }

        const orderNo = target.getAttribute('data-order-reconcile');
        if (!orderNo) {
          return;
        }

        const previousText = target.textContent;
        target.setAttribute('disabled', 'disabled');
        target.textContent = '同步中...';
        setFlash('orders-admin-flash', '', '');

        try {
          const data = await api('/v1/admin/orders/' + encodeURIComponent(orderNo) + '/reconcile', {
            method: 'POST'
          });
          setFlash(
            'orders-admin-flash',
            '订单已同步: ' + orderNo + ' -> ' + data.reconciliation.status + ' (' + data.reconciliation.reason + ')',
            'success'
          );
          await loadAdminOperations();
          if (state.selectedOrderNo === orderNo) {
            await loadOrderDetail(orderNo);
          }
        } catch (error) {
          setFlash('orders-admin-flash', error.message, 'error');
        } finally {
          target.removeAttribute('disabled');
          target.textContent = previousText || '同步订单';
        }
      });

      document.getElementById('order-detail').addEventListener('click', async (event) => {
        const target = event.target instanceof Element ? event.target.closest('[data-order-reconcile]') : null;
        if (!target) {
          return;
        }

        const orderNo = target.getAttribute('data-order-reconcile');
        if (!orderNo) {
          return;
        }

        const previousText = target.textContent;
        target.setAttribute('disabled', 'disabled');
        target.textContent = '同步中...';
        setFlash('orders-admin-flash', '', '');

        try {
          const data = await api('/v1/admin/orders/' + encodeURIComponent(orderNo) + '/reconcile', {
            method: 'POST'
          });
          setFlash(
            'orders-admin-flash',
            '订单已同步: ' + orderNo + ' -> ' + data.reconciliation.status + ' (' + data.reconciliation.reason + ')',
            'success'
          );
          await loadAdminOperations();
          await loadOrderDetail(orderNo);
        } catch (error) {
          setFlash('orders-admin-flash', error.message, 'error');
        } finally {
          target.removeAttribute('disabled');
          target.textContent = previousText || '同步订单';
        }
      });

      document.getElementById('app-list').addEventListener('click', async (event) => {
        const target = event.target instanceof Element ? event.target.closest('[data-app-secret-revoke]') : null;
        if (!target) {
          return;
        }

        const appCode = target.getAttribute('data-app-secret-revoke');
        const secretId = target.getAttribute('data-secret-id');
        if (!appCode || !secretId) {
          return;
        }

        if (!window.confirm('确认停用这个 App Secret？停用后现有 secret 将不能继续换取 app token。')) {
          return;
        }

        try {
          await api('/v1/admin/apps/' + encodeURIComponent(appCode) + '/secrets/' + encodeURIComponent(secretId) + '/revoke', {
            method: 'POST'
          });
          setFlash('app-admin-flash', 'App Secret 已停用', 'success');
          await refresh();
        } catch (error) {
          setFlash('app-admin-flash', error.message, 'error');
        }
      });

      document.getElementById('entitlements-list').addEventListener('click', async (event) => {
        const target = event.target instanceof Element ? event.target.closest('[data-entitlement-revoke]') : null;
        if (!target) {
          return;
        }

        const entitlementId = target.getAttribute('data-entitlement-revoke');
        if (!entitlementId) {
          return;
        }

        if (!window.confirm('确认撤销这条授权？如果它属于同一来源的一组权限，会整组一起撤销。')) {
          return;
        }

        const previousText = target.textContent;
        target.setAttribute('disabled', 'disabled');
        target.textContent = '撤销中...';
        setFlash('entitlements-admin-flash', '', '');

        try {
          const data = await api('/v1/admin/entitlements/' + encodeURIComponent(entitlementId) + '/revoke', {
            method: 'POST'
          });
          setFlash('entitlements-admin-flash', '授权已撤销，共处理 ' + data.revokedCount + ' 条记录', 'success');
          await Promise.all([loadAdminOperations(), loadObservability()]);
        } catch (error) {
          setFlash('entitlements-admin-flash', error.message, 'error');
        } finally {
          target.removeAttribute('disabled');
          target.textContent = previousText || '撤销授权';
        }
      });

      refresh();
    </script>
  </body>
</html>`;
}
