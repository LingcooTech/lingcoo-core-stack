// Migrated from src/modules/admin/ui-foundation.ts
// Pure metadata, no HTML rendering functions

export type AdminSectionKey = 'dashboard' | 'payments' | 'apps' | 'licenses' | 'operations' | 'observability';

export type AdminSectionDataScope =
  | 'paymentSettings'
  | 'apps'
  | 'products'
  | 'plans'
  | 'entitlements'
  | 'operations'
  | 'observability';

interface AdminSectionCard {
  label: string;
  value: string;
  note: string;
}

interface AdminSectionAction {
  label: string;
  href: string;
  tone: 'primary' | 'secondary';
  external?: boolean;
  shortcut?: string;
}

interface AdminSectionMeta {
  groupLabel: string;
  navTitle: string;
  navNote: string;
  icon: string;
  title: string;
  lead: string;
  href: string;
  contextCards: [AdminSectionCard, AdminSectionCard];
  heroActions: AdminSectionAction[];
  pageDataScopes: AdminSectionDataScope[];
  commandAliases: string[];
}

export interface AdminNavigationGroup {
  label: string;
  items: AdminSectionKey[];
}

export interface AdminCommandItem {
  id: string;
  label: string;
  note: string;
  href: string;
  icon: string;
  group: string;
  external?: boolean;
  sectionKey?: AdminSectionKey;
  keywords: string[];
  shortcut?: string;
}

