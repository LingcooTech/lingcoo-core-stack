# 托管节点安装与运行

控制端配置 `HOSTING_DNS_SECRET_ID`、`HOSTING_DNS_SECRET_KEY`、`HOSTING_DNS_ZONE=lingcoo.com`、`HOSTING_DOMAIN_SUFFIX=app.lingcoo.com`。密钥用 CAM 专用子用户限制到 lingcoo.com 必要记录操作，仅存服务端私有配置。

通过管理员 `/v1/admin/hosting/nodes` 登记节点获得一次性的 report token。节点配置文件必须是 0600，包含：

```json
{
  "stackUrl": "https://stack.lingcoo.com",
  "nodeId": "实际节点 UUID",
  "reportToken": "本节点专用密钥",
  "workspace": "/opt/lingcoo-hosting/instances",
  "adapters": {},
  "gatewayConfigPath": "/opt/lingcoo-gateway/Caddyfile",
  "gatewayContainer": "lingcoo-gateway",
  "backupRoot": "/opt/lingcoo-hosting/backups",
  "monitorOnly": false,
  "portStart": 23000,
  "portEnd": 23999
}
```

将应用构建产物 `hosting-adapter.json` 的完整描述写入 `adapters[appCode]`，额外设置绝对 `bundle` 路径；描述必须包含 `protocolVersion: 2` 和全部受信文件 `hashes`。空注册表不会接收应用任务。禁止继续使用 `retailBundle` / `bundleHashes` 隐式配置。协议见 [应用适配 v2](../specs/adapter-v2-wechat-v3/design.md)。

分发 `hosting_adapter.py`、`hosting-node-agent.py`、`hosting-node-report.py`、`hosting-node-ingress.py`、`hosting-node-backup.py`、`hosting-node-operation.py` 与已验证部署包。后台启用节点后，执行：

```sh
HOSTING_AGENT_DIR=/opt/lingcoo-hosting \
HOSTING_NODE_CONFIG=/opt/lingcoo-hosting/node.json \
sh scripts/install-hosting-node-service.sh
```

安装器拒绝将 testLoopback 或仅用缓存镜像的配置设为永久服务。systemd 保证同一 oneshot 不并发执行；文件锁进一步保护手动调用。节点 token 只能读取本节点任务，不得使用平台管理员 token 运行节点。

检查 `systemctl status lingcoo-hosting.timer`、`journalctl -u lingcoo-hosting.service`；备份检查 `lingcoo-hosting-backup.timer`。每日备份完成应有 `HOSTING_COMPLETE`，并验证 `SHA256SUMS`。节点磁盘可用容量不足会停止新分配，异机备份与保留策略配置见下文。

网关修改保留已有路由并先验证，配置文件绑定挂载时保留 inode。Caddy 的 `/data` 卷必须持久化以保留证书。网关 80/443 需可达；不要把数据库端口发布到公网。

暂停新分配可在节点管理关闭 enabled；该开关不是删除实例。当前未提供自动回收活跃实例的数据卷，也不自动将失败任务的预算释放给其他客户。

备份定时表达式采用服务器本地时区；本轮节点为 `Asia/Shanghai`，每日 04:00 执行。备份会短暂停止 API/Worker 写入，不能当作无中断备份。备份等待节点排他锁；执行器遇到备份占锁会留待下一轮。备份失败需运维检查并补跑。

## 2026-10-08：资源与运维管理

服务器资源入口：`https://stack.lingcoo.com/admin/servers`；托管实例和运维入口：`https://stack.lingcoo.com/admin/hosting`。管理员可编辑名称、厂商、地域、用途、月成本、到期日期与托管资源预算；成本/日期未知时显示“待填写”。预算表示可分配资源上限，不是每个容器的实际占用；不得低于已预留资源。节点实际内存、磁盘、容器健康和使用量每分钟上报。

- `118.25.36.15`：运行现有 Retail 托管实例和其他既有应用；仅平台创建的实例支持受控重启/备份。
- `82.157.22.93`：Stack 控制端、证书签发器、加密备份仓库；以 `monitorOnly: true` 纳管，暂停新实例分配。
- 非平台应用仅展示资源与健康状态，不能通过托管操作按钮执行命令。
- 暂停“新分配”不影响现有入口、上报、备份和运维。仅监控节点不得在页面直接启用分配，需要先安装并配置执行器。
- 页面展示节点离线（5 分钟）、内存不足 512 MiB、磁盘不足 5 GiB、容器不健康、证书/服务器 14 天内到期、本地/异机备份超过 36 小时等异常。本期为管理页告警，未接短信/邮件通知。

