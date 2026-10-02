# Lingcoo Core Stack 架构与工程底座升级方案

评估日期：2026 年 10 月 2 日。本文保留评估时的代码基线与方案；实际实施、验证与阶段提交见 [实施记录](foundation-upgrade-progress.md)，切换流程见 [升级操作说明](foundation-release-runbook.md)。

本方案以当前 `ts-fastify-business-starter` 的代码与工程规则为参照，优先强化 Stack 的模块边界、依赖组装、数据一致性、异步任务、安全基线和自动化验收。应用商城扩展、托管基础设施、第三方发布者和新的实例模型留到本方案验收之后。

建议保留 Stack 的模块化单体、API 与 Worker 两个进程、PostgreSQL、Redis、真实支付 Provider 和当前 Admin UI，通过增量改造建立可执行的架构约束。底座完成的标准是关键行为有回归保障，边界违规能够被 CI 拦截，故障能够恢复，升级能够复现。

## 1 评估依据与验证范围

| 对象    | 本次读取的版本                         | 工作区情况                                                                                                                                       |
| ------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stack   | HEAD `bc80000`，同时读取当前工作区文件 | 已有修改 `admin-ui/src/pages/AiTranslateWorkflowPrivacyPage.tsx`，已有未跟踪评估稿 `docs/architecture-assessment-starter-alignment.md`，本次保留 |
| Starter | HEAD `a192f80`                         | 本次读取时 `git status --short` 无输出                                                                                                           |

主要依据是两个仓库的源码、工程配置、迁移和测试，以及桌面的三份接入与架构文档。历史评估只作为背景，本方案的现状判断以本次代码核对为准。

已执行 Starter 的 `node scripts/check-module-boundaries.mjs`，结果通过。这只证明其现有检查规则通过，不代表 Starter 的全部质量检查或业务行为已经验证。

本机 Node 为 `v24.19.0`，npm 为 `11.17.0`。Stack 的生产配置与 CI 使用 Node 22；本地缺少后端 `tsc`、`tsx`、`eslint` 和 Admin 的 `tsc`、`eslint` 可执行依赖。本次没有安装依赖，也没有运行 Stack 的 typecheck、lint、业务测试、数据库集成测试、Docker smoke 或生产部署。下面的故障风险均标明为静态代码发现或设计判断，不作为线上事故结论。

### 静态结构基线

通过扫描 `src/modules` 中 TypeScript 的相对路径 `from` 导入，得到以下结果：

| 指标                                         | 当前结果 | 解释                                        |
| -------------------------------------------- | -------- | ------------------------------------------- |
| 业务模块目录                                 | 15       | 已具备模块组织基础                          |
| 模块公开入口 `public.ts`                     | 0        | 跨模块可见性没有统一入口                    |
| 跨模块导入声明                               | 71       | 按导入声明计数，包含类型导入                |
| 跨模块 Repository 导入声明                   | 25       | 需要优先改为用例接口或查询接口              |
| 模块文件直接导入聚合 Schema                  | 15       | 含正常的本模块持久化使用，不能全部视为违规  |
| 模块内 Service 或 Repository 的 `new` 表达式 | 440      | 是依赖组装分散的信号，不逐一认定为问题      |
| 后端测试文件                                 | 3        | 目前覆盖 RBAC、任务纯函数和部署请求 Schema  |
| 聚合 Schema 行数                             | 898      | 需要表所有权和稳定聚合出口                  |
| DeploymentService 行数                       | 2090     | 同时承担配置、授权、Token、交付、状态与动作 |

扫描不包含动态导入、路径别名、`src/lib` 和入口文件，也不判断运行时调用关系。实施阶段应保存可重复生成的依赖清单，不能只依赖这一次计数。

## 2 Starter 能力的采用范围

