export type AdminSectionKey =
  | 'storage'
  | 'dashboard'
  | 'apps'
  | 'content'
  | 'docs'
  | 'secrets'
  | 'orders'
  | 'payments'
  | 'settings'
  | 'users'
  | 'licenses'
  | 'deployments'
  | 'servers'
  | 'hosting'
  | 'installs'
  | 'tickets'
  | 'notifications'
  | 'observability';

export type AdminSectionDataScope =
  | 'paymentSettings'
  | 'systemSettings'
  | 'apps'
  | 'plans'
  | 'entitlements'
  | 'operations'
  | 'observability';

export type AdminSectionPermission =
  | 'storage.read'
  | 'dashboard.view'
  | 'apps.manage'
  | 'content.manage'
  | 'docs.manage'
  | 'orders.view'
  | 'payments.manage'
  | 'settings.manage'
  | 'users.view'
  | 'licenses.manage'
  | 'deployments.view'
  | 'installs.view'
  | 'tickets.manage'
  | 'notifications.manage'
  | 'observability.view';

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
  /** Lucide 图标组件名，通过 section-icons.tsx 的 resolveIcon() 渲染 */
  icon: string;
  permission: AdminSectionPermission;
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

export function resolveAdminSection(pathname: string): AdminSectionKey | undefined {
  const matches = (
    Object.entries(adminSectionMeta) as Array<[AdminSectionKey, AdminSectionMeta]>
  ).filter(([, meta]) => pathname === meta.href || pathname.startsWith(`${meta.href}/`));

  if (matches.length === 0) {
    return undefined;
  }

  matches.sort((left, right) => right[1].href.length - left[1].href.length);
  return matches[0]?.[0];
}

export function listAllowedAdminSectionKeys(
  canAccess: (permission: AdminSectionPermission) => boolean,
): AdminSectionKey[] {
  return (Object.entries(adminSectionMeta) as Array<[AdminSectionKey, AdminSectionMeta]>)
    .filter(([, meta]) => canAccess(meta.permission))
    .map(([key]) => key);
}

