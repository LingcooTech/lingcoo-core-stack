# 仓库应用定义与交付版本标准

本标准对应应用生命周期新入口，公开和私有仓库均可；与旧 Manifest v1 并存。当前能力与阶段进度见 [任务清单](../specs/application-lifecycle/tasks.md)。不得将“导入成功”当成部署或真实支付验收成功。

## 责任

应用仓库提供定义、Dockerfile、CI、Compose、初始化/迁移/健康、数据备份与恢复规则。Git 服务保存源码并执行 CI，ACR 或兼容仓库存储镜像。Stack 负责连接、版本、销售授权、交付和托管运维，不管理应用内部业务账号。

源码可公开也可私有，软件可免费也可收费，托管独立计费。价格、促销、服务连接密钥、客户输入和服务器资源由平台管理，不放入仓库定义。开源许可证和再分发义务由应用维护者确认。

## 文件和结构

推荐 `stack/app.yaml`（也可 JSON，导入时指定路径）。[容器应用完整示例](../examples/stack-compose-app.json) 是可通过结构检查的模板，镜像地址为示例，不能作为真实交付证据。

### 生成应用开发模板

在 Stack 仓库运行以下命令，将模板生成到尚不存在的目录，然后按生成的 `STACK-DELIVERY.md` 集成到应用仓库：

```sh
npm run app:create -- --kind compose --directory /tmp/my-stack-app --code my_app --name 我的应用 --image registry.example.com/team/my-app
npm run app:create -- --kind none --directory /tmp/my-extension --code my_extension --url https://example.com/download
```

Compose 模板包括可运行 HTTP 样本、Dockerfile、Compose、源码与实际镜像启动测试、CI 登记流程。免部署模板包括定义、入口与不推送镜像的登记流程，应用自身构建与授权测试需由开发者补入。两套模板默认免费且许可为 UNLICENSED，开发者必须确认实际许可与商品策略。

生成的 `scripts/stack-toolkit.cjs` 内置与服务端同源的结构校验规则，在应用目录运行 `npm run stack:validate` 即可，无需安装 Stack。`release` 子命令额外核对完整提交、版本和镜像集合。校验器更新通过重新生成、审查工具差异后替换；平台接收时再次校验。模板不覆盖已有目录，不自动创建远程仓库或上传密钥。

完整责任矩阵、首次接入步骤及验收清单见 [开发交付模板说明](../templates/stack-app/README.md)。模板与单容器启动检查不代替平台多服务交付验收。

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

声明普通参数 envFields、secretFields、domainSlots，语义沿用现有交付字段；镜像变量和域名变量独立声明，不重复放入 envFields。所有 Compose 插值必须使用完整 `${VARIABLE}` 并有对应声明，默认值写在字段定义中，不在 Compose 中使用 `:-` 等运算符。容器内部 shell 变量或字面量美元符号使用 `$$` 转义。环境变量列表必须显式写 `KEY=value`，不允许继承宿主机环境变量。

根节点只支持 services/volumes/networks。服务设置采用白名单；不允许 build、privileged、主机目录挂载、Docker socket、固定 container_name、主机网络、外部资源和直接发布主机端口。只允许项目隔离的命名卷与默认网络。入口端口由 Stack 执行器注入，避免客户实例冲突。超出支持范围会明确拒绝，不静默丢弃。

`resources` 声明实测 CPU/内存/磁盘预算；`entrypoint` 声明入口服务、容器端口、健康路径；`lifecycle` 声明 migrate/initialize/backup/restore 的服务和 argv 命令。持久化应用必须提供备份和恢复命令，upgradePolicy 指明 same_schema/migration_required。初始化必须可重试，不能在日志输出秘密；回滚镜像不替代数据库恢复。

### 实例密钥和初始化顺序

可选 `generatedSecrets` 声明 `{key, encoding: "hex", bytes: 32}` 数组（16–64 字节）。key 必须对应 `secretFields` 中 `scope=preset`、`editable=false` 的字段。平台首次绑定实例时生成，加密保存；任务重试复用原值，不允许客户覆盖。普通参数、域名和其他密钥仍按声明校验。生成字段的声明不包含密钥值。