| 能力           | Starter 当前实现                                        | Stack 升级决策                                           |
| -------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| 模块公开边界   | `public.ts` 与检查脚本                                  | 采用公开入口与检查思想，增加语法树扫描和债务清单         |
| 依赖注入       | class 或 factory 显式依赖，模块注册时组装               | 集中 API 与 Worker 的组装定义，无需引入 DI 容器          |
| 数据库事务     | DatabaseTransaction 与 DatabaseExecutor                 | 替换 `tx as DbClient`，跨模块写操作显式传递同一 executor |
| Jobs           | Registry、Payload Schema、Attempt、租约、领取凭据与心跳 | 优先适配现有任务表和任务种类，保留存量任务               |
| Settings       | Registry、来源、版本冲突、Keyring、连接测试             | 采用治理机制，保留现有设置键和后台兼容接口               |
| Audit          | 上下文、脱敏、事务内记录                                | 复用现有 `audit_logs`，升级语义和安全投影                |
| Access Control | 独立 Guard 和权限接口                                   | 保留 Stack 角色与权限，集中身份、状态和授权检查          |
| Contracts      | 独立 Zod 请求响应协议                                   | 统一 Zod 后按关键 API 分批建设                           |
| API Client     | 响应校验、错误协议、取消信号                            | 适配 Stack 的 Bearer 与后续 Cookie 模式，保留旧接口兼容  |
| HTTP 基础设施  | 安全错误、请求标识、可配置文档                          | 收敛到 Stack 的 HTTP 层，增加敏感信息过滤                |
| 质量门禁       | 边界、静态托管、数据库测试、Docker、E2E                 | 按 Stack 真实交付链路采用；模板生成和 CLI 发布检查不纳入 |
| Identity       | Session 与 CSRF                                         | 第一阶段保留 JWT 和 App Token，单独规划浏览器认证迁移    |
| Payments       | Starter 的支付模块与 Provider                           | 采用接口隔离和测试方式，保留微信与支付宝实现             |
| Storage        | 多 Provider 和资产库                                    | 先治理七牛接口，不增加尚未使用的 Provider                |
| Outbox         | 事务事件与可靠投递                                      | 预先明确边界，按真实异步一致性需要启用                   |

Starter 也需要选择性借鉴。它目前在 `modules/index.ts` 和 Worker 入口分别组装部分运行时；公开出口中存在用于外键引用的持久化表导出。Stack 应明确区分运行时业务接口与 Schema 引用，避免通过公开出口重新暴露完整 Repository。

Starter 的边界脚本使用正则扫描相对路径 `from` 导入，主要检查公开入口和目录形状。它不能单独证明层级依赖、路径别名、动态导入、循环依赖或表写入所有权正确。Stack 的门禁应覆盖这些约束，并有违规样例验证检查器确实生效。

## 3 必须优先处理的风险

P0 表示应在扩展新平台能力前处理的正确性或安全问题。以下为静态发现，未进行线上复现。

| 编号 | 现状与风险                                                             | 处理要求                                                           | 代码依据                                             |
| ---- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------- |
| F01  | `claimNext` 仅取 pending，可重试失败写为 failed，Worker 未自动重新排队 | 建立明确可重试状态机，覆盖失败后自动再执行                         | `src/lib/job-runs.ts`、`src/worker.ts`               |
| F02  | 任务完成与失败仅按 jobId 更新，没有领取凭据；长任务无心跳              | 领取生成 claimToken，写回和租约恢复受条件保护                      | `src/lib/job-runs.ts`                                |
| F03  | 注册时无管理员则创建 admin；登录也可在无管理员时提升权限               | 生产环境显式初始化管理员，普通注册和登录不授予管理员；兼容已有账号 | `src/modules/auth/service.ts`                        |
| F04  | Jobs 管理列表返回任务记录，重试共用 observability.view                 | 使用安全诊断 DTO；增加 jobs.manage 并明确角色映射                  | `src/lib/job-runs.ts`、`src/modules/admin/routes.ts` |
| F05  | Settings 密钥可回退到 JWT Secret；密文无 keyId                         | 增加独立 Keyring 和兼容旧密文的轮换流程                            | `src/lib/settings-crypto.ts`、各 Settings Service    |
| F06  | 全局错误可能把未分类异常 message 和 details 返回客户端                 | 5xx 返回稳定安全摘要，详细异常保留在脱敏日志中                     | `src/app.ts`、`src/lib/errors.ts`                    |
| F07  | Token 使用先查询再更新，更新未附 active 与有效期条件                   | 原子消费、明确一次性语义，兑换流程保持一致性                       | `src/modules/deployment/repository.ts`、`service.ts` |
| F08  | 部署额度先 count 再 create；JSON meta 动作用整对象读改写               | 锁定额度来源或原子预留；动作增加互斥和版本条件，避免覆盖           | `src/modules/deployment/service.ts`                  |
| F09  | 生产迁移脚本缺失 DATABASE_URL 时使用默认本地连接                       | 生产与 CI 显式校验目标；缺失配置直接失败                           | `scripts/run-migrations.mjs`                         |

