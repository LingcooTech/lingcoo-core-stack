# Stack 托管适配器协议 v2

状态：2026-10-11 代码接口说明。与 [Manifest v1](stack-app-delivery-onboarding-standard.md) 是两个独立协议。适配包是应用提供、平台运维审核安装的受信任代码，不是客户部署任务可以上传执行的代码。

## 1. 文件及登记位置

应用仓库维护 `hosting-adapter.json`（描述）、`stack-delivery.py`（执行钩子）、`docker-compose.prod.yml`、所引用配置文件及备份脚本。文件名 hosting-adapter.json 是发布约定；运行时读取节点私有配置中的 `adapters[appCode]`。

运维将审核后的完整包安装到节点不可被客户修改的绝对目录，并为描述附加 `bundle` 和 `hashes`。新应用首次接入需要此工程步骤，后台填 Manifest 不会自动安装适配包。不要把历史升级脚本当作无需审核的任意包安装入口。

节点校验器：[hosting_adapter.py](../scripts/hosting_adapter.py)。执行器：[hosting-node-agent.py](../scripts/hosting-node-agent.py)。未知应用、错误版本、摘要不匹配、实例归属不一致均拒绝执行。

## 2. 描述字段

| 字段                            | 作用及当前限制                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `protocolVersion`               | 数字 2                                                                            |
| `projectPrefix`                 | 小写字母开头，后续字母/数字/连字符，最长 32；同一节点不同应用不能重复             |
| `weights`                       | Compose 服务名 → 正整数资源权重；用于拆分 CPU/内存预算，不代表实测用量            |
| `appServices`                   | 非空应用服务列表；各项必须存在于 weights                                          |
| `healthyServices`               | 需要等待 Docker healthy 的应用服务                                                |
| `infrastructureServices`        | 数据库等先启动的基础服务，可为空                                                  |
| `infrastructureHealthyServices` | 初始化前必须 healthy 的基础服务，可为空                                           |
| `initialization`                | 有序 service/command 数组；可声明 environment，将部署输入映射到初始化命令环境变量 |
| `ingressService`、`ingressPort` | 平台网关连接的 Compose 服务及其容器内端口                                         |
| `httpChecks`                    | 非空站内路径列表，用于安装及更新后的 HTTP 检查                                    |
| `minMemoryMb`                   | 整数，至少 128；应用实测最低预算，不是所有应用统一分配 4 GB                       |
| `volumes`                       | 实例拥有的命名卷后缀列表；备份、恢复、退出和回收使用                              |
| `files`                         | 要复制的相对路径，必须包含 docker-compose.prod.yml                                |
| `imageVariables`                | 镜像环境变量列表，必须包含 APP_IMAGE；其他镜像变量可按应用定义                    |
| `originVariable`                | 修改域名时需要更新的公网地址变量，允许 null                                       |
| `originServices`                | 公网地址变化后需要重建的服务，可为空                                              |
| `backupScript`                  | 相对包目录的备份脚本路径                                                          |
| `bundle`                        | 运维登记的受信任包绝对路径，不由客户输入                                          |
| `hashes`                        | 包内文件相对路径 → SHA-256；覆盖适配器、files、备份脚本及其依赖                   |

禁止绝对资源文件路径、`..`、符号链接逃逸及项目归属冲突。名称、长度和列表约束以校验器为准。服务列表虽由应用定义，但当前权限、退出与回收机制不接受任意宿主机可写挂载；持久数据应使用实例拥有的命名卷。

## 3. Python 执行钩子

`stack-delivery.py` 必须暴露当前执行器调用的接口：

| 接口                                  | 责任                                                   |
| ------------------------------------- | ------------------------------------------------------ |
| `APP_CODE`                            | 与登记 appCode 和任务 appCode 完全一致                 |
| `prepare_configuration(env, project)` | 校验输入并生成实例配置；project 由平台按部署 UUID 生成 |
| `hosting_configuration(values, port)` | 把实例配置转换为托管模式，包括分配的回环端口           |
| `encode_env(values)`                  | 安全编码环境变量，返回可写入配置文件的文本             |
| `write_private(path, text)`           | 安全写入私有配置，限制文件权限，不泄漏密钥             |
| `read_env(path)`                      | 读取实例配置，供安装与受控更新使用                     |
| `prepare_hosting(directory, port)`    | 准备托管编排和入口配置，避免占用平台公网 80/443        |

