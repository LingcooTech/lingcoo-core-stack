export type AdminSectionKey =
  | 'dashboard'
  | 'applications'
  | 'products'
  | 'pricing'
  | 'authorizationTemplates'
  | 'transactions'
  | 'users'
  | 'authorizations'
  | 'instances'
  | 'events'
  | 'logs'
  | 'paymentSettings';

export type AdminSectionDataScope =
  | 'paymentSettings'
  | 'apps'
  | 'products'
  | 'prices'
  | 'authorizations'
  | 'transactions'
  | 'instances'
  | 'events'
  | 'logs';

interface AdminSectionMeta {
  groupLabel: string;
  navTitle: string;
  navNote: string;
  icon: string;
  title: string;
  href: string;
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
    groupLabel: '仪表盘',
    navTitle: '仪表盘',
    navNote: '全局指标与快捷入口',
    icon: 'DB',
    title: '仪表盘',
    href: '/admin',
    pageDataScopes: ['paymentSettings', 'apps', 'products', 'prices', 'transactions', 'authorizations'],
    commandAliases: ['dashboard', 'overview', '总览', '仪表盘', '控制台']
  },
  applications: {
    groupLabel: '开发接入',
    navTitle: '应用列表',
    navNote: '接入身份、密钥与交付配置',
    icon: 'AP',
    title: '应用列表',
    href: '/admin/applications',
    pageDataScopes: ['apps'],
    commandAliases: ['applications', 'apps', '开发接入', '应用', '接入']
  },
  products: {
    groupLabel: '商品建模',
    navTitle: '产品',
    navNote: '对外售卖的商品目录',
    icon: 'PD',
    title: '产品',
    href: '/admin/products',
    pageDataScopes: ['products', 'prices'],
    commandAliases: ['products', 'catalog', '商品建模', '产品', '商品']
  },
  pricing: {
    groupLabel: '商品建模',
    navTitle: '价格方案',
    navNote: '月付、年付、买断等收费结构',
    icon: 'PR',
    title: '价格方案',
    href: '/admin/pricing',
    pageDataScopes: ['prices', 'products'],
    commandAliases: ['pricing', '价格', '价格方案', '定价']
  },
  authorizationTemplates: {
    groupLabel: '商品建模',
    navTitle: '授权档位',
    navNote: '产品对应的授权定义',
    icon: 'AT',
    title: '授权档位',
    href: '/admin/authorization-templates',
    pageDataScopes: ['authorizations', 'prices', 'products'],
    commandAliases: ['authorization templates', 'authorization', '授权档位', '授权模板']
  },
  transactions: {
    groupLabel: '运营中心',
    navTitle: '交易管理',
    navNote: '订单、支付状态与补单',
    icon: 'TR',
    title: '交易管理',
    href: '/admin/transactions',
    pageDataScopes: ['transactions'],
    commandAliases: ['transactions', 'orders', 'payments', '交易', '订单', '补单']
  },
  users: {
    groupLabel: '运营中心',
    navTitle: '用户管理',
    navNote: '账号、角色与状态',
    icon: 'US',
    title: '用户管理',
    href: '/admin/users',
    pageDataScopes: ['transactions'],
    commandAliases: ['users', 'accounts', '用户', '用户管理']
  },
  authorizations: {
    groupLabel: '运营中心',
    navTitle: '授权管理',
    navNote: '已发放授权的运营操作',
    icon: 'AU',
    title: '授权管理',
    href: '/admin/authorizations',
    pageDataScopes: ['authorizations', 'transactions'],
    commandAliases: ['authorizations', '授权', '授权管理']
  },
  instances: {
    groupLabel: '运营中心',
    navTitle: '实例管理',
    navNote: '安装记录、设备与部署实例',
    icon: 'IN',
    title: '实例管理',
    href: '/admin/instances',
    pageDataScopes: ['instances', 'apps'],
    commandAliases: ['instances', 'installs', 'deployments', '实例', '安装实例']
  },
  events: {
    groupLabel: '运营中心',
    navTitle: '事件管理',
    navNote: '业务事件流与上下文',
    icon: 'EV',
    title: '事件管理',
    href: '/admin/events',
    pageDataScopes: ['events', 'transactions'],
    commandAliases: ['events', '事件', '事件管理']
  },
  logs: {
    groupLabel: '运营中心',
    navTitle: '日志管理',
    navNote: '支付回调与处理日志',
    icon: 'LG',
    title: '日志管理',
    href: '/admin/logs',
    pageDataScopes: ['logs'],
    commandAliases: ['logs', 'webhooks', 'billing webhooks', '日志', '日志管理', '回调日志']
  },
  paymentSettings: {
    groupLabel: '系统设置',
    navTitle: '支付配置',
    navNote: '微信支付、支付宝通道',
    icon: 'PM',
    title: '支付配置',
    href: '/admin/settings/payments',
    pageDataScopes: ['paymentSettings'],
    commandAliases: ['payment settings', 'payments', 'billing', '支付配置', '微信支付', '支付宝']
  }
};

export const adminNavigationGroups: AdminNavigationGroup[] = [
  { label: '仪表盘', items: ['dashboard'] },
  { label: '开发接入', items: ['applications'] },
  { label: '商品建模', items: ['products', 'pricing', 'authorizationTemplates'] },
  { label: '运营中心', items: ['transactions', 'users', 'authorizations', 'instances', 'events', 'logs'] },
  { label: '系统设置', items: ['paymentSettings'] }
];

export function resolveAdminSectionKey(pathname: string): AdminSectionKey | undefined {
  const matches = Object.entries(adminSectionMeta)
    .filter(([, meta]) => pathname === meta.href || pathname.startsWith(meta.href + '/'))
    .sort((left, right) => right[1].href.length - left[1].href.length);

  return matches[0]?.[0] as AdminSectionKey | undefined;
}

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
    note: '查看 API 文档和调试入口',
    href: '/docs',
    icon: 'DC',
    group: '快捷入口',
    external: true,
    keywords: ['docs', 'swagger', 'api', '文档']
  },
  {
    id: 'global:status',
    label: '系统状态',
    note: '查看系统状态与公共首页',
    href: '/',
    icon: 'ST',
    group: '快捷入口',
    keywords: ['status', 'home', '首页', '健康检查']
  }
];