另外需要优先验证身份类型和用户状态：普通 authenticate 目前主要验证 JWT，用户 Token 与 App Token 使用同一签名配置；Admin Guard 查询角色但未显式检查 suspended。应建立 Principal 模型，验证 user/app 类型、主体有效性及停用状态，不把签名正确等同于可执行所有业务操作。

公开注册与登录自动产生管理员的行为是本次新核实的重点。数据库事务中的 count 检查也不能替代管理员初始化的并发控制。显式 bootstrap 应通过锁或唯一初始化记录保证并发安全，并在已经存在管理员时幂等退出。

### 工程保障缺口

- 根 CI 没有 lint、format、Admin 安装与构建、数据库关键路径或迁移重复执行检查。
- 依赖审计使用 `|| true`，当前不会阻止存在未处置问题的合并；本次未执行漏洞审计，不认定已有漏洞数量。
- 后端 tsconfig 开启 strict，但只包含 src，测试文件没有独立类型检查配置。
- `build:admin` 内执行 `npm install`，构建与安装混合；Docker Verify 路径过滤未覆盖 Admin。
- Docker runtime 复制完整后端 node_modules；`.dockerignore` 未完整排除所有层级依赖目录及各种 Secret 文件。
- API 的连接关闭钩子已经存在，但 server 入口缺少调用 app.close 的信号处理；Worker 有停止标志，缺少有界等待、取消和异常路径统一清理。
- `/health` 与 `/ready` 已存在，应保留并验证语义；readiness 的依赖探测需要超时边界。
- 发布镜像对应固定 SHA，但服务器脚本更新到最新 origin/main，可能导致部署配置与镜像版本不一致；清理脚本会删除未使用镜像，需要验证回退资产保留。

## 4 目标架构与强制规则

```text
src/
  app.ts                    HTTP 应用工厂
  server.ts                 API 兼容入口
  worker.ts                 Worker 兼容入口
  entrypoints/              API Worker 和运维命令
  composition/              运行时组装与 Handler 定义
  config/                   一次性环境读取与校验
  http/                     插件 错误 Guard 和请求上下文
  platform/                 无业务语义的基础类型与工具
  db/                       连接 事务类型和 Schema 聚合出口
  modules/
    <module>/
      public.ts             公开用例 查询接口和类型
      plugin.ts             HTTP 装配
      api/                  参数与响应映射
      application/          用例 事务和依赖接口
      domain/               纯规则与状态机
      infrastructure/       Repository Provider 和持久化
      workers/              本模块任务 Handler
packages/
  contracts/                多端共享的请求响应 Schema
  api-client/               与 UI 无关的 HTTP 客户端
```

目标目录按模块逐步采用。已有平铺模块先建立公开边界和依赖注入，再在实质修改时移动文件。核心收益来自可见性、所有权和一致性约束，而不是目录数量。

### 模块依赖规则

1. 跨模块业务依赖只通过 `public.ts`，导出明确用例、查询 DTO、能力 Port 和稳定类型。不得用公开入口转导完整 Repository、内部 Service 的所有方法或可写 Drizzle 表。
2. `api` 负责协议映射与调用用例，不直接操作数据库、创建 Provider 或编排多步事务。
3. `domain` 不依赖 Fastify、Drizzle、Redis、环境变量、Repository 或其他模块内部实现。
4. Application Service 使用显式构造依赖；基础设施实现由 Composition Root 组装。事务内创建绑定 executor 的 Repository 仍可接受。
5. 模块不得自行读取 process.env、调用 loadEnv 或创建连接。环境配置和连接均从运行时注入。
6. `platform` 不依赖业务模块。`src/lib` 按真实职责逐步归位，不改名成另一个无边界公共目录。
7. Admin 聚合通过各模块的查询能力和命令能力；禁止 Admin 直接更新授权、订单或用户表。跨表报表需要单独的只读投影接口和登记例外。
8. 消除新增模块循环依赖。现有循环登记后分批拆除；运行时依赖组装也要验证，不能只让 import 图无环。
9. 外键定义确需其他模块的表引用时，使用只供持久化层的 Schema 出口或聚合引用，并在门禁中限制消费者。业务层不能借此读写其他模块表。
10. contracts 不依赖 Fastify、Drizzle、UI 或服务端 Secret；api-client 不依赖 React、路由或 React Query。