export const adminSectionMeta: Record<AdminSectionKey, AdminSectionMeta> = {
  dashboard: {
    groupLabel: 'Dashboards',
    navTitle: '总览',
    navNote: '系统状态与关键入口',
    icon: 'DB',
    title: '管理后台',
    lead: '把支付、应用、授权、运营和观测放进统一的资源壳层里，用一套导航、表格和状态语言管理整个中台。',
    href: '/admin',
    contextCards: [
      { label: 'Mode', value: 'Resource Shell', note: '后台先建立稳定壳层，再往里面填资源页。' },
      { label: 'Route', value: '/admin', note: '所有后台页共享同一套布局、表格和交互基线。' }
    ],
    heroActions: [
      { label: '资源总览', href: '/admin', tone: 'primary' },
      { label: 'API 文档', href: '/docs', tone: 'secondary', external: true, shortcut: 'docs' }
    ],
    pageDataScopes: ['paymentSettings', 'apps', 'products', 'plans', 'operations', 'observability'],
    commandAliases: ['dashboard', 'overview', '总览', '控制台', 'metrics']
  },
  payments: {
    groupLabel: 'Resources',
    navTitle: '支付',
    navNote: '微信支付、支付宝配置',
    icon: 'PM',
    title: '支付配置',
    lead: '支付页只处理通道配置、启用状态和支付能力，不再混入运营、授权或应用接入数据。',
    href: '/admin/payments',
    contextCards: [
      { label: 'Focus', value: 'Provider Setup', note: '支付表单按 provider 拆分，状态与来源统一显示。' },
      { label: 'Route', value: '/admin/payments', note: '支付页继续复用同一个 shell，不再做独立风格。' }
    ],
    heroActions: [
      { label: '支付资源', href: '/admin/payments', tone: 'primary' },
      { label: '返回总览', href: '/admin', tone: 'secondary' }
    ],
    pageDataScopes: ['paymentSettings'],
    commandAliases: ['payments', 'billing settings', 'wechat', 'alipay', '支付配置']
  },
  apps: {
    groupLabel: 'Resources',
    navTitle: '应用',
    navNote: '接入应用与 App Secret',
    icon: 'AP',
    title: '应用接入',
    lead: '应用页负责接入清单、产品绑定和 Secret 管理，后续可以自然扩成一个标准资源列表。',
    href: '/admin/apps',
    contextCards: [
      { label: 'Focus', value: 'Registry + Secret', note: '应用元数据和 Secret 生命周期放在同一资源域里。' },
      { label: 'Route', value: '/admin/apps', note: '后续应用资源应继续向列表页、详情页和操作页拆分。' }
    ],
    heroActions: [
      { label: '应用索引', href: '/admin/apps', tone: 'primary' },
      { label: '返回总览', href: '/admin', tone: 'secondary' }
    ],
    pageDataScopes: ['apps', 'products'],
    commandAliases: ['apps', 'app secrets', 'registry', '应用接入', 'secret']
  },
  licenses: {
    groupLabel: 'Resources',
    navTitle: '授权',
    navNote: '人工授权与 entitlement',
    icon: 'LC',
    title: '授权管理',
    lead: '授权页承接 entitlement 的发放、撤销和核对，应该保持资源视角，而不是散落在支付或运营页里。',
    href: '/admin/licenses',
    contextCards: [
      { label: 'Focus', value: 'Entitlement Ops', note: '授权动作和授权明细共用统一状态语言。' },
      { label: 'Route', value: '/admin/licenses', note: '更接近 Nova 的资源索引页组织方式。' }
    ],
    heroActions: [
      { label: '授权索引', href: '/admin/licenses', tone: 'primary' },
      { label: '返回总览', href: '/admin', tone: 'secondary' }
    ],
    pageDataScopes: ['plans', 'entitlements'],
    commandAliases: ['licenses', 'entitlements', 'grant', '授权', '人工授权']
  },
  operations: {
    groupLabel: 'Operations',
    navTitle: '运营',
    navNote: '订单、安装与补单排障',
    icon: 'OP',
    title: '运营台',
    lead: '运营页优先使用高密度列表、筛选和详情抽屉式信息，避免把订单和安装信息做成低密度卡片墙。',
    href: '/admin/operations',
    contextCards: [
      { label: 'Focus', value: 'Dense Lists', note: '订单和安装实例优先走表格，再配详情面板。' },
      { label: 'Route', value: '/admin/operations', note: '这里是最需要向 Nova 靠拢的页面类型。' }
    ],
    heroActions: [
      { label: '订单运营', href: '/admin/operations', tone: 'primary' },
      { label: '返回总览', href: '/admin', tone: 'secondary' }
    ],
    pageDataScopes: ['operations'],
    commandAliases: ['operations', 'orders', 'installs', '运营', '订单']
  },
  observability: {
    groupLabel: 'Operations',
    navTitle: '观测',
    navNote: '事件流与支付回调',
    icon: 'EV',
    title: '事件与观测',
    lead: '观测页展示事件流和回调记录，重点是时间、来源、状态和 payload 的快速浏览，不是展示型卡片。',
    href: '/admin/observability',
    contextCards: [
      { label: 'Focus', value: 'Event Review', note: '事件与回调更适合审查式列表，而不是说明型布局。' },
      { label: 'Route', value: '/admin/observability', note: '同样复用资源壳层和数据表格基建。' }
    ],
    heroActions: [
      { label: '事件索引', href: '/admin/observability', tone: 'primary' },
      { label: '返回总览', href: '/admin', tone: 'secondary' }
    ],
    pageDataScopes: ['observability'],
    commandAliases: ['observability', 'events', 'webhooks', '观测', '事件']
  }
};

export const adminNavigationGroups: AdminNavigationGroup[] = [
  { label: 'Dashboards', items: ['dashboard'] },
  { label: 'Resources', items: ['payments', 'apps', 'licenses'] },
  { label: 'Operations', items: ['operations', 'observability'] }
];

export const adminCommandItems: AdminCommandItem[] = [
  ...Object.entries(adminSectionMeta).map(([sectionKey, meta]) => ({
    id: `section:${sectionKey}`,
    label: meta.title,
    note: meta.navNote,
    href: meta.href,
    icon: meta.icon,
    group: meta.groupLabel,
    sectionKey: sectionKey as AdminSectionKey,
    keywords: [meta.title, meta.navTitle, meta.navNote, meta.groupLabel, ...meta.commandAliases],
    shortcut: meta.href.replace('/admin', '') || '/admin'
  })),
  {
    id: 'global:docs',
    label: 'API 文档',
    note: '查看当前服务 API 文档和调试入口',
    href: '/docs',
    icon: 'DC',
    group: 'Quick Links',
    external: true,
    keywords: ['docs', 'swagger', 'api', '文档']
  },
  {
    id: 'global:status',
    label: '系统状态',
    note: '返回系统状态与公共首页',
    href: '/',
    icon: 'ST',
    group: 'Quick Links',
    keywords: ['status', 'home', '首页', '健康检查']
  }
];
