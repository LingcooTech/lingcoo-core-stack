# Stack 底座升级实施记录

本记录跟踪 `foundation-upgrade-assessment-and-plan.md` 的实施与验证。升级分支为 `codex/stack-foundation-upgrade`；各阶段验证后提交并推送，生产部署与合并另行处理。

原有改动已于 2026 年 10 月 2 日提交并推送到 main，提交为 `44c0688`。后端与 Admin 依赖均从现有 lockfile 恢复；未修改默认 npm 缓存权限。

## 阶段 A 工程基线

已实施。初始后端与 Admin 类型检查通过，现有 6 个测试通过，lint 分别有 22 与 31 个 warning，均无 error。Warning 不作为可忽略的新代码规范，后续阶段逐项收敛。

隔离数据库测试要求显式的 DATABASE_TEST_URL，数据库名以 `_test` 结尾。测试不使用开发或生产数据库，支付 Provider 以本地测试替身代替真实支付请求。

新增 8 个数据库与 HTTP 回归全部通过，覆盖重复及并发支付回调、金额与币种不匹配、权益失败事务回滚、退款重放、App Token appCode 约束、部署 Token 过期及撤销、Admin 服务端权限。PostgreSQL 16 空库迁移与重复执行通过。后端、测试和 Admin 类型检查通过，后端与 Admin 构建通过，生产入口 JS/CSS 文件检查通过。

新增 `npm run check`、隔离 Compose 与集成测试入口，CI 同时检查后端与 Admin 并执行数据库回归；Docker 路径过滤包含 Admin 和 scripts。构建脚本不再隐式安装依赖。完整表所有权清单与可重复的 AST 导入报告已建立。

本机验证使用 Node 24，CI 保留 Node 22；生产 Node 22 镜像验证安排在阶段 F。阶段 A 未改变业务代码。