`lifecycle.infrastructure` 显式列出迁移/初始化前启动的服务，例如 `["postgres"]`。这些服务必须有启用的健康检查，且只能依赖同一基础服务集合。存在 migrate/initialize 命令时，执行内核要求显式声明该列表（无基础服务填 `[]`）。初始化命令使用已停止的应用服务创建一次性容器，按 argv 覆盖入口，成功步骤写入记录后才继续；应用自身仍须保证幂等，以处理进程在命令成功但记录落盘前中断的情况。

本阶段已实现内部安装绑定与通用安装内核：固定版本/计划、加密参数、逐阶段重试、完整服务健康及回环入口检查。节点不需要 Node，不执行仓库中的宿主机脚本；私密 Compose 通过 stdin 传入，节点步骤记录不保存明文参数。Docker 本身仍会保存容器环境变量，节点 Docker 管理权限属于受信任运维边界。

**客户 deploy token 和托管任务领取尚未接入新内核，备份恢复、DNS/TLS 与可信发布证据链仍待完成。因此容器版本发布门禁继续关闭，不能将内核安装成功视为完整生产交付。**旧实例不会自动切换。

新接入应用应声明 `resources.serviceLimits`，按 Compose 服务名填写 `{cpuMillis, memoryMb}`；必须覆盖全部服务、合计等于总预算，编译器直接采用该值，不再分摊。不能同时填写权重。模板已经采用明确限额。旧声明兼容可选 `resources.serviceWeights` 为全部服务逐一声明正整数权重，不填则均分。计划编译器先给每个服务 64 MiB 内存和 10 mCPU，再按权重分配剩余额度，余数以确定性顺序分配，合计严格等于实例预算；预算不足时拒绝生成计划。实际执行必须通过样本实测确认预算合适。磁盘字段目前用于容量预算，并非 Docker 文件系统硬配额。

嵌套环境配置、健康检查、依赖和网络也采用契约校验；未知服务、循环依赖、未声明网络与远端日志驱动会拒绝。执行计划覆盖源码中的 CPU/内存限制，关闭超额 swap，限制 PID 和日志，并启用 no-new-privileges。实例使用独立 `stack-<instance UUID>` Compose 项目，命名卷保持项目作用域。入口只绑定宿主机回环端口，公网访问由平台网关提供。

开发者可运行 `npm run app:definition:validate -- <app.yaml|app.json> <仓库根目录>`，复用服务端校验规则；通过仅表示定义结构有效。

## 导入与版本

后台应用列表 → 从仓库或文件导入 → 读取并校验 → 预览 → 创建草稿。公开 GitHub 匿名读取；私有 GitHub 配置 Contents: Read 连接。只访问固定 GitHub API，不执行仓库代码，不跟随任意下载 URL。导入先将 ref 解析到提交，应用和 Compose 都读取同一提交。重复 App Code 拒绝覆盖。

服务连接令牌加密保存，后台只返回配置状态；连接纳入平台密钥轮换。构建使用 CI 的推送凭证，部署只使用只读镜像凭证。

版本以应用+version 唯一，包含完整源码 commit、解析后的 definition 快照、所有 images 的固定摘要、notes 和可选 buildUrl。同内容重复提交幂等，内容不同返回冲突，已登记快照不得编辑。发布不自动上架或升级实例；撤回保留历史快照。

当前容器版本发布要求通用执行器运行验收；相关阶段未完成时 API 会阻止发布。免部署版本可登记、发布和撤回，但商品仍需单独配置销售与授权规则。没有通过真实镜像拉取、初始化、就绪、HTTPS、备份恢复验收时，不能宣称可正式交付。

容器版本行中的“部署计划”按该版本的定义和镜像快照生成只读预览；即使来源候选定义后来改变，预览也不改用新定义。可选择定义支持的部署模式，查看逐服务镜像/资源、持久化卷、入口及必填参数。预览不创建实例、不预留服务器、不显示实例密钥。接口 POST `/v1/admin/apps/:appCode/releases/:releaseId/plan` 接收 `{instanceId,mode}`，当前 `executionEnabled=false`，不等于运行验收通过。

## 源码同步和 CI

应用生命周期页的“关联仓库定义 / 同步交付定义”重新读取固定提交，比较候选定义后保存。同步不覆盖商品名称、价格、权益销售配置、已有版本快照或实例；这些内容有各自的发布与交付步骤。

