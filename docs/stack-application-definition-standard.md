# 仓库应用定义与交付版本标准

本标准对应应用生命周期新入口，公开和私有仓库均可；与旧 Manifest v1 并存。当前能力与阶段进度见 [任务清单](../specs/application-lifecycle/tasks.md)。不得将“导入成功”当成部署或真实支付验收成功。

## 责任

应用仓库提供定义、Dockerfile、CI、Compose、初始化/迁移/健康、数据备份与恢复规则。Git 服务保存源码并执行 CI，ACR 或兼容仓库存储镜像。Stack 负责连接、版本、销售授权、交付和托管运维，不管理应用内部业务账号。

源码可公开也可私有，软件可免费也可收费，托管独立计费。价格、促销、服务连接密钥、客户输入和服务器资源由平台管理，不放入仓库定义。开源许可证和再分发义务由应用维护者确认。

## 文件和结构

推荐 `stack/app.yaml`（也可 JSON，导入时指定路径）。[容器应用完整示例](../examples/stack-compose-app.json) 是可通过结构检查的模板，镜像地址为示例，不能作为真实交付证据。

| 字段          | 内容                                                                                  |
| ------------- | ------------------------------------------------------------------------------------- |
| schemaVersion | 整数 1；与旧 Manifest 的字符串版本独立                                                |
| app           | 稳定 code、名称、类型、介绍、素材 URL、许可证 license、获取方式 acquisition=free/paid |
| features      | 权益 code/name/kind；沿用现有全局唯一权益 Code，建议应用名前缀                        |
| build         | GitHub Actions workflow 文件名，不含目录                                              |
| images        | 每个组件的 key、完整 repository、imageEnv；不含凭证和可变 tag                         |
| delivery      | none 或 compose；none 说明入口和使用方式，compose 见下文                              |

严格契约：[applicationDefinitionSchema](../packages/contracts/src/app-lifecycle.ts)。未知字段、错误引用和重复字段会拒绝。JSON/YAML 不超过 500 KB，重复键与 YAML 别名不支持。只声明密钥字段，不填写其默认值或实际值。

## Compose 交付

`delivery.kind=compose`，声明支持的 self_hosted/managed 模式。`compose` 可内嵌对象；仓库导入可填仓库根目录相对路径，Stack 在同一个固定提交读取。上传单文件时必须内嵌 Compose。

每个应用组件使用 `${IMAGE_ENV}`，必须与 images.imageEnv 对应；数据库等基础镜像直接固定完整 `@sha256:`。CI 提交版本时填入应用镜像摘要。允许多个服务共享同一镜像变量。

声明普通参数 envFields、secretFields、domainSlots，语义沿用现有交付字段；镜像变量和域名变量独立声明，不重复放入 envFields。所有 Compose 插值必须有对应声明，容器内部 shell 变量使用 `$$` 转义。

根节点只支持 services/volumes/networks。服务设置采用白名单；不允许 build、privileged、主机目录挂载、Docker socket、固定 container_name、主机网络、外部资源和直接发布主机端口。只允许项目隔离的命名卷与默认网络。入口端口由 Stack 执行器注入，避免客户实例冲突。超出支持范围会明确拒绝，不静默丢弃。

`resources` 声明实测 CPU/内存/磁盘预算；`entrypoint` 声明入口服务、容器端口、健康路径；`lifecycle` 声明 migrate/initialize/backup/restore 的服务和 argv 命令。持久化应用必须提供备份和恢复命令，upgradePolicy 指明 same_schema/migration_required。初始化必须可重试，不能在日志输出秘密；回滚镜像不替代数据库恢复。

开发者可运行 `npm run app:definition:validate -- <app.yaml|app.json> <仓库根目录>`，复用服务端校验规则；通过仅表示定义结构有效。

## 导入与版本

后台应用列表 → 从仓库或文件导入 → 读取并校验 → 预览 → 创建草稿。公开 GitHub 匿名读取；私有 GitHub 配置 Contents: Read 连接。只访问固定 GitHub API，不执行仓库代码，不跟随任意下载 URL。导入先将 ref 解析到提交，应用和 Compose 都读取同一提交。重复 App Code 拒绝覆盖。

服务连接令牌加密保存，后台只返回配置状态；连接纳入平台密钥轮换。构建使用 CI 的推送凭证，部署只使用只读镜像凭证。

版本以应用+version 唯一，包含完整源码 commit、解析后的 definition 快照、所有 images 的固定摘要、notes 和可选 buildUrl。同内容重复提交幂等，内容不同返回冲突，已登记快照不得编辑。发布不自动上架或升级实例；撤回保留历史快照。

当前容器版本发布要求通用执行器运行验收；相关阶段未完成时 API 会阻止发布。免部署版本可登记、发布和撤回，但商品仍需单独配置销售与授权规则。没有通过真实镜像拉取、初始化、就绪、HTTPS、备份恢复验收时，不能宣称可正式交付。

## 接口

管理员接口需 apps.manage 权限，浏览器请求沿用现有会话与 CSRF 保护。

| 方法     | 路径                                                 | 用途                                                           |
| -------- | ---------------------------------------------------- | -------------------------------------------------------------- |
| GET/POST | /v1/admin/app-connections                            | 列表/添加服务连接                                              |
| DELETE   | /v1/admin/app-connections/:connectionId              | 撤销连接                                                       |
| POST     | /v1/admin/apps/import/preview                        | `{source:{repository,ref,path,connectionId?}}` 或 `{document}` |
| POST     | /v1/admin/apps/import                                | 提交通过校验的预览创建草稿                                     |
| GET      | /v1/admin/apps/:appCode/lifecycle                    | 来源、定义、版本列表                                           |
| POST     | /v1/admin/apps/:appCode/releases                     | 登记不可变版本                                                 |
| POST     | /v1/admin/apps/:appCode/releases/:releaseId/publish  | 发布版本，独立于商品销售                                       |
| POST     | /v1/admin/apps/:appCode/releases/:releaseId/withdraw | 撤回版本                                                       |

GitHub 读取规则参照 [Contents API](https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28)。CI 触发参照 [Actions Workflow API](https://docs.github.com/en/rest/actions/workflows?apiVersion=2022-11-28)。镜像识别遵循 [Registry HTTP API v2](https://distribution.github.io/distribution/spec/api/)。