export const adminSectionMeta: Record<AdminSectionKey, AdminSectionMeta> = {
  storage: {
    groupLabel: '内容管理',
    navTitle: '云存储',
    navNote: '营销素材',
    icon: 'FolderOpen',
    permission: 'storage.read',
    title: '云存储 · 营销素材',
    lead: '统一管理图片、文档和文本，支持文件夹、版本与引用保护',
    href: '/admin/storage',
    contextCards: [
      { label: '存储', value: 'S3 兼容', note: '七牛等对象存储' },
      { label: '素材', value: '统一管理', note: '稳定地址与内容版本' },
    ],
    heroActions: [],
    pageDataScopes: [],
    commandAliases: ['storage', '云存储', '营销素材'],
  },
  deployments: {
    groupLabel: '客户管理',
    navTitle: '应用部署',
    navNote: '交付台账',
    icon: 'Boxes',
    permission: 'deployments.view',
    title: '应用部署',
    lead: '统一追踪客户自有服务器与平台托管的交付记录',
    href: '/admin/deployments',
    contextCards: [
      { label: '自有服务器', value: '交付追踪', note: '客户自行维护服务器' },
      { label: '平台托管', value: '托管运维', note: '由平台管理运行服务' },
    ],
    heroActions: [],
    pageDataScopes: [],
    commandAliases: ['deployments', '应用部署', '交付台账'],
  },
  servers: {
    groupLabel: '资源',
    navTitle: '服务器资源',
    navNote: '接入、容量与健康',
    icon: 'Server',
    permission: 'settings.manage',
    title: '服务器资源',
    lead: '',
    href: '/admin/servers',
    contextCards: [
      { label: '接入', value: '节点代理', note: '认证上报后显示实际资源' },
      { label: '容量', value: '声明与预留', note: '按应用版本规格分配' },
    ],
    heroActions: [],
    pageDataScopes: [],
    commandAliases: ['servers', '服务器', '资源池'],
  },
  hosting: {
    groupLabel: '运维',
    navTitle: '托管运维',
    navNote: '实例、备份与恢复',
    icon: 'Server',
    permission: 'settings.manage',
    title: '托管运维',
    lead: '管理托管实例、备份与运维任务',
    href: '/admin/hosting',
    contextCards: [
      { label: '节点', value: '健康上报', note: '超过 5 分钟的报告不参与分配' },
      { label: '容量', value: '并发预留', note: '按应用规格分配资源' },
    ],
    heroActions: [],
    pageDataScopes: [],
    commandAliases: ['hosting', '托管', '运维'],
  },
  dashboard: {
    groupLabel: '概览',
    navTitle: '仪表盘',
    navNote: '',
    icon: 'LayoutDashboard',
    permission: 'dashboard.view',
    title: '管理后台',
    lead: '',
    href: '/admin',
    contextCards: [
      { label: '模式', value: '资源管理', note: '统一管理商品、交易、客户和运维资源。' },
      { label: '路由', value: '/admin', note: '所有管理页面共享统一的布局和交互基线。' },
    ],
    heroActions: [
      { label: '资源总览', href: '/admin', tone: 'primary' },
      { label: 'API 文档', href: '/api-docs', tone: 'secondary', external: true, shortcut: 'docs' },
    ],
    pageDataScopes: ['paymentSettings', 'apps', 'plans', 'operations', 'observability'],
    commandAliases: ['dashboard', 'overview', '总览', '仪表盘', '控制台'],
  },
  apps: {
    groupLabel: '应用管理',
    navTitle: '应用管理',
    navNote: '',
    icon: 'Package',
    permission: 'apps.manage',
    title: '应用管理',
    lead: '',
    href: '/admin/apps',
    contextCards: [
      { label: '用途', value: '应用配置', note: '应用是授权和交易的核心单元。' },
      { label: '密钥', value: '应用密钥', note: '通过密钥管理页为应用签发 API 密钥。' },
    ],
    heroActions: [
      { label: '应用管理', href: '/admin/apps', tone: 'primary' },
      { label: '应用密钥', href: '/admin/secrets', tone: 'secondary' },
    ],
    pageDataScopes: ['apps', 'plans'],
    commandAliases: ['apps', 'applications', '应用管理', '应用', '产品', '套餐'],
  },
  content: {
    groupLabel: '内容管理',
    navTitle: '内容管理',
    navNote: '',
    icon: 'FileText',
    permission: 'content.manage',
    title: '内容管理',
    lead: '',
    href: '/admin/content',
    contextCards: [
      { label: '用途', value: '内容运营', note: '统一管理文章、教程、观点和导入内容。' },
      { label: '来源', value: '多源导入', note: '支持 WordPress、Notion 与微信公众号内容导入。' },
    ],
    heroActions: [
      { label: '内容管理', href: '/admin/content', tone: 'primary' },
      { label: '应用管理', href: '/admin/apps', tone: 'secondary' },
    ],
    pageDataScopes: ['operations'],
    commandAliases: ['content', 'cms', 'blog', 'posts', '文章', '内容', '内容管理', '教程'],
  },
  docs: {
    groupLabel: '文档管理',
    navTitle: '文档管理',
    navNote: '',
    icon: 'BookOpen',
    permission: 'docs.manage',
    title: '文档管理',
    lead: '',
    href: '/admin/docs',
    contextCards: [
      { label: '用途', value: '产品文档', note: '维护 fd-core-stack 与各应用的结构化文档空间。' },
      { label: '结构', value: '空间 + 页面树', note: '支持左侧目录、页面层级和逐页发布。' },
    ],
    heroActions: [
      { label: '文档管理', href: '/admin/docs', tone: 'primary' },
      { label: '内容管理', href: '/admin/content', tone: 'secondary' },
    ],
    pageDataScopes: ['operations'],
    commandAliases: ['docs', 'documents', 'knowledge base', '文档', '文档管理', '帮助中心'],
  },
  secrets: {
    groupLabel: '应用管理',
    navTitle: '应用密钥',
    navNote: '',
    icon: 'KeyRound',
    permission: 'apps.manage',
    title: '应用密钥',
    lead: '',
    href: '/admin/secrets',
    contextCards: [
      { label: '用途', value: '身份认证', note: '应用通过密钥访问中台 API。' },
      { label: '安全', value: '一次性显示', note: '密钥仅在创建时显示一次，请妥善保存。' },
    ],
    heroActions: [
      { label: '密钥管理', href: '/admin/secrets', tone: 'primary' },
      { label: '应用管理', href: '/admin/apps', tone: 'secondary' },
    ],
    pageDataScopes: ['apps'],
    commandAliases: ['secrets', 'keys', 'api keys', '密钥', '应用密钥'],
  },
  orders: {
    groupLabel: '交易管理',
    navTitle: '订单管理',
    navNote: '',
    icon: 'Receipt',
    permission: 'orders.view',
    title: '订单管理',
    lead: '',
    href: '/admin/orders',
    contextCards: [
      { label: '用途', value: '交易追踪', note: '订单连接支付与授权的完整链路。' },
      { label: '操作', value: '补单同步', note: '可手动同步支付状态，处理异常订单。' },
    ],
    heroActions: [
      { label: '订单管理', href: '/admin/orders', tone: 'primary' },
      { label: '支付配置', href: '/admin/payments', tone: 'secondary' },
    ],
    pageDataScopes: ['operations'],
    commandAliases: ['orders', '订单', '订单管理', '补单'],
  },
  payments: {
    groupLabel: '交易管理',
    navTitle: '支付配置',
    navNote: '',
    icon: 'Wallet',
    permission: 'payments.manage',
    title: '支付配置',
    lead: '',
    href: '/admin/payments',
    contextCards: [
      { label: '用途', value: '通道配置', note: '配置支付通道后即可在售卖方案中使用。' },
      { label: '安全', value: '加密存储', note: '支付凭证加密后存储在数据库中。' },
    ],
    heroActions: [
      { label: '支付配置', href: '/admin/payments', tone: 'primary' },
      { label: '返回总览', href: '/admin', tone: 'secondary' },
    ],
    pageDataScopes: ['paymentSettings'],
    commandAliases: ['payments', 'billing', 'wechat', 'alipay', '支付配置', '微信支付'],
  },
  settings: {
    groupLabel: '运维',
    navTitle: '系统设置',
    navNote: '',
    icon: 'Settings',
    permission: 'settings.manage',
    title: '系统设置',
    lead: '',
    href: '/admin/settings',
    contextCards: [
      {
        label: '用途',
        value: '平台基础能力',
        note: '认证邮件、媒体存储和 AI Provider 都在这里统一维护。',
      },
      { label: '安全', value: '加密存储', note: '敏感凭证以加密形式存入数据库。' },
    ],
    heroActions: [
      { label: '系统设置', href: '/admin/settings', tone: 'primary' },
      { label: '支付配置', href: '/admin/payments', tone: 'secondary' },
    ],
    pageDataScopes: ['systemSettings'],
    commandAliases: [
      'settings',
      'system',
      'smtp',
      'qiniu',
      'openrouter',
      'ai hub',
      '邮件配置',
      '系统设置',
    ],
  },
  users: {
    groupLabel: '客户管理',
    navTitle: '用户管理',
    navNote: '',
    icon: 'Users',
    permission: 'users.view',
    title: '用户管理',
    lead: '',
    href: '/admin/users',
    contextCards: [
      { label: '用途', value: '用户管理', note: '管理用户账号、角色和状态。' },
      { label: '操作', value: '角色与状态', note: '可调整用户角色、停用或激活账号。' },
    ],
    heroActions: [
      { label: '用户管理', href: '/admin/users', tone: 'primary' },
      { label: '授权管理', href: '/admin/licenses', tone: 'secondary' },
    ],
    pageDataScopes: ['operations'],
    commandAliases: ['users', '用户', '用户管理', '账号'],
  },
  licenses: {
    groupLabel: '客户管理',
    navTitle: '授权管理',
    navNote: '',
    icon: 'ShieldCheck',
    permission: 'licenses.manage',
    title: '授权管理',
    lead: '',
    href: '/admin/licenses',
    contextCards: [
      { label: '用途', value: '授权管理', note: '授权是用户使用产品功能的凭证。' },
      { label: '来源', value: '多种途径', note: '授权可来自订单支付或管理员手动发放。' },
    ],
    heroActions: [
      { label: '授权管理', href: '/admin/licenses', tone: 'primary' },
      { label: '返回总览', href: '/admin', tone: 'secondary' },
    ],
    pageDataScopes: ['plans', 'entitlements'],
    commandAliases: ['licenses', 'entitlements', 'grant', '授权', '授权管理'],
  },
  installs: {
    groupLabel: '客户管理',
    navTitle: '客户端安装',
    navNote: '',
    icon: 'Boxes',
    permission: 'installs.view',
    title: '客户端安装',
    lead: '查看客户端登记、用户绑定与最近上报；服务器运行管理请前往托管运维。',
    href: '/admin/installs',
    contextCards: [
      {
        label: '用途',
        value: '客户端登记',
        note: '记录通过安装接入协议登记的客户端，用于客户支持和授权关联。',
      },
      { label: '数据', value: '设备指纹', note: '记录设备信息用于安装去重和统计。' },
    ],
    heroActions: [
      { label: '客户端安装', href: '/admin/installs', tone: 'primary' },
      { label: '授权管理', href: '/admin/licenses', tone: 'secondary' },
    ],
    pageDataScopes: ['operations'],
    commandAliases: ['installs', 'installations', '安装', '安装实例', '客户端安装'],
  },
  tickets: {
    groupLabel: '客户管理',
    navTitle: '工单管理',
    navNote: '',
    icon: 'LifeBuoy',
    permission: 'tickets.manage',
    title: '工单管理',
    lead: '',
    href: '/admin/tickets',
    contextCards: [
      { label: '用途', value: '问题处理', note: '集中处理订单、授权、安装和部署相关的用户问题。' },
      { label: '方式', value: '站内会话', note: '用户在个人中心发起，管理员在后台统一跟进。' },
    ],
    heroActions: [
      { label: '工单管理', href: '/admin/tickets', tone: 'primary' },
      { label: '用户管理', href: '/admin/users', tone: 'secondary' },
    ],
    pageDataScopes: ['operations'],
    commandAliases: ['tickets', 'support', 'helpdesk', '工单', '客服', '支持'],
  },
  notifications: {
    groupLabel: '客户管理',
    navTitle: '通知管理',
    navNote: '',
    icon: 'Bell',
    permission: 'notifications.manage',
    title: '通知管理',
    lead: '',
    href: '/admin/notifications',
    contextCards: [
      { label: '用途', value: '消息中心', note: '查看系统发出的用户通知，并向全站用户发布公告。' },
      { label: '方式', value: '站内通知', note: '公告会直接进入用户账户的消息通知中心。' },
    ],
    heroActions: [
      { label: '通知管理', href: '/admin/notifications', tone: 'primary' },
      { label: '用户管理', href: '/admin/users', tone: 'secondary' },
    ],
    pageDataScopes: ['operations'],
    commandAliases: ['notifications', 'announcements', 'broadcast', '通知', '公告', '通知管理'],
  },
  observability: {
    groupLabel: '运维',
    navTitle: '事件日志',
    navNote: '',
    icon: 'Activity',
    permission: 'observability.view',
    title: '事件日志',
    lead: '',
    href: '/admin/observability',
    contextCards: [
      { label: '用途', value: '事件审计', note: '记录关键业务操作和支付回调。' },
      { label: '数据', value: '事件与回调', note: '包含系统事件和支付渠道的回调记录。' },
    ],
    heroActions: [
      { label: '事件日志', href: '/admin/observability', tone: 'primary' },
      { label: '返回总览', href: '/admin', tone: 'secondary' },
    ],
    pageDataScopes: ['observability'],
    commandAliases: ['observability', 'events', 'webhooks', '事件日志', '事件'],
  },
};

