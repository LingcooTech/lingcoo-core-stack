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