边界门禁建议采用 TypeScript 语法树与路径解析，覆盖 import、export from、require、可静态解析的动态 import 和路径别名。未知动态路径在受控层禁止或明确登记。既有债务清单精确到文件与导入，包含理由、归属和消除阶段；新增违规直接阻断，禁止整目录豁免。

### 核心表所有权

| 所有者                 | 核心数据                                                 | 跨模块访问方式                         |
| ---------------------- | -------------------------------------------------------- | -------------------------------------- |
| auth                   | 用户、认证身份、密码、验证码                             | IdentityQuery 与账户管理用例           |
| app                    | apps、app_secrets、app_offers                            | CatalogQuery 与应用管理用例            |
| license                | plans、features、plan_features、entitlements             | 套餐目录接口、权益查询、授予和撤销用例 |
| billing                | customers、subscriptions、orders、billing_webhook_events | BillingQuery 与支付退款用例            |
| checkout               | checkout_sessions、payment_attempts                      | 结算查询与支付结果投影接口             |
| install                | installs                                                 | 安装登记与绑定用例                     |
| deployment             | deployments、deployment_tokens、app_delivery_settings    | 部署与交付配置用例                     |
| settings               | system_settings                                          | SettingsReader 与配置管理用例          |
| jobs                   | job_runs 与新增 attempt 等字段或表                       | JobQueue 与安全诊断接口                |
| audit                  | audit_logs                                               | AuditWriter 与安全审计查询             |
| event 和 notifications | events 与 notifications 分别归属                         | 事件写入接口与通知投影接口             |

这是建议的唯一写入所有权，保留现有业务归属以减少迁移。剩余 content、docs、ticket、ai 表在阶段 0 完成清单。Schema 文件迁移时保留表名、约束名、索引名和旧聚合出口，运行 migration generation dry run，确认没有意外 DROP、RENAME 或重建历史。

### 跨模块事务

从真实 Drizzle 类型推导 `DbTransaction`，定义 `DbExecutor = DbClient | DbTransaction`；由 Application 层开启事务，Port 和 Repository 接受调用方 executor。逐步移除 `tx as DbClient`，事务内调用不允许回落到全局连接或隐式另开事务。

支付完成仍在一个数据库事务内更新订单、发放权益、更新 Checkout 和记录必要业务事实。用接口替换直接 Repository 引用时，必须保持这些原子性；不能为了消除循环依赖，把它们拆成不可靠的独立请求。

Billing 与 Checkout 的相互依赖可通过 Billing 定义的支付结果投影 Port 处理：Checkout 提供只依赖其自身 Repository 的 Adapter，由 Composition Root 注入 Billing；Checkout 的业务服务仍调用 Billing 的公开能力。验收同时检查静态依赖与运行时组装。

第三方支付或网络调用不因代码位于 transaction 回调中就具备数据库原子性。使用状态机、Provider 幂等键和补偿任务处理外部副作用，保持事务短小。

## 5 分阶段实施方案

### 阶段 A 建立基线与回归保障

先在隔离开发或 CI 环境恢复冻结安装，记录选定 Node/npm、两个 lockfile 和构建命令。先按当前生产 Node 22 配置建立基线；版本升级作为独立变更验证，不能同时混入目录迁移。

统一 `npm run check`，逐步纳入后端与 Admin 的 lint、typecheck、test、build、模块边界和生产静态托管检查。根 build:admin 只构建；安装由 CI 或 Docker 显式执行 `npm ci`。为测试建立独立 tsconfig，避免 src 的类型检查掩盖测试类型错误。

先补支付金额与币种校验、重复回调仅授予一次权益、退款重复执行、App Token appCode 不匹配、部署 Token 过期或撤销、现有 Admin 权限矩阵的特征测试。测试关注 HTTP 与数据库可观察行为，避免只复制实现细节。

验收：干净 checkout 能冻结安装与构建；现有业务回归通过；扫描输出依赖图和表所有权清单。确实阻塞基线的问题单独列出，不能把历史异常响应固化成永久正确行为。

