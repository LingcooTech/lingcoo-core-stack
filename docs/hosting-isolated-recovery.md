# 托管冷快照隔离恢复

本工具用于验证备份能否在另一节点还原，尚不执行客户实例迁移或公网切流。它不修改 Stack 的实例分配、DNS、网关及服务期限，也不启动应用 API、Worker 或定时任务。

## 输入条件

- 备份格式必须为 `lingcoo-cold-volumes-v1`，来自已完成的停服/升级冷快照。日常应用自定义的逻辑备份暂不支持此恢复器。
- `manifestSha256` 必须取自独立保存的操作回执，而不是临时对待验证的下载文件计算后自行信任。
- 目标节点安装相同版本的可信 v2 适配器，缓存相同镜像摘要；工具不执行备份内的脚本，不自动拉取或替换镜像。
- 配置、计划、恢复目录保持私有权限。目标磁盘需要同时容纳下载、展开卷和校验临时归档；工具预检空间，但不代表平台已经为该目标预留生产容量。

计划示例（实际 UUID、摘要和上限由运维填写）：

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "deploymentId": "22222222-2222-4222-8222-222222222222",
  "sourceOperationId": "33333333-3333-4333-8333-333333333333",
  "targetNodeId": "44444444-4444-4444-8444-444444444444",
  "manifestSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "maxBytes": 536870912
}
```

`maxBytes` 同时限制下载总量及卷展开总量。计划与目标节点绑定，恢复 ID 一旦使用不可改变计划。

## 操作顺序

1. 从备份仓库选择完整 Restic 快照 ID（64 位摘要），核实部署标签和精确冷备份目录。禁止用 `latest`。
2. 在目标节点下载到新的私有目录：

```sh
python3 hosting-recovery-fetch.py \
  --config /path/to/private-node.json --plan /path/to/recovery-plan.json \
  --snapshot FULL_RESTIC_SNAPSHOT_ID \
  --source /absolute/backup-root/DEPLOYMENT_ID-exit-SOURCE_OPERATION_ID \
  --destination /private/recovery-download/snapshot
```

3. 校验并恢复至隔离卷：

```sh
python3 hosting-node-recover.py inspect \
  --config /path/to/private-node.json --plan /path/to/recovery-plan.json \
  --backup /private/recovery-download/snapshot --root /private/recovery-runs

python3 hosting-node-recover.py restore \
  --config /path/to/private-node.json --plan /path/to/recovery-plan.json \
  --backup /private/recovery-download/snapshot --root /private/recovery-runs
```

4. 留存输出及 `recovery.json`。工具逐文件核对内容、UID/GID、权限和链接，输出快照时点、数据量和恢复校验耗时。同一操作重试会重新核对已恢复卷；不覆盖已有数据。
5. 业务层验证必须使用隔离数据库容器、关闭外部网络且不启动业务任务。当前自动测试验证 PostgreSQL 表数据与持久文件。适配器的版本兼容性、扩展、业务队列仍需按应用另验。
6. 验证后删除测试数据库容器，再执行归属保护的清理：

```sh
python3 hosting-node-recover.py cleanup \
  --config /path/to/private-node.json --plan /path/to/recovery-plan.json \
  --root /private/recovery-runs
```

清理只删除该恢复操作创建的卷；任一卷被容器引用或归属不符时拒绝。计划、证据和输入备份保留，私有下载文件由运维按保留政策单独清理。中断的还原不会自动覆盖重试：先核对并清理，再使用新恢复 ID。

## 当前边界

- 已停止快照不证明源实例此刻仍已隔离。正式接管前需要独立的防双写隔离证据。
- 不支持跨架构/数据库大版本转换、外部表空间、逃逸父目录的符号链接、特殊设备文件或任意 Compose 结构变更。
- 恢复验证耗时不等于整机 RTO；快照时点也不代表已经具备承诺的 RPO。
- 生产迁移尚需源隔离、双节点资源预留、目标接管、应用健康检查及默认/自定义域名切换。目标接受新写入后不能盲目回到旧数据。
- 两台节点上的 CLI 可用于运维演练；82 控制节点仍保持仅监控，未启用生产托管分配。
