import {
  adminCommandItems,
  adminSectionMeta,
  renderAdminHeroActions,
  renderAdminNavigation,
  renderAdminSectionContext,
  renderAdminTopbarLinks,
  type AdminSectionKey
} from './ui-foundation';

export type { AdminSectionKey } from './ui-foundation';

export function renderAdminPage(activeSection: AdminSectionKey = 'dashboard') {
  const section = adminSectionMeta[activeSection] ?? adminSectionMeta.dashboard;
  const commandItemsJson = JSON.stringify(adminCommandItems).replace(/</g, '\\u003c');
  const pageDataScopesJson = JSON.stringify(section.pageDataScopes);
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>fd-core-stack 管理后台</title>
    <style>
      :root {
        --bg: #f4f7fb;
        --bg-2: #eef3fb;
        --panel: rgba(255, 255, 255, 0.96);
        --panel-strong: #ffffff;
        --panel-soft: #f8fbff;
        --ink: #172033;
        --muted: #6b7280;
        --line: #e4eaf2;
        --line-strong: #d6deea;
        --accent: #2563eb;
        --accent-2: #1d4ed8;
        --accent-soft: #eff6ff;
        --danger: #dc2626;
        --success: #16a34a;
        --warning: #d97706;
        --shadow: 0 22px 50px rgba(15, 23, 42, 0.08);
        --shadow-soft: 0 8px 24px rgba(15, 23, 42, 0.06);
        --radius: 24px;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "SF Pro Display", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif;
        color: var(--ink);
        background: #edf2f7;
        min-height: 100vh;
      }

      .shell {
        width: 100%;
        min-height: 100vh;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: 268px minmax(0, 1fr);
        gap: 0;
        align-items: stretch;
      }

      .shell.sidebar-collapsed {
        grid-template-columns: 84px minmax(0, 1fr);
      }

      .workspace {
        display: grid;
        gap: 0;
        min-height: 100vh;
        background: #ffffff;
        border: 0;
        overflow: hidden;
      }

      .sidebar {
        position: sticky;
        top: 0;
        height: 100vh;
        padding: 18px 14px 16px;
        overflow: auto;
        background: #f3f5f8;
        color: var(--ink);
        border: 0;
        border-right: 1px solid var(--line);
        box-shadow: none;
      }

      .sidebar .muted,
      .sidebar .subtle,
      .sidebar p {
        color: var(--muted);
      }

      .brand-lockup {
        display: grid;
        gap: 12px;
        margin-bottom: 18px;
      }

      .brand-row {
        display: flex;
        gap: 12px;
        align-items: center;
      }

      .brand-mark {
        width: 40px;
        height: 40px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
        background: linear-gradient(135deg, var(--accent), #4f8cff);
        color: white;
        font-size: 15px;
        font-weight: 800;
        letter-spacing: -0.04em;
        box-shadow: 0 8px 18px rgba(37, 99, 235, 0.18);
      }

      .sidebar-title {
        margin: 0;
        font-size: 18px;
        line-height: 1.1;
        letter-spacing: -0.04em;
        color: var(--ink);
      }

      .sidebar-copy {
        margin: 0;
        font-size: 12px;
        line-height: 1.55;
      }

      .sidebar-label {
        display: block;
        margin-bottom: 8px;
        color: #94a3b8;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }

      .sidebar-user {
        font-size: 14px;
        font-weight: 700;
        color: var(--ink);
      }

      .sidebar-note {
        margin-top: 18px;
        padding-top: 18px;
        border-top: 1px solid var(--line);
      }

      .sidebar-block {
        margin-top: 18px;
        padding: 12px;
        border-radius: 14px;
        background: #ffffff;
        border: 1px solid var(--line);
      }

      .workspace-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        min-height: 64px;
        padding: 12px 20px;
        border-bottom: 1px solid var(--line);
        background: var(--panel-strong);
      }

      .topbar-left {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
        flex: 1 1 auto;
      }

      .sidebar-toggle {
        min-width: 40px;
        height: 40px;
        padding: 0;
        border-radius: 10px;
        border: 1px solid var(--line);
        background: #ffffff;
        color: var(--ink);
        font-size: 16px;
        line-height: 1;
      }

      .search-shell {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 42px;
        width: min(460px, 100%);
        padding: 0 14px;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: #f8fafc;
      }

      .search-shell.command-trigger {
        padding: 0 14px;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      .search-shell.command-trigger:hover {
        transform: none;
      }

      .search-icon {
        width: 14px;
        height: 14px;
        border: 2px solid #94a3b8;
        border-radius: 50%;
        position: relative;
        flex: 0 0 auto;
      }

      .search-icon::after {
        content: "";
        position: absolute;
        right: -5px;
        bottom: -4px;
        width: 6px;
        height: 2px;
        border-radius: 999px;
        background: #94a3b8;
        transform: rotate(45deg);
        transform-origin: center;
      }

      .search-shell .search-input {
        flex: 1 1 auto;
        border: 0;
        padding: 0;
        background: transparent;
        color: #94a3b8;
        font-size: 14px;
        box-shadow: none;
      }

      .search-shell .search-input:focus {
        box-shadow: none;
      }

      .search-copy {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        width: 100%;
        color: #94a3b8;
        font-size: 14px;
      }

      .search-hint {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: #94a3b8;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .search-hint kbd,
      .command-kbd {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 22px;
        min-height: 22px;
        padding: 0 6px;
        border-radius: 8px;
        border: 1px solid var(--line);
        background: #ffffff;
        color: #64748b;
        font-family: "SFMono-Regular", "IBM Plex Mono", monospace;
        font-size: 11px;
        font-weight: 700;
        text-transform: none;
        letter-spacing: 0;
      }

      .topbar-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .topbar-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 38px;
        padding: 0 12px;
        border-radius: 10px;
        border: 1px solid var(--line);
        background: #ffffff;
        color: var(--ink);
        text-decoration: none;
        font-size: 12px;
        font-weight: 700;
      }

      .topbar-link-primary {
        background: linear-gradient(135deg, var(--accent), var(--accent-2));
        border-color: transparent;
        color: #ffffff;
      }

      .topbar-link-icon,
      .topbar-link-primary {
        gap: 8px;
      }

      .topbar-link-glyph {
        width: 20px;
        height: 20px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        background: #f8fafc;
        color: #64748b;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.04em;
      }

      .topbar-link-primary .topbar-link-glyph {
        background: rgba(255, 255, 255, 0.16);
        color: #ffffff;
      }

      .topbar-shortcut {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 28px;
        min-height: 22px;
        padding: 0 7px;
        border-radius: 8px;
        background: rgba(148, 163, 184, 0.14);
        color: inherit;
        font-family: "SFMono-Regular", "IBM Plex Mono", monospace;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0;
        opacity: 0.82;
      }

      .workspace-tools {
        display: flex;
        gap: 10px;
        align-items: center;
        justify-content: flex-end;
      }

      .workspace-user {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 10px 6px 6px;
        border-radius: 12px;
        background: #ffffff;
        border: 1px solid var(--line);
      }

      .user-avatar {
        width: 38px;
        height: 38px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: linear-gradient(135deg, #e0e7ff, #eff6ff);
        color: var(--accent);
        font-size: 12px;
        font-weight: 800;
      }

      .user-copy strong,
      .user-copy span {
        display: block;
      }

      .user-copy strong {
        font-size: 13px;
        line-height: 1.2;
      }

      .user-copy span {
        margin-top: 2px;
        color: var(--muted);
        font-size: 12px;
      }

      .hero,
      .layout,
      .status-grid,
      .auth-grid,
      .field-grid,
      .admin-nav {
        display: grid;
        gap: 16px;
      }

      .hero {
        grid-template-columns: minmax(0, 1fr) 280px;
        margin: 0;
        align-items: center;
        padding: 20px 24px 18px;
        border-bottom: 1px solid var(--line);
        background: #ffffff;
      }

      .layout {
        grid-template-columns: 280px minmax(0, 1fr);
        align-items: start;
        padding: 20px 24px 24px;
        background: #ffffff;
      }

      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 14px;
        box-shadow: none;
        backdrop-filter: none;
        position: relative;
        overflow: hidden;
      }

      .hero-main {
        display: grid;
        gap: 12px;
        padding: 0;
        background: transparent;
      }

      .hero-side,
      .card {
        padding: 18px;
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 4px 8px;
        border-radius: 999px;
        background: #ffffff;
        color: #64748b;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        border: 1px solid var(--line);
      }

      h1 {
        margin: 10px 0 8px;
        font-family: "SF Pro Display", "PingFang SC", "Helvetica Neue", sans-serif;
        font-size: 28px;
        line-height: 1.08;
        letter-spacing: -0.04em;
      }

      h2 {
        margin: 0 0 8px;
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
        max-width: 760px;
        font-size: 14px;
      }

      .breadcrumb-row {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #64748b;
        font-size: 12px;
        font-weight: 600;
      }

      .breadcrumb-row strong {
        color: var(--accent);
        font-weight: 700;
      }

      .hero-actions {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 4px;
      }

      .hero-side {
        display: grid;
        gap: 10px;
        align-content: start;
        justify-items: end;
        padding: 0;
      }

      .hero-spotlight {
        width: 100%;
        padding: 14px 16px;
        border-radius: 12px;
        background: #ffffff;
        border: 1px solid var(--line);
      }

      .hero-spotlight strong {
        display: block;
        font-size: 13px;
        letter-spacing: -0.01em;
      }

      .spotlight-label {
        display: block;
        margin-bottom: 6px;
        color: #94a3b8;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .hero-spotlight span {
        display: block;
        margin-top: 6px;
        color: var(--muted);
        line-height: 1.5;
      }

      .stack {
        display: grid;
        gap: 16px;
      }

      .status-grid {
        display: grid;
        gap: 8px;
        margin-top: 14px;
      }

      .status-card {
        padding: 12px 14px;
        border-radius: 12px;
        background: #ffffff;
        border: 1px solid var(--line);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .status-card label {
        display: block;
        color: var(--muted);
        font-size: 12px;
        margin-bottom: 0;
      }

      .status-card strong {
        display: block;
        font-size: 13px;
        color: var(--ink);
      }

      .metric-grid {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 16px;
      }

      .metric-card {
        padding: 18px;
        border-radius: 16px;
        border: 1px solid var(--line);
        background: #ffffff;
        box-shadow: none;
      }

      .metric-card label {
        display: block;
        margin-bottom: 10px;
        color: #94a3b8;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .metric-card strong {
        display: block;
        font-size: 24px;
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
        padding: 18px;
        border-radius: 16px;
        background: #ffffff;
        color: var(--ink);
        box-shadow: none;
        border: 1px solid var(--line);
      }

      .quick-card h3 {
        margin: 0 0 8px;
        font-size: 16px;
      }

      .quick-card p {
        margin: 0;
        color: var(--muted);
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
        padding: 18px 20px;
        border-radius: 16px;
        background: #ffffff;
        border: 1px solid var(--line);
        box-shadow: none;
      }

      .record-list {
        gap: 0;
        border: 1px solid var(--line);
        border-radius: 14px;
        background: #ffffff;
        overflow: hidden;
      }

      .record-list .entity-card {
        border: 0;
        border-bottom: 1px solid var(--line);
        border-radius: 0;
        padding: 16px 18px;
      }

      .record-list .entity-card:last-child {
        border-bottom: 0;
      }

      .record-list > .locked {
        border: 0;
        border-radius: 0;
        background: #ffffff;
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
        background: var(--accent-soft);
        color: var(--accent);
        border: 1px solid #dbeafe;
        font-size: 12px;
      }

      .meta-chip.ghost {
        background: #f8fafc;
        border-color: var(--line);
        color: var(--ink);
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
        margin: 6px 0 0;
        position: static;
      }

      .nav-group {
        display: grid;
        gap: 6px;
        margin-bottom: 14px;
      }

      .nav-group-label {
        padding: 0 12px;
        color: #94a3b8;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .nav-link {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        justify-content: flex-start;
        min-height: 56px;
        padding: 12px 14px;
        border-radius: 14px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--ink);
        text-decoration: none;
        font-weight: 700;
        box-shadow: none;
        position: relative;
      }

      .nav-icon {
        width: 28px;
        height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        background: #ffffff;
        border: 1px solid var(--line);
        color: #64748b;
        font-size: 12px;
        font-weight: 800;
        flex: 0 0 auto;
      }

      .nav-copy {
        min-width: 0;
      }

      .nav-link.active {
        background: var(--accent-soft);
        border-color: #dbeafe;
        color: var(--accent);
      }

      .nav-link.active .nav-icon {
        background: #dbeafe;
        border-color: #bfdbfe;
        color: var(--accent);
      }

      .nav-link.active::before {
        content: "";
        position: absolute;
        left: -6px;
        top: 10px;
        bottom: 10px;
        width: 3px;
        border-radius: 999px;
        background: var(--accent);
      }

      .nav-title {
        font-size: 14px;
        font-weight: 800;
      }

      .nav-note {
        margin-top: 4px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 500;
        line-height: 1.45;
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
        background: rgba(22, 163, 74, 0.1);
        border-color: rgba(22, 163, 74, 0.16);
      }

      .badge.warn {
        color: var(--warning);
        background: #fff7ed;
        border-color: #fed7aa;
      }

      .badge.muted {
        color: var(--muted);
        background: #f8fafc;
        border-color: var(--line);
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
        border: 1px solid var(--line-strong);
        border-radius: 12px;
        padding: 12px 14px;
        font: inherit;
        color: var(--ink);
        background: #ffffff;
        outline: none;
        transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
      }

      input:focus,
      select:focus,
      textarea:focus {
        border-color: rgba(37, 99, 235, 0.56);
        box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1);
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
        padding: 13px 14px;
        border: 1px solid var(--line);
        border-radius: 14px;
        background: #ffffff;
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
        border-radius: 12px;
        padding: 11px 16px;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
        transition: transform 0.16s ease, opacity 0.16s ease, box-shadow 0.16s ease;
        box-shadow: none;
      }

      button:hover {
        transform: translateY(-1px);
      }

      .primary {
        background: linear-gradient(135deg, var(--accent), var(--accent-2));
        color: white;
      }

      .secondary {
        background: #f8fafc;
        border: 1px solid var(--line);
        color: var(--ink);
      }

      .danger {
        background: #fef2f2;
        border: 1px solid #fecaca;
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
        background: #f8fbff;
        border: 1px solid var(--line);
      }

      .warning {
        background: #fef2f2;
        border-color: #fecaca;
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
        border-radius: 12px;
        background: #f8fafc;
        border: 1px solid var(--line);
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
        gap: 16px;
      }

      .shell.sidebar-collapsed .sidebar {
        padding-left: 10px;
        padding-right: 10px;
      }

      .shell.sidebar-collapsed .sidebar-title,
      .shell.sidebar-collapsed .sidebar-copy,
      .shell.sidebar-collapsed .nav-note,
      .shell.sidebar-collapsed .nav-group-label,
      .shell.sidebar-collapsed .sidebar-block,
      .shell.sidebar-collapsed .sidebar-note {
        display: none;
      }

      .shell.sidebar-collapsed .brand-row {
        justify-content: center;
      }

      .shell.sidebar-collapsed .brand-lockup {
        justify-items: center;
      }

      .shell.sidebar-collapsed .nav-link {
        min-height: 48px;
        padding: 10px;
        align-items: center;
        justify-content: center;
      }

      .shell.sidebar-collapsed .nav-title {
        display: none;
      }

      .shell.sidebar-collapsed .nav-group {
        justify-items: center;
      }

      :root {
        --bg: #f4f7fb;
        --bg-2: #eef2f8;
        --panel: #ffffff;
        --panel-strong: #ffffff;
        --panel-soft: #f8fafc;
        --ink: #213047;
        --muted: #6b7a90;
        --line: #e4eaf3;
        --line-strong: #d7e0ec;
        --accent: #2582f4;
        --accent-2: #0f6bdc;
        --accent-soft: #edf5ff;
        --danger: #e25454;
        --success: #12805c;
        --warning: #c67a20;
        --shadow: 0 16px 40px rgba(31, 45, 61, 0.08);
        --shadow-soft: 0 8px 18px rgba(31, 45, 61, 0.05);
        --radius: 18px;
      }

      body {
        background: var(--bg);
        color: var(--ink);
      }

      .shell {
        grid-template-columns: 250px minmax(0, 1fr);
        background: var(--bg);
      }

      .shell.sidebar-collapsed {
        grid-template-columns: 82px minmax(0, 1fr);
      }

      .sidebar {
        padding: 18px 14px 18px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.88)),
          var(--bg-2);
        border-right: 1px solid var(--line);
      }

      .workspace {
        background: var(--bg);
      }

      .workspace-bar {
        min-height: 58px;
        padding: 10px 22px;
        background: rgba(255, 255, 255, 0.92);
        backdrop-filter: blur(14px);
      }

      .search-shell,
      .topbar-link,
      .workspace-user,
      .sidebar-block,
      .status-card,
      .hero-spotlight {
        box-shadow: var(--shadow-soft);
      }

      .sidebar-toggle,
      .topbar-link,
      .workspace-user,
      .search-shell {
        border-color: var(--line);
      }

      .search-shell {
        min-height: 40px;
        width: min(430px, 100%);
        background: #f8fafc;
      }

      .topbar-link {
        min-height: 36px;
        padding: 0 13px;
        border-radius: 12px;
        background: #ffffff;
        color: #516179;
      }

      .workspace-user {
        border-radius: 14px;
        background: #ffffff;
      }

      .hero {
        grid-template-columns: minmax(0, 1fr) 320px;
        gap: 18px;
        padding: 22px 24px 16px;
        background: transparent;
        border-bottom: 0;
      }

      .hero-main {
        gap: 10px;
        padding: 0;
      }

      .breadcrumb-row {
        font-size: 12px;
        text-transform: none;
        letter-spacing: 0;
      }

      h1 {
        margin: 4px 0 4px;
        font-size: 34px;
        line-height: 1.02;
      }

      .lead {
        max-width: 720px;
        margin: 0;
        font-size: 14px;
        line-height: 1.6;
      }

      .hero-actions {
        gap: 8px;
        margin-top: 8px;
      }

      .hero-side {
        gap: 12px;
      }

      .hero-spotlight {
        padding: 16px;
        border-radius: 16px;
        border: 1px solid var(--line);
      }

      .layout {
        grid-template-columns: 312px minmax(0, 1fr);
        gap: 18px;
        padding: 0 24px 24px;
        background: transparent;
      }

      .layout > .stack {
        position: sticky;
        top: 80px;
        align-self: start;
      }

      .panel {
        border-radius: 16px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.96);
        box-shadow: var(--shadow-soft);
      }

      .card,
      .hero-side,
      .hero-main {
        min-width: 0;
      }

      .hero-side,
      .card {
        padding: 18px;
      }

      .card-head {
        margin-bottom: 16px;
      }

      .card-head h2 {
        font-size: 19px;
      }

      .metric-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .metric-card,
      .quick-card,
      .summary-tile,
      .entity-card {
        border-radius: 16px;
        border-color: var(--line);
        box-shadow: none;
      }

      .metric-card {
        padding: 16px;
      }

      .metric-card strong {
        font-size: 22px;
      }

      .quick-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .quick-card {
        padding: 16px;
        background: linear-gradient(180deg, #ffffff, #fbfdff);
      }

      .record-list {
        border: 0;
        background: transparent;
      }

      .record-list .entity-card {
        margin-bottom: 12px;
        border: 1px solid var(--line);
        border-radius: 16px;
      }

      .record-list .entity-card:last-child {
        margin-bottom: 0;
      }

      .record-list > .locked {
        border-radius: 16px;
      }

      .badge,
      .meta-chip {
        font-weight: 800;
      }

      button {
        border-radius: 12px;
      }

      .secondary {
        background: #f8fafc;
      }

      .toolbar {
        gap: 12px;
        align-items: stretch;
      }

      .toolbar .field {
        margin: 0;
      }

      .table-card {
        border: 1px solid var(--line);
        border-radius: 16px;
        background: #ffffff;
        overflow: hidden;
      }

      .table-scroll {
        width: 100%;
        overflow: auto;
      }

      .data-table {
        width: 100%;
        min-width: 720px;
        border-collapse: separate;
        border-spacing: 0;
      }

      .data-table thead th {
        padding: 12px 16px;
        border-bottom: 1px solid var(--line);
        background: #f8fafc;
        color: #7c8ba1;
        font-size: 11px;
        font-weight: 800;
        text-align: left;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        white-space: nowrap;
      }

      .data-table thead th.align-right,
      .data-table tbody td.align-right {
        text-align: right;
      }

      .data-table tbody td {
        padding: 14px 16px;
        border-bottom: 1px solid var(--line);
        vertical-align: top;
        background: #ffffff;
      }

      .data-table tbody tr:last-child td {
        border-bottom: 0;
      }

      .data-table tbody tr:hover td {
        background: #fbfdff;
      }

      .cell-stack {
        display: grid;
        gap: 4px;
        min-width: 0;
      }

      .cell-primary {
        color: var(--ink);
        font-size: 13px;
        font-weight: 800;
        line-height: 1.4;
      }

      .cell-secondary,
      .cell-tertiary {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.45;
      }

      .cell-tertiary {
        color: #90a0b7;
      }

      .cell-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .cell-actions button {
        padding: 8px 12px;
        font-size: 12px;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 28px;
        padding: 0 10px;
        border-radius: 999px;
        border: 1px solid transparent;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .pill.neutral {
        background: #f8fafc;
        border-color: var(--line);
        color: #69798f;
      }

      .pill.ok {
        background: #edf9f4;
        border-color: #ccebdd;
        color: var(--success);
      }

      .pill.warn {
        background: #fff6e8;
        border-color: #f4dbb3;
        color: var(--warning);
      }

      .pill.danger {
        background: #fff1f1;
        border-color: #f3caca;
        color: var(--danger);
      }

      .inline-actions {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .table-sublist {
        display: grid;
        gap: 10px;
      }

      .table-subitem {
        padding-top: 10px;
        border-top: 1px solid var(--line);
      }

      .table-subitem:first-child {
        padding-top: 0;
        border-top: 0;
      }

      .panel-note {
        margin-bottom: 14px;
        padding: 12px 14px;
        border-radius: 14px;
        background: #f8fafc;
        border: 1px solid var(--line);
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }

      .command-palette {
        position: fixed;
        inset: 0;
        z-index: 50;
      }

      .command-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(15, 23, 42, 0.34);
        backdrop-filter: blur(10px);
      }

      .command-dialog {
        position: relative;
        width: min(760px, calc(100vw - 32px));
        margin: 11vh auto 0;
        border-radius: 22px;
        border: 1px solid rgba(226, 234, 243, 0.96);
        background: rgba(255, 255, 255, 0.98);
        box-shadow: 0 24px 64px rgba(15, 23, 42, 0.18);
        overflow: hidden;
      }

      .command-header {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 18px 20px;
        border-bottom: 1px solid var(--line);
      }

      .command-header .search-icon {
        flex: 0 0 auto;
      }

      .command-input {
        width: 100%;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--ink);
        font-size: 15px;
        box-shadow: none;
      }

      .command-input:focus {
        box-shadow: none;
      }

      .command-results {
        max-height: min(52vh, 520px);
        overflow: auto;
        padding: 10px;
      }

      .command-group {
        margin: 8px 10px 6px;
        color: #94a3b8;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .command-item {
        width: 100%;
        display: grid;
        grid-template-columns: 36px minmax(0, 1fr) auto;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
        border-radius: 14px;
        border: 0;
        background: transparent;
        text-align: left;
        color: var(--ink);
        cursor: pointer;
      }

      .command-item:hover,
      .command-item.active {
        transform: none;
        background: #edf5ff;
      }

      .command-item-icon {
        width: 36px;
        height: 36px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
        background: #f8fafc;
        border: 1px solid var(--line);
        color: #516179;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.04em;
      }

      .command-item-title {
        font-size: 14px;
        font-weight: 800;
        line-height: 1.35;
      }

      .command-item-note {
        margin-top: 2px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.45;
      }

      .command-item-meta {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: #94a3b8;
        font-size: 11px;
        font-weight: 700;
      }

      .command-empty {
        padding: 28px 18px 34px;
        color: var(--muted);
        text-align: center;
        font-size: 13px;
      }

      .command-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 16px;
        border-top: 1px solid var(--line);
        background: #f8fafc;
        color: #7c8ba1;
        font-size: 12px;
      }

      .command-footer-copy {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      @media (max-width: 980px) {
        .shell,
        .hero,
        .layout,
        .metric-grid,
        .quick-grid,
        .summary-strip,
        .auth-grid,
        .field-grid,
        .checkbox-list {
          grid-template-columns: 1fr;
        }

        .sidebar {
          position: static;
          height: auto;
        }

        .workspace-bar {
          flex-direction: column;
          align-items: flex-start;
        }

        .topbar-left {
          width: 100%;
        }

        .hero-actions {
          justify-content: flex-start;
        }

        .workspace-tools {
          width: 100%;
          flex-direction: column;
          align-items: stretch;
        }

        .command-dialog {
          width: min(760px, calc(100vw - 20px));
          margin-top: 6vh;
        }

        .layout > .stack {
          position: static;
        }
      }
    </style>
  </head>
  <body>
    <div id="admin-shell" class="shell">
      <aside class="sidebar">
        <div class="brand-lockup">
          <div class="brand-row">
            <div class="brand-mark">FD</div>
            <div>
              <span class="eyebrow">fd-core-stack</span>
              <h1 class="sidebar-title">Core Stack</h1>
            </div>
          </div>
          <p class="sidebar-copy">统一承接支付、授权、应用接入和运营链路的独立核心中台。</p>
        </div>

        <nav class="admin-nav">${renderAdminNavigation(activeSection)}</nav>

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
          <label class="sidebar-label">Quick Links</label>
          <p><a class="ghost-link" href="/docs" target="_blank" rel="noreferrer">API 文档</a></p>
          <p><a class="ghost-link" href="/admin/payments">支付配置</a></p>
          <p>密钥保存后不回显，刷新为空属于正常表现。</p>
        </div>
      </aside>

      <main class="workspace">
        <section class="workspace-bar">
          <div class="topbar-left">
            <button id="sidebar-toggle" class="sidebar-toggle" type="button" aria-label="切换侧边栏">☰</button>
            <button id="command-trigger" class="search-shell command-trigger" type="button" aria-label="打开命令搜索">
              <span class="search-icon"></span>
              <span class="search-copy">
                <span>Press / or Cmd K to search</span>
                <span class="search-hint">
                  <kbd>/</kbd>
                  <kbd>K</kbd>
                </span>
              </span>
            </button>
          </div>
          <div class="workspace-tools">
            <div class="topbar-actions">${renderAdminTopbarLinks()}</div>
            <div class="workspace-user">
              <div id="current-user-avatar" class="user-avatar">FD</div>
              <div class="user-copy">
                <strong id="current-user-chip">未登录</strong>
                <span id="current-user-role">等待管理员会话</span>
              </div>
            </div>
          </div>
        </section>

        <section class="hero">
          <div class="hero-main">
            <div class="breadcrumb-row">
              <span>${section.groupLabel}</span>
              <span>/</span>
              <strong>${section.navTitle}</strong>
            </div>
            <h1>${section.title}</h1>
            <p class="lead">
              ${section.lead}
            </p>

            <div class="hero-actions">${renderAdminHeroActions(activeSection)}</div>
          </div>

          <aside class="hero-side">${renderAdminSectionContext(activeSection)}</aside>
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
              <div id="app-list" class="stack record-list" style="margin-top:18px;"></div>
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
              <div id="orders-list" class="stack record-list"></div>
            </div>

            <div class="panel card" data-admin-section="operations">
              <div class="card-head">
                <div>
                  <h2>安装实例</h2>
                  <p class="muted">查看 app 安装实例、绑定用户、最近活跃时间。</p>
                </div>
              </div>
              <div id="installs-list" class="stack record-list"></div>
            </div>

            <div class="panel card" data-admin-section="licenses">
              <div class="card-head">
                <div>
                  <h2>授权明细</h2>
                  <p class="muted">查看 entitlement 明细、来源订单和当前状态。支持按来源整组撤销。</p>
                </div>
              </div>
              <div id="entitlements-admin-flash" class="flash"></div>
              <div id="entitlements-list" class="stack record-list"></div>
            </div>

            <div class="panel card" data-admin-section="observability">
              <div class="card-head">
                <div>
                  <h2>业务事件</h2>
                  <p class="muted">中台自身记录的事件流，便于排查登录、安装、支付、授权链路。</p>
                </div>
              </div>
              <div id="events-list" class="stack record-list"></div>
            </div>

            <div class="panel card" data-admin-section="observability">
              <div class="card-head">
                <div>
                  <h2>支付回调</h2>
                  <p class="muted">查看微信支付和支付宝通知入库、处理状态与原始负载。</p>
                </div>
              </div>
              <div id="webhooks-list" class="stack record-list"></div>
            </div>
          </div>
        </section>
      </main>
    </div>

    <div id="command-palette" class="command-palette hidden" aria-hidden="true">
      <div id="command-backdrop" class="command-backdrop"></div>
      <div class="command-dialog" role="dialog" aria-modal="true" aria-labelledby="command-input">
        <div class="command-header">
          <span class="search-icon"></span>
          <input
            id="command-input"
            class="command-input"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            placeholder="搜索页面、资源或快速入口"
          />
        </div>
        <div id="command-results" class="command-results"></div>
        <div class="command-footer">
          <div class="command-footer-copy">
            <span class="command-kbd">↑</span>
            <span class="command-kbd">↓</span>
            <span>切换</span>
            <span class="command-kbd">Enter</span>
            <span>打开</span>
          </div>
          <div class="command-footer-copy">
            <span class="command-kbd">Esc</span>
            <span>关闭</span>
          </div>
        </div>
      </div>
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
        selectedOrderNo: '',
        sidebarCollapsed: localStorage.getItem('fd_core_admin_sidebar_collapsed') === '1',
        pageDataScopes: ${pageDataScopesJson},
        commandQuery: '',
        commandItems: ${commandItemsJson},
        filteredCommandItems: [],
        activeCommandIndex: 0
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

      function applySidebarState() {
        const shell = document.getElementById('admin-shell');
        const toggle = document.getElementById('sidebar-toggle');
        shell.classList.toggle('sidebar-collapsed', Boolean(state.sidebarCollapsed));
        toggle.textContent = state.sidebarCollapsed ? '>' : '<';
        toggle.setAttribute('aria-label', state.sidebarCollapsed ? '展开侧边栏' : '收起侧边栏');
      }

      function applyActiveSection(section) {
        document.querySelectorAll('[data-admin-section]').forEach((el) => {
          el.classList.toggle('hidden', el.getAttribute('data-admin-section') !== section);
        });

        document.querySelectorAll('[data-nav-section]').forEach((el) => {
          el.classList.toggle('active', el.getAttribute('data-nav-section') === section);
        });
      }

      function hasDataScope(scope) {
        return Array.isArray(state.pageDataScopes) && state.pageDataScopes.includes(scope);
      }

      function isEditableTarget(target) {
        return (
          target instanceof HTMLElement &&
          (
            target.isContentEditable ||
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT'
          )
        );
      }

      function getCommandPaletteElements() {
        return {
          palette: document.getElementById('command-palette'),
          input: document.getElementById('command-input'),
          results: document.getElementById('command-results'),
          trigger: document.getElementById('command-trigger')
        };
      }

      function isCommandPaletteOpen() {
        const { palette } = getCommandPaletteElements();
        return !palette.classList.contains('hidden');
      }

      function getMatchedCommandItems(query) {
        const normalized = String(query || '').trim().toLowerCase();
        const items = Array.isArray(state.commandItems) ? state.commandItems : [];

        if (!normalized) {
          return items.slice(0, 8);
        }

        return items
          .map((item) => {
            const keywords = Array.isArray(item.keywords) ? item.keywords : [];
            const haystack = [item.label, item.note, ...keywords].join(' ').toLowerCase();

            if (!haystack.includes(normalized)) {
              return null;
            }

            const primary = String(item.label || '').toLowerCase();
            const note = String(item.note || '').toLowerCase();
            const score =
              (primary.startsWith(normalized) ? 0 : 3) +
              (keywords.some((entry) => String(entry).toLowerCase().startsWith(normalized)) ? 1 : 4) +
              (note.includes(normalized) ? 1 : 4);

            return { item, score };
          })
          .filter(Boolean)
          .sort((left, right) => left.score - right.score)
          .map((entry) => entry.item)
          .slice(0, 12);
      }

      function setActiveCommandIndex(nextIndex) {
        const buttons = Array.from(document.querySelectorAll('[data-command-index]'));
        if (!buttons.length) {
          state.activeCommandIndex = 0;
          return;
        }

        const bounded = Math.max(0, Math.min(nextIndex, buttons.length - 1));
        state.activeCommandIndex = bounded;

        buttons.forEach((button, index) => {
          button.classList.toggle('active', index === bounded);
        });

        const activeButton = buttons[bounded];
        if (activeButton instanceof HTMLElement) {
          activeButton.scrollIntoView({ block: 'nearest' });
        }
      }

      function renderCommandResults() {
        const { results } = getCommandPaletteElements();
        const items = getMatchedCommandItems(state.commandQuery);
        state.filteredCommandItems = items;
        state.activeCommandIndex = items.length ? Math.min(state.activeCommandIndex, items.length - 1) : 0;

        if (!items.length) {
          results.innerHTML = '<div class="command-empty">没有匹配项。试试输入资源名、页面别名或快捷入口。</div>';
          return;
        }

        let lastGroup = '';
        results.innerHTML = items
          .map((item, index) => {
            const groupMarkup =
              item.group !== lastGroup
                ? '<div class="command-group">' + escapeHtml(item.group) + '</div>'
                : '';
            lastGroup = item.group;

            return (
              groupMarkup +
              '<button class="command-item' + (index === state.activeCommandIndex ? ' active' : '') + '" type="button" data-command-index="' + index + '">' +
                '<span class="command-item-icon">' + escapeHtml(item.icon) + '</span>' +
                '<span>' +
                  '<span class="command-item-title">' + escapeHtml(item.label) + '</span>' +
                  '<span class="command-item-note">' + escapeHtml(item.note) + '</span>' +
                '</span>' +
                '<span class="command-item-meta">' +
                  (item.shortcut ? '<span class="command-kbd">' + escapeHtml(item.shortcut) + '</span>' : '') +
                  (item.external ? '<span>External</span>' : '<span>Open</span>') +
                '</span>' +
              '</button>'
            );
          })
          .join('');
      }

      function openCommandPalette(seed = '') {
        const { palette, input } = getCommandPaletteElements();
        state.commandQuery = seed;
        state.activeCommandIndex = 0;
        palette.classList.remove('hidden');
        palette.setAttribute('aria-hidden', 'false');
        input.value = seed;
        renderCommandResults();
        window.requestAnimationFrame(() => input.focus());
      }

      function closeCommandPalette() {
        const { palette, input, trigger } = getCommandPaletteElements();
        state.commandQuery = '';
        palette.classList.add('hidden');
        palette.setAttribute('aria-hidden', 'true');
        input.value = '';
        if (trigger instanceof HTMLElement) {
          trigger.focus();
        }
      }

      function activateCommandByIndex(index) {
        const item = state.filteredCommandItems[index];
        if (!item) {
          return;
        }

        if (item.external) {
          window.open(item.href, '_blank', 'noopener,noreferrer');
          closeCommandPalette();
          return;
        }

        window.location.href = item.href;
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

      function getInitials(value) {
        const source = String(value || 'FD').trim();
        if (!source) {
          return 'FD';
        }

        const cleaned = source
          .replace(/@.*$/, '')
          .split(/[\s._-]+/)
          .filter(Boolean);

        if (!cleaned.length) {
          return source.slice(0, 2).toUpperCase();
        }

        return cleaned
          .slice(0, 2)
          .map((part) => part[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();
      }

      function setSessionIdentity(label, role, avatarSource, chipLabel) {
        const sidebarUser = document.getElementById('current-user');
        const userChip = document.getElementById('current-user-chip');
        const userRole = document.getElementById('current-user-role');
        const userAvatar = document.getElementById('current-user-avatar');

        sidebarUser.textContent = label;
        userChip.textContent = chipLabel || label;
        userRole.textContent = role;
        userAvatar.textContent = getInitials(avatarSource || label);
      }

      function setAppOverviewLabel(apps) {
        const badge = document.getElementById('app-count-badge');
        if (!hasDataScope('apps')) {
          document.getElementById('app-overview').textContent = '按需加载';
          badge.textContent = '按需加载';
          badge.className = 'badge muted';
          return;
        }

        document.getElementById('app-overview').textContent = apps.length > 0 ? ('已接入 ' + apps.length + ' 个应用') : '暂无应用';
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

      function formatDateTime(value, fallback = '-') {
        if (!value) {
          return fallback;
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
          return escapeHtml(value);
        }

        return escapeHtml(date.toLocaleString('zh-CN', { hour12: false }));
      }

      function formatMoney(amount, currency) {
        if (typeof amount !== 'number') {
          return '-';
        }

        return escapeHtml((amount / 100).toFixed(2) + ' ' + String(currency || '').trim());
      }

      function formatProvider(provider) {
        if (!provider) {
          return '-';
        }

        return provider === 'wechat_pay' ? 'wechat' : provider;
      }

      function getToneFromStatus(value) {
        const normalized = String(value || '').trim().toLowerCase();

        if (!normalized) {
          return 'neutral';
        }

        if (
          normalized === 'paid' ||
          normalized === 'active' ||
          normalized === 'configured' ||
          normalized === 'processed' ||
          normalized === 'success'
        ) {
          return 'ok';
        }

        if (
          normalized === 'pending' ||
          normalized === 'expiring' ||
          normalized === 'inactive' ||
          normalized === 'database' ||
          normalized === 'env'
        ) {
          return 'warn';
        }

        if (
          normalized === 'failed' ||
          normalized === 'cancelled' ||
          normalized === 'revoked' ||
          normalized === 'expired' ||
          normalized === 'refunded' ||
          normalized === 'error'
        ) {
          return 'danger';
        }

        return 'neutral';
      }

      function renderPill(value, tone) {
        const label = String(value || '-');
        return '<span class="pill ' + (tone || getToneFromStatus(label)) + '">' + escapeHtml(label) + '</span>';
      }

      function renderCellStack(primary, secondary = '', tertiary = '') {
        return (
          '<div class="cell-stack">' +
            '<div class="cell-primary">' + primary + '</div>' +
            (secondary ? '<div class="cell-secondary">' + secondary + '</div>' : '') +
            (tertiary ? '<div class="cell-tertiary">' + tertiary + '</div>' : '') +
          '</div>'
        );
      }

      function renderTableCard(columns, rows, emptyMessage) {
        if (!rows.length) {
          return '<div class="locked">' + escapeHtml(emptyMessage) + '</div>';
        }

        return (
          '<div class="table-card">' +
            '<div class="table-scroll">' +
              '<table class="data-table">' +
                '<thead><tr>' +
                  columns
                    .map((column) => (
                      '<th class="' + escapeHtml(column.className || '') + '">' + escapeHtml(column.label) + '</th>'
                    ))
                    .join('') +
                '</tr></thead>' +
                '<tbody>' +
                  rows
                    .map((row) => (
                      '<tr>' +
                        row
                          .map((cell) => (
                            '<td class="' + escapeHtml(cell.className || '') + '">' + cell.html + '</td>'
                          ))
                          .join('') +
                      '</tr>'
                    ))
                    .join('') +
                '</tbody>' +
              '</table>' +
            '</div>' +
          '</div>'
        );
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
        root.innerHTML = renderTableCard(
          [
            { label: '应用' },
            { label: '类型 / 状态' },
            { label: '绑定产品' },
            { label: 'Secrets' }
          ],
          apps.map((app) => {
            const secrets = Array.isArray(app.secrets) ? app.secrets : [];
            const products = Array.isArray(app.products) ? app.products : [];

            return [
              {
                html: renderCellStack(
                  formatText(app.name) + ' (' + formatText(app.code) + ')',
                  formatText(app.description || '暂无描述'),
                  '创建时间 · ' + formatDateTime(app.createdAt)
                )
              },
              {
                html:
                  '<div class="cell-stack">' +
                    '<div class="inline-actions">' +
                      renderPill(app.type, 'neutral') +
                      renderPill(app.status) +
                    '</div>' +
                    '<div class="cell-secondary">更新时间 · ' + formatDateTime(app.updatedAt) + '</div>' +
                  '</div>'
              },
              {
                html: products.length
                  ? renderCellStack(
                      formatText(products.map((item) => item.code).join(', ')),
                      '产品数 · ' + escapeHtml(products.length),
                      formatText(products.map((item) => item.name).join(' / '))
                    )
                  : renderCellStack('未绑定产品')
              },
              {
                html: secrets.length
                  ? '<div class="table-sublist">' +
                      secrets
                        .map((secret) => (
                          '<div class="table-subitem">' +
                            renderCellStack(
                              'Name · ' + formatText(secret.name),
                              'Hint · ' + formatText(secret.hint) + ' · 最近使用 · ' + formatDateTime(secret.lastUsedAt, '未使用'),
                              '过期 · ' + formatDateTime(secret.expiresAt, '永不过期')
                            ) +
                            '<div class="inline-actions" style="margin-top:8px;">' +
                              renderPill(secret.status) +
                              (secret.status === 'active'
                                ? '<button class="danger" type="button" data-app-secret-revoke="' + escapeHtml(app.code) + '" data-secret-id="' + escapeHtml(secret.id) + '">停用 Secret</button>'
                                : '') +
                            '</div>' +
                          '</div>'
                        ))
                        .join('') +
                    '</div>'
                  : '<div class="cell-secondary">还没有签发 secret。</div>'
              }
            ];
          }),
          '当前还没有已登记的 app。'
        );
      }

      function renderOrders(items) {
        const root = document.getElementById('orders-list');
        const filtered = getFilteredOrders(items);
        const summary = document.getElementById('orders-summary');
        summary.textContent = '当前显示 ' + filtered.length + ' / ' + items.length + ' 条订单';

        root.innerHTML = renderTableCard(
          [
            { label: '订单' },
            { label: '状态' },
            { label: '用户 / 应用' },
            { label: '金额 / 支付' },
            { label: '动作', className: 'align-right' }
          ],
          filtered.map((item) => [
            {
              html: renderCellStack(
                formatText(item.orderNo),
                'Session · ' + formatText(item.checkoutSession?.sessionCode),
                '产品 / 套餐 · ' + formatText(item.product?.code) + ' / ' + formatText(item.plan?.code)
              )
            },
            {
              html:
                '<div class="cell-stack">' +
                  '<div class="inline-actions">' +
                    renderPill(item.status) +
                    renderPill(formatProvider(item.provider), 'neutral') +
                  '</div>' +
                  '<div class="cell-secondary">providerOrderId · ' + formatText(item.providerOrderId) + '</div>' +
                '</div>'
            },
            {
              html: renderCellStack(
                formatText(item.user?.email || item.userId),
                '应用 · ' + formatText(item.app?.code),
                '用户 ID · ' + formatText(item.userId)
              )
            },
            {
              html: renderCellStack(
                formatMoney(item.amount, item.currency),
                '支付时间 · ' + formatDateTime(item.paidAt, '未支付'),
                '创建时间 · ' + formatDateTime(item.createdAt)
              )
            },
            {
              html:
                '<div class="cell-actions">' +
                  '<button class="secondary" type="button" data-order-detail="' + escapeHtml(item.orderNo) + '">查看详情</button>' +
                  '<button class="secondary" type="button" data-order-reconcile="' + escapeHtml(item.orderNo) + '">同步订单</button>' +
                '</div>',
              className: 'align-right'
            }
          ]),
          '当前还没有订单。'
        );
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
        root.innerHTML = renderTableCard(
          [
            { label: '安装实例' },
            { label: '应用 / 产品' },
            { label: '用户' },
            { label: '状态' },
            { label: '最近活跃' }
          ],
          items.map((item) => [
            {
              html: renderCellStack(
                formatText(item.extensionInstallId),
                'Profile · ' + formatText(item.chromeProfileHint),
                '版本 · ' + formatText(item.appVersion)
              )
            },
            {
              html: renderCellStack(
                formatText(item.app?.code),
                '产品 · ' + formatText(item.product?.code),
                '应用类型 · ' + formatText(item.app?.type)
              )
            },
            {
              html: renderCellStack(
                formatText(item.user?.email || '未绑定'),
                '用户名称 · ' + formatText(item.user?.displayName || '-')
              )
            },
            {
              html:
                '<div class="cell-stack">' +
                  '<div class="inline-actions">' + renderPill(item.status) + '</div>' +
                  '<div class="cell-secondary">创建时间 · ' + formatDateTime(item.createdAt) + '</div>' +
                '</div>'
            },
            {
              html: renderCellStack(
                formatDateTime(item.lastSeenAt, '暂无活跃'),
                '更新时间 · ' + formatDateTime(item.updatedAt)
              )
            }
          ]),
          '当前还没有安装实例。'
        );
      }

      function renderEntitlements(items) {
        const root = document.getElementById('entitlements-list');
        root.innerHTML = renderTableCard(
          [
            { label: '用户' },
            { label: '产品 / 功能' },
            { label: '状态' },
            { label: '来源' },
            { label: '有效期' },
            { label: '动作', className: 'align-right' }
          ],
          items.map((item) => [
            {
              html: renderCellStack(
                formatText(item.user?.email || item.userId),
                '显示名称 · ' + formatText(item.user?.displayName || '-'),
                '授权 ID · ' + formatText(item.id)
              )
            },
            {
              html: renderCellStack(
                formatText(item.product?.code),
                '功能 · ' + formatText(item.feature?.code),
                '来源产品 · ' + formatText(item.product?.name || '-')
              )
            },
            {
              html:
                '<div class="cell-stack">' +
                  '<div class="inline-actions">' + renderPill(item.status) + '</div>' +
                  '<div class="cell-secondary">来源类型 · ' + formatText(item.sourceType) + '</div>' +
                '</div>'
            },
            {
              html: renderCellStack(
                formatText(item.sourceOrder?.orderNo || item.sourceId),
                'sourceType · ' + formatText(item.sourceType),
                'sourceId · ' + formatText(item.sourceId)
              )
            },
            {
              html: renderCellStack(
                '开始 · ' + formatDateTime(item.startsAt),
                '到期 · ' + formatDateTime(item.expiresAt, '永不过期'),
                '更新时间 · ' + formatDateTime(item.updatedAt)
              )
            },
            {
              html:
                item.status === 'active'
                  ? '<div class="cell-actions"><button class="danger" type="button" data-entitlement-revoke="' + escapeHtml(item.id) + '">撤销授权</button></div>'
                  : '<div class="cell-actions">' + renderPill('locked', 'neutral') + '</div>',
              className: 'align-right'
            }
          ]),
          '当前还没有授权明细。'
        );
      }

      function renderEvents(items) {
        const root = document.getElementById('events-list');
        root.innerHTML = renderTableCard(
          [
            { label: '事件' },
            { label: '时间' },
            { label: '用户 / 应用' },
            { label: '上下文' },
            { label: 'Payload' }
          ],
          items.map((item) => [
            {
              html: renderCellStack(
                formatText(item.eventName),
                '产品 · ' + formatText(item.product?.code),
                '安装 · ' + formatText(item.install?.extensionInstallId)
              )
            },
            {
              html: renderCellStack(
                formatDateTime(item.eventTime),
                '创建时间 · ' + formatDateTime(item.createdAt)
              )
            },
            {
              html: renderCellStack(
                formatText(item.user?.email || item.userId),
                '应用 · ' + formatText(item.app?.code),
                '用户名称 · ' + formatText(item.user?.displayName || '-')
              )
            },
            {
              html: renderCellStack(
                'orderNo · ' + formatText(item.orderNo),
                'installId · ' + formatText(item.installId),
                'appId · ' + formatText(item.appId)
              )
            },
            {
              html:
                '<details>' +
                  '<summary class="inline-code">properties</summary>' +
                  '<pre class="json-block">' + formatJson(item.properties) + '</pre>' +
                '</details>'
            }
          ]),
          '当前还没有业务事件。'
        );
      }

      function renderWebhooks(items) {
        const root = document.getElementById('webhooks-list');
        root.innerHTML = renderTableCard(
          [
            { label: '回调' },
            { label: '状态' },
            { label: '事件号' },
            { label: '处理时间' },
            { label: 'Payload' }
          ],
          items.map((item) => [
            {
              html: renderCellStack(
                formatText(item.provider) + ' / ' + formatText(item.type),
                '来源 provider · ' + formatText(item.provider),
                '回调类型 · ' + formatText(item.type)
              )
            },
            {
              html:
                '<div class="cell-stack">' +
                  '<div class="inline-actions">' + renderPill(item.status) + '</div>' +
                  '<div class="cell-secondary">入库时间 · ' + formatDateTime(item.createdAt) + '</div>' +
                '</div>'
            },
            {
              html: renderCellStack(
                formatText(item.providerEventId),
                '记录 ID · ' + formatText(item.id)
              )
            },
            {
              html: renderCellStack(
                '已处理 · ' + formatDateTime(item.processedAt, '未处理'),
                '更新时间 · ' + formatDateTime(item.updatedAt)
              )
            },
            {
              html:
                '<details>' +
                  '<summary class="inline-code">payload</summary>' +
                  '<pre class="json-block">' + formatJson(item.payload) + '</pre>' +
                '</details>'
            }
          ]),
          '当前还没有支付回调记录。'
        );
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

      async function loadEntitlementIndex() {
        const entitlements = await api('/v1/admin/entitlements?limit=30');
        state.entitlements = entitlements.items || [];
        renderEntitlements(state.entitlements);
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

      function resetAdminState() {
        state.apps = [];
        state.products = [];
        state.plans = [];
        state.orders = [];
        state.installs = [];
        state.entitlements = [];
        state.events = [];
        state.webhooks = [];
        state.selectedOrderNo = '';

        document.getElementById('wechat-overview').textContent = hasDataScope('paymentSettings') ? '未检查' : '按需加载';
        document.getElementById('alipay-overview').textContent = hasDataScope('paymentSettings') ? '未检查' : '按需加载';
        document.getElementById('app-overview').textContent = hasDataScope('apps') ? '未检查' : '按需加载';

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

      async function loadScopedAdminData() {
        const tasks = [];

        if (hasDataScope('paymentSettings')) {
          tasks.push(
            api('/v1/admin/payment-settings').then((overview) => {
              applyOverview(overview);
            })
          );
        }

        if (hasDataScope('apps')) {
          tasks.push(
            api('/v1/admin/apps').then((apps) => {
              renderManagedApps(apps.items || []);
            })
          );
        }

        if (hasDataScope('products')) {
          tasks.push(
            api('/v1/products').then((products) => {
              state.products = products.items || [];
              if (state.apps.length) {
                syncSelectedAppEditor();
              } else {
                renderProductOptions(state.products, []);
              }
            })
          );
        }

        if (hasDataScope('plans')) {
          tasks.push(
            api('/v1/plans').then((plans) => {
              state.plans = plans.items || [];
              renderPlanOptions(state.plans);
            })
          );
        }

        if (hasDataScope('operations')) {
          tasks.push(loadAdminOperations());
        }

        if (hasDataScope('entitlements')) {
          tasks.push(loadEntitlementIndex());
        }

        if (hasDataScope('observability')) {
          tasks.push(loadObservability());
        }

        await Promise.all(tasks);
      }

      async function loadSession() {
        if (!state.token) {
          setSessionIdentity('未登录', '等待管理员会话', 'FD');
          document.getElementById('access-message').textContent = '还没有管理员会话。请先登录，或者在系统还没有 admin 的情况下先注册一个账号。';
          document.getElementById('settings-panel').classList.add('hidden');
          resetAdminState();
          return;
        }

        try {
          const me = await api('/v1/me');
          const identityLabel = me.user.displayName || me.user.email;
          const sidebarLabel = me.user.displayName ? me.user.displayName + ' · ' + me.user.email + ' · ' + me.user.role : me.user.email + ' · ' + me.user.role;
          setSessionIdentity(sidebarLabel, me.user.role === 'admin' ? 'Administrator' : me.user.role, identityLabel, identityLabel);

          if (me.user.role !== 'admin') {
            document.getElementById('settings-panel').classList.add('hidden');
            document.getElementById('access-message').textContent = '当前账号已登录，但不是 admin，不能管理支付配置。';
            return;
          }

          document.getElementById('access-message').textContent = '当前账号拥有 admin 权限，可以直接保存和清空支付配置。';
          document.getElementById('settings-panel').classList.remove('hidden');
          resetAdminState();
          await loadScopedAdminData();
        } catch (_error) {
          localStorage.removeItem('fd_core_admin_token');
          state.token = '';
          setSessionIdentity('登录已失效', '请重新登录', 'FD');
          document.getElementById('settings-panel').classList.add('hidden');
          document.getElementById('access-message').textContent = '当前登录态已失效，请重新登录。';
          resetAdminState();
        }
      }

      async function refresh() {
        applyActiveSection(state.activeSection);
        applySidebarState();
        await loadBootstrapStatus();
        await loadSession();
      }

      document.getElementById('command-trigger').addEventListener('click', () => {
        openCommandPalette('');
      });

      document.getElementById('command-backdrop').addEventListener('click', () => {
        closeCommandPalette();
      });

      document.getElementById('command-input').addEventListener('input', (event) => {
        state.commandQuery = event.target.value;
        state.activeCommandIndex = 0;
        renderCommandResults();
      });

      document.getElementById('command-input').addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setActiveCommandIndex(state.activeCommandIndex + 1);
          return;
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setActiveCommandIndex(state.activeCommandIndex - 1);
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          activateCommandByIndex(state.activeCommandIndex);
          return;
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          closeCommandPalette();
        }
      });

      document.getElementById('command-results').addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target.closest('[data-command-index]') : null;
        if (!target) {
          return;
        }

        const index = Number(target.getAttribute('data-command-index'));
        if (Number.isNaN(index)) {
          return;
        }

        activateCommandByIndex(index);
      });

      document.addEventListener('keydown', (event) => {
        const key = event.key.toLowerCase();

        if ((event.metaKey || event.ctrlKey) && key === 'k') {
          event.preventDefault();
          openCommandPalette('');
          return;
        }

        if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !isEditableTarget(event.target)) {
          event.preventDefault();
          openCommandPalette('');
          return;
        }

        if (event.key === 'Escape' && isCommandPaletteOpen()) {
          event.preventDefault();
          closeCommandPalette();
        }
      });

      document.getElementById('sidebar-toggle').addEventListener('click', () => {
        state.sidebarCollapsed = !state.sidebarCollapsed;
        localStorage.setItem('fd_core_admin_sidebar_collapsed', state.sidebarCollapsed ? '1' : '0');
        applySidebarState();
      });

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