### 阶段 B 修复底层正确性与安全问题

优先处理 F01 至 F09。Jobs 先修复重试状态转换与领取凭据，覆盖延迟重试、最大尝试、旧 Worker 写回、超时恢复和重复执行。此阶段可以先修原有文件，完整模块目录归位放到阶段 C。

明确普通注册与登录只能授予普通权限，管理员由显式 bootstrap 或授权管理员创建；生产关闭隐式提升和未配置 SMTP 自动验证等开发便利行为。认证 Guard 统一校验主体类型、必要的用户状态和资源归属。

加密先增加兼容旧格式的读取和 Keyring 支持，再迁移密文。迁移未完成前保留旧解密能力，不能直接强制新密钥导致已有支付、SMTP 和交付设置不可读。

部署 Token 原子消费，Token 兑换、域名预留及相关状态更新明确事务边界；支付与部署高风险命令补并发测试。额度检查和动作覆盖先治理现有模型，新的实例领域模型另行实施。

验收：P0 测试使用真实隔离 PostgreSQL；生产危险配置启动失败；API、日志、审计和任务诊断均不暴露测试 Secret。

### 阶段 C 收敛模块边界与运行时组装

先为核心模块提供窄 public API，再改消费者。以 auth、app、license、billing、checkout、deployment 和 admin 为第一批，随后覆盖其他模块。

构建 API 和 Worker Runtime Factory，共享配置定义、基础服务 factory 和 Handler Registry；两个进程分别创建和释放自己的连接，禁止共享 HTTP 实例或数据库连接对象。Route 通过依赖调用 Service，Worker 不再以分支特殊处理退款任务。

将 Jobs 收敛为独立模块，提供事务入队、Payload 版本与 Schema、Handler Registry、Attempt、领取凭据、租约、心跳、可控并发、有界关闭和保留期。投递语义采用至少一次，Handler 必须自行保证业务幂等；领取凭据只能保护状态写回，无法保证外部副作用恰好一次。

DeploymentService 按配置、Token/bootstrap、状态、动作与查询拆为用例，BillingService 按下单、通知、退款与对账拆分。对外 Facade 先保留响应与调用兼容，避免一次修改所有消费者。

验收：治理模块无未登记的跨模块内部导入；依赖与表写入所有权有检查；故意违规样例会失败；API/Worker 都可以注入测试 Provider 与时钟；事务回滚后订单、权益与关联任务保持一致。

### 阶段 D 治理配置审计授权与事件关系

Settings 用 Registry 声明类型、可见性、来源、连接测试与版本。通用优先级提议为环境覆盖、数据库值、代码默认、未配置；已有各类设置先逐项核实与兼容，支付和交付配置不得因切换优先级静默改变。

动态交付字段继续来自应用 Manifest，使用应用范围的配置定义或专门 Delivery Settings Adapter。不得把不同应用的同名字段平铺进全局 Registry，也不得把客户应用自身业务 Secret 纳入 Stack 通用设置。

Audit 增加统一 AuditContext、脱敏、大小限制和 executor 参数。关键管理操作与成功审计共享事务；业务事务失败的记录在回滚后单独追加，不写入 Secret 或任意异常原文。通知、观测等辅助失败不应把已成功执行的外部副作用当作可以安全重放的业务失败。

Access Control 通过公开 Guard/Port 管理权限；保留角色，区分只读观测和任务操作。保留 JWT/Bearer 的兼容支持，浏览器 HttpOnly Cookie 与 CSRF 迁移独立安排，并核对 CORS、代理信任和外部客户端行为。

Event 与 Notifications 解除构造耦合。先定义显式投影接口和幂等键；按事务一致性需求选择同步事务投影或持久任务。需要可靠异步发布不可变业务事实时采用 Outbox。不得直接删去通知调用，也不能将 events 表改名后视为 Outbox。

验收：配置并发修改返回冲突；环境覆盖可识别；旧密文可读取且完成轮换演练；Secret 安全投影通过；错误的角色、停用用户及主体类型被拒绝；通知失败不会丢失必要业务事实。

### 阶段 E 建立共享协议与请求幂等

