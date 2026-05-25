export function orderStatusLabel(status: string) {
  switch (status) {
    case 'pending':
      return '待支付';
    case 'paid':
      return '已支付';
    case 'failed':
      return '支付失败';
    case 'cancelled':
      return '已取消';
    case 'refunding':
      return '退款中';
    case 'refunded':
      return '已退款';
    default:
      return status || '未知状态';
  }
}

export function paymentProviderLabel(provider: string | null | undefined) {
  switch (provider) {
    case 'wechat_pay':
      return '微信支付';
    case 'alipay':
      return '支付宝';
    default:
      return provider || '未指定支付方式';
  }
}

export function entitlementStatusLabel(status: string) {
  switch (status) {
    case 'active':
      return '有效';
    case 'revoked':
      return '已撤销';
    case 'expired':
      return '已过期';
    case 'inactive':
      return '未生效';
    default:
      return status || '未知状态';
  }
}

export function entitlementSourceLabel(sourceType: string, orderNo?: string | null) {
  switch (sourceType) {
    case 'order':
      return orderNo ? `订单购买：${orderNo}` : '订单购买';
    case 'manual':
      return '人工发放';
    case 'admin':
      return '管理员发放';
    default:
      return sourceType || '未知来源';
  }
}

export function deploymentStatusLabel(status: string) {
  switch (status) {
    case 'active':
      return '运行中';
    case 'inactive':
      return '已停用';
    case 'cancelled':
      return '已取消';
    case 'expired':
      return '已过期';
    default:
      return status || '未知状态';
  }
}

export function deploymentEnvironmentLabel(environment: string) {
  switch (environment) {
    case 'production':
      return '生产环境';
    case 'staging':
      return '预发环境';
    case 'development':
      return '开发环境';
    default:
      return environment || '默认环境';
  }
}

export function deploymentTokenStatusLabel(status: string) {
  switch (status) {
    case 'active':
      return '可用';
    case 'used':
      return '已使用';
    case 'expired':
      return '已过期';
    case 'revoked':
      return '已撤销';
    default:
      return status || '未知状态';
  }
}

export function canSyncOrderStatus(status: string) {
  return status === 'pending' || status === 'failed' || status === 'refunding';
}
