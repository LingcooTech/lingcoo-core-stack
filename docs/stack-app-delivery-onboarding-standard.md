# Stack 应用接入标准

状态：当前可执行标准，核对日期 2026-10-11。覆盖免部署、自有服务器部署、平台托管；不包含 CloudBase、SAE 或第三方开发者分账。本文替代本文件此前的早期接入指南。代码事实、运营要求和待实现能力分别标注，不把规划当作已实现能力。

阅读顺序：本文 → [托管适配器协议](stack-hosting-adapter-contract.md) → [后台填写指南](app-configuration-and-images-20261011.md)。平台解耦情况和剩余限制见 [解耦审计](stack-application-decoupling-audit-20261011.md)。Retail、Edu 是实现样本，不是平台协议的定义来源。

## 1. 接入的含义与责任

接入由四部分组成：商品声明、交付声明、可执行交付产物、验收证据。Manifest 是安装说明书，不是安装器；后台表单不会自动把任意镜像转化成可交付应用。

| 边界       | 应用提供                                     | Stack 提供                                     |
| ---------- | -------------------------------------------- | ---------------------------------------------- |
| 商品       | 名称、介绍、素材、功能权益、套餐、适用范围   | 商品展示、报价、订单、支付、授权权益           |
| 交付       | 固定版本制品、Manifest、安装/迁移/初始化逻辑 | 参数表单、配置与凭据管理、部署授权、状态记录   |
| 自有服务器 | 可重试的安装入口与运维脚本                   | deploy token、配置交换、交付状态与更新任务协议 |
| 平台托管   | 托管运行声明及受信任适配包                   | 容量调度、任务执行、域名/证书、实例与运维管理  |
| 数据运维   | 数据位置、一致性备份、恢复和版本兼容规则     | 托管操作编排、归属校验、异机备份和操作审计     |

应用不得导入 Stack 业务领域模块或直接访问 Stack 数据库。Stack 不参与应用内部业务表和业务流程。Starter、编程语言、Web 框架和 PostgreSQL 都不是通用接入门槛；应用应使用当前执行环境支持的运行形式，额外依赖由交付包负责声明和适配。

当前只支持客户自有服务器与 Lingcoo 自管 Linux 虚拟机托管。平台托管执行依赖 Docker/Compose；不表示支持任意操作系统、纯静态托管供应商或任意无容器应用。

## 2. 三种接入层次

| 项目                         | 免部署             | 一键部署：自有服务器 | 一键部署：平台托管     |
| ---------------------------- | ------------------ | -------------------- | ---------------------- |
| `meta.deliveryMode`          | `none`             | `one_click`          | `one_click`            |
| 商品、Plan、Feature、Offer   | 需要               | 需要                 | 需要                   |
| 明确购买后实际交付方式       | 需要               | 安装后获得系统       | 托管就绪后获得访问地址 |
| Manifest v1                  | 不要求             | 需要                 | 需要                   |
| 生产镜像、安装脚本、编排文件 | 不因该分类而要求   | 需要                 | 需要                   |
| `meta.hostingProfile`        | 不适用             | 不要求               | 需要                   |
| 节点登记的 Adapter v2        | 不适用             | 不要求平台节点适配器 | 需要                   |
| 真实交付验收                 | 需要验证承诺的服务 | 需要                 | 需要                   |

Chrome 扩展等免部署应用可以同时在应用内部调用 Stack 支付、在 Stack 商品页购买：两者使用同一 App Code、用户和授权接口，具体见[双入口与解耦审计](stack-application-decoupling-audit-20261011.md)。

“免部署”只表示购买后不创建服务器实例。当前不自动为任意第三方 SaaS 开通账号、生成兑换码或交付下载资源；需要对应应用已有交付集成或明确人工履约方式。不能只配置商品就宣称这些能力已经实现。

## 3. 商品声明

- 使用稳定 App Code；为同时满足节点能力声明，统一使用 `^[a-z][a-z0-9_]{0,63}$`，不使用会改变的市场名称。
- 配置基础信息、展示内容、图片、功能权益 Feature、套餐 Plan 和报价 Offer。
- 报价关联套餐，套餐关联有效权益；部署型套餐声明部署数量及域名绑定等 deployment policy。
- 标准运营流程要求正式人民币报价为正数，验收专用价格保持草稿。
- 软件购买权益与托管服务资格分别管理；购买软件不自动等于获得免费托管。

后台创建和维护是可用入口。`app-products/<app-code>/product.json` 是推荐的版本化导入与复现方式，不是后台建商品的强制文件条件。字段结构以 [商品校验器](../src/lib/app-product-validation.ts) 为准；密钥仅通过环境变量映射注入，不能提交真实值。

## 4. 交付声明：Manifest v1

权威结构：[deliveryManifestSchema](../packages/contracts/src/delivery.ts)。`version` 为字符串 `"1"`；严格发布校验拒绝未知结构字段。托管 Adapter 的版本号 `2` 与这里的 Manifest 版本独立。