部署节点必须显式设置 `monitorOnly: false`，并分发新增的 `hosting-node-operation.py`。运维任务只允许 `restart` 与 `backup`，以 UUID 请求标识保证幂等，同实例只允许一个待执行任务。重启只作用于 API/Worker/Web，不重启数据库；执行后检查健康。任务领取限定节点凭据，记录请求人、时间、完成结果与审计；中途崩溃不盲目重放副作用，超时标记失败后人工检查再发新请求。

新增节点流程：服务器资源页登记 → 下载私密接入配置 → 运行 `prepare-hosting-node.py --check` 和 `--install` 纳入监控 → 配置网关/证书接收器/备份 → 验证健康、应用交付与容量预算 → 启用分配。AI 与人工统一使用 [接入指南](./server-onboarding.md) 中的流程。无需改代码添加服务器。平台不会自动接管一台未经配置验证的机器。

## 平台通配符证书

默认域名用 `*.app.lingcoo.com`，只覆盖直接下一级，如 `shop.app.lingcoo.com`。不覆盖 `x.shop.app.lingcoo.com` 或客户自有域名。客户自定义域名继续经平台所有权、解析与 HTTPS 验证后由网关独立签发证书。

证书在 82 节点集中签发：lego **5.5.2**，DNS-01 使用官方 exec hook，调用现有 Stack 镜像内固定版本腾讯 DNSPod SDK。hook 只管理 `_acme-challenge.app` 下匹配本次值且带专用备注的 TXT 记录，不覆盖业务记录。选择 exec hook 是为了沿用现有 lingcoo.com 最小权限策略，无须为原生提供器额外授予域名列表权限。保留权威 DNS 传播检查，跳过递归 DNS 缓存重复检查。

安装目录 `/opt/lingcoo-hosting`；私密发行配置为 `certificates/issuer.json`，包含 domain、zone、email、statePath、credentialsFile、legoBinary、dnsHook、sdkContainer、sshKey、knownHosts 和 targets。DNS 密钥只保存在控制端的 0600 文件；网关只收到证书和私钥。

```sh
HOSTING_AGENT_DIR=/opt/lingcoo-hosting \
HOSTING_CERTIFICATE_CONFIG=/opt/lingcoo-hosting/certificates/issuer.json \
sh scripts/install-hosting-certificate-service.sh
systemctl start lingcoo-hosting-certificate.service
```

每 12 小时检查（加随机延迟），由 lego 管理 ACME/ARI 与到期前续期。已有有效证书时复用并重新协调分发；API 节点报告通过 `issuerStatusPath` 读取 `certificates/automation-status.json`，失败或超过 36 小时未执行会显示异常。

网关配置 `certificate-receiver.json`（domain、gatewayContainer）与专用受限 SSH key：限制来源 IP，禁用转发，forced command 只能运行证书接收器。接收器验证受信任链、SAN 范围、密钥匹配及至少七天剩余有效期后，安装到网关持久 `/data` 卷的 `lingcoo-platform-tls/<fingerprint>`，原子切换 `current`。Caddy validate/reload 失败时恢复旧指针和配置；不以 root SSH 通用命令来分发证书。

节点配置 `wildcardDomain: "app.lingcoo.com"`，`certificateStatusPath` 指向 Docker 网关 `/data` 卷在宿主机上的 `lingcoo-platform-tls/status.json`。新增网关须安装接收器、固定主机公钥并加入发行 targets，成功加载后才能接单。当前仅 118 节点承载托管入口，因此只向该节点分发私钥。

诊断：`journalctl -u lingcoo-hosting-certificate.service`、私有 `certificates/acme/issuer.log` 和 `distribution.json`。不得将 ACME 私钥、DNS 密钥或备份密码复制到工单/聊天。更新发行器前验证下载 checksum；本轮 lego Linux amd64 压缩包 SHA256 为 `2a35505089e7772c92e1e9ac144df91151ef2eca8568630db0ff91fca06d9bef`。

## 一致性备份、异机副本与恢复

本地备份每日北京时间 04:00 执行，也可在管理页“立即备份”。备份期间短暂停止该实例 API/Worker 写入，完成 PostgreSQL dump、文件存储归档、部署配置和镜像标识校验后恢复。排他锁避免与部署/运维并发；备份等待正在执行的任务，节点协调器下次再试。外部 S3 等存储会被现有备份器拒绝，需另行接入对应存储备份流程，不能误报为完整备份。

