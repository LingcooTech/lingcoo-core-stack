# Stack 当前架构与开发约束

本文描述 `codex/stack-foundation-convergence` 的实现；生产是否采用该实现，以部署镜像版本为准。实施与验证记录见 [foundation-convergence-progress.md](foundation-convergence-progress.md)。

Stack 为多应用提供统一账号、应用接入、结算、权益、部署、内容和运营能力。采用 Fastify、Zod、Drizzle、PostgreSQL、Redis、React 与 TanStack Query，保持模块化单体；API 和 Worker 分别运行，共享数据库和领域模块。

## 运行入口与组装

`src/server.ts` 与 `src/worker.ts` 是启动入口，`src/app.ts` 构建 HTTP 应用。`src/composition` 负责服务工厂、API/Worker 能力组装和跨模块运维流程。环境在启动前校验；启动失败和退出有时间限制，就绪检查区分依赖故障与 draining。

模块不能导入 Composition。需要其他模块能力时，模块在自己的 `dependencies.ts` 声明具体方法，通过 `public.ts` 取得公开访问接口，并在构造时投影到实际使用的方法。全局工厂留在组合根；模块增加依赖时，必须同步更新该模块的接口和投影。

`system` 提供运行状态；`auth` 管理身份和凭据；`app` 管理接入方、密钥、目录和 Manifest；`checkout` 提供托管结算会话；`billing` 管理支付状态机与通道；`license` 管理权益；`install` 管理客户端安装和绑定；`deployment` 管理部署配置、令牌、实例状态和操作。`content`、`docs`、`ticket`、`notifications`、`ai` 分别承担内容、文档、支持、通知和 AI 用例。`admin` 负责运营入口，审计、幂等、任务和设置能力有独立模块。

## 身份与权限

浏览器通过 `/v1/auth/session/login` 和 `/v1/auth/session/register` 建立服务端会话。随机会话凭据仅通过 HttpOnly Cookie 发送，数据库保存摘要、有效期与撤销状态；浏览器写请求同时提交会话绑定的 CSRF Token，并接受来源校验。前端从服务端恢复用户和角色，先等待身份初始化再判断受保护路由。

退出使用 `/v1/auth/session/logout` 撤销服务端会话；用户只能列举、撤销自己的会话。原有 `/v1/auth/login`、`/v1/auth/register` 的 Bearer 接入继续可用。改密、重置和停用提高账户凭据版本并撤销会话，旧 Bearer 和旧 Cookie 随之失效。验证码消费、凭据修改和相关事件共享事务。

权限由服务端检查，界面隐藏入口只负责交互。管理员初始化是明确的运行操作，公开注册和登录不能产生管理员。App Token 与用户身份分离，接入方作用域必须匹配 appCode。内部文档、隐藏空间和草稿不能通过公共列表、页面、搜索或反馈接口访问。

## 数据、事务与模块职责

数据库 Schema 按所有者放在 `src/db/schema/<owner>.ts`，`src/db/schema.ts` 保留统一导入入口，共用枚举放在 `schema/enums.ts`；`architecture/table-owners.json` 声明表归属，门禁验证声明文件与归属一致。模块只写自己的表，跨模块操作调用公开接口，传递同一 `DbExecutor` 保持事务。新增跨表用例应证明成功原子性和故障回滚，不能只验证正常返回。

必须返回记录的插入、单行投影会检查空结果；更新不到记录、任务去重与条件抢占等分支保留各自的空结果语义。`queryBatch` 在事务连接上顺序执行查询，在连接池上并行执行独立读取。

全局设置的持久化位于 Settings，部署设置位于 Deployment。设置写入使用同一配置键的版本和审计事务，过期版本拒绝覆盖。密钥轮换由 Composition 统一编排全局设置、部署密文和幂等结果的事务。

App 的远程 Manifest 获取与验证在本地事务之外；落库时锁定并重新读取当前应用，元数据、部署预设与事件一起提交。Deployment 的 bootstrap 组装是独立纯函数，安装命令统一转义参数。部署操作队列由 `action-use-cases.ts` 管理，其依赖只包括权益查询、事件、时钟和解密能力；列表展示组装在 `projection.ts`，共享权益校验在 `entitlement-policy.ts`。配置类保留配置与绑定逻辑，不再承担操作队列或完整展示组装。

