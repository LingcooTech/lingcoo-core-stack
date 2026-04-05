export type AdminSectionKey =
  | 'dashboard'
  | 'catalog'
  | 'apps'
  | 'secrets'
  | 'orders'
  | 'payments'
  | 'users'
  | 'licenses'
  | 'installs'
  | 'delivery'
  | 'observability';

export type AdminSectionDataScope =
  | 'paymentSettings'
  | 'apps'
  | 'products'
  | 'delivery'
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
    groupLabel: '概览',
    navTitle: '仪表盘',
    navNote: '系统概况与快捷入口',
    icon: 'DB',
    title: '管理后台',
    lead: '查看系统关键指标、支付通道状态和最近订单。',
    href: '/admin',
    contextCards: [
      { label: '模式', value: '资源管理', note: '统一管理商品、交易、客户和运维资源。' },
      { label: '路由', value: '/admin', note: '所有管理页面共享统一的布局和交互基线。' }
    ],
    heroActions: [
      { label: '资源总览', href: '/admin', tone: 'primary' },
      { label: 'API 文档', href: '/docs', tone: 'secondary', external: true, shortcut: 'docs' }
    ],
    pageDataScopes: ['paymentSettings', 'apps', 'products', 'plans', 'operations', 'observability'],
    commandAliases: ['dashboard', 'overview', '总览', '仪表盘', '控制台']
  },
  catalog: {
    groupLabel: '商品管理',
    navTitle: '产品目录',
    navNote: '产品、功能项与套餐定义',
    icon: 'CT',
    title: '产品目录',
    lead: '定义可售卖的产品，配置功能项和套餐价格。',
    href: '/admin/catalog',
    contextCards: [
      { label: '用途', value: '商品定义', note: '产品是授权和交易的基础单元。' },
      { label: '关联', value: '应用绑定', note: '产品通过应用管理页绑定到具体应用。' }
    ],
    heroActions: [
      { label: '产品目录', href: '/admin/catalog', tone: 'primary' },
      { label: '应用管理', href: '/admin/apps', tone: 'secondary' }
    ],
    pageDataScopes: ['products', 'plans'],
    commandAliases: ['catalog', 'products', '产品目录', '产品', '套餐']
  },
  apps: {
    groupLabel: '商品管理',
    navTitle: '应用管理',
    navNote: '应用注册与售卖方案配置',
    icon: 'AP',
    title: '应用管理',
    lead: '管理应用注册信息、绑定产品和配置售卖方案。',
    href: '/admin/apps',
    contextCards: [
      { label: '用途', value: '渠道配置', note: '应用是面向用户的入口，绑定产品后可售卖。' },
      { label: '密钥', value: '应用密钥', note: '通过密钥管理页为应用签发 API 密钥。' }
    ],
    heroActions: [
      { label: '应用管理', href: '/admin/apps', tone: 'primary' },
      { label: '应用密钥', href: '/admin/secrets', tone: 'secondary' }
    ],
    pageDataScopes: ['apps', 'products'],
    commandAliases: ['apps', 'applications', '应用管理', '应用']
  },
  secrets: {
    groupLabel: '商品管理',
    navTitle: '应用密钥',
    navNote: '生成与管理 API 密钥',
    icon: 'SK',
    title: '应用密钥',
    lead: '为应用生成 API 密钥，管理密钥生命周期。',
    href: '/admin/secrets',
    contextCards: [
      { label: '用途', value: '身份认证', note: '应用通过密钥访问中台 API。' },
      { label: '安全', value: '一次性显示', note: '密钥仅在创建时显示一次，请妥善保存。' }
    ],
    heroActions: [
      { label: '密钥管理', href: '/admin/secrets', tone: 'primary' },
      { label: '应用管理', href: '/admin/apps', tone: 'secondary' }
    ],
    pageDataScopes: ['apps'],
    commandAliases: ['secrets', 'keys', 'api keys', '密钥', '应用密钥']
  },
  orders: {
    groupLabel: '交易管理',
    navTitle: '订单管理',
    navNote: '订单查询与补单操作',
    icon: 'OD',
    title: '订单管理',
    lead: '查看订单详情、支付记录，处理异常订单。',
    href: '/admin/orders',
    contextCards: [
      { label: '用途', value: '交易追踪', note: '订单连接支付与授权的完整链路。' },
      { label: '操作', value: '补单同步', note: '可手动同步支付状态，处理异常订单。' }
    ],
    heroActions: [
      { label: '订单管理', href: '/admin/orders', tone: 'primary' },
      { label: '支付配置', href: '/admin/payments', tone: 'secondary' }
    ],
    pageDataScopes: ['operations'],
    commandAliases: ['orders', '订单', '订单管理', '补单']
  },
  payments: {
    groupLabel: '交易管理',
    navTitle: '支付配置',
    navNote: '微信支付、支付宝通道',
    icon: 'PM',
    title: '支付配置',
    lead: '配置微信支付和支付宝的通道凭证与参数。',
    href: '/admin/payments',
    contextCards: [
      { label: '用途', value: '通道配置', note: '配置支付通道后即可在售卖方案中使用。' },
      { label: '安全', value: '加密存储', note: '支付凭证加密后存储在数据库中。' }
    ],
    heroActions: [
      { label: '支付配置', href: '/admin/payments', tone: 'primary' },
      { label: '返回总览', href: '/admin', tone: 'secondary' }
    ],
    pageDataScopes: ['paymentSettings'],
    commandAliases: ['payments', 'billing', 'wechat', 'alipay', '支付配置', '微信支付']
  },
  users: {
    groupLabel: '客户管理',
    navTitle: '用户管理',
    navNote: '用户账号、角色与状态管理',
    icon: 'US',
    title: '用户管理',
    lead: '查看和管理所有注册用户，修改角色和状态。',
    href: '/admin/users',
    contextCards: [
      { label: '用途', value: '用户管理', note: '管理用户账号、角色和状态。' },
      { label: '操作', value: '角色与状态', note: '可调整用户角色、停用或激活账号。' }
    ],
    heroActions: [
      { label: '用户管理', href: '/admin/users', tone: 'primary' },
      { label: '授权管理', href: '/admin/licenses', tone: 'secondary' }
    ],
    pageDataScopes: ['operations'],
    commandAliases: ['users', '用户', '用户管理', '账号']
  },
  licenses: {
    groupLabel: '客户管理',
    navTitle: '授权管理',
    navNote: '发放与撤销用户授权',
    icon: 'LC',
    title: '授权管理',
    lead: '手动发放授权、查看授权记录、撤销失效授权。',
    href: '/admin/licenses',
    contextCards: [
      { label: '用途', value: '授权管理', note: '授权是用户使用产品功能的凭证。' },
      { label: '来源', value: '多种途径', note: '授权可来自订单支付或管理员手动发放。' }
    ],
    heroActions: [
      { label: '授权管理', href: '/admin/licenses', tone: 'primary' },
      { label: '返回总览', href: '/admin', tone: 'secondary' }
    ],
    pageDataScopes: ['plans', 'entitlements'],
    commandAliases: ['licenses', 'entitlements', 'grant', '授权', '授权管理']
  },
  installs: {
    groupLabel: '客户管理',
    navTitle: '安装实例',
    navNote: '应用安装记录与设备信息',
    icon: 'IN',
    title: '安装实例',
    lead: '查看应用的安装记录、设备信息和使用状态。',
    href: '/admin/installs',
    contextCards: [
      { label: '用途', value: '实例追踪', note: '跟踪应用的实际安装和使用情况。' },
      { label: '数据', value: '设备指纹', note: '记录设备信息用于安装去重和统计。' }
    ],
    heroActions: [
      { label: '安装实例', href: '/admin/installs', tone: 'primary' },
      { label: '授权管理', href: '/admin/licenses', tone: 'secondary' }
    ],
    pageDataScopes: ['operations'],
    commandAliases: ['installs', 'installations', '安装', '安装实例']
  },
  delivery: {
    groupLabel: '运维',
    navTitle: '部署配置',
    navNote: '部署源、凭证与版本配置',
    icon: 'DL',
    title: '部署配置',
    lead: '配置系统产品的安装源、镜像、凭证和组件版本。',
    href: '/admin/delivery',
    contextCards: [
      { label: '用途', value: '交付配置', note: '配置后用户可通过部署中心一键安装。' },
      { label: '范围', value: '系统产品', note: '仅适用于 Web 应用和系统服务类产品。' }
    ],
    heroActions: [
      { label: '部署配置', href: '/admin/delivery', tone: 'primary' },
      { label: '返回总览', href: '/admin', tone: 'secondary' }
    ],
    pageDataScopes: ['delivery'],
    commandAliases: ['delivery', 'deploy', 'installer', '部署配置', '交付']
  },
  observability: {
    groupLabel: '运维',
    navTitle: '事件日志',
    navNote: '事件流与支付回调记录',
    icon: 'EV',
    title: '事件日志',
    lead: '查看系统事件流和支付回调记录，用于排查和审计。',
    href: '/admin/observability',
    contextCards: [
      { label: '用途', value: '事件审计', note: '记录关键业务操作和支付回调。' },
      { label: '数据', value: '事件与回调', note: '包含系统事件和支付渠道的回调记录。' }
    ],
    heroActions: [
      { label: '事件日志', href: '/admin/observability', tone: 'primary' },
      { label: '返回总览', href: '/admin', tone: 'secondary' }
    ],
    pageDataScopes: ['observability'],
    commandAliases: ['observability', 'events', 'webhooks', '事件日志', '事件']
  }
};

export const adminNavigationGroups: AdminNavigationGroup[] = [
  { label: '概览', items: ['dashboard'] },
  { label: '商品管理', items: ['catalog', 'apps'] },
  { label: '交易管理', items: ['orders', 'payments'] },
  { label: '客户管理', items: ['users', 'licenses', 'installs'] },
  { label: '运维', items: ['delivery', 'observability'] }
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
