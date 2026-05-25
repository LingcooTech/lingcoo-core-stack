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

export function checkoutSessionStatusLabel(status: string) {
  switch (status) {
    case 'pending':
      return '待支付';
    case 'paid':
      return '已支付';
    case 'failed':
      return '支付失败';
    case 'expired':
      return '已过期';
    case 'cancelled':
      return '已取消';
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

export function checkoutActionTypeLabel(actionType: string | null | undefined) {
  switch (actionType) {
    case 'purchase':
      return '购买授权';
    case 'renew':
      return '续费';
    case 'upgrade':
      return '升级';
    default:
      return actionType || '未指定动作';
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

export function recordStatusLabel(status: string) {
  switch (status) {
    case 'active':
      return '启用';
    case 'inactive':
      return '停用';
    case 'archived':
      return '已归档';
    case 'draft':
      return '草稿';
    case 'published':
      return '已发布';
    case 'hidden':
      return '隐藏';
    default:
      return status || '未知状态';
  }
}

export function notificationStatusLabel(status: string) {
  switch (status) {
    case 'unread':
      return '未读';
    case 'read':
      return '已读';
    case 'archived':
      return '已归档';
    default:
      return status || '未知状态';
  }
}

export function notificationLevelLabel(level: string) {
  switch (level) {
    case 'info':
      return '信息';
    case 'success':
      return '成功';
    case 'warning':
      return '警告';
    case 'error':
      return '错误';
    default:
      return level || '未知级别';
  }
}

export function operationStatusLabel(status: string) {
  switch (status) {
    case 'pending':
      return '待处理';
    case 'processing':
    case 'running':
      return '处理中';
    case 'processed':
    case 'completed':
    case 'succeeded':
      return '已完成';
    case 'failed':
      return '失败';
    case 'dead':
      return '已终止';
    case 'ignored':
      return '已忽略';
    default:
      return status || '未知状态';
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

export function deploymentActionStatusLabel(status: string) {
  switch (status) {
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    case 'pending':
      return '待执行';
    case 'running':
      return '执行中';
    default:
      return status || '未知状态';
  }
}

export function canSyncOrderStatus(status: string) {
  return status === 'pending' || status === 'failed' || status === 'refunding';
}
