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
    navTitle: '应用中心',
    navNote: '浏览应用与购买入口',
    icon: 'BX',
    title: '应用中心',
    lead: '发现并获取优质应用',
    href: '/',
    contextCards: [],
    heroActions: []
  },
  orders: {
    navTitle: '订单记录',
    navNote: '支付记录与状态同步',
    icon: 'RC',
    title: '我的订单',
    lead: '查看支付记录与订单状态',
    href: '/orders',
    contextCards: [],
    heroActions: [
      { label: '刷新订单', href: '/orders', tone: 'primary' },
      { label: '应用中心', href: '/', tone: 'secondary' }
    ]
  },
  access: {
    navTitle: '我的应用',
    navNote: '已购产品与 entitlement',
    icon: 'SH',
    title: '我的应用',
    lead: '查看已购应用和授权状态',
    href: '/access',
    contextCards: [],
    heroActions: [
      { label: '查看授权', href: '/access', tone: 'primary' },
      { label: '部署管理', href: '/deploy', tone: 'secondary' }
    ]
  },
  deploy: {
    navTitle: '部署管理',
    navNote: '系统交付与后续部署入口',
    icon: 'DP',
    title: '部署管理',
    lead: '管理应用部署与交付',
    href: '/deploy',
    contextCards: [],
    heroActions: [
      { label: '部署管理', href: '/deploy', tone: 'primary' },
      { label: '我的应用', href: '/access', tone: 'secondary' }
    ]
  }
};