先统一后端 Zod 4 与 Admin Zod 3 的主版本，验证表单 resolver 等消费者，再建立 Stack 自有的 contracts 与 api-client。优先覆盖身份、错误、Checkout、权益、部署及 Jobs，不一次迁移全部后台接口。

建议采用 npm workspaces 管理现有 admin-ui 和两个新增 package，保留后端根目录与 npm。实施前形成 package exports 与构建 ADR，验证 CommonJS 后端和 ESM/Vite 前端消费同一 Contract 的方式；共享包先构建，随后构建后端和 Admin，运行镜像包含真实需要的工作区产物。避免引入 workspace 后 Docker 中的符号链接指向未复制目录。

统一安全错误码、请求标识、时间和分页表达；api-client 验证响应，并区分 HTTP 错误、协议错误与网络错误。已有 API 响应兼容通过客户端映射或明确版本过渡实现，尤其不能直接将字符串 error 改成对象导致现有客户端失效。支付 Provider 回调格式独立遵循已有 Provider 协议。

请求幂等用于创建订单、Checkout、退款和部署动作：作用域包含主体、命令和 key；相同 key 不同 payload 返回冲突；并发请求共享受控结果；保存安全结果并规定过期策略。Provider 调用使用稳定幂等标识。它与支付回调去重、Job 去重、授权唯一性约束分别治理。

验收：CommonJS 与浏览器构建都消费共享协议；响应不符合协议时可定位；旧客户端关键路径继续通过；同 key 同 payload 不重复副作用，同 key 不同 payload 被拒绝。

### 阶段 F 验证生产交付与故障恢复

Docker 分离构建依赖和生产依赖，确认迁移运行时依赖属于 production dependencies；编译产物、迁移、共享包和 Admin 静态文件都纳入镜像检查。保留非 root、只读文件系统与现有 Compose 形态。

发布固定 image digest 或已验证不可变标签，部署配置检出相同 release SHA。迁移使用独立执行入口和部署互斥；检验并发迁移、空库、现有库升级、重复执行，以及已有 legacy migration repair 场景。历史 SQL 和 journal 保留。

增加 API 信号关闭、启动失败清理与依赖超时；Worker 停止领取后有界等待并中止支持取消的任务。进程或连接丢失后任务通过租约恢复。保留 health 与 ready 路径，增加 Worker 可观测状态，不能以进程存在代替能领取执行任务。

将安全审计作为可失败门禁；例外需要记录真实影响、补救措施和到期时间。锁文件、GitHub Actions 引用、构建镜像与回退资产都建立明确版本策略。

验收：生产镜像 migration、API readiness、Worker 执行与关闭、Admin 静态资源和深层路由刷新均通过；健康检查失败不报告发布成功；上一版本资产保留。数据库变化影响旧版本运行时，采用向前修复或经验证的恢复方案，不能承诺所有版本都能直接回滚。

## 6 建议的变更包与依赖顺序

| 变更包 | 范围                                                         | 前置条件                     |
| ------ | ------------------------------------------------------------ | ---------------------------- |
| PR01   | 工程基线、冻结安装、Admin 构建、关键业务特征测试             | 无                           |
| PR02   | 身份类型、管理员 bootstrap、安全错误与日志、独立密钥兼容前置 | PR01 的相关回归              |
| PR03   | Jobs 重试、领取凭据、租约、并发与敏感诊断                    | PR01，可与 PR02 顺序独立评审 |
| PR04   | 部署 Token 原子性、额度与动作互斥、迁移目标校验              | PR01                         |
| PR05   | public API、债务清单、边界检查器                             | PR01，P0 修复已形成稳定接口  |
| PR06   | Composition Root、运行时注入、准确事务类型                   | PR05                         |
| PR07   | 核心循环依赖、Admin 查询和命令、表所有权                     | PR06                         |
| PR08   | Jobs 模块与 Handler、Mail Adapter、关闭与恢复                | PR03、PR06                   |
| PR09   | Settings Registry、Keyring 完整轮换与配置版本迁移            | PR02、PR06                   |
| PR10   | AuditContext、授权 Guard、事件与通知接口                     | PR06、PR09 的相关接口        |
| PR11   | Zod 统一、共享 Contract、API Client 和兼容映射               | PR05、PR06                   |
| PR12   | 请求幂等与外部副作用补偿                                     | PR07、PR08、PR11             |
| PR13   | 生产依赖镜像、静态托管、发布 SHA、迁移与回退演练             | 各运行时与构建接口稳定       |
| PR14   | 完整质量门禁、关键 E2E、债务清单验收                         | 前述变更完成                 |