| 字段              | 必须表达的内容                                                   |
| ----------------- | ---------------------------------------------------------------- |
| `installer`       | 交付仓库 URL、版本引用、远程安装脚本 URL、绝对安装目录           |
| `domainSlots`     | 域名标识、名称、环境变量、部署输入字段、是否必填                 |
| `envFields`       | 普通配置的 key、label、type、scope、required、editable、advanced |
| `secretFields`    | 敏感配置；type 为 secret，禁止嵌入默认值                         |
| `assets`          | 资源唯一标识、类型、是否必需、公开/私有及镜像/文件/凭据引用      |
| `groups`、`notes` | 可选分组与操作说明                                               |

普通字段类型为 text、email、boolean；scope 为 preset（平台配置）或 user_input（客户部署时填写）。环境变量名必须为大写字母开头的字母、数字和下划线。字段不能重名，资源引用必须能解析到声明字段。

资源枚举包括 docker_image、http_file、github_release、qiniu_object、custom，但“能声明某类型”不等于平台内置了该类型的安装执行器。新应用仍需要执行适配。镜像型应用的必需 Docker 镜像固定到完整 `@sha256:<64位摘要>`，不能以 latest 或仅 Git SHA tag 替代发布检查要求。

清单来源可以是直接返回 JSON 的正式 HTTPS 地址，或公开 GitHub 交付仓库。两者同时配置时 URL 优先；应用源码不需要公开。更换来源后先保存，再同步。同步读取并保存清单，不自动执行安装，不构成制品发布方认证或安装安全证明。

## 5. 应用交付包必须满足的运营要求

下列是接入验收要求，不表示当前 Schema 可以自动证明全部成立：

- 运行镜像包含所需运行文件，不包含真实密钥、测试数据和开发缓存；默认采用最小权限运行。
- 固定应用版本、镜像 digest、交付包校验和及安装入口；记录可追溯源码版本。仓库供应商不是 ACR 专属约束，但当前托管登录字段仍叫 `ACR_USERNAME`、`ACR_PASSWORD`。
- 提供 Compose 编排，声明所有应用服务、基础服务、网络、端口和持久数据；资源预算基于实测。
- 迁移、首次初始化支持无人值守；重复运行不破坏既有数据和内部密钥，失败有非零退出码。命令名称和实现语言不限定为 npm。
- 需要初始化的应用仅在首次安装消费初始化凭据，不写入日志或可公开文件。
- 提供可验证的就绪检查；检查路径按应用声明，不要求所有应用固定使用 `/health/ready`。Worker 进程存活与业务队列正常消费应分别验收。
- 应用入口正确处理平台域名、代理和公网地址。需要域名授权约束时，交付包负责实现相应绑定，不能仅依赖前端按钮隐藏。
- 持久数据必须有备份、隔离恢复和退出交付方案。数据库不兼容迁移不能仅靠回退镜像处理。
- 不提交业务源码、真实 `.env`、私钥或拉取密码到公开交付仓库。镜像并不保证源码不可提取；客户自有服务器管理员也能接触下发凭据，应使用专用受限凭据。

## 6. 自有服务器交付

流程：购买取得权益 → 创建部署并填写 IP、域名与应用输入 → 获取 deploy token → 客户在服务器执行安装命令 → 安装器交换部署配置 → 拉取镜像、迁移、初始化、启动 → 就绪检查并上报结果。

安装器负责理解 Stack 配置交换与状态协议，准备依赖并执行应用安装。客户负责服务器与域名解析。仅在后台填写 IP 不授予 Stack SSH 权限，也不会自动远程执行命令。

安装器实现参考 [部署模块](../src/modules/deployment) 与应用发布后的安装脚本。不同应用可以实现相同协议，不要求导入 Retail 或 Edu 代码。

安装器的协议入口（请求类型以 [deployment.ts](../packages/contracts/src/deployment.ts) 为准）：

| 入口                                      | 用途                                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `POST /v1/deployments/bootstrap/exchange` | 提交 `{token}`，获取部署信息与 `bootstrap.envDefaults`；使用安装命令提供的 `FD_STACK_EXCHANGE_URL` |
| `POST /v1/deployments/status/report`      | 使用部署 ID 与状态上报凭据提交就绪和资源版本；地址与凭据由交换结果提供                             |
| `POST /v1/deployments/actions/pull`       | 拉取此部署的待执行动作                                                                             |
| `POST /v1/deployments/actions/complete`   | 回报动作结果；失败不应冒充成功                                                                     |

新应用使用通用 `runtimeAssets.current/available` 字典，key 对应 Manifest 中的 asset key。例如 `runtimeAssets: {current: {"app-runtime": "registry/repo@sha256:..."}, available: {}}`；省略号是说明占位符，不能作为实际 digest。状态上报令牌与初始 deploy token 职责不同，不能混用或写入日志。

部署状态接口仅接受通用 `runtimeAssets`，不再接受 `runtimeImages`、`wordpressAssets` 或 WordPress 专用动作。旧数据由一次性迁移转为通用结构并加密归档，安装器必须升级到当前协议。通用 Docker 镜像更新动作仍为 `apply_runtime_images` / `ignore_runtime_images`。

