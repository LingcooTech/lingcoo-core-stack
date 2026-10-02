# Stack 底座升级实施记录

本记录跟踪 `foundation-upgrade-assessment-and-plan.md` 的实施与验证。升级分支为 `codex/stack-foundation-upgrade`；各阶段验证后提交并推送，生产部署与合并另行处理。

原有改动已于 2026 年 10 月 2 日提交并推送到 main，提交为 `44c0688`。后端与 Admin 依赖均从现有 lockfile 恢复；未修改默认 npm 缓存权限。

## 阶段 A 工程基线

已实施。初始后端与 Admin 类型检查通过，现有 6 个测试通过，lint 分别有 22 与 31 个 warning，均无 error。Warning 不作为可忽略的新代码规范，后续阶段逐项收敛。

隔离数据库测试要求显式的 DATABASE_TEST_URL，数据库名以 `_test` 结尾。测试不使用开发或生产数据库，支付 Provider 以本地测试替身代替真实支付请求。

新增 8 个数据库与 HTTP 回归全部通过，覆盖重复及并发支付回调、金额与币种不匹配、权益失败事务回滚、退款重放、App Token appCode 约束、部署 Token 过期及撤销、Admin 服务端权限。PostgreSQL 16 空库迁移与重复执行通过。后端、测试和 Admin 类型检查通过，后端与 Admin 构建通过，生产入口 JS/CSS 文件检查通过。

新增 `npm run check`、隔离 Compose 与集成测试入口，CI 同时检查后端与 Admin 并执行数据库回归；Docker 路径过滤包含 Admin 和 scripts。构建脚本不再隐式安装依赖。完整表所有权清单与可重复的 AST 导入报告已建立。

本机验证使用 Node 24，CI 保留 Node 22；生产 Node 22 镜像验证安排在阶段 F。阶段 A 未改变业务代码。

## 阶段 B 正确性与安全

已实施 F01–F09：任务延迟重试、领取凭据、租约与独立尝试记录；显式且并发安全的管理员初始化；用户主体与停用状态检查；任务操作权限与安全诊断；安全 5xx 响应；独立加密 Keyring 及旧密文兼容；部署额度锁、Token 原子消费、动作互斥与完成重放；迁移连接必须显式指定。

真实 PostgreSQL 的 19 个集成测试全部通过，包括两个 Worker 竞争、过期恢复、旧 Worker 写回拒绝、并发初始化管理员，以及部署额度、Token 和动作并发。单元测试增加生产配置、安全错误与密钥兼容检查，共 10 个通过。完整 check 包含后端、测试、Admin 类型检查及两端构建。

生产切换前必须配置独立 `SETTINGS_ENCRYPTION_KEY` 或 Keyring。已有使用 JWT 加密的密文暂通过 legacy 读取兼容，轮换后才能关闭此能力。无管理员的环境使用 `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` 执行 `npm run db:bootstrap`，不会在公开注册或登录时提升权限。已有管理员保留。

Jobs migration 使用扩展字段，切换时必须先停止或排空旧 Worker，再运行 migration 并启动新 Worker，禁止混合旧的无凭据写回进程。Token 兑换仍保留现有交付状态语义，新的实例生命周期留待独立方案。

## 阶段 C 模块接口与运行时组装

已建立全部业务模块的 public 入口、显式能力工厂与 API 组装。公开 Service Port 只列出实际协作的方法，Repository 能力仅投影明确查询与命令；实例和连接均在调用方运行时创建。跨模块业务 Service 与事务绑定能力由 Composition Root 注入，Billing/Checkout 以及 App/License 不再互相导入内部实现。表清理回到所属模块。AST 门禁检查静态导入、别名、require、动态导入、模块循环、领域依赖与跨表写入，债务清单目前为空，并通过故意违规样例验证。

