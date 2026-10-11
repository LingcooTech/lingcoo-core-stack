# lingcoo-core-stack

单机可部署的核心中台骨架，面向：

- `auth`
- `billing`
- `license`
- `event`
- `api`

当前目标不是一次把所有支付细节都写满，而是先把核心中台的 MVP 主流程跑通。

底座升级分支的工程验证、生产切换与回退流程见 [升级操作说明](docs/foundation-release-runbook.md)，分阶段结果见 [实施记录](docs/foundation-upgrade-progress.md)。

## 应用接入文档

- [仓库应用定义与交付版本标准](docs/stack-application-definition-standard.md)：公开/私有仓库导入、源码同步、构建和不可变版本；阶段进度见文档中的任务清单。
- [当前应用接入标准](docs/stack-app-delivery-onboarding-standard.md)：商品、交付清单、自部署、托管与验收。
- [托管适配器协议 v2](docs/stack-hosting-adapter-contract.md)：应用与节点的执行接口。
- [解耦审计与能力边界](docs/stack-application-decoupling-audit-20261011.md)。
- [后台填写指南](docs/app-configuration-and-images-20261011.md)。

## 技术选择

- 应用框架：Fastify
- 语言：TypeScript
- 数据库：PostgreSQL
- 缓存 / 队列预留：Redis
- 反向代理：Caddy
- 数据访问：Drizzle ORM
- 部署方式：Docker Compose
- 支付方向：微信支付、支付宝

为什么这样选：

- Fastify 够轻，模块化清晰，单机资源占用比重框架更稳
- PostgreSQL 足够支撑用户、授权、订单、事件这些核心数据
- Redis 先作为缓存和任务队列预留，不强行引入复杂消息系统
- Caddy 适合单机，后面有域名时可以直接接 HTTPS
- 生产环境端口做成可配置，避免在一台机器上和其他站点争抢 `80/443`

## 当前目录

```text
.
├── .github/workflows/ci.yml
├── Caddyfile
├── Dockerfile
├── docker-compose.yml
├── docker-compose.prod.yml
├── drizzle.config.ts
├── src
│   ├── app.ts
│   ├── server.ts
│   ├── worker.ts
│   ├── db
│   ├── lib
│   ├── modules
│   │   ├── auth
│   │   ├── billing
│   │   ├── event
│   │   ├── license
│   │   └── system
│   ├── plugins
│   ├── scripts
│   └── types
└── secrets
```

## 启动

开发、CI 和生产统一使用 `.node-version` 指定的 Node 22.23.2 与 npm 10.9.8。
请先使用版本管理器切换到该版本，再运行 `npm ci`；`npm run check:toolchain`
会检查 Node、npm 和仓库声明是否一致。Node 类型包也固定在 22 系列。
升级工具链时须同步更新声明、CI 和固定摘要的基础镜像，并通过镜像验收。

先复制环境变量：

```bash
cp .env.example .env
```

本地开发：

```bash
docker compose up --build
```

访问入口：

- API: `http://localhost:8080`
- Health: `http://localhost:8080/health`
- Docs: `http://localhost:8080/docs`
- Admin: `http://localhost:8080/admin`

生产部署需先指定通过验证的完整 SHA 镜像，并配置独立 Settings 加密密钥。完整流程见升级操作说明；手动部署也必须先排空旧 Worker：

```bash
export FD_CORE_RUNTIME_IMAGE='<registry>/fd-core-stack@sha256:<verified-image-digest>'
export APP_VERSION='<full-git-sha>'
docker compose -f docker-compose.prod.yml pull api worker
docker compose -f docker-compose.prod.yml stop -t 45 worker
docker compose -f docker-compose.prod.yml up -d postgres redis
docker compose -f docker-compose.prod.yml run --rm --no-deps \
  -e HOME=/tmp \
  -e npm_config_cache=/tmp/.npm \
  api npm run db:migrate
docker compose -f docker-compose.prod.yml up -d api worker caddy
```

生产默认访问入口：