## 7. 平台托管交付

除上述交付要求，还需要两份声明：

- `meta.hostingProfile`：平台调度/监测信息，包括 enabled、domainField、CPU/内存/磁盘预算、monitoring 和可选 httpChecks。以 [hostingProfileSchema](../packages/contracts/src/hosting.ts) 及 [监测协议](../packages/contracts/src/hosting-monitor.ts) 为准。
- 节点 `adapters[appCode]`：运维管理员预装的 Adapter v2，包含编排、初始化、健康检查、数据卷、备份和文件摘要。见 [完整适配接口](stack-hosting-adapter-contract.md)。

当前托管创建要求 Manifest 恰有一个域名槽位，其 sourceField 与 hostingProfile.domainField 一致。后台普通交付表单不会自动生成或部署托管适配包；首次托管接入由工程和运维完成。

节点只有在受信任适配包验证通过后才报告 supportedApps，平台按应用能力与可用容量调度；未匹配节点不会回退到 Retail 或强行部署。托管执行完成后，平台处理默认子域名、路由、证书和公网验证。自定义域名由客户解析到平台指定地址，再验证绑定。

## 8. 识别与验证分层

| 阶段         | 当前做什么                                                                                                | 不代表什么                                     |
| ------------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 同步         | 下载 JSON，做兼容解析，保存原始清单及来源                                                                 | 不等于严格发布校验或来源认证                   |
| 商品离线校验 | 校验商品结构、清单与引用；`--ready` 增加售卖配置要求                                                      | 不访问真实镜像仓库、不证明安装成功             |
| 后台配置检查 | 报价权益、严格 Manifest、参数/凭据存在、安装 URL、资源引用及 digest；声明托管时检查 profile 与 monitoring | 不下载执行安装器、不验证凭据权限、不做真实付款 |
| 节点运行前   | 应用能力、资源、适配器摘要、实例归属、固定镜像、任务参数                                                  | 文件摘要不是第三方代码安全审计或发布方签名     |
| 真实验收     | 拉取、安装、就绪、HTTPS、状态、备份恢复、支持范围内的更新及失败路径                                       | 不能用一次样本成功保证任意新应用可用           |

代码入口：[商品校验](../src/lib/app-product-validation.ts)、[配置检查](../src/modules/app/readiness.ts)、[同步](../src/modules/app/manifest-service.ts)、[调度](../src/modules/deployment/hosting.ts)、[节点校验](../scripts/hosting_adapter.py)。

当前缺口：服务端强制配置检查主要用于 one_click 首次启用或从其他模式切换到启用的 one_click；免部署发布、已经启用商品的后续修改没有完全统一的强制发布门禁。离线校验、同步兼容解析、后台检查的覆盖范围也不同。运营必须遵循完整验收流程，不能把缺少拦截理解为允许跳过要求。

## 9. 新应用接入步骤与完成定义

1. 确认免部署/自有服务器/托管支持范围，明确购买后实际交付物。
2. 应用方准备运行制品、Manifest、安装入口；需要托管时准备 Adapter v2 和 hostingProfile。
3. 在 Stack 创建草稿，同步正式清单，填写 preset 和密钥，配置 Feature/Plan/Offer；可使用 product.json 导入复现。
4. 运维登记并验证托管适配包、备份配置及 supportedApps；自部署不需要平台节点适配器。
5. 执行离线、后台和真实交付验收，记录版本、结果及不支持范围。
6. 正式报价、权益、交付和售后安排确认后再启用商品。

可用离线命令（在 Stack 仓库，使用项目规定 Node 版本）：

```sh
npm run app:validate -- app-products/<app-code>/product.json
npm run app:validate -- app-products/<app-code>/product.json --ready
```

导入会写入数据库，应在目标环境明确后使用 `npm run app:import -- <product.json> --require-secrets --ready-for-sale`；草稿导入不要加 ready-for-sale。命令通过不替代后台配置检查和实际验收。

完成清单：

- [ ] 草稿商品与正式版本一致，真实密钥没有进入仓库或日志。
- [ ] 售价、套餐和授权权益正确，支持的交付类型明确。
- [ ] 安装、重复执行、失败重试、健康及状态回报有证据。
- [ ] 托管的节点能力、预算、域名/证书、公网访问有证据。
- [ ] 持久数据备份和隔离恢复有证据，更新/回退适用范围明确。
- [ ] 真实支付等外部环节另行验收；未验收项明确记录，不能伪记为通过。

## 10. 样本与历史材料

- [Retail 接入记录](retail-stack-onboarding-runbook.md)：具体样本和历史证据，不是新应用必须复制的业务模型。
- [后台填写指南](app-configuration-and-images-20261011.md)：当前交付字段操作。
- [应用与平台责任规划](app-platform-responsibility-contract.md)：保留早期规划，当前范围以本文为准。
- 历史具体 registry、namespace、Retail/Edu 字段和 npm 命令是样本值，不是通用平台标准。
