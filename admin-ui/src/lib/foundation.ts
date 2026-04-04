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
    navTitle: '产品中心',
    navNote: '产品、方案、销售与交付工作台',
    icon: 'CT',
    title: '产品中心',
    lead: '一个产品就是一个对外售卖、授权和交付的主体。在这里统一管理能力、授权方案、销售展示和交付入口。',
    href: '/admin/products',
    contextCards: [
      { label: '主体', value: 'Product', note: '后台主心智已经收敛到产品，而不是应用。' },
      { label: '覆盖', value: '销售与交付', note: '能力项、授权方案、展示入口和交付声明都围绕产品管理。' }
    ],
    heroActions: [
      { label: '产品中心', href: '/admin/products', tone: 'primary' },
      { label: '支付配置', href: '/admin/payments', tone: 'secondary' }
    ],
    pageDataScopes: ['products', 'plans'],
    commandAliases: ['catalog', 'products', '产品中心', '产品', '方案', '工作台']
  },
  apps: {
    groupLabel: '商品管理',
    navTitle: '内部档案',
    navNote: '兼容旧模型的内部实现记录',
    icon: 'AP',
    title: '内部档案',
    lead: '兼容旧模型的内部实现记录，正常情况下不再作为管理员主操作入口。',
    href: '/admin/products',
    contextCards: [
      { label: '用途', value: '兼容层', note: '旧 app 记录已退居内部实现，不再作为主操作对象。' },
      { label: '模式', value: '统一产品流', note: '产品信息、授权方案和交付声明统一在产品中心维护。' }
    ],
    heroActions: [
      { label: '产品中心', href: '/admin/products', tone: 'primary' },
      { label: '支付配置', href: '/admin/payments', tone: 'secondary' }
    ],
    pageDataScopes: ['apps', 'products'],
    commandAliases: ['apps', 'applications', '内部档案', '兼容层']
  },
  secrets: {
    groupLabel: '商品管理',
    navTitle: '已停用',
    navNote: '接入密钥模式已弃用',
    icon: 'SK',
    title: '已停用',
    lead: '当前产品统一采用用户 JWT + entitlement 模型控制授权，接入密钥入口已停用。',
    href: '/admin/products',
    contextCards: [
      { label: '状态', value: 'Deprecated', note: '保留此 section 仅用于兼容历史命令与跳转。' },
      { label: '替代', value: 'JWT + entitlement', note: '授权控制统一通过用户登录态和 entitlement 处理。' }
    ],
    heroActions: [
      { label: '产品中心', href: '/admin/products', tone: 'primary' },
      { label: '返回总览', href: '/admin', tone: 'secondary' }
    ],
    pageDataScopes: ['apps'],
    commandAliases: ['deprecated', 'legacy', '已停用']
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
    navTitle: '产品交付配置',
    navNote: '交付变量、实例参数与部署预设',
    icon: 'DL',
    title: '产品交付配置',
    lead: '按产品管理交付变量、部署预设和实例所需的覆盖值。',
    href: '/admin/delivery',
    contextCards: [
      { label: '用途', value: '交付配置', note: '配置后用户可通过部署中心一键安装产品。' },
      { label: '范围', value: '可交付产品', note: '仅适用于需要在线访问、自行安装或一键部署的产品。' }
    ],
    heroActions: [
      { label: '产品交付配置', href: '/admin/delivery', tone: 'primary' },
      { label: '产品中心', href: '/admin/products', tone: 'secondary' }
    ],
    pageDataScopes: ['delivery'],
    commandAliases: ['delivery', 'deploy', 'installer', '部署配置', '交付', '产品交付']
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
  { label: '商品管理', items: ['catalog'] },
  { label: '交易管理', items: ['orders', 'payments'] },
  { label: '客户管理', items: ['users', 'licenses', 'installs'] },
  { label: '运维', items: ['observability'] }
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