这是一份建议拆分，不是工期承诺。PR 应按实际复杂度继续拆小，保留独立可审查和可回退的结果。CI 与测试随每个变更增长，不能把验证全部推迟到 PR14。整个过程只在隔离环境执行测试迁移，不将方案评估解释为生产部署授权。

## 7 必须具备的验收场景

| 范畴      | 场景                                                         | 必须证明                                             |
| --------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| 架构      | 非公开导入、别名绕过、动态导入、循环和跨表写入样例           | 门禁识别违规，已登记例外不允许扩大                   |
| 事务      | 支付完成中途异常、权益写入失败、事务内入队失败               | 同一事务写入全部回滚，无半成功状态                   |
| 支付      | 重复和并发回调、金额或币种不匹配                             | 一次合法状态转换与一次权益发放                       |
| 退款      | 重复请求、Provider 超时、任务重试                            | 有稳定请求标识、可对账且不重复补偿                   |
| Jobs      | 失败重试、双 Worker、租约过期、旧 Worker 完成、进程杀死      | 自动恢复，旧凭据不能覆盖新结果，副作用可接受重复投递 |
| Jobs 诊断 | Payload 含验证码、Secret 和异常                              | Admin、日志与审计均无测试 Secret                     |
| 认证      | App Token 请求用户接口、停用用户使用旧 Token、无管理员时注册 | 正确拒绝或保留普通身份，不隐式授权                   |
| 授权      | 只读角色重试任务、跨用户读取订单或部署                       | 服务端拒绝，不能仅依赖隐藏按钮                       |
| 配置      | 缺失加密密钥、密文轮换、旧版本配置读取、并发保存             | 有明确失败、兼容和冲突语义                           |
| 部署      | 同 Token 并发兑换、过期或撤销、同时创建超额部署              | 一次性消费和额度约束真实生效                         |
| HTTP      | 未分类 500、验证失败、非 JSON 响应和取消                     | 稳定安全协议与请求关联标识                           |
| 数据库    | 空库、现有库、迁移二次执行、legacy repair、并发发布          | 历史保持，重复安全，失败阻断发布                     |
| 生产镜像  | 仅生产依赖、迁移与共享包产物、只读与非 root                  | 安装和运行不依赖开发依赖或本机文件                   |
| 前端      | 登录、权限、订单、权益、部署、生产深层路由刷新               | 当前产品路径保持可用                                 |
| 进程      | SIGTERM、启动失败、数据库与 Redis 超时                       | 有界退出、连接释放、任务可恢复                       |

纯规则使用单元测试，HTTP 使用 Fastify inject，事务与并发使用隔离 PostgreSQL，生产交付使用 Docker smoke，浏览器使用少量关键 Playwright 路径。前端交互测试和后端集成测试按风险选择；不以覆盖率数字替代这些行为验收。

## 8 迁移与回退边界

| 改造                       | 主要风险                                   | 控制方式                                                              |
| -------------------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| public API 与文件归位      | 只是重新导出内部实现，边界名存实亡         | 窄接口、消费者测试、表写入规则与门禁违规测试                          |
| Jobs 领取凭据              | 旧 Worker 仍可无条件写回，混合版本破坏保护 | 扩展 Schema 后停止或排空旧 Worker，再切换新实现；回退前处理新任务状态 |
| Keyring                    | 强制新配置导致旧密文不可读                 | 兼容读取、可重复轮换、迁移计数、保留旧 key 和经过验证的回退版本       |
| 事务类型与依赖注入         | 跨模块调用逃离事务或创建嵌套事务           | executor 明确传递，失败注入与真实数据库回滚测试                       |
| Settings 来源统一          | 环境变量和数据库优先级改变运行配置         | 逐项映射、解析预览、兼容层和连接测试                                  |
| Schema 所有权迁移          | 自动生成 DROP 或约束重建                   | 保留名字，生成结果审查，禁止重写历史                                  |
| Contracts 与 npm workspace | CommonJS 和 ESM 不兼容或运行产物缺失       | 独立包装 ADR、双消费者构建、Docker smoke                              |
| 认证收紧                   | 外部客户端或既有角色失去合法权限           | Principal 兼容策略、权限映射、客户端回归和明确错误码                  |
| Event 与通知解耦           | 业务已提交但通知丢失或重复                 | 事务投影或持久任务、幂等约束、失败与重放测试                          |
| 发布与数据库升级           | 镜像和脚本不同版本或旧镜像不兼容新 Schema  | 固定 SHA、扩展再收缩、保留回退资产和恢复演练                          |