- API: `http://<server-ip>:18080`
- Health: `http://<server-ip>:18080/health`
- Docs: `http://<server-ip>:18080/docs`
- Admin: `http://<server-ip>:18080/admin`

如果服务器已经有统一入口层占用 `80/443`，只需要在 `.env` 里改 `FD_CORE_HTTP_PORT` / `FD_CORE_HTTPS_PORT` 即可。

支付配置存储说明：

- 管理后台主入口是 `/admin`
- 支付配置页面是 `/admin/payments`
- 微信支付和支付宝参数现在可以通过后台页面直接填写
- 敏感值以加密方式写入数据库，不再要求把支付密钥长期写在服务器 `.env`
- 生产必须配置独立的 `SETTINGS_ENCRYPTION_KEY` 或 Keyring；旧 JWT 密文的读取兼容只用于迁移过渡
- 管理员通过 `npm run db:bootstrap` 显式初始化，公开注册和登录只保留普通用户身份

完整自动化发布说明见 [升级操作说明](docs/foundation-release-runbook.md) 与 [DEPLOYMENT.md](DEPLOYMENT.md)。

本机提交、push 与发布操作说明见 [docs/local-push-deploy-guide.md](docs/local-push-deploy-guide.md)。

中台目标架构说明见 [docs/platform-architecture.md](docs/platform-architecture.md)。

Admin UI 基线说明见 [docs/admin-ui-architecture.md](docs/admin-ui-architecture.md)。

## MVP 初始化

开发环境第一次启动后，执行数据库迁移：

```bash
docker compose exec api npm run db:migrate
```

然后导入一套可直接测试的 MVP 产品数据：

```bash
docker compose exec api npm run seed:mvp
```

`docker/postgres/init/001-extensions.sql` 会在新库初始化时自动启用 `pgcrypto`，用于 UUID 默认值。

## 这版已经具备的内容

- Docker / Compose 开发与生产骨架
- Fastify 应用入口
- PostgreSQL / Redis 连接插件
- 模块注册式架构
- 邮箱密码注册 / 登录
- JWT 鉴权
- 产品、套餐、功能、授权的数据模型
- 多应用接入模型
- 创建 checkout session
- 托管支付页
- 微信支付 Native 真实下单
- 微信支付回调验签与 AES-GCM 解密
- 支付宝页面支付真实下单
- 支付宝异步通知验签
- 支付回调幂等落库
- 本地模拟支付完成
- 支付完成后自动发放 entitlement
- 查询当前用户权益
- 事件入库
- 一版中台核心表结构和迁移
- MVP 种子数据脚本
- 管理员登录与支付配置后台页
- 数据库加密系统设置中心
- GitHub Actions CI
- Docker PR 构建校验
- GHCR + 阿里云 ACR 双镜像仓库发布基线
- SSH 自动部署脚本
- 生产环境纯镜像部署，不在服务器本地构建
- 版本号、健康检查、就绪检查接口

## 这版还没有做的内容

- 支付状态主动查询与补单
- 退款、关单、对账
- 完整 Admin 后台
- 真正的异步任务队列
- 订阅续费与周期性扣费
- 风控、限流和审计后台

## 支付接入策略

当前实现已经是真实支付链路，不再是 stub：

- 微信支付：API v3 `Native` 下单，服务端自己签名，请求回调时使用平台证书验签并用 API v3 Key 解密报文
- 支付宝：官方 `alipay-sdk` 生成 `alipay.trade.page.pay` 支付链接，异步通知使用官方 `checkNotifySignV2` 验签
- 两条回调最终都回收敛到同一个订单支付事务，复用已有 entitlement 发放逻辑

这样选的原因很直接：

- 微信支付最关键的是签名、验签和解密，自己掌控更稳
- 支付宝官方 SDK 已经把页面支付和通知验签封装好了，直接用最省事
- 统一在 `BillingService` 里做支付成功事务，避免在路由层写重复业务逻辑

## 当前模块结构

当前不是“外部插件系统”，而是“模块化单体”：

- `system`
  - 健康检查、模块自检
- `auth`
  - 注册、登录、`/v1/me`
