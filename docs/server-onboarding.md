# 服务器资源接入

服务器资源属于上游资源池；后台入口为 `/admin/servers`。托管实例、备份和运维任务位于 `/admin/hosting`。新服务器默认暂停分配，只有收到报告才显示实际资源。

## AI 与人工使用同一流程

AI 可读取 [服务器接入 Skill](../skills/stack-server-onboarding/SKILL.md)。使用经过审阅的固定 Stack 提交，将该提交的 scripts 目录传到目标服务器。不要将来源未知的远程脚本直接交给 root 执行。

1. 在服务器资源页面登记名称、IP 和可分配预算，下载接入配置。配置含节点凭据，只保存到私密文件，权限设为 600。
2. 执行 `python3 scripts/prepare-hosting-node.py --check`。Linux、Python 3、运行中的 Docker、Compose 和 systemd 均需可用。缺失的系统依赖由 AI 或运维按发行版安装；检查命令本身只读。
3. 执行 `sudo python3 scripts/prepare-hosting-node.py --install /私密路径/node-enrollment.json`。命令拒绝覆盖已有节点目录；安装代理、生成私密节点配置并启动 systemd。初始化失败后检查日志与已创建目录，不要删除现有应用数据来重试。
4. 返回服务器资源页，确认最近上报、CPU/内存/磁盘、容器清单。页面每 15 秒刷新，代理每轮结束约 60 秒后再执行。节点此时仅监控，不接单。

## 手动接入命令

以下示例从运维 Mac 上传脚本到 Linux 服务器，使用 root 登录。目标服务器须具备 Python 3、运行中的 Docker、Docker Compose 和 systemd；接入脚本检查这些条件，但不自动安装系统依赖。使用普通管理员账号时，应调整上传目录，并以 sudo 执行检查、安装和服务管理命令。

### 1. 后台登记与下载配置

在 Stack 后台“服务器资源”中添加服务器，填写名称、IP 和可分配预算。创建后点击“下载接入配置”，得到 `node-enrollment.json`。该文件包含本节点凭据，不要放进 Git、聊天或日志。下面假设文件位于 Mac 的 `~/Downloads/node-enrollment.json`。

### 2. 在 Mac 打包并上传

将 `服务器IP` 替换为实际地址。示例固定到已验证版本 `6c81c123a342925323123e14ad2849ecea04417d`；后续升级时应使用另一个经过审阅和验收的固定提交。

```sh
SERVER_IP="服务器IP"

cd /Users/admin/Projects/Lingcoo-core-stack

git archive \
  --format=tar \
  --output=/tmp/stack-node-scripts.tar \
  6c81c123a342925323123e14ad2849ecea04417d \
  scripts

chmod 600 ~/Downloads/node-enrollment.json

ssh root@"$SERVER_IP" \
  'install -d -m 700 /root/stack-node-setup'

scp /tmp/stack-node-scripts.tar \
  ~/Downloads/node-enrollment.json \
  root@"$SERVER_IP":/root/stack-node-setup/

ssh root@"$SERVER_IP"
```

### 3. 在服务器检查并安装

以下命令在目标服务器上执行：

```sh
cd /root/stack-node-setup
tar -xf stack-node-scripts.tar
chmod 600 node-enrollment.json

python3 scripts/prepare-hosting-node.py --check
```

输出中 `checks` 各项为 `true`，且 `ready` 为 `true` 时可以继续。检查失败则先补齐对应系统组件或修复 Docker/systemd 状态，再重新检查。

```sh
python3 scripts/prepare-hosting-node.py \
  --install /root/stack-node-setup/node-enrollment.json
```

脚本和配置准备好后，检查、安装也可以合并执行；检查失败不会继续安装：

```sh
python3 scripts/prepare-hosting-node.py --check &&
python3 scripts/prepare-hosting-node.py \
  --install /root/stack-node-setup/node-enrollment.json
```

安装器将代理和私密配置写入 `/opt/lingcoo-hosting`，创建 systemd 定时任务，并立即启动一次上报。成功输出包含 `installed: true`、`monitorOnly: true` 和 `allocationEnabled: false`。这表示资源纳管已安装，尚未启用托管分配。

### 4. 确认服务与上报

```sh
# 定时任务应显示 active
systemctl is-active lingcoo-hosting.timer

# 查看最近一次执行结果
systemctl show lingcoo-hosting.service -p Result

# 查看最近日志，仅在服务器内排查
journalctl -u lingcoo-hosting.service -n 30 --no-pager
```

代理采用 oneshot 周期执行，执行结束后服务显示 `inactive` 属于正常现象；应结合 `Result=success`、定时任务状态及 Stack 中的最近上报时间判断。返回服务器资源页，通常约一分钟内可看到在线状态、CPU/内存/磁盘和容器清单。安装成功输出本身不代表平台已收到上报，应以后台最近报告为准。

若服务器已有 `/opt/lingcoo-hosting`，安装器会拒绝覆盖，需按节点更新流程处理；不要删除已有节点目录或实例数据后重装。现有两台已接入服务器无需重复执行首次安装。

## 接入配置格式

```json
{ "stackUrl": "https://stack.example.com", "nodeId": "实际 UUID", "reportToken": "节点专用凭据" }
```

## 从监控节点变为托管节点

上述命令完成的是资源纳管，Stack 可以显示服务器状态。完整托管准备尚未由该安装命令自动完成；不能仅修改一个开关就视为可交付客户应用。

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