export const adminNavigationGroups: AdminNavigationGroup[] = [
  { label: '概览', items: ['dashboard'] },
  { label: '应用管理', items: ['apps'] },
  { label: '内容管理', items: ['content', 'storage'] },
  { label: '文档管理', items: ['docs'] },
  { label: '交易管理', items: ['orders', 'payments'] },
  {
    label: '客户管理',
    items: ['users', 'licenses', 'deployments', 'installs', 'tickets', 'notifications'],
  },
  { label: '资源', items: ['servers'] },
  { label: '运维', items: ['hosting', 'settings', 'observability'] },
];

export const adminCommandItems: AdminCommandItem[] = [
  ...Object.entries(adminSectionMeta).map(([sectionKey, meta]) => ({
    id: `section:${sectionKey}`,
    label: meta.title,
    note: meta.navNote || meta.contextCards[0]?.note || meta.lead || '',
    href: meta.href,
    icon: meta.icon,
    group: meta.groupLabel,
    sectionKey: sectionKey as AdminSectionKey,
    keywords: [meta.title, meta.navTitle, meta.navNote, meta.groupLabel, ...meta.commandAliases],
    shortcut: meta.href.replace('/admin', '') || '/admin',
  })),
  {
    id: 'global:docs',
    label: 'API 文档',
    note: '查看 API 文档和调试入口',
    href: '/api-docs',
    icon: 'BookOpenText',
    group: '快捷入口',
    external: true,
    keywords: ['docs', 'swagger', 'api', '文档'],
  },
  {
    id: 'global:status',
    label: '系统状态',
    note: '查看系统状态与公共首页',
    href: '/',
    icon: 'Gauge',
    group: '快捷入口',
    keywords: ['status', 'home', '首页', '健康检查'],
  },
];