- `admin`
  - 支付配置、应用管理接口
- `app`
  - 接入应用、产品绑定、应用密钥
- `install`
  - 扩展安装实例注册、绑定、heartbeat、按实例查询授权
- `checkout`
  - checkout session、托管支付页、支付状态轮询
- `billing`
  - 下单、订单查询、支付 provider 适配、模拟支付
- `license`
  - 产品目录、套餐、功能、entitlement 发放与查询
- `event`
  - 埋点和业务事件入库

模块之间共享一套数据库、Redis、环境配置和鉴权能力，但服务层是按业务域拆开的。

## 当前可跑通的 MVP 流程

1. 注册账号

```bash
curl -X POST http://localhost:8080/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "demo@example.com",
    "password": "password123",
    "displayName": "Demo User"
  }'
```

2. 登录，拿到 `token`

```bash
curl -X POST http://localhost:8080/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "demo@example.com",
    "password": "password123"
  }'
```

3. 查看产品目录

```bash
curl http://localhost:8080/v1/catalog
```

4. 创建 checkout session 并发起支付

```bash
curl -X POST http://localhost:8080/v1/checkout/sessions \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "appCode": "ai_web_translator_ext",
    "planCode": "translator_pro_monthly",
    "providerPreference": "wechat_pay"
  }'
```

响应里的 `presentation.url` 就是中台托管支付页，直接打开即可完成扫码或跳转支付测试。

5. 模拟支付成功

```bash
curl -X POST http://localhost:8080/v1/billing/orders/$ORDER_NO/mock-pay \
  -H "Authorization: Bearer $TOKEN"
```

6. 查询当前用户权益

```bash
curl http://localhost:8080/v1/entitlements/me \
  -H "Authorization: Bearer $TOKEN"
```

这条链路现在已经完整：

- 注册
- 登录
- 创建 checkout session
- 打开中台托管支付页
- 发起微信 / 支付宝真实支付
- 异步通知验签
- 支付回调幂等处理
- 自动发放 entitlement
- 查询 entitlement

## 支付配置

### 微信支付

需要配置：

- `WECHAT_PAY_MCH_ID`
- `WECHAT_PAY_APP_ID`
- `WECHAT_PAY_APP_SECRET`
- `WECHAT_PAY_KEY`
- `WECHAT_PAY_DISABLE_H5`
- `WECHAT_PAY_API_BASE_URL`
- `WECHAT_PAY_NOTIFY_URL`

当前固定走 `Native` 模式，返回 `code_url`，适合中台 API 对接任意前端。

### 支付宝

需要配置：

- `ALIPAY_APP_ID`
- `ALIPAY_PRIVATE_KEY_PATH` 或 `ALIPAY_PRIVATE_KEY`
- `ALIPAY_PUBLIC_KEY_PATH` 或 `ALIPAY_PUBLIC_KEY`
- `ALIPAY_F2F_PAY`
- `ALIPAY_KEY_TYPE`
- `ALIPAY_GATEWAY`
- `ALIPAY_NOTIFY_URL`
- `ALIPAY_RETURN_URL`

当前支持两种模式：

- 关闭 `ALIPAY_F2F_PAY` 时，走 `alipay.trade.page.pay`
- 开启 `ALIPAY_F2F_PAY` 时，走 `alipay.trade.precreate` 并返回二维码

### 回调幂等

`billing_webhook_events` 表现在会记录支付回调事件，并对 `provider + provider_event_id` 做唯一约束。

即使支付平台重复推送通知，也不会重复发 entitlement。

## 单机部署建议

你现在只有一台 2 核 4G 服务器，所以先按这个原则来：

- 一个仓库
- 一个主应用
- 一个 worker
- 一个 PostgreSQL
- 一个 Redis
- 一个 Caddy

不要一开始拆微服务，也不要上 Kubernetes。

## 下一步

下一步应该做的是：

1. 增加订单状态主动查询、关单和补单
2. 增加退款和对账
3. 扩展完整 Admin 后台
4. 增加异步任务处理和告警