钩子须支持安全重试，不能修改其他实例或全局业务配置。部署任务不能指定任意模块路径或命令；初始化命令来自管理员批准的描述。

Python 是当前“适配器”的实现约束，不是应用自身编程语言的要求。业务镜像可以运行其他语言。

## 4. 固定约定及当前能力边界

- 托管安装及受控更新以 `APP_IMAGE` 为主镜像变量，正式值必须为完整 digest。
- 在线拉取分支使用 `ACR_USERNAME`、`ACR_PASSWORD` 执行 docker login，registry 从 APP_IMAGE 提取。这是现有字段命名，不代表限定阿里云；匿名公共仓库、多 registry 独立凭据不能仅凭通用 Manifest 声明就假定已适配。
- 运维配置 `useCachedImagesOnly` 时只检查本机镜像，不代表普通托管部署自动支持匿名拉取。
- Compose 文件固定为 docker-compose.prod.yml，平台生成 limits.json 并按声明服务分配资源。
- 当前不固定 api/worker/postgres/web/caddy 服务名；没有数据库的应用也可提供空 infrastructureServices 和 initialization。
- 当前平台托管要求一个主域名槽位；公网检查使用 hostingProfile.httpChecks，缺省路径是 `/`。平台会同时核验 TLS、HTTP 200 与实例路由标识，不强制 `/health/ready`。
- 当前受控托管升级是已批准版本间的 APP_IMAGE 替换，面向同 schema 兼容升级，不会自动执行任意新数据库迁移或任意多镜像原子升级。
- 托管 profile 是应用 metadata，Adapter 是节点配置，两者需要工程接入时配套审核；尚无一个后台向导自动完成两者生成和安装。

## 5. 执行顺序与运行隔离

校验任务/适配器/预算 → 校验实例及数据卷归属 → 建立执行日志 → 生成配置 → 复制审核过的文件 → 应用托管钩子 → Compose 校验与镜像准备 → 启动基础服务并等待健康 → 执行初始化步骤 → 启动应用及入口 → HTTP 检查 → 上报运行结果。

平台以部署 UUID 生成独立目录和 Compose project；使用应用描述中的服务、卷、端口和资源权重。节点上报通过验证的 supportedApps，平台只向支持该应用且资源可用的节点分配。

## 6. 备份、恢复和退出

日常备份调用：`sh <bundle>/<backupScript> <instance-directory> <project> <backup-directory>`。应用脚本负责停写/一致性、数据库与文件备份、必要的服务恢复，并输出备份及 SHA256SUMS；平台补入 limits.json、execution.json，核验摘要，再按节点配置进行 Restic 异机加密备份。

日常应用备份与平台退出冷快照是不同产物。平台退出快照格式 `lingcoo-cold-volumes-v1` 使用描述的 volumes/files，包含 manifest.json、配置、执行记录、卷归档与摘要；恢复到隔离卷，不会直接启动客户应用。应用必须验证自己的恢复方式，不能把“备份任务成功”当作“业务已恢复”。

接口实现：[备份](../scripts/hosting-node-backup.py)、[冷快照](../scripts/hosting-node-retire.py)、[隔离恢复](../scripts/hosting-node-recover.py)、[受控更新](../scripts/hosting-node-upgrade.py)。

## 7. 验收与样本使用

首次托管接入至少验证：未知适配器拒绝、摘要篡改拒绝、项目/卷归属拒绝、资源不足拒绝、初次安装、同任务重试、真实 HTTP 就绪、数据持久化、备份、隔离恢复、域名接入，以及声明支持的更新/退出路径。

平台有一个不依赖 Retail/Edu 结构的 [纯静态 nginx 交付样本](../test/fixtures/static-hosting) 与 [真实 Docker 验收](../test/hosting-static-docker.py)：无 API、Worker、数据库，验证安装、重放、备份和恢复。它是异构协议测试证据，不是任意第三方应用已完成验收的保证。

最小学习路径：先阅读该静态样本的钩子和 Compose，再按本应用的服务、数据与初始化需求编写完整包；Retail/Edu 可作复杂应用参考，但不要复制其业务变量、资源预算或迁移命令作为平台固定要求。