118 使用 restic **0.19.1** 将已校验目录加密传输到 82 的 `/opt/lingcoo-backup-vault/retail`。专用 `lingcoo-backup` 用户使用 SFTP chroot，禁止 shell/转发，SSH key 限制来源 118；仓库密码和 SSH key 不保存在仓库中。无需新增付费服务。restic 下载压缩包 SHA256：`f415415624dcc452f2a02b8c33641791a8c6d6d3b65bbb3543fcf9a25151585c`。

节点的 `offsite` 配置包含 binary、repository、passwordFile、sftpCommand。仓库为 `sftp:lingcoo-backup@82.157.22.93:/retail`；sftpCommand 显式指定 key、固定 known_hosts、BatchMode 与 StrictHostKeyChecking。密码文件 0600，目录 0700；缓存位置显式设在备份目录，避免 systemd 无 HOME 时运行失败。Go 内存软限制 256 MiB。

保留策略：按 deployment UUID 标签保留 7 个每日、4 个每周、3 个每月快照；异机上传和保留处理成功后才删除本地超过 14 天的已完成备份。两阶段状态分别上报，本地成功不代表异机成功。私有排错日志为 `backups/offsite-private.log`，只在服务器内查看。

恢复密码的独立副本保存在运维电脑 `/Users/admin/.config/lingcoo-hosting/offsite-recovery-password`（0600），须随运营流程纳入可靠的私密凭据保管。服务器更换时从现存私密配置恢复仓库连接，不能重新初始化覆盖已有仓库。

恢复流程：

1. 从 restic 选择该部署标签下的快照，`restore` 到全新私有目录；先执行 `restic check` 与 `SHA256SUMS` 校验。
2. 使用固定交付包 `deploy/scripts/restore-isolated.sh`，项目名必须 `oms-restore-*`，新网络为 internal；恢复 PostgreSQL/文件卷，不启动业务 API/Worker。
3. 核对业务表计数、测试数据、存储归档哈希以及配置解密条件；验证成功后再制定正式切换步骤。
4. 清理仅本次演练创建且标签匹配的容器/卷/网络；不得使用全局 Docker prune。

每日备份的目标 RPO 约 24 小时，不能保证零数据丢失；跨机器副本减少单机故障风险，但两台同属腾讯云，仍非跨云/不可变备份。后续有正式客户时应补充独立存储或第三故障域、恢复演练周期与主动告警通知。本期不提供一键跨节点迁移、版本升级或破坏性在线恢复。

## 本轮生产验收结果

2026-10-08 已发布运行版本 `8c93a049bb9a5896362186776621f1946b25bc37`。[CI](https://github.com/LingcooTech/lingcoo-core-stack/actions/runs/37714943243) 和 [生产发布](https://github.com/LingcooTech/lingcoo-core-stack/actions/runs/37715468897) 成功，线上 `/ready` 版本一致。CI 通过 56 项单元、70 项集成、12 项管理界面及 4 项浏览器端到端测试。

- 两台节点在线、无管理告警，82 仅监控，118 启用托管执行器；已完成线上页面、资产编辑入口和运维结果显示验证。
- `retail-demo-20261008.app.lingcoo.com` 公网使用 `*.app.lingcoo.com`，到期时间为北京时间 2027-01-06 08:41:14；无效证书包被接收器拒绝，当前有效证书保持不变；重复检查复用同一证书。
- `retail-demo.lingcoo.com` 继续使用独立证书。两个域名的 Web、Admin、API readiness、Worker health 均为 HTTP 200。
- 正式管理员接口创建的重启与备份任务均成功。重复请求复用同一任务；最新备份本地完成于北京时间 10:06:15，异机完成于 10:06:46。核对 15 个非目标运行容器及 Retail 数据库的启动时间，未受托管操作影响。
- 从异机加密快照恢复 79 张业务表，核对账号、商品、订单、客户、存储对象表记录数量与文件哈希；restic 全数据检查、备份 SHA256 校验均通过。演练容器、卷、网络和临时明文恢复文件已清理。
- Retail 五个服务在本次验收采样时合计约 285 MiB，预算上限仍为 1024 MiB。该数字是当前空闲采样，不是峰值或可承载客户数量的容量承诺；本轮未进行内存压缩改造或负载容量测试。

结构化证据见 [managed-hosting-operations-acceptance.json](./managed-hosting-operations-acceptance.json)。验收后的文档提交不重复发布同一运行代码。