目录调整、正确性修复、协议变更和数据库迁移尽量分别提交。所有新增持久化改造使用前向 migration，数据库回退根据数据与 Schema 兼容性决定，不能等同于 Git revert。

## 9 本轮明确决策

1. 采用强边界模块化单体，保留现有业务与运行形态。
2. 优先完成回归保障和 P0 修复，再治理模块、组装与事务。
3. Starter 是参考实现，Stack 的接口和质量标准独立维护。
4. 第一阶段保留 npm、CommonJS、当前 Admin 和真实支付 Provider；运行时升级与浏览器认证迁移单独验证。
5. 核心模块禁止新增未登记内部依赖，现有债务按清单逐步清零。
6. Settings、Audit、Jobs 和 Access Control 成为有所有权的基础模块；具体业务配置和 Handler 仍由业务模块负责。
7. 第一轮不建设新的云适配器、完整第三方商城、通用事件总线或多存储 Provider。
8. 底座验收后，再进入 Manifest 与 Release 标准、Instance 模型和托管交付升级。

上述决策已用于升级分支的增量实施；本方案中的静态发现仍按评估时的基线保留。生产合并与切换不包含在本次实施中。

## 10 核对源文件

Stack 依据：

- [应用组装](../src/app.ts)、[API 入口](../src/server.ts)、[Worker 入口](../src/worker.ts)。
- [模块注册](../src/modules/index.ts)、[数据库类型](../src/db/types.ts)、[聚合 Schema](../src/db/schema.ts)。
- [Jobs](../src/lib/job-runs.ts)、[Audit](../src/lib/audit-logs.ts)、[环境](../src/lib/env.ts)、[加密](../src/lib/settings-crypto.ts)。
- [认证用例](../src/modules/auth/service.ts)、[支付用例](../src/modules/billing/service.ts)、[结算用例](../src/modules/checkout/service.ts)。
- [部署用例](../src/modules/deployment/service.ts)、[部署 Repository](../src/modules/deployment/repository.ts)、[Admin 用例](../src/modules/admin/service.ts)。
- [事件](../src/modules/event/service.ts)、[通知](../src/modules/notifications/service.ts)、[Admin API Client](../admin-ui/src/api/client.ts)。
- [CI](../.github/workflows/ci.yml)、[Docker Verify](../.github/workflows/docker.yml)、[部署脚本](../scripts/deploy/deploy.sh)、[迁移](../scripts/run-migrations.mjs)、[Dockerfile](../Dockerfile)。
- [既有架构评估](architecture-assessment-starter-alignment.md)。

Starter 依据：

- [架构](../../ts-fastify-business-starter/docs/architecture.md)、[质量标准](../../ts-fastify-business-starter/docs/quality-bar.md)。
- [边界检查](../../ts-fastify-business-starter/scripts/check-module-boundaries.mjs)、[模块组装](../../ts-fastify-business-starter/apps/server/src/modules/index.ts)、[Worker](../../ts-fastify-business-starter/apps/server/src/entrypoints/worker.ts)。
- [Jobs](../../ts-fastify-business-starter/docs/jobs.md)、[Settings](../../ts-fastify-business-starter/docs/settings.md)、[Audit](../../ts-fastify-business-starter/docs/audit.md)、[Access Control](../../ts-fastify-business-starter/docs/access-control.md)。
- [Idempotency](../../ts-fastify-business-starter/docs/idempotency.md)、[Outbox](../../ts-fastify-business-starter/docs/outbox.md)、[数据库类型](../../ts-fastify-business-starter/apps/server/src/database/database.ts)。
- [Contracts](../../ts-fastify-business-starter/packages/contracts/src/index.ts)、[API Client](../../ts-fastify-business-starter/packages/api-client/src/client.ts)、[CI](../../ts-fastify-business-starter/.github/workflows/ci.yml)。