从 Drizzle 推导真实事务类型，移除 `tx as DbClient`。支付成功的订单、权益、Checkout 投影仍共用事务；退款处理中必要的对账任务现在在事务内入队。新增入队失败回滚测试，20 个集成测试通过。

Jobs 收敛为独立模块，载荷与版本经过 Registry 校验，Worker 统一组装邮件、Webhook 与退款 Handler。并发数、关闭等待和保留期显式配置，租约丢失中止支持取消的 Handler，终态任务与尝试记录默认保留 90 天。审计辅助失败不会重试已完成的外部任务。保留 lib 的兼容出口。

Deployment Facade 拆出配置和 bootstrap 组装用例，Billing 拆出退款与对账用例，调用与响应保持兼容。API 与 Worker 接受可替换的能力工厂，业务时钟与 Job 时钟可以注入。15 个单元测试通过。生产信号与镜像恢复演练继续在阶段 F 验证。

## 阶段 D 配置、审计、授权与事件

已建立 Settings Registry，迁移设置 Schema 到所属模块，登记可见性、作用域、连接测试和现有优先级。保持数据库设置优先于环境回退，避免支付和交付行为静默变化。GET 提供安全来源说明和 ETag；新版 Admin 保存携带 If-Match，冲突返回 409。旧客户端暂允许不携带版本，其保存仍串行化。删除后的 revision 保留，避免重建配置时版本回退。

配置保存、用户管理、权益授权和任务重试的成功审计与数据库变更共享事务，失败后追加安全失败记录。AuditContext、递归脱敏、容量限制和历史记录安全投影统一。故障注入发现全局错误处理器晚注册导致插件路由仍返回异常原文，已提前注册并用真实 HTTP 500 回归验证。权限与主体检查提取到 Access 模块。

轮换命令 `npm run settings:rotate` 默认为只读演练，`npm run settings:rotate -- --apply` 在事务内重加密全局设置、应用交付配置以及部署元数据密文。保留旧 key 与 legacy 解密能力直到检查完成，重复执行无新增轮换；执行失败整体回滚。当前写入 key 必须独立且至少 32 字符，显式保留的旧 key 只用于读取。

Event 不再直接构造通知服务。事件和仅包含 eventId 的通知投影任务共享事务；Worker 使用 Notifications 公开投影接口，已有 dedupe 约束保证重放不会重复通知。投影失败保留事实和任务并自动重试。本轮采用持久 Jobs 承载投影，不引入通用事件总线。

阶段 D 验证：25 个隔离数据库/HTTP 集成测试通过，16 个单元测试通过，两端类型与构建通过。配置值与 ETag 在同一锁定事务中读取；成功保存的响应保留本次提交的版本，避免并发响应错配。

## 阶段 E 共享协议、客户端与请求幂等

已建立 npm workspaces，以根 lockfile 冻结安装；contracts 和 api-client 提供真实 CommonJS / ESM 产物。统一 Zod 4.3.6 与表单 resolver，修正设置表单输入、输出类型。认证与支付、Checkout、部署请求共用 Schema；关键响应由后端及客户端校验，错误保留旧字符串并提供 code、requestId。Admin 登录不再尝试通过公开注册初始化管理员。

关键创建、退款和部署动作支持可选 Idempotency-Key。保留旧客户端兼容；新客户端对同一未完成命令复用 key。数据库按主体、命令与 key 隔离，校验请求摘要，重复请求返回加密保存的结果。支付订单、Checkout 和部署记录关联 commandId。结果保留 24 小时，清理结果后保留摘要墓碑，禁止旧 key 自动复用。超时、进程中断或未知结果不得盲目重试，需先通过订单号、退款请求号或资源 commandId 对账；本轮不宣称跨外部 Provider 的 exactly-once。

28 个隔离数据库/HTTP 回归通过，包含并发订单的单次 Provider 调用、失败安全重放、部署重放与原资源关联。共享包真实双格式消费和客户端协议/取消测试纳入 check；生产镜像与浏览器交互在阶段 F 验证。