AI 请求在短事务中锁定用户/应用额度，预留请求次数、字符和 Token 预算，然后释放事务再调用 Provider；成功、失败按预留记录结算并提交事件。Pending 预留计入额度，防止并发穿透。进程崩溃或结算故障留下的预留会保守占用额度，最长至滚动窗口结束；当前窗口为 24 小时。外部 Provider 的 JSON 需要通过协议校验，错误响应不会原样透传供应商内容。

Token 预留沿用 `maxTokens` 的输出预算，不包含供应商分词后的完整输入成本，因此总 Token 限额属于准入控制，不能作为精确计费硬上限。真实费用控制需要供应商计量与独立预算策略。

## 协议与客户端

`packages/contracts` 提供共享请求契约与响应注册表；`@lingcoo/contracts/models` 提供业务 Zod 模型及其推导类型。Admin 响应类型从该包导入，不能再自行复制一套服务端响应接口。

每个 `/v1` JSON 业务路由必须在 `response-registry.ts` 或 `external-responses.ts` 注册响应契约；遗漏会在路由注册阶段失败。服务端校验成功响应，SDK 校验后返回解析结果；未知成功响应、格式错误和业务错误分别处理。付款通知的 XML/纯文本协议是明确列出的两个例外。自动 HEAD 路由不要求另一份响应定义。

SDK 的 `client.endpoint('GET /v1/admin/orders', path)` 从注册表推导返回类型，方法和运行时响应解析器由端点确定；实际路径与端点不匹配时在发送请求前失败。Admin 的 135 个调用使用该入口，不再指定返回值泛型。低层 `client(path, options)` 在没有显式 Schema 时返回 `unknown`，有 Schema 时返回其解析输出。请求 body 仍使用各接口共享输入模型及服务端校验，并非全部由端点自动推导。

业务模型按职责放在 `packages/contracts/src/models/`，原 `models.ts` 为兼容导出入口。新增端点须更新注册表，编译期负例和客户端/服务端路由覆盖检查共同防止调用漂移。

## 工程门禁与扩展步骤

工具链由 `.node-version`、`packageManager` 和安装/开发/提交检查统一约束。两端与共享包启用类型感知的 `no-floating-promises`、`no-misused-promises`；浏览器事件通过 `handleAsync`/`runAsync` 接住拒绝，业务代码应优先 await。

两端及共享包启用 `strict`、`noUncheckedIndexedAccess`、`noImplicitOverride` 与 `noFallthroughCasesInSwitch`。`npm run check` 执行共享包构建、格式、迁移快照一致性、模块边界、两端零警告 lint、类型、单元、构建和静态资源检查。Fast Refresh 对既有 variant/hook 导出有具名例外，Hooks 正确性规则保留。

迁移必须与最新 schema snapshot 一起提交；`check:schema` 验证无额外生成差异，真实 PostgreSQL 回归比较完整迁移历史与 schema 新建库。私有模块导入不能借助 lib 辅助文件绕过，模块内不直接执行任意 SQL；行锁由表所有者提供，事务 advisory 锁通过固定基础设施函数取得。

新增业务模块或接口时：

1. 明确表所有者和公开能力，在组合根组装服务。
2. 在模块声明最小依赖，避免循环与私有实现导入。
3. 定义请求与响应 Zod 契约，客户端导入共享响应类型。
4. 为权限、资源归属、并发限制、失败回滚补充实际行为验证。
5. 运行工程、隔离数据库、Admin 组件和关键浏览器流程；涉及运行时或依赖时验证生产镜像。

`npm run test:integration` 只接受明确以 `_test` 结尾的隔离数据库。`npm run test:admin` 使用 Vitest 浏览器模式，`npm run test:e2e` 使用 Playwright 验证实际页面和 HTTP 服务。生产镜像验收包括 Node 22、只读非 root、迁移、API/Worker 健康、实际任务执行、启动失败和 SIGTERM 退出。

工程门禁和模拟 Provider 回归不能替代真实供应商联调、生产监控、异机恢复演练或负载验证。模块仍可按业务增长继续拆分用例，配置与领域策略仍应随复杂度增长继续拆分；静态门禁覆盖既定规则，不能替代业务评审。
