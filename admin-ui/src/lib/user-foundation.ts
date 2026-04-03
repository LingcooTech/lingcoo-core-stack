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
    navNote: '浏览产品与购买入口',
    icon: 'BX',
    title: '产品中心',
    lead: '发现并获取可购买、可授权、可交付的软件产品',
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
      { label: '产品中心', href: '/', tone: 'secondary' }
    ]
  },
  access: {
    navTitle: '我的产品',
    navNote: '已购产品与授权状态',
    icon: 'SH',
    title: '我的产品',
    lead: '查看已购产品和授权状态',
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
    lead: '管理已购产品的交付与部署',
    href: '/deploy',
    contextCards: [],
    heroActions: [
      { label: '部署管理', href: '/deploy', tone: 'primary' },
      { label: '我的产品', href: '/access', tone: 'secondary' }
    ]
  }
};
