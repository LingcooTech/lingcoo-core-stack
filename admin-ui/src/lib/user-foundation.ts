export type UserSectionKey = 'discover' | 'orders' | 'access' | 'deploy';

interface UserSectionAction {
  label: string;
  href: string;
  tone: 'primary' | 'secondary';
}

interface UserSectionMeta {
  navTitle: string;
  navNote: string;
  icon: string;
  title: string;
  lead: string;
  href: string;
  contextCards: Array<{
    label: string;
    value: string;
    note: string;
  }>;
  heroActions: UserSectionAction[];
}

export const userSectionMeta: Record<UserSectionKey, UserSectionMeta> = {
  discover: {
    navTitle: '产品中心',
    navNote: '浏览应用与购买入口',
    icon: 'BX',
    title: '产品中心',
    lead: '这里不是内容门户，而是 FutureDecade 产品体系的交易入口。用户在这里浏览应用、选择套餐，并进入统一支付与授权流程。',
    href: '/',
    contextCards: [
      { label: 'Role', value: 'Commerce Layer', note: '负责购买、授权和交付入口，不承担内容门户职责。' },
      { label: 'Scope', value: 'Apps + Pricing', note: '先收口产品浏览与购买闭环，再继续接入部署控制。' }
    ],
    heroActions: [
      { label: '浏览产品', href: '/', tone: 'primary' },
      { label: '查看订单', href: '/orders', tone: 'secondary' }
    ]
  },
  orders: {
    navTitle: '我的订单',
    navNote: '支付记录与状态同步',
    icon: 'RC',
    title: '我的订单',
    lead: '订单页优先保证状态可核对、支付可追踪，不把它做成营销卡片页。支付成功后，授权和部署资格都应该能从订单链路回查。',
    href: '/orders',
    contextCards: [
      { label: 'Focus', value: 'Traceability', note: '先保证订单与支付状态能被快速核对。' },
      { label: 'Next', value: 'Delivery Links', note: '后续会把部署记录和安装入口挂回订单链路。' }
    ],
    heroActions: [
      { label: '刷新订单', href: '/orders', tone: 'primary' },
      { label: '产品中心', href: '/', tone: 'secondary' }
    ]
  },
  access: {
    navTitle: '我的授权',
    navNote: '已购产品与 entitlement',
    icon: 'SH',
    title: '我的授权',
    lead: '授权页展示 entitlement 的实际结果，而不是价格信息。这里应该明确用户已经拥有什么、能在哪些产品上使用，以及授权何时生效或过期。',
    href: '/access',
    contextCards: [
      { label: 'Focus', value: 'Entitlement View', note: '按产品聚合能力，再展开具体 feature。' },
      { label: 'Next', value: 'Deploy Eligibility', note: '后续把部署权和更新权一起纳入授权视图。' }
    ],
    heroActions: [
      { label: '查看授权', href: '/access', tone: 'primary' },
      { label: '部署中心', href: '/deploy', tone: 'secondary' }
    ]
  },
  deploy: {
    navTitle: '部署中心',
    navNote: '系统交付与后续部署入口',
    icon: 'DP',
    title: '部署中心',
    lead: '这里承接 Headless WP 这类系统产品的交付入口。用户基于已购授权创建部署记录，再签发 deploy token，把部署域名和安装预设带入同一条安装链路。',
    href: '/deploy',
    contextCards: [
      { label: 'Focus', value: 'System Delivery', note: '优先服务最复杂的系统产品，而不是插件类轻产品。' },
      { label: 'Current', value: 'Bootstrap Live', note: '部署记录、deploy token 和远程安装入口已经接通。' }
    ],
    heroActions: [
      { label: '部署中心', href: '/deploy', tone: 'primary' },
      { label: '我的授权', href: '/access', tone: 'secondary' }
    ]
  }
};