“构建新版本”调用仓库已有 GitHub Actions workflow_dispatch。连接需拥有该仓库 Contents: Read、Actions: Read/Write；公开仓库匿名读取仍可用，但触发构建必须选择有写权限的连接。构建流程在默认分支存在，接收 stack_commit、stack_version、stack_build_id 三个字符串输入，checkout 必须固定 stack_commit。Stack 保存请求 ID、提交和版本，展示 GitHub 运行状态和日志链接。网络失败时请求标记为待核对，不自动重新触发；先检查 Actions 运行记录，确认没有运行后再创建新请求。

在应用内生成“CI 发布凭证”，有效期 90 天，只显示一次，存入该应用仓库 Secret `STACK_PUBLISH_TOKEN`。后台可撤销；凭证不能访问管理接口，也不能给其他应用登记版本或发布商品。后台只保存凭证摘要。到期前生成新凭证替换 CI Secret，再撤销旧凭证。

将 [便携登记脚本](../scripts/publish-application-release.mjs) 复制到应用仓库的 scripts 目录，参照 [构建工作流模板](../examples/stack-publish-workflow.yml) 配置；模板须补上应用自身测试与生产启动校验。应用依赖可以是自己的 Node/pnpm 版本，登记脚本用单独 Node 22 步骤执行，并在临时目录安装 yaml@2.9.1。配置变量 STACK_API_URL 为平台 HTTPS 地址，WEB_IMAGE_REPOSITORY 为定义中的镜像仓库；ACR 推送凭证仅保存在应用 CI Secret。多镜像应用逐一构建，在 images.json 中提供每个声明 key 对应的完整 repository@sha256 摘要。

调用示例：`node scripts/publish-application-release.mjs stack/app.yaml images.json 1.0.0 <40位commit>`。脚本解析同一 checkout 内的 Compose，将定义快照和镜像摘要提交到 Stack，只登记草稿。未通过通用执行器运行验收的容器版本仍不能发布。只配置工作流不代表已完成真实 ACR 构建回传，须用实际应用验证。

## 镜像仓库管理

应用生命周期页的组件镜像表提供“查看仓库版本”。公开仓库可匿名读取；私有仓库选择与声明中 registry host 完全匹配的拉取连接。后台分页读取标签，可以将标签或已有摘要解析为固定 repository@sha256，独立计算 Manifest 内容摘要并与仓库声明核对。镜像标签可以变化，不作为已登记交付版本的身份。

只查询当前应用声明的组件仓库；不开放任意地址代理，不跟随重定向。HTTPS 连接在实际 socket 的 DNS 查询中限制为公网地址，防止域名重绑定访问内网。认证仅向本仓库同源令牌服务，以及已知阿里云个人版、Docker Hub 认证端点发送；申请的令牌 scope 固定为该仓库 pull。其他跨域认证服务暂不支持，会明确报错。只读账号仍需在镜像厂商侧授予最小拉取权限。

该操作验证 Manifest 可访问及摘要一致，不下载全部镜像层，不代表平台架构兼容、初始化、就绪或备份恢复已验收。实际交付仍需运行验证。开发机的代理若将域名解析为 198.18.0.0/15 等保留地址，会被内网访问保护拒绝；不应为测试关闭保护，可在正常公网 DNS 的部署环境验证。

管理员接口：GET `/v1/admin/apps/:appCode/images/:imageKey/tags` 查询标签，connectionId/last 为可选查询参数；POST `/v1/admin/apps/:appCode/images/:imageKey/resolve` 以 reference 和可选 connectionId 核对固定镜像摘要。

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
| PUT      | /v1/admin/apps/:appCode/source                       | 保存候选来源与定义                                             |
| GET/POST | /v1/admin/apps/:appCode/builds                       | 读取运行记录 / 触发固定提交构建                                |
| GET/POST | /v1/admin/apps/:appCode/publishing-tokens            | 列表 / 生成应用 CI 凭证                                        |
| DELETE   | /v1/admin/apps/:appCode/publishing-tokens/:tokenId   | 撤销 CI 凭证                                                   |
| POST     | /v1/publishing/apps/:appCode/releases                | 应用专属 Bearer CI 凭证登记版本草稿                            |

GitHub 读取规则参照 [Contents API](https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28)。CI 触发参照 [Actions Workflow API](https://docs.github.com/en/rest/actions/workflows?apiVersion=2022-11-28)。镜像识别遵循 [Registry HTTP API v2](https://distribution.github.io/distribution/spec/api/)。
