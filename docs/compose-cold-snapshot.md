# 通用 Compose 冷备份与隔离恢复

此工具是平台执行内核的一部分，目前用于隔离验收，尚未接入托管定时任务、异机 Restic 传输、发布验收记录和域名切流。不能据此取消 Compose 商品的发布阻断。

## 使用条件

- Linux Docker 节点，同目录提供平台版本的 `compose-install.py` 与 `compose-snapshot.py`；使用与安装相同的私有工作目录。
- 安装已达到 `runtime_ready`，每项服务恰好一个运行容器；全部持久数据在声明的命名卷内，卷没有被其他实例共享。
- 备份会停止整个实例的写入，复制所有持久卷后启动原容器。适用于允许维护窗口的应用，不是在线数据库备份；数据库必须具备进程停止后的可恢复性，真实应用仍需单独验证。
- 不执行应用仓库提供的宿主机脚本。归档使用平台固定 digest 的 BusyBox 容器；无网络、只读根文件系统、受限 CPU/内存，备份卷只读挂载。
- 当前实现是平台冷快照模式，不执行应用声明的逻辑 backup/restore 命令，也不替代应用接入标准中相应的恢复约定。

## 命令

私有 job 文件包含安装配置与密钥，权限应为 `600`，不得上传代码仓库或记录到日志。

```sh
python3 compose-snapshot.py backup \
  --workspace /var/lib/stack/compose \
  --snapshot /var/lib/stack/snapshots/new-snapshot \
  < /private/path/source-job.json
```

命令返回快照 ID、卷数量和 `manifestSha256`。控制端应在受信备份记录中保存该摘要；恢复时不能从待恢复文件自行计算摘要冒充可信值。归档权限为 `600`、目录为 `700`，内容仍是明文数据，离开节点之前必须由加密备份传输层加密；本工具尚未连接该传输层。配置与密钥由控制端另行安全保存，快照清单仅包含配置摘要。

```sh
python3 compose-snapshot.py restore \
  --workspace /var/lib/stack/compose \
  --snapshot /var/lib/stack/snapshots/new-snapshot \
  --manifest-sha256 TRUSTED_SHA256 \
  < /private/path/new-target-job.json
python3 compose-install.py --workspace /var/lib/stack/compose \
  < /private/path/new-target-job.json
```

恢复目标必须使用新实例 ID、项目名和空资源，可变更入口端口、健康地址与部署模式，其余版本、卷、环境配置必须匹配。恢复只创建并填充新卷，返回 `restored_not_started`；随后按安装内核既有调用方式运行目标 job，执行启动和健康检查，已完成的迁移与初始化不会重跑。它不会覆盖源实例，不自动切流，不支持跨版本恢复。

## 失败和边界

- 备份前检查归属、共享卷、实例状态，拉取归档镜像成功后才停写。
- 归档失败仍尝试启动原服务；只有归档成功且服务进程重启成功后才生成完整快照清单。重启进程不等于业务健康，调用方必须补充健康验证。
- 摘要、归档大小、路径、链接和扩展大小先验证，之后才访问目标 Docker 资源。拒绝绝对路径、包含 `..` 的路径与链接、特殊设备文件。该保守规则也会拒绝应用中的部分合法相对软链接，需要在应用接入验收中识别。
- 恢复中断后的目标保留供排查，重新恢复必须使用新的实例身份；不得重用或覆盖半成品。
- `snapshot-status.json` 和 `restore-status.json` 位于私有实例目录。SIGTERM/SIGINT 会触发备份重启清理；断电、SIGKILL 无法保证执行清理，需由后续恢复协调器检查阶段并处置。
- 声明的磁盘预算用于限制归档文件及展开数据大小，不等于 Docker 卷磁盘配额，也不能替代节点容量预留。当前未实现跨节点锁、源隔离、防双写、资源预留、目标清理任务与自动接管。

## 验证

`test/compose-snapshot.test.ts` 调用 Python 拒绝路径测试；`test/compose-node-probe.py --snapshot` 在全新工作目录验证真实镜像、冷备份、独立恢复、原实例重启、初始化不重复、源和已有目标覆盖拒绝，并清理测试容器、卷和网络。fixture 验证不能替代 Retail/Edu 数据库恢复验收，也不能作为平台可信商品发布证据。
