# 底座升级的验证、切换与回退

适用于 `codex/stack-foundation-upgrade` 的 A–F 改造。实施记录见 [foundation-upgrade-progress.md](foundation-upgrade-progress.md)。本轮仅提交与推送升级分支，不执行生产切换。

## 工程命令

使用 Node 22，在仓库根目录执行 `npm ci`；根 lockfile 是后端、Admin 和共享包的唯一安装依据。`npm run check` 包含共享包构建、模块边界、两端 lint / 类型、单元测试、两端构建和静态入口检查。业务源码新增依赖必须经 `public.ts` 与 Composition Port 协作，债务清单当前为空。

数据库验证使用隔离 Compose，禁止指向生产：

```sh
docker compose -p lingcoo-stack-foundation-test -f docker-compose.test.yml up -d --wait
DATABASE_TEST_URL=postgres://stack_test:stack_test_only@127.0.0.1:15438/lingcoo_stack_test npm run test:integration
DATABASE_TEST_URL=postgres://stack_test:stack_test_only@127.0.0.1:15438/lingcoo_stack_test npm run test:e2e
```

浏览器首次使用前执行 `npx playwright install chromium`。E2E 必须先完成构建，测试入口会启动自己的 API，拒绝复用未知服务。支付以本地替身验证，不调用真实支付网关。

```sh
docker build --build-arg APP_VERSION=foundation-smoke -t lingcoo-stack-foundation:verify .
npm run smoke:production
```

镜像 smoke 使用独立 `lingcoo-stack-image-smoke` 项目与临时 `_test` 数据库，结束时只清理该项目。验证 Node 22、生产依赖、非 root、只读、重复迁移、深层 HTML 与资源、启动失败清理、SIGTERM 和保留镜像重启。该验证不是生产备份恢复证明。

## 生产切换

1. 对目标数据库完成备份与恢复验证，保留当前镜像 SHA、Compose、Caddyfile 和可读取旧密文的 key。检查迁移 0024–0026 及原有 migration 记录；脚本不修改历史 SQL。
2. 配置强 JWT 和独立至少 32 字符的 Settings key。旧 JWT 密文需要保留 legacy 读取，已使用 Keyring 的环境保留旧 key。生产禁止通配 CORS，默认关闭 API 文档。
3. 缺少管理员时，通过受控环境变量 `INITIAL_ADMIN_EMAIL`、`INITIAL_ADMIN_PASSWORD` 执行 `npm run db:bootstrap`。公开注册、登录不会创建管理员。
4. CI 通过后构建完整 40 位 SHA 镜像，镜像 smoke 通过后才推送。发布流程记录 registry digest，并以 `FD_CORE_RELEASE_IMAGE=<repository>@sha256:<digest>` 传给服务器。脚本按同一 SHA 检出，不追踪最新 main；GitHub concurrency 和服务器 flock 串行化发布。运行 Compose 使用已验证 digest，标签只用于发布与查询。
5. 脚本停止并排空旧 Worker，再迁移并启动新 API / Worker。禁止混用旧的无领取凭据 Worker 与新任务状态。迁移持有同一数据库连接的 advisory lock；修复 legacy 记录需要实际 Schema 证明，失败即停止发布。
6. API `/ready` 必须依赖可达并返回本次 SHA，Worker 心跳及数据库、Redis 探测必须健康。镜像 smoke 还要求 Worker 真实领取并完成投影任务。成功后保存 `.deploy-releases/<sha>` 的 digest、非 Secret 发布资产和验证记录；脚本不清理旧镜像或数据卷。
7. `npm run settings:rotate` 先演练，再以 `-- --apply` 轮换设置、交付、部署与幂等结果密文。核对计数和读取结果后，才考虑移除旧 key 与 legacy 读取。旧版本不能读取新密文时，不得直接回退。

API 默认排空 30 秒，Worker 默认排空 30 秒，Compose 等待 45 秒。超出等待的 Worker 停止写回，任务保留租约，由新 Worker 恢复。邮件、Webhook 仍按可重试交付语义处理；外部调用不能因此被宣称绝不重复。

## 请求结果不确定时

关键 POST 可携带 `Idempotency-Key`。同主体、命令和 key 的不同内容返回 409；并发相同请求等待已有结果，成功或已记录失败会重放。加密结果保存 24 小时，过期后清理结果但保留摘要墓碑，旧 key 不能重新执行。

处理支付超时、进程中断或响应丢失时，先查订单的 `meta.commandId`、Checkout / 部署的 commandId，以及 Provider 的订单号、退款请求号。处于 processing / unknown 的请求不得换 key 盲目重试。保存结果失败后也不会自动接管原命令；需要人工对账。跨外部系统的自动补偿扩展不包含在本轮。

## 回退

`scripts/deploy/rollback.sh` 仅接受已验证 SHA。维护者确认目标代码支持当前 Schema、任务租约与密文版本后，以 `DEPLOY_ROLLBACK_SCHEMA_COMPATIBLE=1` 执行。默认使用 `.deploy-releases/previous`，也可显式指定 IMAGE_TAG。回退复用同一发布流程与健康检查，跳过 migration，不自动逆向修改数据库。

迁移中断或新版本健康失败时，保留日志、发布资产和数据库，先评估 Schema 兼容性。涉及密文格式或任务写回协议的回退，必须先排空相应 Worker，必要时前向修复；不能将 Git revert 视为数据回退。

## 依赖审计

2026-10-02 的审计结果：生产依赖 0 漏洞；全部工作区无 high / critical，剩余 4 个 moderate 报告属于开发工具链的 esbuild / Drizzle loader。CI 和周期审计阻断 high，不能通过 `|| true` 忽略失败。

临时接受的开发工具风险由仓库维护者负责在 2026-11-01 前复核：不向公网暴露 esbuild 开发服务器；这些开发依赖不进入生产镜像。未使用 `npm audit fix --force` 降级 Drizzle。依据见 [esbuild 开发服务公告](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99)、[Drizzle 发行记录](https://github.com/drizzle-team/drizzle-orm/releases)。Fastify JWT 与 Nodemailer 升级按[官方兼容说明](https://github.com/fastify/fastify-jwt)、[官方发行记录](https://github.com/nodemailer/nodemailer/releases)核对并进行回归。

生产镜像基础镜像固定 digest，GitHub Actions 固定为官方 tag 对应 commit；后续维护通过独立依赖变更更新并重新验证。
