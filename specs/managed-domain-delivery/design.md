# 设计

延续现有 deployment 模块及共享 contracts；新增 deployment_domains 表，唯一 hostname，绑定 deployment，保存随机 TXT challenge 和 pending_dns/pending_tls/ready/removing 状态。所有客户操作校验部署归属，节点操作校验节点归属。

域名验证采用 TXT 所有权证明和目标 CNAME/A 检查；只有验证通过的域名进入节点期望入口列表。域名删除进入 removing，节点先删除入口再回报，随后释放记录。默认域名始终保留。

节点使用 systemd timer 运行上报和部署执行器。DNSPod 密钥仅留在控制端。Caddy 校验配置后平滑重载并通过 ACME 管理证书。业务应用多域名 CORS 必须随入口同步，默认规范 URL 保留。

验证：共享契约、迁移、归属与冲突、DNS 验证失败、入口删除、真实节点默认及别名 HTTPS、备份和现有服务回归。
