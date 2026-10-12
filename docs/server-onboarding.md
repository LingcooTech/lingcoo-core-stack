# 服务器资源接入

服务器资源属于上游资源池；后台入口为 `/admin/servers`。托管实例、备份和运维任务位于 `/admin/hosting`。新服务器默认暂停分配，只有收到报告才显示实际资源。

## AI 与人工使用同一流程

AI 可读取 [服务器接入 Skill](../skills/stack-server-onboarding/SKILL.md)。使用经过审阅的固定 Stack 提交，将该提交的 scripts 目录传到目标服务器。不要将来源未知的远程脚本直接交给 root 执行。

1. 在服务器资源页面登记名称、IP 和可分配预算，下载接入配置。配置含节点凭据，只保存到私密文件，权限设为 600。
2. 执行 `python3 scripts/prepare-hosting-node.py --check`。Linux、Python 3、运行中的 Docker、Compose 和 systemd 均需可用。缺失的系统依赖由 AI 或运维按发行版安装；检查命令本身只读。
3. 执行 `sudo python3 scripts/prepare-hosting-node.py --install /私密路径/node-enrollment.json`。命令拒绝覆盖已有节点目录；安装代理、生成私密节点配置并启动 systemd。初始化失败后检查日志与已创建目录，不要删除现有应用数据来重试。
4. 返回服务器资源页，确认最近上报、CPU/内存/磁盘、容器清单。页面每 15 秒刷新，代理每轮结束约 60 秒后再执行。节点此时仅监控，不接单。

接入配置格式：

```json
{ "stackUrl": "https://stack.example.com", "nodeId": "实际 UUID", "reportToken": "节点专用凭据" }
```

## 从监控节点变为托管节点

完成网关、平台证书接收器、发行目标、只读镜像凭据、本地与异机备份配置，再将节点配置的 `monitorOnly` 改为 `false`。各项配置沿用仓库 `docs/managed-hosting-operations.md`、`docs/hosting-isolated-recovery.md` 的操作规程。旧适配器与通用 Compose 协议的能力分别上报；通用协议不能替代尚未完成的应用备份适配与发布验收。

公网开放业务入口 80/443；数据库保持私网。DNS 凭据留在控制端，新网关仅接收证书。测试部署、HTTPS、备份及隔离恢复通过后再启用分配。监控上报成功不代表完成这些验收，接入脚本不会自动启用分配。

## 应用资源声明

一键部署应用必须在交付声明的 `delivery.resources` 给出总预算。新接入应使用逐服务 `serviceLimits`，示例值仅展示格式，必须用应用实际验证结果确定：

```json
{
  "cpuMillis": 1000,
  "memoryMb": 512,
  "diskMb": 10240,
  "serviceLimits": {
    "api": { "cpuMillis": 600, "memoryMb": 320 },
    "database": { "cpuMillis": 400, "memoryMb": 192 }
  }
}
```

服务名称必须完整匹配 Compose，服务 CPU/内存之和必须等于总预算，不能同时提供旧 `serviceWeights`。Stack 编译时直接生成每个容器 CPU/内存限额，调度预留总预算；已发布版本和实例绑定后不能偷偷改变限额。旧声明的权重分配继续兼容。

实际资源占用随负载变化，容器限额不等于始终占用的内存。应用方应记录启动/迁移峰值、空闲与目标负载峰值、业务数据增长和磁盘需求。磁盘目前是调度预算，不是强制文件系统配额。容量规划还需扣除操作系统、网关、备份及已有工作负载。
