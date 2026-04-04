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
    groupLabel: '仪表盘',
    navTitle: '仪表盘',
    navNote: '全局指标与快捷入口',
    icon: 'DB',
    title: '仪表盘',
    lead: '查看接入应用、商品、交易和授权的整体状态，并快速进入核心后台模块。',
    href: '/admin',
    contextCards: [
      { label: '定位', value: '商业化中台', note: '统一承接应用接入、商品建模与运营管理。' },
      { label: '结构', value: '3 大分区', note: '开发接入、商品建模、运营中心各自独立。' }
    ],
    heroActions: [
      { label: '查看应用', href: '/admin/applications', tone: 'primary' },
      { label: '商品建模', href: '/admin/products', tone: 'secondary' }
    ],
    pageDataScopes: ['paymentSettings', 'apps', 'products', 'prices', 'transactions', 'authorizations'],
    commandAliases: ['dashboard', 'overview', '总览', '仪表盘', '控制台']
  },
  applications: {
    groupLabel: '开发接入',
    navTitle: '应用列表',
    navNote: '接入身份、密钥与交付配置',
    icon: 'AP',
    title: '应用列表',
    lead: '管理接入中台的软件身份，配置密钥、回调、交付方式与可售卖商品。',
    href: '/admin/applications',
    contextCards: [
      { label: '负责', value: '技术接入', note: '应用只回答“谁在接中台、怎么接入”。' },
      { label: '边界', value: '不管价格', note: '价格、授权档位和交易不在这里定义。' }
    ],
    heroActions: [
      { label: '应用列表', href: '/admin/applications', tone: 'primary' },
      { label: '商品列表', href: '/admin/products', tone: 'secondary' }
    ],
    pageDataScopes: ['apps'],
    commandAliases: ['applications', 'apps', '开发接入', '应用', '接入']
  },
  products: {
    groupLabel: '商品建模',
    navTitle: '产品',
    navNote: '对外售卖的商品目录',
    icon: 'PD',
    title: '产品',
    lead: '定义对外售卖的商品本身，维护产品档案、绑定应用，并查看价格与授权结构。',
    href: '/admin/products',
    contextCards: [
      { label: '负责', value: '卖什么', note: '产品是商业目录对象，不是技术接入对象。' },
      { label: '关联', value: '价格与授权', note: '价格方案和授权档位围绕产品展开。' }
    ],
    heroActions: [
      { label: '产品列表', href: '/admin/products', tone: 'primary' },
      { label: '价格方案', href: '/admin/pricing', tone: 'secondary' }
    ],
    pageDataScopes: ['products', 'prices'],
    commandAliases: ['products', 'catalog', '商品建模', '产品', '商品']
  },
  pricing: {
    groupLabel: '商品建模',
    navTitle: '价格方案',
    navNote: '月付、年付、买断等收费结构',
    icon: 'PR',
    title: '价格方案',
    lead: '统一查看产品的收费方式、计费周期、币种和金额，并追踪对应授权结果。',
    href: '/admin/pricing',
    contextCards: [
      { label: '负责', value: '怎么卖', note: '月付、年付、买断都在这里定义。' },
      { label: '边界', value: '不定义功能', note: '价格只决定收费，不决定底层能力实现。' }
    ],
    heroActions: [
      { label: '价格方案', href: '/admin/pricing', tone: 'primary' },
      { label: '产品列表', href: '/admin/products', tone: 'secondary' }
    ],
    pageDataScopes: ['prices', 'products'],
    commandAliases: ['pricing', '价格', '价格方案', '定价']
  },
  authorizationTemplates: {
    groupLabel: '商品建模',
    navTitle: '授权档位',
    navNote: '产品对应的授权定义',
    icon: 'AT',
    title: '授权档位',
    lead: '查看产品当前的授权档位与价格映射关系。授权档位是独立商业对象，不再作为产品编辑页的附属配置。',
    href: '/admin/authorization-templates',
    contextCards: [
      { label: '负责', value: '买完给什么', note: '授权档位定义购买后的访问级别或权益结果。' },
      { label: '边界', value: '独立对象', note: '授权档位独立管理，只负责购买后的级别结果。' }
    ],
    heroActions: [
      { label: '授权档位', href: '/admin/authorization-templates', tone: 'primary' },
      { label: '价格方案', href: '/admin/pricing', tone: 'secondary' }
    ],
    pageDataScopes: ['authorizations', 'prices', 'products'],
    commandAliases: ['authorization templates', 'authorization', '授权档位', '授权模板']
  },
  transactions: {
    groupLabel: '运营中心',
    navTitle: '交易管理',
    navNote: '订单、支付状态与补单',
    icon: 'TR',
    title: '交易管理',
    lead: '查看订单、支付状态与补单结果，串起商品购买到授权发放的交易链路。',
    href: '/admin/transactions',
    contextCards: [
      { label: '负责', value: '交易运行', note: '订单与支付异常都在这里处理。' },
      { label: '串联', value: '交易到授权', note: '订单是支付、授权和事件的中心索引。' }
    ],
    heroActions: [
      { label: '交易管理', href: '/admin/transactions', tone: 'primary' },
      { label: '支付配置', href: '/admin/settings/payments', tone: 'secondary' }
    ],
    pageDataScopes: ['transactions'],
    commandAliases: ['transactions', 'orders', 'payments', '交易', '订单', '补单']
  },
  users: {
    groupLabel: '运营中心',
    navTitle: '用户管理',
    navNote: '账号、角色与状态',
    icon: 'US',
    title: '用户管理',
    lead: '管理用户账号、角色和状态，并从运营视角追踪用户订单、授权和使用情况。',
    href: '/admin/users',
    contextCards: [
      { label: '负责', value: '账号运营', note: '统一管理注册用户、角色和账号状态。' },
      { label: '联动', value: '订单与授权', note: '用户页是排查交易和授权的入口之一。' }
    ],
    heroActions: [
      { label: '用户管理', href: '/admin/users', tone: 'primary' },
      { label: '授权管理', href: '/admin/authorizations', tone: 'secondary' }
    ],
    pageDataScopes: ['transactions'],
    commandAliases: ['users', 'accounts', '用户', '用户管理']
  },
  authorizations: {
    groupLabel: '运营中心',
    navTitle: '授权管理',
    navNote: '已发放授权的运营操作',
    icon: 'AU',
    title: '授权管理',
    lead: '查看已经发放给用户的真实授权记录，并执行补发、撤销、延期等运营操作。',
    href: '/admin/authorizations',
    contextCards: [
      { label: '负责', value: '授权结果', note: '这里看的是已发放结果，不是授权模板定义。' },
      { label: '来源', value: '订单 / 手工', note: '授权可来自支付、试用或人工发放。' }
    ],
    heroActions: [
      { label: '授权管理', href: '/admin/authorizations', tone: 'primary' },
      { label: '交易管理', href: '/admin/transactions', tone: 'secondary' }
    ],
    pageDataScopes: ['authorizations', 'transactions'],
    commandAliases: ['authorizations', '授权', '授权管理']
  },
  instances: {
    groupLabel: '运营中心',
    navTitle: '实例管理',
    navNote: '安装记录、设备与部署实例',
    icon: 'IN',
    title: '实例管理',
    lead: '查看软件装在哪、激活在哪、部署在哪，用于设备约束、交付排查和实例运营。',
    href: '/admin/instances',
    contextCards: [
      { label: '负责', value: '运行实例', note: '实例管理关注软件的实际安装和部署位置。' },
      { label: '关联', value: '用户与应用', note: '实例可帮助排查授权、设备和交付问题。' }
    ],
    heroActions: [
      { label: '实例管理', href: '/admin/instances', tone: 'primary' },
      { label: '应用列表', href: '/admin/applications', tone: 'secondary' }
    ],
    pageDataScopes: ['instances', 'apps'],
    commandAliases: ['instances', 'installs', 'deployments', '实例', '安装实例']
  },
  events: {
    groupLabel: '运营中心',
    navTitle: '事件管理',
    navNote: '业务事件流与上下文',
    icon: 'EV',
    title: '事件管理',
    lead: '查看业务事件流、用户行为和应用上报事件，作为运营审计与问题定位的依据。',
    href: '/admin/events',
    contextCards: [
      { label: '负责', value: '业务事件', note: '聚焦业务动作、授权链路和运行事件。' },
      { label: '用途', value: '排查与审计', note: '可按用户、产品、实例串联事件上下文。' }
    ],
    heroActions: [
      { label: '事件管理', href: '/admin/events', tone: 'primary' },
      { label: '日志管理', href: '/admin/logs', tone: 'secondary' }
    ],
    pageDataScopes: ['events', 'transactions'],
    commandAliases: ['events', '事件', '事件管理']
  },
  logs: {
    groupLabel: '运营中心',
    navTitle: '日志管理',
    navNote: '支付回调与处理日志',
    icon: 'LG',
    title: '日志管理',
    lead: '查看系统当前可用的回调与处理日志。现阶段优先承接支付回调日志，后续可继续扩展系统日志源。',
    href: '/admin/logs',
    contextCards: [
      { label: '负责', value: '系统日志', note: '先收敛支付回调与处理日志，后续扩展更多来源。' },
      { label: '用途', value: '运维排障', note: '回调日志可用于追踪支付链路异常。' }
    ],
    heroActions: [
      { label: '日志管理', href: '/admin/logs', tone: 'primary' },
      { label: '事件管理', href: '/admin/events', tone: 'secondary' }
    ],
    pageDataScopes: ['logs'],
    commandAliases: ['logs', 'webhooks', 'billing webhooks', '日志', '日志管理', '回调日志']
  },
  paymentSettings: {
    groupLabel: '系统设置',
    navTitle: '支付配置',
    navNote: '微信支付、支付宝通道',
    icon: 'PM',
    title: '支付配置',
    lead: '配置微信支付和支付宝的通道凭证与参数，作为交易能力的系统级基础设施。',
    href: '/admin/settings/payments',
    contextCards: [
      { label: '负责', value: '基础设施', note: '支付配置属于系统设置，不属于商品建模。' },
      { label: '安全', value: '加密存储', note: '支付敏感字段默认以脱敏方式展示。' }
    ],
    heroActions: [
      { label: '支付配置', href: '/admin/settings/payments', tone: 'primary' },
      { label: '交易管理', href: '/admin/transactions', tone: 'secondary' }
    ],
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
