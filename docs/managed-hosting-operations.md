# 托管节点安装与运行

控制端配置 `HOSTING_DNS_SECRET_ID`、`HOSTING_DNS_SECRET_KEY`、`HOSTING_DNS_ZONE=lingcoo.com`、`HOSTING_DOMAIN_SUFFIX=app.lingcoo.com`。密钥用 CAM 专用子用户限制到 lingcoo.com 必要记录操作，仅存服务端私有配置。

通过管理员 `/v1/admin/hosting/nodes` 登记节点获得一次性的 report token。节点配置文件必须是 0600，包含：

```json
{
  "stackUrl": "https://stack.lingcoo.com",
  "nodeId": "实际节点 UUID",
  "reportToken": "本节点专用密钥",
  "workspace": "/opt/lingcoo-hosting/instances",
  "retailBundle": "/opt/lingcoo-hosting/bundle",
  "bundleHashes": {
    "stack-delivery.py": "SHA256",
    "docker-compose.prod.yml": "SHA256",
    "docker/Caddyfile": "SHA256"
  },
  "gatewayConfigPath": "/opt/lingcoo-gateway/Caddyfile",
  "gatewayContainer": "lingcoo-gateway",
  "backupRoot": "/opt/lingcoo-hosting/backups",
  "portStart": 23000,
  "portEnd": 23999
}
```

分发 `hosting-node-agent.py`、`hosting-node-report.py`、`hosting-node-ingress.py`、`hosting-node-backup.py` 与已验证部署包。后台启用节点后，执行：

```sh
HOSTING_AGENT_DIR=/opt/lingcoo-hosting \
HOSTING_NODE_CONFIG=/opt/lingcoo-hosting/node.json \
sh scripts/install-hosting-node-service.sh
```

安装器拒绝将 testLoopback 或仅用缓存镜像的配置设为永久服务。systemd 保证同一 oneshot 不并发执行；文件锁进一步保护手动调用。节点 token 只能读取本节点任务，不得使用平台管理员 token 运行节点。

检查 `systemctl status lingcoo-hosting.timer`、`journalctl -u lingcoo-hosting.service`；备份检查 `lingcoo-hosting-backup.timer`。每日备份完成应有 `HOSTING_COMPLETE`，并验证 `SHA256SUMS`。节点磁盘可用容量不足会停止新分配，仍需设置监控、备份外传和保留策略。

网关修改保留已有路由并先验证，配置文件绑定挂载时保留 inode。Caddy 的 `/data` 卷必须持久化以保留证书。网关 80/443 需可达；不要把数据库端口发布到公网。

暂停新分配可在节点管理关闭 enabled；该开关不是删除实例。当前未提供自动回收活跃实例的数据卷，也不自动将失败任务的预算释放给其他客户。
